import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {parseReactionCountUpdate,ReactionInputError} from '../lib/server/analytics/telegram.ts';
import {POST} from '../app/api/analytics/telegram/webhook/route.ts';
const previous=process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET;
afterEach(()=>{if(previous===undefined)delete process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET;else process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET=previous;});
const update={update_id:7,message_reaction_count:{chat:{id:-100123456,type:'channel',title:'Test'},message_id:31,date:1791457200,reactions:[{type:{type:'emoji',emoji:'👍'},total_count:4},{type:{type:'custom_emoji',custom_emoji_id:'1234'},total_count:2}]}};
test('Telegram parser keeps only channel aggregate identity and complete safe total',()=>{
  assert.deepEqual(parseReactionCountUpdate({...update,raw_actor:{id:'not-stored'}}),{updateId:7,destinationId:'-100123456',messageId:'31',eventAt:new Date('2026-10-08T11:00:00Z'),total:6});
  assert.equal(parseReactionCountUpdate({update_id:8,message:{text:'unrelated'}}),null);
  assert.equal(parseReactionCountUpdate({...update,message_reaction_count:{...update.message_reaction_count,reactions:[]}})?.total,0);
});
test('Telegram malformed or duplicate/unknown reaction vectors never become partial counts',()=>{
  for(const reactions of [null,[{total_count:3}],[{type:{type:'emoji',emoji:'👍'},total_count:-1}],[{type:{type:'emoji',emoji:'👍'},total_count:1.5}],[{type:{type:'unknown'},total_count:3}],Array(1001).fill({type:{type:'paid'},total_count:0}),[{type:{type:'paid'},total_count:Number.MAX_SAFE_INTEGER},{type:{type:'emoji',emoji:'👍'},total_count:1}],[update.message_reaction_count.reactions[0],update.message_reaction_count.reactions[0]]]) assert.throws(()=>parseReactionCountUpdate({...update,message_reaction_count:{...update.message_reaction_count,reactions}}),ReactionInputError);
  for(const chat of [{id:-123,type:'group'},{id:100,type:'channel'},{id:Number.MAX_SAFE_INTEGER+1,type:'channel'}]) assert.throws(()=>parseReactionCountUpdate({...update,message_reaction_count:{...update.message_reaction_count,chat}}),ReactionInputError);
});
test('Telegram webhook authenticates before malformed body, with no owner cookie',async()=>{
  process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET='synthetic_analytics_secret';
  const make=(secret?:string)=>new Request('https://planly.test/api/analytics/telegram/webhook',{method:'POST',headers:secret?{'X-Telegram-Bot-Api-Secret-Token':secret}:{},body:'{bad'});
  assert.equal((await POST(make())).status,401);assert.equal((await POST(make('wrong'))).status,401);
  assert.equal((await POST(make('synthetic_analytics_secret'))).status,400);
  delete process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET;assert.equal((await POST(make())).status,503);
});
test('Telegram webhook bounds streamed payload and ignores unrelated authenticated events',async()=>{
  process.env.TELEGRAM_ANALYTICS_WEBHOOK_SECRET='synthetic_analytics_secret';
  const make=(body:string)=>new Request('https://planly.test/api/analytics/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'synthetic_analytics_secret'},body});
  assert.equal((await POST(make(' '.repeat(65537)))).status,413);
  const ignored=await POST(make(JSON.stringify({update_id:1,message:{from:{id:123},text:'unused'}})));assert.equal(ignored.status,200);assert.deepEqual(await ignored.json(),{ok:true});
});
