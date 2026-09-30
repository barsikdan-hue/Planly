const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const base64 = value => btoa(String.fromCharCode(...new Uint8Array(value)));
async function key(secret) {
  if (!secret || bytes(secret).length !== 32) throw new Error('Серверный ключ шифрования не настроен.');
  return crypto.subtle.importKey('raw', bytes(secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await key(secret), new TextEncoder().encode(value));
  return `${base64(iv)}.${base64(result)}`;
}
export async function decrypt(value, secret) {
  const [iv, payload] = value.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv)}, await key(secret), bytes(payload)));
}
