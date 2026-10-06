import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as contracts from '../lib/contracts/library.ts';
import type { CreateLibraryItemInput } from '../lib/contracts/library.ts';

test('canonical title and ordered media are exact, invalid content cannot be hashed', async () => {
  const projection=(contracts as unknown as {canonicalLibraryCreateInput?: (raw:CreateLibraryItemInput)=>unknown}).canonicalLibraryCreateInput;
  assert.equal(typeof projection,'function','Library canonical projection must exist');
  const project=projection!;
  assert.deepEqual(project({text:'  Copy  ',mediaIds:['b','a']}),{title:null,text:'Copy',mediaIds:['b','a']});
  assert.deepEqual(project({title:null,text:'Copy',mediaIds:[]}),{title:null,text:'Copy',mediaIds:[]});
  assert.deepEqual(project({title:' ',text:'Copy',mediaIds:[]}),{title:'',text:'Copy',mediaIds:[]});
  assert.throws(()=>project({text:' ',mediaIds:[]})); assert.throws(()=>project({text:'Copy',mediaIds:['a','a']}));
  const helper=await import(new URL('../lib/server/library-creation.ts',import.meta.url).href);
  const hash=helper.libraryCreationInputHash;
  assert.equal(hash({text:' Copy ',mediaIds:['b','a']}),createHash('sha256').update('{"title":null,"text":"Copy","mediaIds":["b","a"]}').digest('hex'));
  assert.equal(hash({text:'Copy',mediaIds:[]}),hash({title:null,text:'Copy',mediaIds:[]}));
  assert.notEqual(hash({text:'Copy',mediaIds:[]}),hash({title:'',text:'Copy',mediaIds:[]}));
  assert.notEqual(hash({text:'Copy',mediaIds:['a','b']}),hash({text:'Copy',mediaIds:['b','a']}));
  assert.equal(hash({text:'Copy',mediaIds:[],inputHash:'untrusted'}),hash({text:'Copy',mediaIds:[]}));
});
test('Library creation keys validate UUID and normalize case', () => {
  const schema=(contracts as unknown as {libraryCreationKeySchema?: {parse:(raw:unknown)=>string}}).libraryCreationKeySchema;
  assert.ok(schema,'Library key schema must exist');
  assert.equal(schema.parse('A0000000-0000-4000-8000-000000000001'),'a0000000-0000-4000-8000-000000000001');
  for(const invalid of [null,'','not-a-uuid',' a0000000-0000-4000-8000-000000000001']) assert.throws(()=>schema.parse(invalid));
});
