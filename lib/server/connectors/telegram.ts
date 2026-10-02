import type { PublicationErrorType, PublishInput, PublishResult, SocialConnector } from './types.ts';

export type TelegramValidationResult =
  | { ok: true; destinationId: string; displayName: string }
  | Extract<PublishResult, { ok: false }>;
type Failure = Extract<PublishResult, { ok: false }>;
type ApiResult = { ok: true; result: unknown } | Failure;
const failure = (errorType: PublicationErrorType, code: string, message: string): Failure => ({ ok: false, errorType, code, message });
const ambiguous = () => failure('PERMANENT', 'AMBIGUOUS_DELIVERY', 'Telegram delivery outcome is unknown. Check the channel before sending again.');
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const validDestination = (value: string | null) => !!value && (/^-[1-9]\d{0,15}$/.test(value) || /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value));

export function createTelegramConnector(options: { token: string; fetcher?: typeof fetch; timeoutMs?: number }): SocialConnector & {
  validate(destinationId: string): Promise<TelegramValidationResult>;
} {
  const fetcher = options.fetcher ?? fetch;
  const token = options.token.trim();
  const configured = /^\d+:[A-Za-z0-9_-]{20,}$/.test(token);

  async function call(method: string, body: Record<string, unknown> | FormData, mutation: boolean): Promise<ApiResult> {
    if (!configured) return token ? failure('AUTH', 'TELEGRAM_TOKEN_FORMAT', 'Telegram bot token format is invalid on the server.') : failure('AUTH', 'TELEGRAM_NOT_CONFIGURED', 'Telegram bot token is not configured on the server.');
    try {
      const multipart = body instanceof FormData;
      const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', redirect: 'error',
        headers: multipart ? undefined : { 'content-type': 'application/json' },
        body: multipart ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      const payload = record(await response.json());
      if (response.ok && payload?.ok === true) return { ok: true, result: payload.result };
      const code = typeof payload?.error_code === 'number' ? payload.error_code : response.status;
      if (code === 401 || code === 403) return failure('AUTH', `TELEGRAM_${code}`, 'Telegram bot credentials or channel posting permissions need reconnecting.');
      if (code === 429) {
        const seconds = record(payload?.parameters)?.retry_after;
        if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) {
          return failure('TEMPORARY', 'TELEGRAM_429', 'Telegram rate limit; retry later.');
        }
        return { ...failure('TEMPORARY', 'TELEGRAM_429', 'Telegram rate limit; retry later.'), retryAfterMs: seconds * 1000 };
      }
      if (code === 400) return failure('VALIDATION', 'TELEGRAM_400', 'Telegram rejected the destination, text or media. Check channel and provider limits.');
      // An explicit API rejection is safe to retry; an unconfirmed gateway response is not.
      if (code >= 500 && payload?.ok === false) return failure('TEMPORARY', 'TELEGRAM_UNAVAILABLE', 'Telegram temporarily rejected the request.');
      if (mutation) return ambiguous();
      return failure('TEMPORARY', 'TELEGRAM_UNAVAILABLE', 'Telegram validation is temporarily unavailable.');
    } catch {
      // fetch errors contain token-bearing URLs. Never return or log their message.
      return mutation ? ambiguous() : failure('TEMPORARY', 'TELEGRAM_UNAVAILABLE', 'Telegram validation is temporarily unavailable.');
    }
  }

  return {
    provider: 'TELEGRAM',
    async validate(destinationId) {
      if (!validDestination(destinationId)) return failure('VALIDATION', 'TELEGRAM_DESTINATION', 'Use a channel/group @username or negative chat ID.');
      const me = await call('getMe', {}, false);
      if (!me.ok) return me;
      const bot = record(me.result);
      if (bot?.is_bot !== true || !Number.isSafeInteger(bot.id)) return failure('AUTH', 'TELEGRAM_BOT_INVALID', 'Telegram did not confirm the bot identity.');
      const chatResponse = await call('getChat', { chat_id: destinationId }, false);
      if (!chatResponse.ok) return chatResponse;
      const chat = record(chatResponse.result);
      if (!['channel', 'supergroup', 'group'].includes(String(chat?.type)) || !Number.isSafeInteger(chat?.id) || Number(chat?.id) >= 0 || !validDestination(String(chat?.id))) return failure('VALIDATION', 'TELEGRAM_CHAT_REQUIRED', 'Select a Telegram channel or group.');
      const canonicalId = String(chat!.id);
      const memberResponse = await call('getChatMember', { chat_id: canonicalId, user_id: bot.id }, false);
      if (!memberResponse.ok) return memberResponse;
      const member = record(memberResponse.result);
      if (record(member?.user)?.id !== bot.id || !(member?.status === 'creator' || (member?.status === 'administrator' && (chat!.type !== 'channel' || member.can_post_messages === true)))) {
        return failure('AUTH', 'TELEGRAM_POST_PERMISSION', 'Add the bot as administrator; channels also require permission to post messages.');
      }
      return { ok: true, destinationId: canonicalId, displayName: typeof chat!.title === 'string' ? chat!.title.slice(0, 200) : 'Telegram' };
    },
    async publish(input: PublishInput): Promise<PublishResult> {
      if (input.provider !== 'TELEGRAM' || !validDestination(input.destinationId)) return failure('VALIDATION', 'TELEGRAM_DESTINATION', 'Use a valid connected Telegram channel or group.');
      const media = input.media ?? [];
      if (media.length > 10 || !input.text.trim() || input.text.length > (media.length ? 1024 : 4096)) {
        return failure('VALIDATION', 'TELEGRAM_CONTENT_LIMIT', 'Telegram supports text up to 4096 characters, media captions up to 1024 and albums up to 10 items.');
      }
      for (const asset of media) {
        const photo = asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/png';
        if (!photo && asset.mimeType !== 'video/mp4') return failure('VALIDATION', 'TELEGRAM_MEDIA_FORMAT', 'Telegram publishing supports JPEG, PNG and MP4.');
        if (!asset.bytes.length || asset.bytes.length > (photo ? 10 : 20) * 1024 * 1024) return failure('VALIDATION', 'TELEGRAM_MEDIA_SIZE', 'Media exceeds the supported upload size.');
        if (photo && asset.width && asset.height && (asset.width + asset.height > 10000 || Math.max(asset.width / asset.height, asset.height / asset.width) > 20)) {
          return failure('VALIDATION', 'TELEGRAM_PHOTO_DIMENSIONS', 'Telegram photo dimensions exceed provider limits.');
        }
      }
      let method = 'sendMessage';
      let body: Record<string, unknown> | FormData = { chat_id: input.destinationId, text: input.text };
      if (media.length) {
        body = new FormData();
        body.set('chat_id', input.destinationId!);
        const items = media.map((asset, index) => {
          const type = asset.mimeType === 'video/mp4' ? 'video' : 'photo';
          const name = media.length === 1 ? type : `media${index}`;
          const bytes = new Uint8Array(asset.bytes.length);
          bytes.set(asset.bytes);
          (body as FormData).set(name, new Blob([bytes.buffer], { type: asset.mimeType }), `${name}.${type === 'video' ? 'mp4' : asset.mimeType === 'image/png' ? 'png' : 'jpg'}`);
          return index === 0 ? { type, media: `attach://${name}`, caption: input.text } : { type, media: `attach://${name}` };
        });
        if (media.length === 1) {
          method = media[0].mimeType === 'video/mp4' ? 'sendVideo' : 'sendPhoto';
          body.set('caption', input.text);
        } else {
          method = 'sendMediaGroup';
          body.set('media', JSON.stringify(items));
        }
      }
      const response = await call(method, body, true);
      if (!response.ok) return response;
      const messages = Array.isArray(response.result) ? response.result : [response.result];
      if (messages.length !== Math.max(1, media.length)) return ambiguous();
      const parsed = messages.map(value => ({ value: record(value), chat: record(record(value)?.chat) }));
      if (parsed.some(({ value, chat }) => !Number.isSafeInteger(value?.message_id) || Number(value?.message_id) <= 0 || !['channel', 'supergroup', 'group'].includes(String(chat?.type)) || !Number.isSafeInteger(chat?.id) || Number(chat?.id) >= 0 ||
        (input.destinationId!.startsWith('@') ? `@${String(chat?.username).toLowerCase()}` !== input.destinationId!.toLowerCase() : String(chat?.id) !== input.destinationId))) return ambiguous();
      const ids = parsed.map(({ value }) => String(value!.message_id));
      if (new Set(ids).size !== ids.length) return ambiguous();
      const chat = parsed[0].chat!;
      const username = typeof chat.username === 'string' && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(chat.username) ? chat.username : null;
      const remoteUrl = username ? `https://t.me/${username}/${ids[0]}` : chat.type !== 'group' && /^-100\d+$/.test(String(chat.id)) ? `https://t.me/c/${String(chat.id).slice(4)}/${ids[0]}` : null;
      return { ok: true, remoteId: ids.join(','), remoteUrl };
    },
  };
}
