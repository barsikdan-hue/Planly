import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../docs/editorial/lentaro-m1-2026-10-19/',import.meta.url);
test('portable pilot retains every reviewed text/image/evidence byte across checkout platforms',async()=>{
 const manifest=JSON.parse(await readFile(new URL('bundle-manifest.json',root),'utf8')) as {files:{path:string;sha256:string;bytes:number}[]};
 assert.ok(manifest.files.length>20);
 for(const file of manifest.files){
  assert.ok(!file.path.includes('..')&&!file.path.startsWith('/'));
  const bytes=await readFile(new URL(file.path,root));
  assert.equal(bytes.length,file.bytes,file.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
 }
 const textFiles=manifest.files.filter(file=>/^materials\/L0[123]-r1\.txt$/.test(file.path));
 const images=manifest.files.filter(file=>/^assets\/final\/L0[123]-r1-portrait\.jpg$/.test(file.path));
 assert.equal(textFiles.length,3);assert.equal(images.length,3);
});
