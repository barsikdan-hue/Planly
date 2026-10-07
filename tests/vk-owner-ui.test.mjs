// Actual PlannerApp Settings callbacks, client HTTP and OwnerLifetime effects.
// Hooks, sessionStorage, timers and HTTP are controlled fixtures, not browser proof.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toast } from 'sonner';
import { fixture, cleanup, deferred } from './helpers/library-editor-fixture.mjs';

const originalToast = { success: toast.success, error: toast.error };
afterEach(() => { cleanup(); Object.assign(toast, originalToast); });
const authorizationUrl = 'https://id.vk.ru/authorize?client_id=fixture-app&scope=wall%20photos&state=fixture-public-state&code_challenge=fixture-public-challenge';
const account = (provider, prefix = 'owner', extra = {}) => ({
  id: `${prefix}-${provider}`, provider, providerAccountId: provider === 'vk' ? '-123' : provider === 'telegram' ? '-100123' : '-456',
  displayName: `${prefix} ${provider}`, enabled: true, connectionStatus: 'CONNECTED', ...extra,
});
const accounts = (prefix = 'owner') => ['telegram', 'max', 'vk'].map(provider => account(provider, prefix));
function captureMessages() {
  const messages = [];
  for (const kind of Object.keys(originalToast)) toast[kind] = message => messages.push({ kind, message });
  return messages;
}
async function openSettings(mutation) {
  const value = fixture({ scheduled: true, mutation });
  value.snapshot.socialAccounts = accounts();
  const redirects = [];
  window.location.assign = url => redirects.push(url);
  await value.settle();
  await value.navigate('settings');
  assert.equal(value.app.find('Settings').props.accounts.length, 3);
  return { value, redirects };
}
async function switchOwner(value) {
  value.snapshot.profile = { id: 'other', displayName: 'Owner B' };
  value.snapshot.socialAccounts = accounts('other');
  await value.poll();
  assert.equal(value.app.find('Settings').props.name, 'Owner B', 'real scheduled poll applied the new owner');
  assert.deepEqual(value.app.find('Settings').props.accounts, accounts('other'));
}
const disconnected = () => account('vk', 'owner', { providerAccountId: null, displayName: 'VK', enabled: false, connectionStatus: 'DISCONNECTED' });
const rejected = () => Response.json({ error: 'VK_RECONNECT_REQUIRED' }, { status: 409 });

test('VK Settings connect sends account/community only and redirects to the returned public VK ID URL', async () => {
  const { value, redirects } = await openSettings(() => Response.json({ authorizationUrl }));
  const before = value.app.find('Settings').props.accounts;
  await value.app.find('Settings').props.connect('owner-vk', '123');
  await value.settle();
  assert.equal(value.requests.length, 1);
  assert.equal(value.requests[0].url, '/api/social-accounts/vk/start');
  assert.equal(value.requests[0].method, 'POST');
  assert.deepEqual(value.requests[0].body, { accountId: 'owner-vk', communityId: '123' });
  assert.deepEqual(redirects, [authorizationUrl]);
  assert.deepEqual(value.app.find('Settings').props.accounts, before, 'OAuth start alone cannot claim a connected account');
});

for (const url of ['https://evil.example.test/authorize', 'https://id.vk.ru/unrelated']) {
  test('VK Settings connect rejects an untrusted authorization host or path before navigation', async () => {
    const messages = captureMessages();
    const { value, redirects } = await openSettings(() => Response.json({ authorizationUrl: url }));
    await value.app.find('Settings').props.connect('owner-vk', '123');
    await value.settle();
    assert.deepEqual(redirects, []);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].kind, 'error');
    assert.ok(messages[0].message.includes('VK'));
  });
}

for (const outcome of ['success', 'error']) {
  test(`pending old-owner VK OAuth ${outcome} cannot redirect or notify after an authoritative owner poll`, async () => {
    const pending = deferred(), messages = captureMessages();
    const { value, redirects } = await openSettings(() => pending.promise);
    const operation = value.app.find('Settings').props.connect('owner-vk', '123');
    await value.settle();
    assert.equal(value.requests.length, 1);
    await switchOwner(value);
    messages.length = 0;
    pending.resolve(outcome === 'success' ? Response.json({ authorizationUrl }) : rejected());
    await operation;
    await value.settle();
    assert.deepEqual(redirects, []);
    assert.deepEqual(messages, []);
    assert.deepEqual(value.app.find('Settings').props.accounts, accounts('other'));
  });
}

for (const outcome of ['success', 'error']) {
  test(`pending old-owner VK disconnect ${outcome} cannot change or notify the newly polled owner`, async () => {
    const pending = deferred(), messages = captureMessages();
    const { value, redirects } = await openSettings(() => pending.promise);
    const operation = value.app.find('Settings').props.disconnect('owner-vk');
    await value.settle();
    assert.equal(value.requests.length, 1);
    assert.equal(value.requests[0].url, '/api/social-accounts/vk/disconnect');
    assert.deepEqual(value.requests[0].body, { accountId: 'owner-vk' });
    await switchOwner(value);
    messages.length = 0;
    pending.resolve(outcome === 'success' ? Response.json(disconnected()) : rejected());
    await operation;
    await value.settle();
    assert.deepEqual(value.app.find('Settings').props.accounts, accounts('other'));
    assert.deepEqual(messages, []);
    assert.deepEqual(redirects, []);
  });
}

for (const outcome of ['success', 'error']) {
  test(`pending VK disconnect ${outcome} cannot update account state or toast after App unmount`, async () => {
    const pending = deferred(), messages = captureMessages();
    const { value } = await openSettings(() => pending.promise);
    const operation = value.app.find('Settings').props.disconnect('owner-vk');
    await value.settle();
    const before = value.app.find('Settings').props.accounts;
    value.unmount();
    messages.length = 0;
    pending.resolve(outcome === 'success' ? Response.json(disconnected()) : rejected());
    await operation;
    assert.equal(value.app.changed, false, 'unmounted App received no state update from the old operation');
    assert.deepEqual(value.app.find('Settings').props.accounts, before);
    assert.deepEqual(messages, []);
  });
}

test('same-owner VK disconnect applies its matching public DTO and preserves Telegram/MAX accounts', async () => {
  const messages = captureMessages();
  const { value, redirects } = await openSettings(() => Response.json(disconnected()));
  await value.app.find('Settings').props.disconnect('owner-vk');
  await value.settle();
  const current = value.app.find('Settings').props.accounts;
  assert.deepEqual(current, [account('telegram'), account('max'), disconnected()]);
  assert.deepEqual(Object.keys(current[2]).sort(), ['connectionStatus', 'displayName', 'enabled', 'id', 'provider', 'providerAccountId']);
  assert.deepEqual(redirects, []);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'success');
  assert.ok(messages[0].message.includes('VK'));
});

for (const [marker, kind] of [['connected', 'success'], ['reconnect', 'error']]) {
  test(`VK OAuth callback ${marker} displays one generic public feedback message and consumes its marker`, async () => {
    const messages = captureMessages();
    const value = fixture({ scheduled: true });
    value.snapshot.socialAccounts = accounts();
    const changes = [];
    Object.assign(window.location, { href: `https://planly.example.test/?vk=${marker}#settings`, search: `?vk=${marker}`, pathname: '/', hash: '#settings' });
    window.history.replaceState = (_state, _title, location) => {
      const next = new URL(String(location), window.location.href);
      changes.push(next.toString());
      Object.assign(window.location, { href: next.toString(), search: next.search, pathname: next.pathname, hash: next.hash });
    };
    await value.settle();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].kind, kind);
    assert.ok(messages[0].message.includes('VK'));
    assert.ok(!messages[0].message.includes(marker), 'feedback must be a generic user message, not a raw callback parameter');
    assert.ok(changes.some(location => !new URL(location).searchParams.has('vk')));
    assert.equal(window.location.hash, '#settings');
    await value.poll();
    assert.equal(messages.length, 1, 'bootstrap polling cannot repeat an already consumed callback message');
  });
}
