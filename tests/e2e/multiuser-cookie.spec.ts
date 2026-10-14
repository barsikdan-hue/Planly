import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { inArray } from 'drizzle-orm';
import { getDb, closeDb } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { hashOwnerPassword } from '../../lib/server/auth/password.ts';

test('delayed real A logout cannot remove the newer B browser session cookie',async({page,context},info)=>{
  const database=new URL(process.env.DATABASE_URL??'');
  expect(['localhost','127.0.0.1'].includes(database.hostname)&&database.pathname==='/planly_test').toBe(true);
  const suffix=randomUUID(),ids=[`browser-a-${suffix}`,`browser-b-${suffix}`],password='browser-fixture-password';
  const db=getDb(),backend=`http://127.0.0.1:${4321+info.workerIndex}`,base=`https://localhost:${4321+info.workerIndex}`;
  let server:ReturnType<typeof spawn>|undefined,releaseLogout:()=>void=()=>{},logout:Promise<unknown>|undefined;
  const delivered=new Promise<void>(resolve=>{releaseLogout=resolve;});
  let captured:()=>void=()=>{};const backendLogoutDone=new Promise<void>(resolve=>{captured=resolve;});
  try{
    const hash=await hashOwnerPassword(password);
    await db.insert(users).values(ids.map(id=>({id,email:`${id}@example.test`,displayName:id,role:'USER' as const,accessState:'ACTIVE' as const,authInitialized:true,passwordHash:hash})));
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(4321+info.workerIndex)],{env:{...process.env,NODE_ENV:'production'},stdio:'ignore',windowsHide:true});
    const deadline=Date.now()+10000;let ready=false;
    while(Date.now()<deadline){try{ready=(await fetch(`${backend}/api/health`,{signal:AbortSignal.timeout(1000)})).ok;}catch{/* bounded startup probe */}if(ready)break;await delay(100);}
    expect(ready).toBe(true);
    // Isolated HTTPS browser origin proxies the actual compiled backend.
    // Preserve Secure/HttpOnly and real Set-Cookie; only delay A's response.
    await context.route(`${base}/**`,async route=>{
      const path=new URL(route.request().url());
      const headers=await route.request().allHeaders();
      // The fixture proxy's API transport supplies metadata for the captured
      // origin; cross-origin requests retain their rejection classification.
      if(headers.origin)headers['sec-fetch-site']=new URL(headers.origin).origin===path.origin?'same-origin':'cross-site';
      const response=await route.fetch({url:`${backend}${path.pathname}${path.search}`,headers});
      if(path.pathname==='/api/auth/logout'){captured();await delivered;}
      await route.fulfill({response});
    });
    await page.goto(`${base}/login`);
    const login=async(id:string)=>page.evaluate(async({email,password})=>(await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})})).status,{email:`${id}@example.test`,password});
    expect(await login(ids[0])).toBe(200);
    const a=(await context.cookies(base)).find(cookie=>cookie.name==='planly_session');expect(Boolean(a)).toBe(true);
    logout=page.evaluate(async()=>(await fetch('/api/auth/logout',{method:'POST'})).status);
    await backendLogoutDone;expect(await login(ids[1])).toBe(200);
    const b=(await context.cookies(base)).find(cookie=>cookie.name==='planly_session');expect(Boolean(b)&&b!.value!==a!.value).toBe(true);
    const profile=async()=>page.evaluate(async()=>{const response=await fetch('/api/profile');return {status:response.status,body:await response.json()};});
    expect((await profile()).body.id).toBe(ids[1]);
    releaseLogout();expect(await logout).toBe(200);
    // Actual Chromium applies the real delayed response headers before this read.
    expect((await fetch(`${backend}/api/profile`,{headers:{cookie:`planly_session=${a!.value}`}})).status).toBe(401);
    expect((await fetch(`${backend}/api/profile`,{headers:{cookie:`planly_session=${b!.value}`}})).status).toBe(200);
    const current=await profile();expect(current.status).toBe(200);expect(current.body.id).toBe(ids[1]);
    expect((await context.cookies(base)).some(cookie=>cookie.name==='planly_session'&&cookie.value===b!.value)).toBe(true);
    await page.goto(`${base}/`);await page.reload();expect(new URL(page.url()).pathname).toBe('/');expect((await profile()).body.id).toBe(ids[1]);
  }finally{
    releaseLogout();await logout?.catch(()=>{});
    if(server&&server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}
    await db.delete(users).where(inArray(users.id,ids));await closeDb();
  }
});
