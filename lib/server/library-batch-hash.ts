import { createHash } from 'node:crypto';
import type { LibraryBatchIntent } from '../contracts/library-batch.ts';
import { canonicalLibraryBatchIntent } from '../library-batch.ts';

type Instant = string|Date;
type Provider = 'TELEGRAM'|'MAX';
export type LibraryBatchContent = {title:string|null;baseText:string;media:{id:string;position:number;checksum:string;mimeType:string;byteSize:number;width:number|null;height:number|null;durationMs:number|null}[]};
export type LibraryBatchSnapshot = {
  contractVersion:1;
  owner:{id:string;role:'USER'|'ADMIN';authInitialized:boolean;accessState:'ACTIVE'|'BLOCKED';sessionVersion:number};
  intentHash:string;
  sources:{id:string;userId:string;title:string|null;bodyText:string;status:'READY'|'USED'|'ARCHIVED';updatedAt:Instant;linkedPostId:string|null}[];
  attachments:{sourceId:string;mediaId:string;position:number}[];
  media:{id:string;userId:string;storageKey:string;checksum:string;mimeType:string;byteSize:number;width:number|null;height:number|null;durationMs:number|null;updatedAt:Instant}[];
  accounts:{id:string;userId:string;provider:Provider;providerAccountId:string|null;displayName:string;enabled:boolean;connectionStatus:'DISCONNECTED'|'CONNECTED'|'ERROR';connectionGeneration:number;bindingRevision:number;updatedAt:Instant}[];
  bindings:{accountId:string;userId:string;provider:Provider;destinationId:string;humanId:string;botId:string;sessionVersion:number;revision:number;configRevision:string;checkedAt:Instant;updatedAt:Instant}[];
  configs:{provider:Provider;configRevision:string}[];
};
const hash=(value:unknown,domain?:string)=>createHash('sha256').update((domain?domain+'\n':'')+JSON.stringify(value)).digest('hex');
const iso=(value:Instant)=>new Date(value).toISOString();
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const byId=<T extends {id:string}>(values:T[])=>[...values].sort((a,b)=>compare(a.id,b.id));
export function libraryBatchRequestHash(intent: LibraryBatchIntent): string {
  return hash(canonicalLibraryBatchIntent(intent),'planly.library-batch.intent.v1');
}
export function libraryBatchContentHash(input: LibraryBatchContent): string {
  return hash({title:input.title,baseText:input.baseText,media:[...input.media].sort((a,b)=>a.position-b.position).map(value=>({id:value.id,position:value.position,checksum:value.checksum,mimeType:value.mimeType,byteSize:value.byteSize,width:value.width,height:value.height,durationMs:value.durationMs}))});
}
export function libraryBatchSnapshotHash(input: LibraryBatchSnapshot): string {
  const o=input.owner;
  return hash({contractVersion:1,owner:{id:o.id,role:o.role,authInitialized:o.authInitialized,accessState:o.accessState,sessionVersion:o.sessionVersion},intentHash:input.intentHash,
    sources:byId(input.sources).map(v=>({id:v.id,userId:v.userId,title:v.title,bodyText:v.bodyText,status:v.status,updatedAt:iso(v.updatedAt),linkedPostId:v.linkedPostId})),
    attachments:[...input.attachments].sort((a,b)=>compare(a.sourceId,b.sourceId)||a.position-b.position).map(v=>({sourceId:v.sourceId,mediaId:v.mediaId,position:v.position})),
    media:byId(input.media).map(v=>({id:v.id,userId:v.userId,storageKey:v.storageKey,checksum:v.checksum,mimeType:v.mimeType,byteSize:v.byteSize,width:v.width,height:v.height,durationMs:v.durationMs,updatedAt:iso(v.updatedAt)})),
    accounts:byId(input.accounts).map(v=>({id:v.id,userId:v.userId,provider:v.provider,providerAccountId:v.providerAccountId,displayName:v.displayName,enabled:v.enabled,connectionStatus:v.connectionStatus,connectionGeneration:v.connectionGeneration,bindingRevision:v.bindingRevision,updatedAt:iso(v.updatedAt)})),
    bindings:[...input.bindings].sort((a,b)=>compare(a.accountId,b.accountId)).map(v=>({accountId:v.accountId,userId:v.userId,provider:v.provider,destinationId:v.destinationId,humanId:v.humanId,botId:v.botId,sessionVersion:v.sessionVersion,revision:v.revision,configRevision:v.configRevision,checkedAt:iso(v.checkedAt),updatedAt:iso(v.updatedAt)})),
    configs:[...input.configs].sort((a,b)=>(a.provider==='TELEGRAM'?0:1)-(b.provider==='TELEGRAM'?0:1)).map(v=>({provider:v.provider,configRevision:v.configRevision})),
  },'planly.library-batch.snapshot.v1');
}
