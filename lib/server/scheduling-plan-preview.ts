import { getDb } from '../../db/index.ts';
import { schedulingPlanPreviewInputSchema, type SchedulingPlanPreviewInput, type SchedulingPlanPreview } from '../contracts/scheduling-plan.ts';
import { fromDbProvider } from '../contracts/planner.ts';
import { allocateDraftSlots } from '../scheduling-plan.ts';
import { occupiedSlotMinutes } from './planner-slots.ts';
import { readSchedulingSnapshots, schedulingEligibility, fingerprintSchedulingSnapshot, schedulingPostDto, schedulingAccountDto, schedulingMediaDto } from './scheduling-plan-snapshot.ts';
import { getObjectStorage, type ObjectStorage } from './storage.ts';

export async function previewSchedulingPlan(userId:string,raw:SchedulingPlanPreviewInput,options:{now?:()=>Date;storage?:Pick<ObjectStorage,'signedGetUrl'>}={}):Promise<SchedulingPlanPreview> {
  const input=schedulingPlanPreviewInputSchema.parse(raw);
  return getDb().transaction(async tx=>{
    const snapshots=await readSchedulingSnapshots(tx,userId,input.postIds);
    const rows:SchedulingPlanPreview['rows']=snapshots.map(snapshot=>{const issue=schedulingEligibility(snapshot);return {post:schedulingPostDto(snapshot),accounts:snapshot.targets.filter(row=>row.target.active).map(row=>schedulingAccountDto(row.account)),fingerprint:issue?null:fingerprintSchedulingSnapshot(snapshot),scheduledAt:null,issue};});
    if(rows.every(row=>!row.issue)){
      const providers=[...new Set(snapshots.flatMap(snapshot=>snapshot.targets.filter(row=>row.target.active).map(row=>fromDbProvider(row.account.provider))))];
      const assigned=allocateDraftSlots(input.postIds,{...input.settings,providers},await occupiedSlotMinutes(tx,userId,{providers}),options.now?.()??new Date());
      rows.forEach((row,i)=>{row.scheduledAt=assigned[i].scheduledAt;if(!row.scheduledAt)row.issue='NO_SLOT';});
    }
    const selected=new Map(snapshots.flatMap(snapshot=>snapshot.media.map(row=>[row.asset.id,row.asset] as const)));
    const media:SchedulingPlanPreview['media']=[];
    if(selected.size){const storage=options.storage??getObjectStorage();for(const asset of selected.values())media.push({...schedulingMediaDto(asset),previewUrl:await storage.signedGetUrl(asset.storageKey,300)});}
    return {complete:rows.every(row=>!row.issue&&row.scheduledAt!==null),rows,media};
  });
}
