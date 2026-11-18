// Observation only. The verifier's original strict matcher remains the acceptance oracle.
const checkNames=['postIdMatches','wallOwnerMatches','textMatches','photoCountMatches','photoIdentityMatches'];
const reasons=['READBACK_MATCH','READBACK_MISMATCH','READBACK_INVALID_SHAPE','READBACK_ITEM_MISSING','READBACK_API_ERROR','READBACK_INCOMPLETE'];
const responseTypes=['OBJECT','ARRAY','NULL','STRING','NUMBER','BOOLEAN','UNDEFINED','OTHER','UNAVAILABLE'];
const unavailableReasons=['POST_UNAVAILABLE','FIELD_MISSING','FIELD_INVALID','PHOTO_COUNT_NOT_ONE','READBACK_ERROR','EXPECTED_IDENTITY_NOT_RETAINED'];
const errorTypes=['VK_API','HTTP','RESPONSE_SHAPE','TRANSPORT'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const responseType=value=>value===null?'NULL':Array.isArray(value)?'ARRAY':({object:'OBJECT',string:'STRING',number:'NUMBER',boolean:'BOOLEAN',undefined:'UNDEFINED'})[typeof value]??'OTHER';
function blank(reason,type,count,unavailableReason){
 const out={reason,responseType:type,itemsCount:count,unavailable:{}};
 for(const name of checkNames){out[name]=null;out.unavailable[name]=unavailableReason;}
 return out;
}
export function describeReadback(read,expected){
 const type=responseType(read),items=record(read)?read.items:undefined;
 const count=Array.isArray(items)?items.length:null;
 if(!Array.isArray(items)||items.length!==1||!record(items[0]))return blank(
  Array.isArray(items)&&items.length===0?'READBACK_ITEM_MISSING':'READBACK_INVALID_SHAPE',type,count,'POST_UNAVAILABLE');
 const post=items[0],out={reason:'READBACK_MATCH',responseType:type,itemsCount:count,unavailable:{}};
 function unavailable(name,reason){out[name]=null;out.unavailable[name]=reason;}
 function compare(name,field,type,wanted){
  if(!Object.hasOwn(post,field))return unavailable(name,'FIELD_MISSING');
  if(typeof post[field]!==type)return unavailable(name,'FIELD_INVALID');
  out[name]=post[field]===wanted;
 }
 compare('postIdMatches','id','number',expected.postId);
 compare('wallOwnerMatches','owner_id','number',expected.wallOwner);
 compare('textMatches','text','string',expected.text);
 const attachments=post.attachments;
 if(!Object.hasOwn(post,'attachments')||!Array.isArray(attachments)||attachments.some(a=>a===null||a===undefined)){
  const reason=Object.hasOwn(post,'attachments')?'FIELD_INVALID':'FIELD_MISSING';
  unavailable('photoCountMatches',reason);unavailable('photoIdentityMatches',reason);
 }else{
  // Match the original filter, including its treatment of non-photo extra entries.
  const photos=attachments.filter(a=>a.type==='photo');out.photoCountMatches=photos.length===1;
  if(photos.length!==1)unavailable('photoIdentityMatches','PHOTO_COUNT_NOT_ONE');
  else{
   const photo=photos[0].photo;
   if(!record(photo)||!Object.hasOwn(photo,'owner_id')||!Object.hasOwn(photo,'id'))unavailable('photoIdentityMatches',record(photo)?'FIELD_MISSING':'FIELD_INVALID');
   else if(!['number','string'].includes(typeof photo.owner_id)||!['number','string'].includes(typeof photo.id))unavailable('photoIdentityMatches','FIELD_INVALID');
   // Do not tighten the old template-string comparison's numeric/string identity semantics.
   else{
    out.photoIdentityMatches=`photo${photo.owner_id}_${photo.id}`===expected.attachment;
    const parts=typeof expected.attachment==='string'?/^photo(-?[1-9]\d*)_([1-9]\d*)$/.exec(expected.attachment):null;
    if(parts)out.photoIdentityDetails={ownerMatches:String(photo.owner_id)===parts[1],idMatches:String(photo.id)===parts[2],expectedOwnerIsWall:parts[1]===String(expected.wallOwner),actualOwnerIsWall:String(photo.owner_id)===String(expected.wallOwner)};
   }
  }
 }
 out.reason=Object.values(out.unavailable).some(r=>r!=='PHOTO_COUNT_NOT_ONE')?'READBACK_INVALID_SHAPE':
  checkNames.every(name=>out[name]===true)?'READBACK_MATCH':'READBACK_MISMATCH';
 return out;
}
export function describeReadbackError(errorType){
 const reason=errorType==='RESPONSE_SHAPE'?'READBACK_INVALID_SHAPE':'READBACK_API_ERROR';
 return {...blank(reason,'UNAVAILABLE',null,'READBACK_ERROR'),errorType:errorTypes.includes(errorType)?errorType:'TRANSPORT'};
}
// Existing records have no retained pre-publication attachment receipt. Never invent one.
export function describeExistingReadback(read,expected){
 const out=describeReadback(read,{...expected,attachment:undefined});
 if(out.photoIdentityMatches!==null){
  out.photoIdentityMatches=null;out.unavailable.photoIdentityMatches='EXPECTED_IDENTITY_NOT_RETAINED';
  if(out.reason!=='READBACK_INVALID_SHAPE')out.reason=['postIdMatches','wallOwnerMatches','textMatches','photoCountMatches'].every(k=>out[k]===true)?'READBACK_INCOMPLETE':'READBACK_MISMATCH';
 }
 return out;
}
export function sanitizeReadbackDiagnostic(value){
 try{
  if(!record(value))return;
  const {reason,responseType,itemsCount,errorType,unavailable}=value;
  if(!reasons.includes(reason)||!responseTypes.includes(responseType)||!(itemsCount===null||Number.isSafeInteger(itemsCount)&&itemsCount>=0&&itemsCount<=1_048_576)||!record(unavailable))return;
  const out={reason,responseType,itemsCount,unavailable:{}};
  const details=value.photoIdentityDetails;
  if(record(details)){
   const safe={};for(const name of ['ownerMatches','idMatches','expectedOwnerIsWall','actualOwnerIsWall']){const result=details[name];if(typeof result!=='boolean')return;safe[name]=result;}
   out.photoIdentityDetails=safe;
  }
  if(errorType!==undefined){if(!errorTypes.includes(errorType))return;out.errorType=errorType;}
  for(const name of checkNames){
   const result=value[name];if(result!==null&&typeof result!=='boolean')return;
   out[name]=result;
   if(result===null){const why=unavailable[name];if(!unavailableReasons.includes(why))return;out.unavailable[name]=why;}
  }
  return out;
 }catch{return;}
}
