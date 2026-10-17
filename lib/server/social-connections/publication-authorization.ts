import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import { socialAccounts, socialBindings, users } from '../../../db/schema.ts';
import { ForbiddenError } from '../auth/access.ts';
import { getOwnerEmail } from '../env.ts';
import { createTelegramConnector } from '../connectors/telegram.ts';
import { createMaxConnector } from '../connectors/max.ts';
import type { PublishInput } from '../connectors/types.ts';
import { socialConnectionConfig } from './config.ts';
import type { ConnectionTransaction } from './state.ts';

type Pointer={socialBindingRevision:number|null;socialBindingDestinationId:string|null};
export type PublicationAuthorization={userId:string;accountId:string;provider:'TELEGRAM'|'MAX';sessionVersion:number;generation:number;revision:number;destinationId:string;humanId:string;botId:string;configRevision:string};

// Callers already hold the user lock. Admission and lifecycle use user → account.
async function currentBinding(tx:ConnectionTransaction,user:typeof users.$inferSelect,accountId:string):Promise<PublicationAuthorization|null> {
  const [account]=await tx.select().from(socialAccounts).where(and(eq(socialAccounts.id,accountId),eq(socialAccounts.userId,user.id))).for('update');
  if(!account || account.provider==='VK' || !user.authInitialized || user.accessState!=='ACTIVE' || !account.enabled || account.connectionStatus!=='CONNECTED')return null;
  const [binding]=await tx.select().from(socialBindings).where(eq(socialBindings.accountId,accountId));
  let config;try{config=socialConnectionConfig(account.provider);}catch{return null;}
  if(!binding || binding.userId!==user.id || binding.provider!==account.provider || binding.destinationId!==account.providerAccountId || binding.revision!==account.bindingRevision || binding.sessionVersion!==user.sessionVersion || binding.configRevision!==config.revision)return null;
  return {userId:user.id,accountId,provider:account.provider,sessionVersion:user.sessionVersion,generation:account.connectionGeneration,revision:binding.revision,destinationId:binding.destinationId,humanId:binding.humanId,botId:binding.botId,configRevision:binding.configRevision};
}
export async function capturePublicationBinding(tx:ConnectionTransaction,userId:string,accountId:string,provider:string):Promise<Partial<Pointer>> {
  if(provider!=='TELEGRAM' && provider!=='MAX')return {};
  const [user]=await tx.select().from(users).where(eq(users.id,userId));
  // Migration-default internal callers retain nullable history. Actual registered
  // transport below still requires a live principal and proof for every USER.
  if(user && (!user.authInitialized || user.email===getOwnerEmail()))return {};
  const binding=user?await currentBinding(tx,user,accountId):null;
  if(!binding)throw new ForbiddenError();
  return {socialBindingRevision:binding.revision,socialBindingDestinationId:binding.destinationId};
}
export async function observePublicationAuthorization(userId:string,accountId:string,pointer:Pointer):Promise<PublicationAuthorization|null> {
  return getDb().transaction(async tx=>{
    const [user]=await tx.select().from(users).where(eq(users.id,userId)).for('update');
    if(!user)return null;
    const binding=await currentBinding(tx,user,accountId);
    return binding && binding.revision===pointer.socialBindingRevision && binding.destinationId===pointer.socialBindingDestinationId?binding:null;
  });
}
function sameAuthorization(a:PublicationAuthorization,b:PublicationAuthorization) {
  return a.userId===b.userId && a.accountId===b.accountId && a.provider===b.provider && a.sessionVersion===b.sessionVersion && a.generation===b.generation && a.revision===b.revision && a.destinationId===b.destinationId && a.humanId===b.humanId && a.botId===b.botId && a.configRevision===b.configRevision;
}
export async function beginVerifiedProviderHandoff<T>(observed:PublicationAuthorization,input:PublishInput,start:()=>Promise<T>,now:()=>number=Date.now) {
  let config;try{config=socialConnectionConfig(observed.provider);}catch{return null;}
  if(config.revision!==observed.configRevision || input.socialAccountId!==observed.accountId || input.provider!==observed.provider || input.destinationId!==observed.destinationId)return null;
  const connector=observed.provider==='TELEGRAM'?createTelegramConnector({token:config.token}):createMaxConnector({token:config.token});
  const checkedAt=now(),control=await connector.validateControl(observed.destinationId,observed.humanId);
  if(!control.ok || control.destinationId!==observed.destinationId || control.humanId!==observed.humanId || control.botId!==observed.botId)return null;
  return getDb().transaction(async tx=>{
    const [user]=await tx.select().from(users).where(eq(users.id,observed.userId)).for('update');
    if(!user)return null;
    const current=await currentBinding(tx,user,observed.accountId);
    if(!current || !sameAuthorization(current,observed) || now()<checkedAt || now()-checkedAt>30000)return null;
    // Start synchronously while admitted, then release locks before awaiting IO.
    // Provider revocation after this last read is an unavoidable external race.
    const outcome=start().then(value=>({ok:true as const,value}),error=>({ok:false as const,error}));
    return {outcome};
  });
}
export async function markObservedConnectionError(observed:PublicationAuthorization) {
  await getDb().transaction(async tx=>{
    const [user]=await tx.select().from(users).where(eq(users.id,observed.userId)).for('update');
    if(!user || user.sessionVersion!==observed.sessionVersion)return;
    const current=await currentBinding(tx,user,observed.accountId);
    if(!current || !sameAuthorization(current,observed))return;
    await tx.update(socialAccounts).set({connectionStatus:'ERROR',updatedAt:new Date()}).where(and(eq(socialAccounts.id,observed.accountId),eq(socialAccounts.connectionGeneration,observed.generation),eq(socialAccounts.bindingRevision,observed.revision),eq(socialAccounts.providerAccountId,observed.destinationId)));
  });
}
