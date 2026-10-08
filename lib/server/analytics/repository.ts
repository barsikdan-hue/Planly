import {and,eq,gte,lte,sql} from 'drizzle-orm';
import {getDb} from '../../../db/index.ts';
import {posts,postTargets,publications,socialAccounts,publicationMetrics} from '../../../db/schema.ts';
import {isCount,legacyTelegramDestination,numericDestination,parseTelegramPrimaryId,publicationWindow,summarizeObserved,validMaxMessageId} from '../../analytics.ts';
import type {AnalyticsDto,AnalyticsError,AnalyticsMetric,AnalyticsQuery,MetricObservation} from '../../contracts/analytics.ts';

export type AnalyticsTx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
export type OwnedObservation = {userId:string;publicationId:string;accountId:string;destinationId:string;remoteMessageId:string;metric:AnalyticsMetric;value:number;observedAt:Date;providerEventAt:Date|null;updateId:number|null};
export async function analyticsCohort(userId:string,query:AnalyticsQuery,now:Date) {
  const window=publicationWindow(query.period,now);
  return getDb().select({publication:publications,account:socialAccounts,metric:publicationMetrics,text:sql<string>`left(${posts.baseText},200)`}).from(publications)
    .innerJoin(posts,eq(posts.id,publications.postId)).innerJoin(postTargets,eq(postTargets.id,publications.postTargetId))
    .innerJoin(socialAccounts,eq(socialAccounts.id,postTargets.socialAccountId)).leftJoin(publicationMetrics,eq(publicationMetrics.publicationId,publications.id))
    .where(and(eq(publications.userId,userId),eq(posts.userId,userId),eq(socialAccounts.userId,userId),eq(publications.provider,query.provider==='max'?'MAX':'TELEGRAM'),eq(publications.status,'PUBLISHED'),gte(publications.publishedAt,window.from),lte(publications.publishedAt,window.through)));
}
export function publicationIdentity(publication:typeof publications.$inferSelect): {remoteId:string;destinationId:string|null} | null {
  const raw=publication.providerRemoteId;
  if(!raw)return null;
  if(publication.provider==='TELEGRAM') {
    const remoteId=parseTelegramPrimaryId(raw);
    if(!remoteId)return null;
    const destinationId=publication.analyticsDestinationId??legacyTelegramDestination(publication.providerUrl,remoteId);
    return {remoteId,destinationId:destinationId?.startsWith('-100')&&numericDestination(destinationId)?destinationId:null};
  }
  return publication.provider==='MAX'&&validMaxMessageId(raw)?{remoteId:raw,destinationId:publication.analyticsDestinationId}:null;
}
export async function listAnalytics(userId:string,query:AnalyticsQuery,now:Date):Promise<AnalyticsDto> {
  const cohort=await analyticsCohort(userId,query,now);
  const rows=cohort.map(({publication,metric,text})=>{
    const identity=publicationIdentity(publication);
    const metricMatches=!!identity&&!!metric&&metric.remoteMessageId===identity.remoteId&&(!identity.destinationId||metric.destinationId===identity.destinationId)&&metric.metric===(query.provider==='max'?'views':'reactions');
    const value=metricMatches&&isCount(metric?.value)?metric.value:null;
    const observedAt=value!==null&&metric?.observedAt?metric.observedAt.toISOString():null;
    const coverage:MetricObservation['coverage']=value!==null?'AVAILABLE':!identity||(query.provider==='telegram'&&!identity.destinationId)?'IDENTITY_UNPROVEN':metricMatches?metric!.coverage:'NO_DATA';
    return {publicationId:publication.id,text,publishedAt:publication.publishedAt!.toISOString(),providerUrl:publication.providerUrl,primaryMessageOnly:query.provider==='telegram'&&publication.providerRemoteId!.includes(','),metric:{value,observedAt,coverage,stale:!!observedAt&&now.getTime()-Date.parse(observedAt)>86400000,collectionError:metricMatches?metric!.collectionError:null}};
  });
  rows.sort((a,b)=> a.metric.value===null&&b.metric.value!==null?1:b.metric.value===null&&a.metric.value!==null?-1:(b.metric.value??0)-(a.metric.value??0)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.publicationId.localeCompare(b.publicationId));
  return {...query,pageSize:20,eligibleCount:rows.length,...summarizeObserved(rows.map(r=>r.metric.value)),rows:rows.slice(query.page*20,(query.page+1)*20),asOf:now.toISOString()};
}

async function lockOwned(tx:AnalyticsTx,input:Omit<OwnedObservation,'value'|'observedAt'|'providerEventAt'|'updateId'>) {
  const [row]=await tx.select({publication:publications,account:socialAccounts}).from(publications)
    .innerJoin(postTargets,eq(postTargets.id,publications.postTargetId)).innerJoin(socialAccounts,eq(socialAccounts.id,postTargets.socialAccountId)).innerJoin(posts,eq(posts.id,publications.postId))
    .where(and(eq(publications.id,input.publicationId),eq(publications.userId,input.userId),eq(posts.userId,input.userId),eq(socialAccounts.userId,input.userId),eq(socialAccounts.id,input.accountId),eq(publications.status,'PUBLISHED')))
    .for('update',{of:[publications,socialAccounts]});
  if(!row||!row.account.enabled||row.account.connectionStatus!=='CONNECTED'||row.account.providerAccountId!==input.destinationId)return null;
  const identity=publicationIdentity(row.publication);
  if(!identity||identity.remoteId!==input.remoteMessageId||(identity.destinationId&&identity.destinationId!==input.destinationId)||(row.publication.provider==='TELEGRAM'&&!identity.destinationId)||input.metric!==(row.publication.provider==='MAX'?'views':'reactions'))return null;
  return row;
}
export async function saveObservation(tx:AnalyticsTx,input:OwnedObservation):Promise<boolean> {
  if(!isCount(input.value))return false;
  const row=await lockOwned(tx,input);if(!row)return false;
  const [previous]=await tx.select().from(publicationMetrics).where(eq(publicationMetrics.publicationId,input.publicationId));
  if(input.providerEventAt&&previous?.providerEventAt&&(input.providerEventAt<previous.providerEventAt||(input.providerEventAt.getTime()===previous.providerEventAt.getTime()&&(input.updateId??-1)<=(previous.lastUpdateId??-1))))return false;
  const values={publicationId:input.publicationId,remoteMessageId:input.remoteMessageId,destinationId:input.destinationId,metric:input.metric,source:row.publication.provider==='MAX'?'MAX_MESSAGE' as const:'TELEGRAM_AGGREGATE' as const,value:input.value,coverage:'AVAILABLE' as const,observedAt:input.observedAt,providerEventAt:input.providerEventAt,lastUpdateId:input.updateId,collectionError:null,attemptedAt:input.observedAt,nextAttemptAt:new Date(input.observedAt.getTime()+900000)};
  await tx.insert(publicationMetrics).values(values).onConflictDoUpdate({target:publicationMetrics.publicationId,set:values});return true;
}
export type CollectionResult = Omit<OwnedObservation,'value'|'observedAt'|'providerEventAt'|'updateId'> & {coverage:MetricObservation['coverage'];value:number|null;error:AnalyticsError|null};
export async function saveCollectionResult(input:CollectionResult,now:Date):Promise<boolean> {
  return getDb().transaction(async tx=>{
    if(input.value!==null&&!input.error)return saveObservation(tx,{...input,value:input.value,observedAt:now,providerEventAt:null,updateId:null});
    const row=await lockOwned(tx,input);if(!row)return false;
    const values={publicationId:input.publicationId,remoteMessageId:input.remoteMessageId,destinationId:input.destinationId,metric:input.metric,source:row.publication.provider==='MAX'?'MAX_MESSAGE' as const:'TELEGRAM_AGGREGATE' as const,coverage:input.coverage,collectionError:input.error,attemptedAt:now,nextAttemptAt:new Date(now.getTime()+900000)};
    // Error/absent observations never erase a known value or its original timestamp.
    await tx.insert(publicationMetrics).values(values).onConflictDoUpdate({target:publicationMetrics.publicationId,set:{collectionError:input.error,attemptedAt:now,nextAttemptAt:values.nextAttemptAt}});return true;
  });
}
