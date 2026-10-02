import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createTelegramConnector } from '../lib/server/connectors/telegram.ts';
import type { PublishInput } from '../lib/server/connectors/types.ts';

const token = '123456:TEST_only_never_real_secret';
const input: PublishInput = { publicationId: 'p1', provider: 'TELEGRAM', destinationId: '-100123', text: 'Привет <мир> & 😜' };
type WireRequest = { method: string; body: unknown; headers: Headers };
const message = (id = 42) => ({ message_id: id, date: 1234, chat: { id: -100123, type: 'channel', title: 'Test', username: 'planly_test' }, text: input.text });

async function wire(run: (connector: ReturnType<typeof createTelegramConnector>, requests: WireRequest[]) => Promise<void>, reply: (req: WireRequest) => { status?: number; body: unknown } = () => ({ body: { ok: true, result: message() } })) {
  const requests: WireRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
    const request = new Request('http://localhost', { method: 'POST', headers, body: Buffer.concat(chunks) });
    const body = headers.get('content-type')?.includes('multipart') ? await request.formData() : await request.json();
    const data = { method: (req.url ?? '').split('/').at(-1)!, body, headers };
    requests.push(data);
    const response = reply(data);
    res.writeHead(response.status ?? 200, { 'content-type': 'application/json' }).end(JSON.stringify(response.body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const fetcher: typeof fetch = (url, options) => {
    const target = new URL(String(url));
    assert.equal(target.origin, 'https://api.telegram.org');
    assert.ok(target.pathname.startsWith(`/bot${token}/`));
    return fetch(`http://127.0.0.1:${address.port}${target.pathname}`, options);
  };
  try { await run(createTelegramConnector({ token, fetcher, timeoutMs: 1000 }), requests); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('Telegram text is sent literally once and confirmed message ID becomes a remote result', async () => {
  await wire(async (connector, requests) => {
    const result = await connector.publish(input);
    assert.deepEqual(result, { ok: true, remoteId: '42', remoteUrl: 'https://t.me/planly_test/42' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'sendMessage');
    assert.deepEqual(requests[0].body, { chat_id: '-100123', text: input.text });
  });
});

for (const [mimeType, method, field] of [['image/png', 'sendPhoto', 'photo'], ['video/mp4', 'sendVideo', 'video']]) {
  test(`Telegram ${method} uploads actual private bytes as multipart with caption`, async () => {
    await wire(async (connector, requests) => {
      const result = await connector.publish({ ...input, media: [{ name: 'asset', mimeType, bytes: new Uint8Array([1, 2, 3]) }] });
      assert.equal(result.ok, true);
      assert.equal(requests[0].method, method);
      const body = requests[0].body as FormData;
      assert.equal(body.get('chat_id'), '-100123');
      assert.equal(body.get('caption'), input.text);
      const file = body.get(field) as File;
      assert.equal(file.type, mimeType);
      assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3]);
    });
  });
}

test('Telegram mixed album preserves attachment order, first caption and all remote IDs', async () => {
  await wire(async (connector, requests) => {
    const result = await connector.publish({ ...input, media: [
      { name: 'one.png', mimeType: 'image/png', bytes: new Uint8Array([1]) },
      { name: 'two.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([2]) },
    ] });
    assert.deepEqual(result, { ok: true, remoteId: '42,43', remoteUrl: 'https://t.me/planly_test/42' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'sendMediaGroup');
    const body = requests[0].body as FormData;
    assert.deepEqual(JSON.parse(String(body.get('media'))), [
      { type: 'photo', media: 'attach://media0', caption: input.text },
      { type: 'video', media: 'attach://media1' },
    ]);
    assert.deepEqual([...new Uint8Array(await (body.get('media1') as File).arrayBuffer())], [2]);
  }, () => ({ body: { ok: true, result: [message(42), message(43)] } }));
});

for (const [method, media] of [
  ['sendPhoto', [{ name: 'photo.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }]],
  ['sendVideo', [{ name: 'video.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([2]) }]],
  ['sendMediaGroup', [
    { name: 'first.png', mimeType: 'image/png', bytes: new Uint8Array([1]) },
    { name: 'second.png', mimeType: 'image/png', bytes: new Uint8Array([2]) },
  ]],
] as const) {
  test(`Telegram ${method} sends media without a caption and confirms delivery`, async () => {
    await wire(async (connector, requests) => {
      const result = await connector.publish({ ...input, text: '', media: [...media] });
      assert.equal(result.ok, true);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, method);
      const form = requests[0].body as FormData;
      assert.equal(form.get('chat_id'), '-100123');
      if (method === 'sendMediaGroup') {
        assert.deepEqual(JSON.parse(String(form.get('media'))), [
          { type: 'photo', media: 'attach://media0', caption: '' },
          { type: 'photo', media: 'attach://media1' },
        ]);
      } else {
        assert.equal(form.get('caption'), '');
        assert.deepEqual([...new Uint8Array(await (form.get(method === 'sendPhoto' ? 'photo' : 'video') as File).arrayBuffer())], method === 'sendPhoto' ? [1] : [2]);
      }
      if (result.ok) assert.equal(result.remoteId, media.length === 2 ? '42,43' : '42');
    }, () => ({ body: { ok: true, result: media.length === 2 ? [message(42), message(43)] : message(42) } }));
  });
}

test('Telegram invalid destination, limits and unsupported media reject before any provider request', async () => {
  await wire(async (connector, requests) => {
    const cases: PublishInput[] = [
      { ...input, destinationId: null }, { ...input, destinationId: 'https://evil.test' },
      { ...input, text: '' }, { ...input, text: 'x'.repeat(4097) },
      { ...input, text: 'x'.repeat(1025), media: [{ name: 'p', mimeType: 'image/png', bytes: new Uint8Array([1]) }] },
      { ...input, media: [{ name: 'p', mimeType: 'video/webm', bytes: new Uint8Array([1]) }] },
      { ...input, media: [{ name: 'p', mimeType: 'image/png', bytes: new Uint8Array() }] },
      { ...input, media: Array.from({ length: 11 }, () => ({ name: 'p', mimeType: 'image/png', bytes: new Uint8Array([1]) })) },
      { ...input, media: [{ name: 'p', mimeType: 'image/png', bytes: new Uint8Array(10 * 1024 * 1024 + 1) }] },
      { ...input, media: [{ name: 'p', mimeType: 'image/png', bytes: new Uint8Array([1]), width: 10000, height: 1000 }] },
    ];
    for (const value of cases) {
      const result = await connector.publish(value);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.errorType, 'VALIDATION');
    }
    assert.equal(requests.length, 0);
  });
});

for (const [status, expected] of [[401, 'AUTH'], [403, 'AUTH'], [400, 'VALIDATION'], [429, 'TEMPORARY']] as const) {
  test(`Telegram ${status} is normalized without leaking provider/token diagnostics`, async () => {
    await wire(async connector => {
      const result = await connector.publish(input);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.errorType, expected);
        assert.ok(!JSON.stringify(result).includes(token));
        if (status === 429) assert.equal(result.retryAfterMs, 120_000);
      }
    }, () => ({ status, body: { ok: false, error_code: status, description: `provider diagnostic ${token}`, parameters: { retry_after: 120 } } }));
  });
}

test('Telegram network failure after handoff is ambiguous and never marked retryable', async () => {
  const connector = createTelegramConnector({ token, fetcher: async () => { throw new Error(`network ${token}`); } });
  const result = await connector.publish(input);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.errorType, 'PERMANENT'); assert.equal(result.code, 'AMBIGUOUS_DELIVERY'); }
  assert.ok(!JSON.stringify(result).includes(token));
});

test('Telegram success without matching confirmed destination and positive ID is ambiguous', async () => {
  for (const value of [{ ...message(), message_id: 0 }, { ...message(), chat: { id: -100999, type: 'channel' } }, {}]) {
    await wire(async connector => {
      const result = await connector.publish(input);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, 'AMBIGUOUS_DELIVERY');
    }, () => ({ body: { ok: true, result: value } }));
  }
});

test('Telegram connection checks bot/channel/admin posting permissions and stores canonical ID', async () => {
  await wire(async (connector, requests) => {
    assert.deepEqual(await connector.validate('@planly_test'), { ok: true, destinationId: '-100123', displayName: 'Test' });
    assert.deepEqual(requests.map(r => r.method), ['getMe', 'getChat', 'getChatMember']);
    assert.deepEqual(requests[2].body, { chat_id: '-100123', user_id: 123456 });
  }, req => ({ body: { ok: true, result: req.method === 'getMe' ? { id: 123456, is_bot: true, first_name: 'Bot' } : req.method === 'getChat' ? message().chat : { status: 'administrator', can_post_messages: true, user: { id: 123456, is_bot: true, first_name: 'Bot' } } } }));
});

test('Telegram connection never accepts a bot without channel posting rights', async () => {
  await wire(async connector => {
    const result = await connector.validate('-100123');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errorType, 'AUTH');
  }, req => ({ body: { ok: true, result: req.method === 'getMe' ? { id: 123456, is_bot: true, first_name: 'Bot' } : req.method === 'getChat' ? message().chat : { status: 'member', user: { id: 123456, is_bot: true, first_name: 'Bot' } } } }));
});

for (const [type, id] of [['supergroup', -100123], ['group', -12345]] as const) {
  test(`Telegram connects an administrator in ${type} without channel-only posting flag`, async () => {
    await wire(async connector => {
      assert.deepEqual(await connector.validate(String(id)), {ok:true,destinationId:String(id),displayName:'Test group'});
    }, req => ({body:{ok:true,result:req.method==='getMe' ? {id:123456,is_bot:true,first_name:'Bot'} : req.method==='getChat' ? {id,type,title:'Test group'} : {status:'administrator',user:{id:123456,is_bot:true,first_name:'Bot'}}}}));
  });
  for (const [label, media] of [['text', []], ['photo', [{name:'p',mimeType:'image/png',bytes:new Uint8Array([1])}]], ['video', [{name:'v',mimeType:'video/mp4',bytes:new Uint8Array([2])}]], ['album', [{name:'p',mimeType:'image/png',bytes:new Uint8Array([1])},{name:'v',mimeType:'video/mp4',bytes:new Uint8Array([2])}]]] as const) {
    test(`Telegram confirms ${label} delivery to ${type} and returns an appropriate link`, async () => {
      await wire(async connector => {
        assert.deepEqual(await connector.publish({...input,destinationId:String(id),media:[...media]}), {ok:true,remoteId:label==='album'?'42,43':'42',remoteUrl:type==='supergroup'?'https://t.me/c/123/42':null});
      }, () => ({body:{ok:true,result:label==='album' ? [42,43].map(message_id=>({message_id,chat:{id,type,title:'Test group'}})) : {message_id:42,chat:{id,type,title:'Test group'}}}}));
    });
  }
}

test('Telegram never connects a non-admin or restricted group member', async () => {
  for (const status of ['member','restricted','left','kicked']) {
    await wire(async connector => {
      const result=await connector.validate('-100123');
      assert.equal(result.ok,false);
      if (!result.ok) assert.equal(result.errorType,'AUTH');
    }, req=>({body:{ok:true,result:req.method==='getMe'?{id:123456,is_bot:true,first_name:'Bot'}:req.method==='getChat'?{id:-100123,type:'supergroup',title:'Group'}:{status,user:{id:123456,is_bot:true,first_name:'Bot'}}}}));
  }
});

test('Telegram strips accidental outer token whitespace before constructing the provider URL', async () => {
  const connector=createTelegramConnector({token:` \r\n${token}\r\n `,fetcher:async url=>{
    assert.equal(String(url),`https://api.telegram.org/bot${token}/getMe`);
    return Response.json({ok:false,error_code:401},{status:401});
  }});
  const result=await connector.validate('-100123');
  assert.equal(result.ok,false);
  if (!result.ok) assert.equal(result.code,'TELEGRAM_401');
});

test('Telegram distinguishes missing and malformed token without calling or leaking credentials', async () => {
  for (const [value, code] of [['   ','TELEGRAM_NOT_CONFIGURED'],['Bearer '+token,'TELEGRAM_TOKEN_FORMAT']]) {
    const result=await createTelegramConnector({token:value,fetcher:async()=>{throw new Error('must not call');}}).validate('-100123');
    assert.equal(result.ok,false);
    if (!result.ok) assert.equal(result.code,code);
    assert.ok(!JSON.stringify(result).includes(token));
  }
});
