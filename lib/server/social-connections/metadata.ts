import {and, asc, eq, inArray} from 'drizzle-orm';
import {getDb} from '../../../db/index.ts';
import {socialAccounts, socialBindings, socialConnectionIntents, users} from '../../../db/schema.ts';
import {fromDbProvider, type SocialAccountDto, type SocialConnectionMetadata} from '../../contracts/planner.ts';
import {getOwnerEmail} from '../env.ts';
import {socialConnectionConfig} from './config.ts';
import {socialConnectionAccountHint} from './account-hint.ts';
import type {ConnectionTransaction} from './state.ts';

export function socialAccountDto(row:typeof socialAccounts.$inferSelect):SocialAccountDto {
 return {id:row.id,provider:fromDbProvider(row.provider),providerAccountId:row.providerAccountId,displayName:row.displayName,enabled:row.enabled,connectionStatus:row.connectionStatus};
}

// One DB statement observes current own account, epoch, binding and pending intent.
// This is a projection, never a provider check, claim, proof or session response.
export async function readSocialAccountDtos(db:ReturnType<typeof getDb>|ConnectionTransaction,userId:string):Promise<SocialAccountDto[]> {
 const rows=await db.select({account:socialAccounts,user:users,binding:socialBindings,intent:socialConnectionIntents}).from(socialAccounts)
  .innerJoin(users,eq(users.id,socialAccounts.userId))
  .leftJoin(socialBindings,eq(socialBindings.accountId,socialAccounts.id))
  .leftJoin(socialConnectionIntents,and(eq(socialConnectionIntents.accountId,socialAccounts.id),inArray(socialConnectionIntents.state,['PENDING','CANDIDATE','VERIFYING'])))
  .where(eq(socialAccounts.userId,userId)).orderBy(asc(socialAccounts.provider));
 return rows.map(({account,user,binding,intent})=>{
  const dto=socialAccountDto(account);
  if(account.provider==='VK' || !user.authInitialized || user.email===getOwnerEmail())return dto;
  let config:string|null=null;
  try{config=socialConnectionConfig(account.provider).revision;}catch{/* Setup unavailable; never expose config or credentials. */}
  const active=user.accessState==='ACTIVE';
  const ready=active && config!==null;
  const current=!!binding && ready && binding.userId===user.id && binding.provider===account.provider &&
   binding.destinationId===account.providerAccountId && binding.revision===account.bindingRevision &&
   binding.sessionVersion===user.sessionVersion && binding.configRevision===config && account.connectionStatus==='CONNECTED';
  const pending=ready && !!intent && intent.userId===user.id && intent.provider===account.provider &&
   intent.sessionVersion===user.sessionVersion && intent.generation===account.connectionGeneration &&
   intent.bindingRevision===account.bindingRevision && intent.configRevision===config && intent.expiresAt.getTime()>Date.now();
  // checkedAt is informational. Durable reservations have no 30-second TTL.
  const state:SocialConnectionMetadata['state']=current?(account.enabled?'enabled':'verified-disabled'):binding?'stale':pending?'pending':'unverified';
  const actions:SocialConnectionMetadata['actions']=ready?['begin']:[];
  if(active && account.enabled)actions.push('pause');
  if(current && !account.enabled)actions.push('enable');
  if(active && (binding || account.providerAccountId))actions.push('release');
  return {...dto,connection:{mode:'verified-user',ready,reason:!active?'ACCESS_REQUIRED':!config?'SETUP_REQUIRED':state==='stale'?'REVERIFY_REQUIRED':null,
   state,accountHint:socialConnectionAccountHint(account.id),bindingRevision:account.bindingRevision,checkedAt:binding?.checkedAt.toISOString()??null,actions}};
 });
}
