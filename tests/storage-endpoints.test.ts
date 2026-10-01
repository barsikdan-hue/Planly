import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createS3Storage } from '../lib/server/storage.ts';

test('container uploads use internal S3 while signed previews use the browser-accessible endpoint', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    response.writeHead(200).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const config = {
    S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
    S3_PUBLIC_ENDPOINT: 'https://media.example.test',
    S3_REGION: 'us-east-1', S3_BUCKET: 'private-media',
    S3_ACCESS_KEY_ID: 'test-access', S3_SECRET_ACCESS_KEY: 'test-secret-never-in-url',
  };
  try {
    const storage = createS3Storage(config);
    await storage.put('owner/image.png', new Uint8Array([1, 2]), 'image/png');
    await storage.delete('owner/image.png');
    assert.deepEqual(requests, ['PUT /private-media/owner/image.png', 'DELETE /private-media/owner/image.png']);
    const preview = new URL(await storage.signedGetUrl('owner/image.png'));
    assert.equal(preview.origin, 'https://media.example.test');
    assert.equal(preview.pathname, '/private-media/owner/image.png');
    assert.equal(preview.searchParams.get('X-Amz-Expires'), '300');
    assert.ok(preview.searchParams.get('X-Amz-Signature'));
    assert.ok(!preview.href.includes(config.S3_SECRET_ACCESS_KEY));
    const fallback = createS3Storage({ ...config, S3_PUBLIC_ENDPOINT: undefined });
    assert.equal(new URL(await fallback.signedGetUrl('image.png')).origin, config.S3_ENDPOINT);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
