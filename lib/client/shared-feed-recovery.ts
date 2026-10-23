import {z} from 'zod';
import {sharedFeedDecisionInputSchema,sharedFeedDecisionReceiptSchema,type SharedFeedDecisionInput,type SharedFeedDecisionReceipt} from '../contracts/shared-feed.ts';

export type SharedJournalStorage=Pick<Storage,'length'|'key'|'getItem'|'setItem'>;
const entrySchema=z.object({version:z.literal(1),owner:z.string().min(1),input:sharedFeedDecisionInputSchema,state:z.enum(['pending','confirmed','terminal','refused']),receipt:sharedFeedDecisionReceiptSchema.optional(),error:z.string().optional()}).strict();
export type SharedJournalEntry=z.infer<typeof entrySchema>;
export type SharedDecisionOutcome={status:'confirmed';receipt:SharedFeedDecisionReceipt}|{status:'stale'}|{status:'terminal'};
const prefix=(owner:string)=>`lentaro:shared-decision:v1:${encodeURIComponent(owner)}:`;
const key=(owner:string,id:string)=>prefix(owner)+id;
const corrupt=()=>new Error('Не удалось прочитать историю выбора. Новый запрос не отправлен. Обратись к администратору, сохранив данные браузера.');

export function readSharedJournal(storage:SharedJournalStorage,owner:string){
 const entries:SharedJournalEntry[]=[];
 for(let i=0;i<storage.length;i++){
  const name=storage.key(i);if(!name?.startsWith(prefix(owner)))continue;
  try{
   const raw=storage.getItem(name);if(!raw||raw.length>16_384)throw corrupt();
   const entry=entrySchema.parse(JSON.parse(raw));
   if(entry.owner!==owner||entry.input.expectedActorId!==owner||name!==key(owner,entry.input.operationId))throw corrupt();
   if(entry.state==='confirmed'&&(!entry.receipt||!matches(entry.input,entry.receipt)))throw corrupt();
   entries.push(entry);
  }catch{throw corrupt();}
 }
 return {pending:entries.filter(entry=>entry.state==='pending'),history:entries.filter(entry=>entry.state!=='pending')};
}
function write(storage:SharedJournalStorage,entry:SharedJournalEntry){
 const encoded=JSON.stringify(entrySchema.parse(entry)),name=key(entry.owner,entry.input.operationId);
 storage.setItem(name,encoded);
 if(storage.getItem(name)!==encoded)throw Error('Браузер не сохранил защиту от повторного выбора. Запрос не подтверждён.');
}
function matches(input:SharedFeedDecisionInput,receipt:SharedFeedDecisionReceipt){
 return input.operationId===receipt.operationId&&input.shareId===receipt.shareId&&input.sourceRevision===receipt.sourceRevision&&input.decision===receipt.decision&&(input.decision!=='LIKE'||receipt.scheduledAt===input.approval.scheduledAt);
}
type Sender=(input:SharedFeedDecisionInput)=>Promise<Response>;
const send:Sender=input=>fetch('/api/shared-feed/decisions',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
const message=(status:number)=>status===401?'Сессия истекла. Войди снова и восстанови выбор.':status===403?'Нет прав для этого действия.':status===404?'Материал больше недоступен. Обнови ленту.':status===409?'Материал изменился или уже выбран. Обнови ленту.':status===422?'Проверь подключение сетей, свободное время и размер медиа.':'Результат пока не подтверждён. Проверь его тем же запросом.';
async function dispatch(storage:SharedJournalStorage,entry:SharedJournalEntry,isCurrent:()=>boolean,sender:Sender):Promise<SharedDecisionOutcome>{
 if(!isCurrent())return {status:'stale'};
 const response=await sender(entry.input);
 if(!isCurrent())return {status:'stale'};
 const current=readSharedJournal(storage,entry.owner).pending.find(value=>value.input.operationId===entry.input.operationId);
 if(!current||JSON.stringify(current.input)!==JSON.stringify(entry.input))return {status:'stale'};
 if(response.status===410){write(storage,{...entry,state:'terminal',error:'Результат предыдущего выбора удалён. Повторная копия не создана.'});return {status:'terminal'};}
 if(!response.ok){
  const body=await response.json().catch(()=>null) as {code?:string}|null;
  const error=body?.code==='SHARED_FEED_ACTOR_CHANGED'?'Кабинет изменился в другой вкладке. Вернись в исходный кабинет для проверки выбора.':message(response.status);
  if(!isCurrent())return {status:'stale'};
  // Recognized fresh-input failures have no outcome. Access loss, unknown errors and
  // operation-key conflicts cannot establish whether an earlier attempt committed.
  const refused=[400,422].includes(response.status)||(response.status===404&&body?.code==='SHARED_SOURCE_UNAVAILABLE')||(response.status===409&&['SHARED_FEED_SOURCE_STALE','SHARED_FEED_ALREADY_DECIDED','PLANNER_SLOT_CONFLICT'].includes(body?.code??''));
  if(refused)write(storage,{...entry,state:'refused',error});
  throw Object.assign(new Error(error),{status:response.status});
 }
 const result=z.object({receipt:sharedFeedDecisionReceiptSchema,replayed:z.boolean()}).strict().parse(await response.json());
 if(!isCurrent())return {status:'stale'};
 if(!matches(entry.input,result.receipt))throw Error('Сервер вернул другое решение. Сохрани исходный запрос для проверки.');
 write(storage,{...entry,state:'confirmed',receipt:result.receipt});
 return {status:'confirmed',receipt:result.receipt};
}
export async function submitSharedDecision(storage:SharedJournalStorage,owner:string,input:SharedFeedDecisionInput,isCurrent=()=>true,sender:Sender=send){
 if(!isCurrent())return {status:'stale'} as const;
 const journal=readSharedJournal(storage,owner);
 if(journal.pending.length)throw Error('Сначала проверь результат предыдущего выбора.');
 const parsed=sharedFeedDecisionInputSchema.parse(input);
 if(parsed.expectedActorId!==owner)throw Error('Кабинет изменился. Обнови страницу перед новым выбором.');
 if(storage.getItem(key(owner,parsed.operationId))!==null)throw Error('Это решение уже сохранено. Используй восстановление.');
 const entry:SharedJournalEntry={version:1,owner,input:parsed,state:'pending'};
 write(storage,entry);
 return dispatch(storage,entry,isCurrent,sender);
}
export async function retrySharedDecision(storage:SharedJournalStorage,owner:string,operationId:string,isCurrent=()=>true,sender:Sender=send){
 const entry=readSharedJournal(storage,owner).pending.find(value=>value.input.operationId===operationId);
 if(!entry)throw Error('Нет незавершённого выбора. Обнови ленту.');
 return dispatch(storage,entry,isCurrent,sender);
}
