import { libraryBatchIntentSchema, type LibraryBatchIntent } from './contracts/library-batch.ts';

export function canonicalLibraryBatchIntent(input: LibraryBatchIntent): LibraryBatchIntent {
  const value=libraryBatchIntentSchema.parse(input);
  return {contractVersion:1,kind:'LIBRARY_BATCH_FUTURE',settings:{startDate:value.settings.startDate,endDate:value.settings.endDate,
    weekdays:[...value.settings.weekdays].sort((a,b)=>a-b),times:[...value.settings.times].sort()},
  rows:value.rows.map(row=>({sourceId:row.sourceId,sourceRevision:new Date(row.sourceRevision).toISOString(),contentHash:row.contentHash,
    targets:[...row.targets].sort((a,b)=>(a.provider==='TELEGRAM'?0:1)-(b.provider==='TELEGRAM'?0:1)||(a.accountId<b.accountId?-1:a.accountId>b.accountId?1:0))
      .map(target=>({accountId:target.accountId,provider:target.provider,destinationId:target.destinationId,scheduledAt:new Date(target.scheduledAt).toISOString()}))}))};
}
