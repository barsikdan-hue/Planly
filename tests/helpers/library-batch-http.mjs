// Real compiled Next/auth/private S3, synthetic users/config only, no Worker.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {eq,inArray} from 'drizzle-orm';
import {startSharedLibraryRuntime} from '../shared-library-http-smoke.mjs';
import {socialAccounts,socialBindings,libraryItems,libraryItemMedia,mediaAssets,publications,libraryBatchConsentOperations} from '../../db/schema.ts';
import {socialConnectionConfig} from '../../lib/server/social-connections/config.ts';
import {removePublicationJob,closePublicationQueue} from '../../lib/server/scheduler/queue.ts';
import {closeRedisConnection} from '../../lib/server/scheduler/redis.ts';

/** @param {{cleanupPhase?: <T>(label: string, work: () => Promise<T>) => Promise<T>}} [options] */
export async function startLibraryBatchRuntime(options = {}){
 const phase=options.cleanupPhase??((_label,work)=>work());
 assert.ok(!process.env.PLANLY_MULTIUSER_BASE_URL,'Batch fixture starts its own Worker-free compiled child');
 const config={TELEGRAM_BOT_TOKEN:'123456:synthetic_fixture_token_only_12345',MAX_BOT_TOKEN:'synthetic_fixture_token_only_12345',TELEGRAM_MINI_APP_URL:'https://t.me/fixture_bot',MAX_MINI_APP_URL:'https://max.ru/fixture_bot'};
 const names=[...Object.keys(config),'PLANLY_PUBLIC_ORIGIN'],previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 Object.assign(process.env,config);delete process.env.PLANLY_PUBLIC_ORIGIN;
 let fixture;
 const restore=()=>{for(const k of names){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}};
 try{
  fixture=await startSharedLibraryRuntime(options);const {db,ids,api,admin,a,b,storage,sources}=fixture;
  const mp4=await readFile(new URL('../e2e/assets/library-batch-blue.mp4',import.meta.url));
  const mediaId=randomUUID(),sourceId=randomUUID(),key=`fixtures/batch-${randomUUID()}/blue.mp4`;
  await storage.put(key,mp4,'video/mp4');await db.insert(mediaAssets).values({id:mediaId,userId:ids[0],storageKey:key,originalName:'Blue.mp4',mimeType:'video/mp4',byteSize:mp4.length,checksum:createHash('sha256').update(mp4).digest('hex'),width:160,height:90,durationMs:1000});
  await db.insert(libraryItems).values({id:sourceId,userId:ids[0],title:'Batch ordered media',bodyText:'Full finite private batch content\nLast line retained',status:'READY'});
  await db.insert(libraryItemMedia).values([{libraryItemId:sourceId,mediaId:fixture.media[1].id,position:0},{libraryItemId:sourceId,mediaId,position:1}]);
  for(const id of [sources[0],sourceId,sources[1]])assert.equal((await api(`/api/admin/shared-library/${id}`,admin,'POST',{shared:true})).status,200);
  const shared=(await (await api('/api/shared-library',a)).json()).items;
  const positive=shared.filter(s=>['Shared text','Batch ordered media'].includes(s.title));assert.equal(positive.length,2);
  const copied=[];
  for(const cookie of [a,b]){const response=await api('/api/shared-library/copy',cookie,'POST',{ids:positive.map(s=>s.id)},{'idempotency-key':randomUUID()});assert.equal(response.status,201);copied.push((await response.json()).items.map(i=>i.id));}
  const negative=shared.find(s=>s.title==='Shared ordered media');const negativeResponse=await api('/api/shared-library/copy',a,'POST',{ids:[negative.id]},{'idempotency-key':randomUUID()});assert.equal(negativeResponse.status,201);const negativeSource=(await negativeResponse.json()).items[0].id;
  const accounts=[];
  for(let i=0;i<ids.length;i++){
   const selected=[];for(const [j,provider] of ['TELEGRAM','MAX'].entries()){
    const accountId=randomUUID(),destination='-'+Date.now()+i+j;selected.push(accountId);
    await db.insert(socialAccounts).values({id:accountId,userId:ids[i],provider,providerAccountId:destination,displayName:`Batch ${provider}`,enabled:true,connectionStatus:'CONNECTED',bindingRevision:1});
    await db.insert(socialBindings).values({accountId,userId:ids[i],provider,destinationId:destination,humanId:'123',botId:'456',sessionVersion:0,revision:1,configRevision:socialConnectionConfig(provider).revision,checkedAt:new Date()});
   }accounts.push(selected);
  }
  const settings={startDate:'2030-01-01',endDate:'2030-01-07',weekdays:[1,2,3,4,5,6,7],times:['10:00','18:00']};
  const input={sourceIds:copied[0],accountIds:accounts[1],settings};
  const call=(path,cookie='',method='GET',body,extra={})=>fetch(fixture.base+'/api/library/batch-consent'+path,{method,redirect:'manual',signal:AbortSignal.timeout(10000),headers:{cookie,origin:fixture.base,'content-type':'application/json','x-planly-library-batch':'1',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const cleanup=async()=>{
   try{
    const jobs=new Set((await phase('batch.pg.publications',async()=>await db.select().from(publications).where(inArray(publications.userId,ids)))).map(p=>p.id));
    for(const row of await phase('batch.pg.receipts',async()=>await db.select().from(libraryBatchConsentOperations).where(inArray(libraryBatchConsentOperations.userId,ids))))for(const r of row.receipt.rows)for(const t of r.targets)jobs.add(t.publicationId);
    for(const id of jobs)await phase('batch.redis.job.remove',()=>removePublicationJob(id));
   }finally{await phase('batch.queue.close',closePublicationQueue);await phase('batch.redis.quit',closeRedisConnection);await fixture.cleanup();restore();}
  };
  return {...fixture,call,input,accounts,copied,negativeSource,mp4,cleanup};
 }catch(error){if(fixture)await fixture.cleanup();restore();throw error;}
}

export async function batchRows(fixture){return fixture.db.select().from(libraryItems).where(eq(libraryItems.userId,fixture.ids[1]));}
