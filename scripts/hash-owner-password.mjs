#!/usr/bin/env node

import { hashOwnerPassword } from '../lib/server/auth/password.ts';

async function readPassword() {
  if (!process.stdin.isTTY) {
    let value = '';
    for await (const chunk of process.stdin) value += chunk;
    return value.replace(/[\r\n]+$/, '');
  }

  process.stdout.write('Owner password: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };
    process.stdin.on('data', (key) => {
      if (key === '\u0003') {
        process.stdin.setRawMode(false);
        reject(new Error('Cancelled.'));
        return;
      }
      if (key === '\r' || key === '\n') return finish();
      if (key === '\u007f') {
        value = value.slice(0, -1);
        return;
      }
      value += key;
    });
  });
}

const password = await readPassword();
if (!password) throw new Error('Password must not be empty.');
console.log(await hashOwnerPassword(password));
