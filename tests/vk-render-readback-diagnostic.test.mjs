import {test} from 'node:test';
import assert from 'node:assert/strict';
import {describeReadback,sanitizeReadbackDiagnostic,classifyCreatedPostWithUnverifiedMedia} from '../experiments/vk-render-check/readback-diagnostic.mjs';
const expected={postId:51,wallOwner:-242095689,text:'PRIVATE_TEXT',attachment:'photo815727447_42'};
const matching=()=>({id:51,owner_id:-242095689,text:'PRIVATE_TEXT',attachments:[{type:'photo',photo:{owner_id:815727447,id:42,access_key:'PRIVATE_KEY'}}]});

test('diagnostic never returns expected/actual private values or payload fields',()=>{
 const p=matching();const d=describeReadback({items:[p],signed:'PRIVATE_URL'},expected);
 assert.equal(d.reason,'READBACK_MATCH');assert.equal(d.photoIdentityMatches,true);assert.equal(JSON.stringify(d).includes('PRIVATE'),false);assert.deepEqual(sanitizeReadbackDiagnostic(d),d);
});
test('photo identity mismatch separates owner and ID changes without exposing either identifier',()=>{
 const p=matching();p.attachments[0].photo={owner_id:expected.wallOwner,id:99};
 const d=describeReadback({items:[p]},expected);assert.equal(d.photoIdentityMatches,false);
 assert.deepEqual(d.photoIdentityDetails,{ownerMatches:false,idMatches:false,expectedOwnerIsWall:false,actualOwnerIsWall:true});
 assert.deepEqual(sanitizeReadbackDiagnostic(d),d);assert.equal(JSON.stringify(d).includes(String(expected.wallOwner)),false);assert.equal(JSON.stringify(d).includes('815727447'),false);
});

test('partial created-post classification never upgrades media, missing data or other mismatches to success',()=>{
 const p=matching();p.attachments[0].photo.id=99;const d=describeReadback({items:[p]},expected);
 assert.deepEqual(classifyCreatedPostWithUnverifiedMedia(d),{status:'POST_CREATED_MEDIA_UNVERIFIED',reason:'PHOTO_IDENTITY_CHANGED'});
 for(const key of ['postIdMatches','wallOwnerMatches','textMatches','photoCountMatches']){
  assert.equal(classifyCreatedPostWithUnverifiedMedia({...d,[key]:false}),null);assert.equal(classifyCreatedPostWithUnverifiedMedia({...d,[key]:null}),null);
 }
 assert.equal(classifyCreatedPostWithUnverifiedMedia({...d,photoIdentityMatches:null}),null);assert.equal(classifyCreatedPostWithUnverifiedMedia({...d,photoIdentityMatches:true}),null);
});
test('missing or invalid types explain unavailable fields without masking independent booleans',()=>{
 const p=matching();p.id='51';delete p.text;delete p.attachments[0].photo.id;
 const d=describeReadback({items:[p]},expected);assert.equal(d.reason,'READBACK_INVALID_SHAPE');assert.equal(d.postIdMatches,null);assert.equal(d.textMatches,null);assert.equal(d.wallOwnerMatches,true);assert.equal(d.photoCountMatches,true);assert.equal(d.photoIdentityMatches,null);
 assert.deepEqual(d.unavailable,{postIdMatches:'FIELD_INVALID',textMatches:'FIELD_MISSING',photoIdentityMatches:'FIELD_MISSING'});
});
test('photo identity retains legacy numeric/string template semantics and extra non-photo entries',()=>{
 const p=matching();p.attachments[0].photo.owner_id='815727447';p.attachments[0].photo.id='42';p.attachments.push([],false,1,'other');
 assert.equal(describeReadback({items:[p]},expected).reason,'READBACK_MATCH');
});
test('malformed attachments and missing photo object are structural, not false equality',()=>{
 for(const attachments of ['PRIVATE',null,[null],[{type:'photo'}]]){
  const d=describeReadback({items:[{...matching(),attachments}]},expected);assert.equal(d.reason,'READBACK_INVALID_SHAPE');assert.equal(d.photoIdentityMatches,null);assert.ok(d.unavailable.photoIdentityMatches);assert.equal(JSON.stringify(d).includes('PRIVATE'),false);
 }
});
test('sanitizer snapshots values once, strips extras and fails closed on hostile diagnostics',()=>{
 const d=describeReadback({items:[matching()]},expected);let reads=0;
 const safe=sanitizeReadbackDiagnostic({...d,get textMatches(){return ++reads===1?true:'PRIVATE';},payload:'PRIVATE'});assert.equal(safe.textMatches,true);assert.equal(reads,1);assert.equal(JSON.stringify(safe).includes('PRIVATE'),false);
 for(const unsafe of [{...d,reason:'PRIVATE'},{...d,itemsCount:Infinity},{...d,photoIdentityMatches:null,unavailable:{photoIdentityMatches:'PRIVATE'}},{get reason(){throw Error('PRIVATE');}}])assert.equal(sanitizeReadbackDiagnostic(unsafe),undefined);
});
