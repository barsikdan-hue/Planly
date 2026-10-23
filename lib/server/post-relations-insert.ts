import {randomUUID} from 'node:crypto';
import {postTargets,postMedia} from '../../db/schema.ts';
import type {SavePostInput} from '../contracts/planner.ts';
import {toDbProvider} from '../contracts/planner.ts';
import type {Transaction} from './planner-slots.ts';
// Caller owns a successfully inserted parent and validates/locks all relations.
// No validation, parent mutation, source conversion, reconciliation or queue IO.
export async function insertPostRelations(tx:Transaction,postId:string,input:SavePostInput,accounts:ReadonlyMap<string,string>,now:Date):Promise<void>{
 if(input.targets.length)await tx.insert(postTargets).values(input.targets.map(target=>({id:randomUUID(),postId,socialAccountId:accounts.get(toDbProvider(target.provider))!,textOverride:target.textOverride,scheduledAt:target.scheduledAt?new Date(target.scheduledAt):null,active:true,createdAt:now,updatedAt:now})));
 if(input.mediaIds.length)await tx.insert(postMedia).values(input.mediaIds.map((mediaId,position)=>({postId,mediaId,position})));
}
