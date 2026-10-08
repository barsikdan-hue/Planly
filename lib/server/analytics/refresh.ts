import {getPool} from '../../../db/index.ts';
import {analyticsCohort,publicationIdentity,saveCollectionResult} from './repository.ts';
import {createMaxAnalyticsReader,type MaxAnalyticsReader} from './max.ts';
import {abortable} from './body.ts';
import type {AnalyticsQuery,RefreshSummary} from '../../contracts/analytics.ts';
import type {MaxMetricRead} from '../../analytics.ts';
export async function refreshMaxAnalytics(userId:string,query:AnalyticsQuery,options:{now?:Date;reader?:MaxAnalyticsReader}={}):Promise<RefreshSummary> {
  const summary:RefreshSummary={checked:0,observed:0,unavailable:0,skipped:0,busy:false,nextPage:null};
  if(query.provider!=='max')return summary;
  const now=options.now??new Date();
  const cohort=(await analyticsCohort(userId,query,now)).sort((a,b)=>b.publication.publishedAt!.getTime()-a.publication.publishedAt!.getTime()||a.publication.id.localeCompare(b.publication.id));
  const rows=cohort.slice(query.page*20,(query.page+1)*20);summary.nextPage=(query.page+1)*20<cohort.length?query.page+1:null;
  if(!rows.length)return summary;
  const accountId=rows[0].account.id;const connection=await getPool().connect();let locked=false;
  const key=`analytics:${accountId}`;
  try {
    const lock=await connection.query<{locked:boolean}>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key]);
    locked=lock.rows[0].locked;if(!locked)return {...summary,busy:true};
    const reader=options.reader??createMaxAnalyticsReader({token:process.env.MAX_BOT_TOKEN??''});
    const signal=AbortSignal.timeout(25000);let cursor=0;
    async function worker(){
      for(;;){const row=rows[cursor++];if(!row)break;
        const identity=publicationIdentity(row.publication);const destination=identity?.destinationId??row.account.providerAccountId;
        if(!identity||!destination||destination!==row.account.providerAccountId||!row.account.enabled||row.account.connectionStatus!=='CONNECTED'||row.metric?.nextAttemptAt&&row.metric.nextAttemptAt>now){summary.skipped++;continue;}
        if(signal.aborted){summary.skipped++;continue;}
        summary.checked++;let result:MaxMetricRead;
        try{result=await abortable(reader.read({destinationId:destination,remoteId:identity.remoteId},signal),signal);}catch{result={coverage:'NO_DATA',value:null,error:'UNAVAILABLE'};}
        if(signal.aborted)result={coverage:'NO_DATA',value:null,error:'UNAVAILABLE'};
        const saved=await saveCollectionResult({userId,publicationId:row.publication.id,accountId:row.account.id,destinationId:destination,remoteMessageId:identity.remoteId,metric:'views',...result},now);
        if(saved&&result.value!==null&&!result.error)summary.observed++;else summary.unavailable++;
      }
    }
    await Promise.all([worker(),worker()]);return summary;
  }finally{try{if(locked)await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}finally{connection.release();}}
}
