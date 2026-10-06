// Catches unsafe durable admission/cleanup, corrupt decoding and owner/raw overlap.
import test from 'node:test';
import assert from 'node:assert/strict';
const moduleUrl=new URL('../lib/client/library-creation-attempt.ts',import.meta.url).href;
async function helpers(){const value=await import(moduleUrl).catch(()=>null);assert.ok(value,'durable Library attempt storage must exist');return value;}
const attempt=()=>({version:1,creationKey:'a0000000-0000-4000-8000-000000000001',editorToken:'b0000000-0000-4000-8000-000000000001',editorRevision:2,input:{title:null,text:'Original',mediaIds:['b','a']}});
function storage(){const values=new Map<string,string>();return {values,fail:'',silent:'',getItem(key:string){if(this.fail==='get')throw Error('get');if(this.silent==='get')return null;return values.get(key)??null;},setItem(key:string,value:string){if(this.fail==='set')throw Error('set');if(this.silent!=='set')values.set(key,value);},removeItem(key:string){if(this.fail==='remove')throw Error('remove');if(this.silent!=='remove')values.delete(key);}};}
test('frozen original envelope clones ordered media and isolates owners and raw recovery',async()=>{
  const h=await helpers(),cache=storage(),value=attempt();cache.setItem('planly:library-editor:v1:A','raw');
  assert.equal(h.writeLibraryCreationAttempt(cache,'A',value),true);value.input.mediaIds.reverse();value.input.text='Caller mutated';
  assert.deepEqual(h.readLibraryCreationAttempt(cache,'A'),{attempt:attempt(),unavailable:false,invalid:false});
  assert.deepEqual(h.readLibraryCreationAttempt(cache,'B'),{attempt:null,unavailable:false,invalid:false});
  assert.equal(h.libraryCreationAttemptKey('a/b'),'planly:library-create:v1:a%2Fb');
  assert.equal(cache.getItem('planly:library-editor:v1:A'),'raw');assert.notEqual(attempt().creationKey,attempt().editorToken);
});
test('strict bounds reject corrupt/version/UUID/revision/input/unknown fields without cleanup',async()=>{
  const h=await helpers(),cache=storage(),key=h.libraryCreationAttemptKey('A');
  const invalid=[{...attempt(),version:2},{...attempt(),creationKey:'bad'},{...attempt(),editorToken:'bad'},
    {...attempt(),editorRevision:-1},{...attempt(),editorRevision:Number.MAX_SAFE_INTEGER+1},{...attempt(),extra:true},
    {...attempt(),input:{...attempt().input,title:'x'.repeat(201)}},{...attempt(),input:{...attempt().input,text:'x'.repeat(20001)}},
    {...attempt(),input:{...attempt().input,mediaIds:['x'.repeat(201)]}}, {...attempt(),input:{...attempt().input,mediaIds:['a','a']}},
    {...attempt(),input:{...attempt().input,extra:true}}];
  for(const value of invalid){const raw=JSON.stringify(value);cache.setItem(key,raw);assert.equal(h.readLibraryCreationAttempt(cache,'A').invalid,true);assert.equal(cache.getItem(key),raw);assert.equal(h.writeLibraryCreationAttempt(cache,'B',value),false);}
  for(const raw of ['{','x'.repeat(150001),'null']){cache.setItem(key,raw);assert.equal(h.readLibraryCreationAttempt(cache,'A').invalid,true);assert.equal(cache.getItem(key),raw);}
  cache.removeItem(key);const bound={...attempt(),editorRevision:Number.MAX_SAFE_INTEGER,input:{title:'x'.repeat(200),text:'x'.repeat(20000),mediaIds:Array.from({length:20},(_,i)=>`${i}`)}};
  assert.equal(h.writeLibraryCreationAttempt(cache,'A',bound),true);
});
for(const mode of ['get','set'])for(const kind of ['fail','silent'] as const)test(`${kind} ${mode} denies durable attempt write`,async()=>{
  const h=await helpers(),cache=storage();cache[kind]=mode;assert.equal(h.writeLibraryCreationAttempt(cache,'A',attempt()),false);
  assert.equal(cache.values.get('planly:library-editor:v1:A'),undefined);
});
for(const kind of ['fail','silent'] as const)test(`${kind} removal retains unresolved intent and reports failure`,async()=>{
  const h=await helpers(),cache=storage();assert.equal(h.writeLibraryCreationAttempt(cache,'A',attempt()),true);cache[kind]='remove';
  assert.equal(h.clearLibraryCreationAttempt(cache,'A',attempt()),false);assert.deepEqual(h.readLibraryCreationAttempt(cache,'A').attempt,attempt());
});
test('exact cleanup refuses newer key/token/revision/payload and unreadable state',async()=>{
  const h=await helpers(),cache=storage(),key=h.libraryCreationAttemptKey('A');
  for(const newer of [{...attempt(),creationKey:'c0000000-0000-4000-8000-000000000001'}, {...attempt(),editorToken:'d0000000-0000-4000-8000-000000000001'}, {...attempt(),editorRevision:3}, {...attempt(),input:{...attempt().input,text:'Newer'}}]){
    cache.setItem(key,JSON.stringify(newer));assert.equal(h.clearLibraryCreationAttempt(cache,'A',attempt()),false);assert.deepEqual(h.readLibraryCreationAttempt(cache,'A').attempt,newer);
  }
  cache.setItem(key,JSON.stringify(attempt()));cache.fail='get';assert.equal(h.clearLibraryCreationAttempt(cache,'A',attempt()),false);assert.equal(h.readLibraryCreationAttempt(cache,'A').unavailable,true);
  cache.fail='';assert.equal(h.clearLibraryCreationAttempt(cache,'A',attempt()),true);assert.equal(cache.getItem(key),null);
});
