import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePost,movePost,moscowDate} from '../lib/planner.ts';
test('empty posts and missing targets cannot be scheduled',()=>{
 assert.match(validatePost({text:' ',networks:['telegram'],date:'2030-01-01',time:'12:00'},'scheduled',0)??'',/текст/);
 assert.match(validatePost({text:'hello',networks:[],date:'2030-01-01',time:'12:00'},'scheduled',0)??'',/соцсеть/);
});
test('reject invalid and past times, accept future Moscow time',()=>{
 const p={text:'hello',networks:['telegram'],date:'2030-01-01',time:'12:00'};
 assert.equal(validatePost(p,'scheduled',0),null);
 assert.ok(validatePost({...p,date:'invalid'},'scheduled',0));
 assert.ok(validatePost(p,'scheduled',Date.parse('2031-01-01')));
 assert.equal(moscowDate('2030-01-01','12:00').toISOString(),'2030-01-01T09:00:00.000Z');
});
test('rescheduling preserves content and independent targets',()=>{
 const post={id:'a',text:'text',date:'2030-01-01',time:'12:00',targets:[{network:'telegram',status:'published'},{network:'vk',status:'failed'}]};
 const moved=movePost(post,'2030-01-02','15:00');
 assert.equal(moved.date,'2030-01-02');assert.deepEqual(moved.targets,post.targets);assert.equal(post.date,'2030-01-01');
});
test('invalid dates and times cannot silently roll into another day',()=>{
 const p={text:'hello',networks:['telegram'],date:'2030-02-31',time:'12:00'};
 assert.ok(validatePost(p,'scheduled',0));
 assert.ok(validatePost({...p,date:'2030-01-01',time:'24:00'},'scheduled',0));
 assert.ok(validatePost({...p,date:'2030-01-01',time:'12:60'},'scheduled',0));
});
test('drafts may omit social networks and schedule, but still require content',()=>{
 assert.equal(validatePost({text:'a draft',networks:[],date:'',time:''},'draft'),null);
});

test('confirmed Telegram publication and failed MAX remain independent in UI', async () => {
 const {fromServerPost}=await import('../lib/planner.ts');
 const post=fromServerPost({id:'real',title:null,baseText:'hello',status:'READY',mediaIds:[],createdAt:'2030-01-01T00:00:00Z',updatedAt:'2030-01-01T00:00:00Z',targets:[
  {id:'tg',socialAccountId:'a',provider:'telegram',textOverride:null,scheduledAt:'2030-01-01T09:00:00Z',publication:{status:'PUBLISHED',remoteId:'71',remoteUrl:'https://t.me/planly_test/71',error:null}},
  {id:'max',socialAccountId:'b',provider:'max',textOverride:null,scheduledAt:'2030-01-01T09:00:00Z',publication:{status:'FAILED',remoteId:null,remoteUrl:null,error:'Provider unavailable'}},
 ]});
 assert.deepEqual(post.targets.map(t=>[t.network,t.status]),[['telegram','published'],['max','failed']]);
 assert.equal(post.targets[0].remoteUrl,'https://t.me/planly_test/71');
 assert.equal(post.targets[1].error,'Provider unavailable');
 assert.equal(post.status,'failed');
});

test('publish now creates READY targets at the supplied time for the same queue path', async()=>{
 const planner=await import('../lib/planner.ts');
 assert.equal(typeof planner.toPublishNowInput,'function');
 const input=planner.toPublishNowInput({text:'now',networks:['telegram'],mediaIds:['photo'],overrides:{telegram:'specific'}},Date.parse('2030-01-01T09:12:34Z'));
 assert.equal(input.status,'READY');
 assert.deepEqual(input.targets,[{provider:'telegram',textOverride:'specific',scheduledAt:'2030-01-01T09:12:34.000Z'}]);
 assert.deepEqual(input.mediaIds,['photo']);
});
