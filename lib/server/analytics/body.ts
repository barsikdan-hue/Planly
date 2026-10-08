export class PayloadLimitError extends Error { constructor(){super('Payload exceeds limit');} }
export async function readBoundedJson(body:ReadableStream<Uint8Array>|null,limit:number):Promise<unknown> {
  if(!body)throw new SyntaxError('Missing JSON');
  const reader=body.getReader();const chunks:Uint8Array[]=[];let length=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw new PayloadLimitError();chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
}
export function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T> {
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new Error('Collection deadline'));
    if(signal.aborted){work.catch(()=>{});abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    work.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
