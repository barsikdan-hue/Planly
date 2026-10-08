import {numericDestination,validMaxMessageId,record,parseMaxViews,type MaxMetricRead} from '../../analytics.ts';
import type {AnalyticsError} from '../../contracts/analytics.ts';
import {abortable,PayloadLimitError,readBoundedJson} from './body.ts';
export type MaxAnalyticsReader={read(expected:{destinationId:string;remoteId:string},signal?:AbortSignal):Promise<MaxMetricRead>};
const unavailable=(error:AnalyticsError):MaxMetricRead=>({coverage:'NO_DATA',value:null,error});
class ReadFailure extends Error {category:AnalyticsError;constructor(category:AnalyticsError){super(category);this.category=category;} }
export function createMaxAnalyticsReader(options:{token:string;fetcher?:typeof fetch;timeoutMs?:number}):MaxAnalyticsReader {
  const fetcher=options.fetcher??fetch;const token=options.token.trim();
  const channels=new Map<string,Promise<boolean>>();
  async function get(path:string,parent?:AbortSignal):Promise<unknown> {
    if(!token||/[\r\n]/.test(token))throw new ReadFailure('ACCESS_DENIED');
    const timeout=AbortSignal.timeout(Math.min(options.timeoutMs??10000,10000));
    const signal=parent?AbortSignal.any([timeout,parent]):timeout;
    try {
      const response=await abortable(fetcher(`https://platform-api2.max.ru${path}`,{method:'GET',redirect:'error',headers:{authorization:token},signal}),signal);
      if(!response.ok){await response.body?.cancel();throw new ReadFailure(response.status===401||response.status===403?'ACCESS_DENIED':response.status===404?'NOT_FOUND_OR_INACCESSIBLE':response.status===429?'RATE_LIMITED':response.status>=500?'UNAVAILABLE':'INVALID_RESPONSE');}
      return await abortable(readBoundedJson(response.body,1048576),signal);
    } catch(error) {
      if(error instanceof ReadFailure)throw error;
      throw new ReadFailure(error instanceof SyntaxError||error instanceof PayloadLimitError?'INVALID_RESPONSE':'UNAVAILABLE');
    }
  }
  return {async read(expected,parent){
    if(!numericDestination(expected.destinationId)||!validMaxMessageId(expected.remoteId))return unavailable('INVALID_RESPONSE');
    try {
      if(!channels.has(expected.destinationId))channels.set(expected.destinationId,get(`/chats/${expected.destinationId}`,parent).then(input=>{
        const chat=record(input);
        if(!Number.isSafeInteger(chat?.chat_id)||String(chat?.chat_id)!==expected.destinationId||chat?.status!=='active'||!['chat','channel','dialog'].includes(String(chat?.type)))throw new ReadFailure('INVALID_RESPONSE');
        return chat?.type==='channel';
      }));
      if(!await channels.get(expected.destinationId))return {coverage:'UNSUPPORTED',value:null,error:null};
      return parseMaxViews(await get(`/messages/${expected.remoteId}`,parent),expected);
    }catch(error){return unavailable(error instanceof ReadFailure?error.category:'UNAVAILABLE');}
  }};
}
