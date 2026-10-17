import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramConnector } from '../lib/server/connectors/telegram.ts';
import { createMaxConnector } from '../lib/server/connectors/max.ts';

const tgToken = '123456:TEST_only_never_real_secret';
const maxToken = 'MAX_TEST_ONLY_secret';
const tgUser = (id: number, is_bot: boolean) => ({ id, is_bot, first_name: is_bot ? 'Bot' : 'Ada' });
const tgAdmin = (id: number, is_bot: boolean) => ({ user: tgUser(id, is_bot), status: 'administrator', can_be_edited: false, is_anonymous: false, can_manage_chat: true, can_delete_messages: true, can_manage_video_chats: false, can_restrict_members: false, can_promote_members: false, can_change_info: false, can_invite_users: true, can_post_stories: false, can_edit_stories: false, can_delete_stories: false, can_post_messages: true, can_edit_messages: true });
const maxMember = (user_id: number, is_bot: boolean) => ({ user_id, is_bot, first_name: is_bot ? 'Bot' : 'Ada', last_activity_time: 1, last_access_time: 1, join_time: 1, is_admin: true, is_owner: false, permissions: ['write'] });
type Changes = { chat?: Record<string, unknown>; bot?: Record<string, unknown>; human?: Record<string, unknown>; me?: Record<string, unknown>; humanPayload?: unknown; failure?: 'missing' | '429' | 'timeout' };

function telegram(changes: Changes = {}) {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.telegram.org');
    assert.equal(init?.method, 'POST');
    const method = url.pathname.split('/').at(-1)!;
    const body = JSON.parse(String(init?.body));
    calls.push({ method, body });
    assert.ok(['getMe', 'getChat', 'getChatMember'].includes(method), 'metadata only');
    if (method === 'getChatMember') assert.equal(body.chat_id, '-100123', 'membership must use canonical chat identity');
    const human = method === 'getChatMember' && body.user_id === 42;
    if (human && changes.failure === 'timeout') throw new Error(`timeout ${tgToken}`);
    if (human && changes.failure) return Response.json({ ok: false, error_code: changes.failure === '429' ? 429 : 400, description: tgToken }, { status: changes.failure === '429' ? 429 : 400 });
    const result = method === 'getMe' ? { ...tgUser(7, true), ...changes.me } : method === 'getChat' ? { id: -100123, type: 'channel', title: 'Channel', ...changes.chat } : human ? changes.humanPayload ?? { ...tgAdmin(42, false), ...changes.human } : { ...tgAdmin(7, true), ...changes.bot };
    return Response.json({ ok: true, result });
  };
  return { connector: createTelegramConnector({ token: tgToken, fetcher }), calls };
}

function max(changes: Changes = {}) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://platform-api2.max.ru');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('authorization'), maxToken);
    assert.equal(init?.redirect, 'error');
    calls.push(url.pathname + url.search);
    assert.ok(['/me', '/chats/-100123', '/chats/-100123/members/me', '/chats/-100123/members?user_ids=42'].includes(url.pathname + url.search), 'targeted metadata only');
    const human = url.pathname.endsWith('/members');
    if (human && changes.failure === 'timeout') throw new Error(`timeout ${maxToken}`);
    if (human && changes.failure) return Response.json({ code: 'error', message: maxToken }, { status: changes.failure === '429' ? 429 : 404 });
    const result = url.pathname === '/me' ? { user_id: 7, is_bot: true, first_name: 'Bot', last_activity_time: 1, ...changes.me } : url.pathname === '/chats/-100123' ? { chat_id: -100123, type: 'channel', status: 'active', title: 'Channel', is_public: false, last_event_time: 1, participants_count: 2, ...changes.chat } : human ? changes.humanPayload ?? { members: [{ ...maxMember(42, false), ...changes.human }], marker: null } : { ...maxMember(7, true), ...changes.bot };
    return Response.json(result);
  };
  return { connector: createMaxConnector({ token: maxToken, fetcher }), calls };
}

async function control(connector: ReturnType<typeof createTelegramConnector> | ReturnType<typeof createMaxConnector>, destination = '-100123', human = '42') {
  return connector.validateControl(destination, human);
}

for (const [name, fixture] of [['Telegram', telegram], ['MAX', max]] as const) {
  test(`${name} control denies ordinary human even with privileged bot`, async () => {
    const { connector } = fixture({ human: name === 'Telegram' ? { status: 'member' } : { is_admin: false } });
    assert.equal((await control(connector) as { ok: boolean }).ok, false);
  });
  test(`${name} control returns exact independent H/B identities and canonical destination`, async () => {
    const { connector, calls } = fixture();
    assert.deepEqual(await control(connector, name === 'Telegram' ? '@alias_name' : '-100123'), { ok: true, destinationId: '-100123', displayName: 'Channel', humanId: '42', botId: '7' });
    assert.equal(calls.length, 4);
    if (name === 'Telegram') assert.deepEqual(calls, [
      { method: 'getMe', body: {} }, { method: 'getChat', body: { chat_id: '@alias_name' } },
      { method: 'getChatMember', body: { chat_id: '-100123', user_id: 7 } },
      { method: 'getChatMember', body: { chat_id: '-100123', user_id: 42 } },
    ]);
  });
  const invalid: Changes[] = name === 'Telegram' ? [
    { human: { user: tgUser(43, false) } }, { human: { user: tgUser(42, true) } }, { human: { user: { id: 42 } } },
    ...['restricted', 'left', 'kicked', 'unknown'].map(status => ({ human: { status } })),
    { human: { can_post_messages: false } }, { human: { can_post_messages: undefined } },
    { bot: { status: 'member' } }, { bot: { user: tgUser(7, false) } }, { bot: { can_post_messages: false } },
    { me: { id: 0 } }, { me: { is_bot: false } }, { chat: { id: -9007199254740992 } }, { chat: { type: 'private' } },
    { humanPayload: [] },
  ] : [
    { human: { user_id: 43 } }, { human: { is_bot: true } }, { human: { is_bot: undefined } },
    { human: { is_admin: 'true' } }, { human: { is_owner: undefined } }, { human: { is_owner: 'false' } },
    { human: { permissions: [] } }, { human: { permissions: ['write', 'unknown'] } }, { human: { permissions: 'write' } },
    { bot: { is_admin: false } }, { bot: { is_bot: false } }, { bot: { user_id: 8 } }, { bot: { permissions: [] } },
    { me: { user_id: 0 } }, { me: { is_bot: false } }, { chat: { chat_id: -999 } }, { chat: { status: 'left' } }, { chat: { type: 'dialog' } },
    { humanPayload: { members: [] } }, { humanPayload: { members: [maxMember(42, false), maxMember(42, false)] } }, { humanPayload: { user_id: 42 } },
  ];
  for (const [index, change] of invalid.entries()) test(`${name} rejects invalid control evidence ${index + 1}`, async () => {
    assert.equal((await control(fixture(change).connector) as { ok: boolean }).ok, false);
  });
  for (const group of [false, true]) for (const owner of [false, true]) test(`${name} accepts ${owner ? 'owner' : 'admin'} of ${group ? 'group' : 'channel'}`, async () => {
    const role = name === 'Telegram' ? { status: owner ? 'creator' : 'administrator', can_post_messages: owner || group ? undefined : true } : { is_owner: owner, is_admin: !owner, permissions: owner || group ? [] : ['post_edit_delete_message'] };
    assert.equal((await control(fixture({ chat: { type: group ? name === 'Telegram' ? 'supergroup' : 'chat' : 'channel' }, human: role, bot: role }).connector) as { ok: boolean }).ok, true);
  });
  for (const failure of ['missing', '429', 'timeout'] as const) test(`${name} safely fails human lookup ${failure}`, async () => {
    const result = await control(fixture({ failure }).connector) as { ok: boolean; errorType?: string };
    assert.equal(result.ok, false);
    assert.equal(result.errorType, failure === 'missing' ? 'VALIDATION' : 'TEMPORARY');
    assert.equal(JSON.stringify(result).includes(name === 'Telegram' ? tgToken : maxToken), false);
  });
  test(`${name} does not cache positive control evidence`, async () => {
    const change: Changes = {};
    const { connector } = fixture(change);
    assert.equal((await control(connector) as { ok: boolean }).ok, true);
    change.human = name === 'Telegram' ? { status: 'member' } : { is_admin: false };
    assert.equal((await control(connector) as { ok: boolean }).ok, false);
  });
  test(`${name} invalid human ID fails before network`, async () => {
    const { connector, calls } = fixture();
    for (const id of ['0', '-1', '42junk', '9007199254740993', '042']) assert.equal((await control(connector, '-100123', id) as { ok: boolean }).ok, false);
    assert.equal(calls.length, 0);
  });
}
