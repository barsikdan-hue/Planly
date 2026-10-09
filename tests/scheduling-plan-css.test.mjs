import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const postcss=createRequire(require.resolve('@tailwindcss/postcss'))('postcss');

test('scheduling controls containing UUIDs wrap without clipping text or fixed row height',async()=>{
  const css=postcss.parse(await readFile(new URL('../app/globals.css',import.meta.url),'utf8'));
  for(const selector of ['.scheduling-warning button','.scheduling-selection button']){
    const declarations={};
    css.walkRules(rule=>{
      if(rule.selector.split(',').map(s=>s.trim()).includes(selector)){
        for(const node of rule.nodes)if(node.type==='decl')declarations[node.prop]=node.value;
      }
    });
    assert.equal(declarations['white-space'],'normal',`${selector}: UUID must wrap instead of expanding the grid`);
    assert.equal(declarations['overflow-wrap'],'anywhere',`${selector}: unbroken identifier must wrap`);
    assert.equal(declarations['max-width'],'100%',`${selector}: control must fit its container`);
    assert.equal(declarations.height,'auto',`${selector}: wrapped label must remain fully visible`);
  }
});
