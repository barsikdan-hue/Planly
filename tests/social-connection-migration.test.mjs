import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

test('0013 additive rehearsal: empty, preserved legacy, duplicate STOP with data intact',async()=>{
  const url=new URL(process.env.DATABASE_URL??'');
  assert.ok(['127.0.0.1','localhost','postgres'].includes(url.hostname),'migration rehearsal requires isolated local/CI PostgreSQL');
  assert.equal(url.pathname,'/planly_test','never migrate an existing application database');
  const adminUrl=new URL(url);adminUrl.pathname='/postgres';
  const admin=new Pool({connectionString:adminUrl.toString(),max:1});
  const folder=await mkdtemp(join(tmpdir(),'planly-i66-e2-migration-'));
  const baseline=join(folder,'baseline');await mkdir(join(baseline,'meta'),{recursive:true});
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  const entries=journal.entries.filter(entry=>entry.idx<=12);
  await writeFile(join(baseline,'meta/_journal.json'),JSON.stringify({...journal,entries}));
  for(const entry of entries) await copyFile(`drizzle/${entry.tag}.sql`,join(baseline,`${entry.tag}.sql`));
  const created=[];
  try {
    for(const scenario of ['empty','legacy','duplicate-numeric','duplicate-alias']) {
      const name=`planly_i66_e2_${randomUUID().replaceAll('-','')}`;
      assert.match(name,/^planly_i66_e2_[a-f0-9]{32}$/);
      await admin.query(`CREATE DATABASE "${name}"`);created.push(name);
      const childUrl=new URL(url);childUrl.pathname=`/${name}`;
      const pool=new Pool({connectionString:childUrl.toString(),max:1});
      try {
        if(scenario!=='empty') {
          await migrate(drizzle(pool),{migrationsFolder:baseline});
          await pool.query("INSERT INTO users(id,email,display_name) VALUES('legacy-a','a@example.test','A'),('legacy-b','b@example.test','B')");
          const dest=scenario==='duplicate-alias'?'@CaseAlias':'-12345';
          await pool.query("INSERT INTO social_accounts(id,user_id,provider,provider_account_id,display_name,enabled,connection_status) VALUES('legacy-a','legacy-a','TELEGRAM',$1,'Existing',true,'CONNECTED')",[dest]);
          if(scenario.startsWith('duplicate')) await pool.query("INSERT INTO social_accounts(id,user_id,provider,provider_account_id,display_name,enabled,connection_status) VALUES('legacy-b','legacy-b','TELEGRAM',$1,'Existing B',true,'CONNECTED')",[scenario==='duplicate-alias'?'@casealias':'-012345']);
        }
        const before=(await pool.query("SELECT to_regclass('social_accounts') AS table_name")).rows[0].table_name?(await pool.query('SELECT * FROM social_accounts ORDER BY id')).rows:[];
        if(scenario.startsWith('duplicate')) {
          await assert.rejects(()=>migrate(drizzle(pool),{migrationsFolder:'drizzle'}),error=>String(error.cause?.message??error.message).includes('SOCIAL_CONNECTION_LEGACY_DUPLICATES'));
          assert.deepEqual((await pool.query('SELECT * FROM social_accounts ORDER BY id')).rows,before);
          assert.equal((await pool.query("SELECT to_regclass('social_bindings') AS table_name")).rows[0].table_name,null);
        } else {
          await migrate(drizzle(pool),{migrationsFolder:'drizzle'});
          assert.equal((await pool.query('SELECT count(*)::int AS count FROM social_bindings')).rows[0].count,0,'legacy is never backfilled with human grants');
          if(scenario==='legacy') {
            const current=(await pool.query('SELECT * FROM social_accounts ORDER BY id')).rows;
            for(const key of Object.keys(before[0])) assert.deepEqual(current[0][key],before[0][key]);
            assert.equal(current[0].binding_revision,0);assert.equal(current[0].connection_generation,0);
          }
          const fields=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='publications' AND column_name IN ('social_binding_revision','social_binding_destination_id') AND is_nullable='YES'")).rows;
          assert.equal(fields.length,2);
        }
      } finally {await pool.end();}
    }
  } finally {
    // Only names recorded after this test successfully created its own database.
    for(const name of created) {assert.match(name,/^planly_i66_e2_[a-f0-9]{32}$/);await admin.query(`DROP DATABASE "${name}"`);}
    await admin.end();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir())+'\\') || resolve(folder).startsWith(resolve(tmpdir())+'/'));
    await rm(folder,{recursive:true,force:true});
  }
});
