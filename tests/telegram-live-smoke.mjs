// Real side effects. Never imported by pnpm test or ordinary self-host smoke.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fromServerPost } from '../lib/planner.ts';

const base = process.env.PLANLY_BASE_URL;
const destination = process.env.PLANLY_TELEGRAM_TEST_CHANNEL;
if (process.env.PLANLY_TELEGRAM_LIVE_TEST !== 'confirmed-test-channel' || !destination || !base ||
    !['localhost','127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('Live Telegram smoke requires explicit test-channel opt-in and an isolated localhost stack.');
}
let cookie = '';
async function api(path, method='GET', body) {
  const headers = new Headers();
  if (cookie) headers.set('cookie',cookie);
  if (body && !(body instanceof FormData)) headers.set('content-type','application/json');
  const response = await fetch(`${base}${path}`,{method,headers,body:body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,signal:AbortSignal.timeout(30_000)});
  if (path === '/api/auth/login') cookie=response.headers.get('set-cookie')?.split(';',1)[0] ?? '';
  if (!response.ok) throw new Error(`Live smoke API request failed: ${path} (${response.status})`);
  return response.status === 204 ? null : response.json();
}
await api('/api/auth/login','POST',{email:process.env.PLANLY_OWNER_EMAIL,password:process.env.PLANLY_OWNER_PASSWORD});
assert.ok(cookie);
const initial=await api('/api/bootstrap');
const account=initial.socialAccounts.find(a=>a.provider==='telegram');
assert.ok(account);
const connected=await api(`/api/social-accounts/${encodeURIComponent(account.id)}`,'PATCH',{destinationId:destination});
assert.equal(connected.connectionStatus,'CONNECTED');
async function upload(name,type) {
  const bytes=await readFile(`artifacts/telegram-fixtures/${name}`);
  const form=new FormData();form.set('file',new Blob([bytes],{type}),name);
  return (await api('/api/media','POST',form)).id;
}
const photo=await upload('photo.png','image/png');
const video=await upload('video.mp4','video/mp4');
const second=await upload('photo2.png','image/png');
const runLabel=`Planly test ${new Date().toISOString()}`;
const evidence=[];
for (const [label,mediaIds,delay] of [['text',[],0],['photo',[photo],0],['video',[video],0],['album',[photo,second],15_000]]) {
  const created=await api('/api/posts','POST',{baseText:`[ТЕСТ PLANLY] ${label}\n${runLabel}`,status:'READY',targets:[{provider:'telegram',textOverride:null,scheduledAt:new Date(Date.now()+delay).toISOString()}],mediaIds});
  const deadline=Date.now()+120_000;
  let post;
  while (Date.now()<deadline) {
    const snapshot=await api('/api/bootstrap');
    post=snapshot.posts.find(p=>p.id===created.id);
    const state=post?.targets[0]?.publication?.status;
    if (state==='PUBLISHED') break;
    if (state==='FAILED' || state==='REQUIRES_RECONNECT') throw new Error(`Live Telegram ${label} failed; inspect the publication's safe diagnostic in Planly.`);
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const publication=post?.targets[0]?.publication;
  assert.equal(publication?.status,'PUBLISHED',`${label} confirmation deadline`);
  assert.ok(publication.remoteId);
  assert.equal(fromServerPost(post).targets[0].status,'published');
  evidence.push({label,postId:post.id,remoteId:publication.remoteId,remoteUrl:publication.remoteUrl});
  console.log(`PASS Telegram ${label}: provider confirmation, stored ID and UI status`);
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/telegram-live-evidence.json',JSON.stringify({commit:process.env.GITHUB_SHA,destination,canonicalChatId:connected.providerAccountId,evidence},null,2));
console.log('Live Telegram messages remain in the designated channel for owner review.');
