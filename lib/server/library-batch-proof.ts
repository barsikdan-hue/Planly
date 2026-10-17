import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { libraryBatchHashSchema } from '../contracts/library-batch.ts';
import { getSessionEnv } from './env.ts';

const bindingSchema=z.object({ownerId:z.string().min(1).max(200),requestHash:libraryBatchHashSchema,snapshotFingerprint:libraryBatchHashSchema}).strict();
const envelopeSchema=bindingSchema.extend({v:z.literal(1),issuedAt:z.string().datetime(),expiresAt:z.string().datetime()}).strict();
const ttl=600_000;
const mac=(encoded:string)=>createHmac('sha256',getSessionEnv().SESSION_SECRET).update('planly.library-batch.preview.v1\n'+encoded).digest();
export type LibraryBatchPreviewBinding = z.infer<typeof bindingSchema>;
export function signLibraryBatchPreview(input: LibraryBatchPreviewBinding, now:Date=new Date()): string {
  const binding=bindingSchema.parse(input);
  const encoded=Buffer.from(JSON.stringify({v:1,...binding,issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+ttl).toISOString()})).toString('base64url');
  return encoded+'.'+mac(encoded).toString('base64url');
}
export function verifyLibraryBatchPreview(proof:string, expected:LibraryBatchPreviewBinding, now:Date=new Date()): boolean {
  if(typeof proof!=='string'||proof.length>2048||!Number.isFinite(now.getTime())) return false;
  try {
    const binding=bindingSchema.parse(expected);
    const parts=proof.split('.');
    if(parts.length!==2||!parts.every(value=>/^[A-Za-z0-9_-]+$/.test(value))) return false;
    const [encoded,signature]=parts;
    const actual=Buffer.from(signature,'base64url');
    if(actual.toString('base64url')!==signature) return false;
    const wanted=mac(encoded);
    if(actual.length!==wanted.length||!timingSafeEqual(actual,wanted)) return false;
    const raw=Buffer.from(encoded,'base64url');
    if(raw.toString('base64url')!==encoded) return false;
    const value=envelopeSchema.parse(JSON.parse(raw.toString('utf8')));
    const issuedAt=Date.parse(value.issuedAt),expiresAt=Date.parse(value.expiresAt);
    return value.ownerId===binding.ownerId&&value.requestHash===binding.requestHash&&value.snapshotFingerprint===binding.snapshotFingerprint&&
      Number.isFinite(issuedAt)&&expiresAt-issuedAt===ttl&&now.getTime()>=issuedAt&&now.getTime()<expiresAt;
  } catch {return false;}
}
