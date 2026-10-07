import test from 'node:test';
import assert from 'node:assert/strict';
import { providerSchema, savePostInputSchema, toDbProvider, fromDbProvider } from '../lib/contracts/planner.ts';
import { validatePublicationContent } from '../lib/publication-content.ts';
import { networkNames } from '../lib/planner.ts';
import { blankPost } from '../lib/planner.ts';
import { readRecovery, writeRecovery } from '../lib/client/editor-recovery.ts';
import { slotQuerySchema } from '../lib/contracts/swipe-planner.ts';

test('VK is a distinct provider and round-trips without becoming MAX', () => {
  assert.equal(providerSchema.safeParse('vk').success, true);
  assert.equal(toDbProvider('vk' as Parameters<typeof toDbProvider>[0]), 'VK');
  assert.equal(fromDbProvider('VK' as Parameters<typeof fromDbProvider>[0]), 'vk');
  assert.equal((networkNames as Record<string,string>).vk, 'VK');
});

test('VK editor recovery preserves provider override and three targets after reload', () => {
  const data = new Map<string,string>();
  const storage = {getItem:(key:string)=>data.get(key) ?? null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
  const fields = {...blankPost(),text:'base',networks:['telegram','max','vk'] as ReturnType<typeof blankPost>['networks'],overrides:{vk:'VK frozen override'} as ReturnType<typeof blankPost>['overrides']};
  assert.equal(writeRecovery(storage,'vk-owner',fields), true);
  assert.deepEqual(readRecovery(storage,'vk-owner').editor?.networks, ['telegram','max','vk']);
  assert.equal((readRecovery(storage,'vk-owner').editor?.overrides as Record<string,string>)?.vk, 'VK frozen override');
  assert.equal(readRecovery(storage,'other-owner').editor, null);
});

test('existing queue slot contract accepts three unique providers', () => {
  assert.equal(slotQuerySchema.safeParse({providers:['telegram','max','vk'],startDate:'2030-01-01',endDate:'2030-01-01',weekdays:[1,2,3,4,5,6,7],times:['10:00']}).success, true);
});

test('one Post accepts three independent targets and rejects duplicate VK targets', () => {
  const input = {baseText:'three destinations', targets:[
    {provider:'telegram',socialAccountId:'tg'},
    {provider:'max',socialAccountId:'max'},
    {provider:'vk',socialAccountId:'vk'},
  ],mediaIds:[],status:'DRAFT'};
  assert.equal(savePostInputSchema.safeParse(input).success, true);
  assert.equal(savePostInputSchema.safeParse({...input, targets:[input.targets[2],input.targets[2]]}).success, false);
});

test('VK accepts text and JPEG/PNG, but excludes unsupported video before enqueue', () => {
  const vk = 'VK' as Parameters<typeof validatePublicationContent>[0];
  assert.equal(validatePublicationContent(vk,'text'), null);
  assert.equal(validatePublicationContent(vk,'caption', [{mimeType:'image/png',byteSize:32}]), null);
  assert.equal(validatePublicationContent(vk,'', [{mimeType:'image/jpeg',byteSize:32}]), null);
  assert.equal(validatePublicationContent(vk,'caption', [{mimeType:'video/mp4',byteSize:32}])?.code, 'VK_MEDIA_FORMAT');
  assert.equal(validatePublicationContent(vk,'', [])?.code, 'VK_CONTENT_LIMIT');
});
