import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,readdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
export async function localStore(directory){
 await mkdir(path.join(directory,'media'),{recursive:true});
 const db=new DatabaseSync(path.join(directory,'planly.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY);');
 for(const filename of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
   if(!db.prepare('SELECT name FROM local_migrations WHERE name=?').get(filename)){
     db.exec('BEGIN');try{db.exec(await readFile(path.join('drizzle',filename),'utf8'));db.prepare('INSERT INTO local_migrations VALUES(?)').run(filename);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e;}
   }
 }
 const prepare=(sql,args=[])=>({bind(...values){return prepare(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}});
 const DB={prepare,async batch(statements){db.exec('BEGIN IMMEDIATE');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e}}};
 const valid=id=>{if(!/^[a-zA-Z0-9-]+$/.test(id))throw new Error('Invalid media ID');return path.join(directory,'media',id)};
 const BUCKET={async put(id,bytes){await writeFile(valid(id),new Uint8Array(bytes))},async get(id){try{const value=await readFile(valid(id));return {body:value,arrayBuffer:async()=>value}}catch(e){if(e.code==='ENOENT')return null;throw e}},async delete(id){await unlink(valid(id)).catch(e=>{if(e.code!=='ENOENT')throw e})}};
 return {DB,BUCKET,close:()=>db.close()};
}
