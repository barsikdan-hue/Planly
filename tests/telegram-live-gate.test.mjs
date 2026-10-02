import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('real Telegram job requires a fresh explicit push and never repeats on workflow rerun',async()=>{
 const source=await readFile(new URL('../.github/workflows/self-host.yml',import.meta.url),'utf8');
 const job=source.split('  telegram-live:')[1];
 assert.ok(job);
 const gate=job.match(/^\s*if: (.*)$/m)?.[1] ?? '';
 assert.match(gate,/github\.event_name == 'push'/);
 assert.match(gate,/github\.run_attempt == 1/);
 assert.match(gate,/contains\(github\.event\.head_commit\.message, '\[telegram-live\]'\)/);
});
