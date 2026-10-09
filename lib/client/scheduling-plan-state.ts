import type { PlanSettings, SchedulingPlanPreview, SchedulingPlanCommitResult } from '../contracts/scheduling-plan.ts';
export type SchedulingPlanState={postIds:string[];settings:PlanSettings|null;preview:SchedulingPlanPreview|null;reviewed:Record<string,string>;revision:number;requestRevision:number|null;previewBusy:boolean;committing:boolean;recoveryBlocked:boolean;result:SchedulingPlanCommitResult|null;error:string|null};
export type SchedulingPlanEvent=
  |{type:'SELECT';postIds:string[]}|{type:'SETTINGS';settings:PlanSettings}
  |{type:'PREVIEW_START';revision:number}|{type:'PREVIEW_RECEIVED';revision:number;preview:SchedulingPlanPreview}
  |{type:'REVIEW';postId:string;checked:boolean}|{type:'RECOVERY';blocked:boolean}
  |{type:'COMMIT_START'}|{type:'COMMITTED';result:SchedulingPlanCommitResult}|{type:'ERROR';message:string};
export function initialSchedulingPlanState():SchedulingPlanState{return {postIds:[],settings:null,preview:null,reviewed:{},revision:0,requestRevision:null,previewBusy:false,committing:false,recoveryBlocked:false,result:null,error:null};}
export function reduceSchedulingPlan(state:SchedulingPlanState,event:SchedulingPlanEvent):SchedulingPlanState {
  switch(event.type){
    case 'SELECT':return {...state,postIds:[...event.postIds],preview:null,reviewed:{},revision:state.revision+1,requestRevision:null,previewBusy:false,error:null};
    case 'SETTINGS':return {...state,settings:{...event.settings,weekdays:[...event.settings.weekdays],times:[...event.settings.times]},preview:null,reviewed:{},revision:state.revision+1,requestRevision:null,previewBusy:false,error:null};
    case 'PREVIEW_START':if(event.revision!==state.revision)return state;return {...state,preview:null,reviewed:{},revision:state.revision+1,requestRevision:state.revision+1,previewBusy:true,error:null};
    case 'PREVIEW_RECEIVED':if(event.revision!==state.revision||event.revision!==state.requestRevision)return state;return {...state,preview:event.preview,reviewed:{},previewBusy:false,requestRevision:null};
    case 'REVIEW':{const row=state.preview?.rows.find(r=>r.post.id===event.postId);if(!row?.fingerprint||row.issue||!row.scheduledAt)return state;const reviewed={...state.reviewed};if(event.checked)reviewed[event.postId]=row.fingerprint;else delete reviewed[event.postId];return {...state,reviewed};}
    case 'RECOVERY':return {...state,recoveryBlocked:event.blocked};
    case 'COMMIT_START':return canConfirmSchedulingPlan(state)?{...state,committing:true,error:null}:state;
    case 'COMMITTED':return {...state,committing:false,result:event.result,preview:null,reviewed:{},error:null};
    case 'ERROR':return {...state,error:event.message,preview:null,reviewed:{},committing:false,previewBusy:false,requestRevision:null};
  }
}
export function canConfirmSchedulingPlan(state:SchedulingPlanState):boolean {
  return !!state.settings&&!state.committing&&!state.previewBusy&&!state.recoveryBlocked&&state.postIds.length>0&&state.postIds.length<=20&&new Set(state.postIds).size===state.postIds.length&&!!state.preview?.complete&&state.preview.rows.length===state.postIds.length&&state.preview.rows.every((row,i)=>row.post.id===state.postIds[i]&&!row.issue&&!!row.scheduledAt&&!!row.fingerprint&&state.reviewed[row.post.id]===row.fingerprint);
}
