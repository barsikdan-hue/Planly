export type PublicationMediaMetadata = {
  mimeType: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
};

export type PublicationContentIssue = { code: string; message: string };

// The existing Planly upload/connector limits are intentionally narrower than provider capabilities.
// Count UTF-16 units consistently with the connectors; no parse_mode or entity parsing is used.
export function validatePublicationContent(
  provider: 'TELEGRAM' | 'MAX',
  text: string,
  media: readonly PublicationMediaMetadata[] = [],
): PublicationContentIssue | null {
  const name = provider === 'TELEGRAM' ? 'Telegram' : 'MAX';
  const maxItems = provider === 'TELEGRAM' ? 10 : 12;
  const textLimit = provider === 'TELEGRAM' ? (media.length ? 1024 : 4096) : 4000;
  const contentCode = provider === 'TELEGRAM' ? 'TELEGRAM_CONTENT_LIMIT' : 'MAX_CONTENT';
  if (media.length > maxItems) return { code: contentCode, message: `${name}: выбери не более ${maxItems} медиафайлов.` };
  if (!media.length && !text.trim()) return { code: contentCode, message: `${name}: добавь текст или медиафайл.` };
  if (text.length > textLimit) return { code: contentCode, message: `${name}: ${media.length && provider === 'TELEGRAM' ? 'подпись' : 'текст'} превышает ${textLimit} символов. Сократи текст для этой соцсети.` };

  for (const asset of media) {
    const photo = asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/png';
    const maxBytes = (provider === 'TELEGRAM' && photo ? 10 : 20) * 1024 * 1024;
    if (!photo && asset.mimeType !== 'video/mp4') return {
      code: provider === 'TELEGRAM' ? 'TELEGRAM_MEDIA_FORMAT' : 'MAX_MEDIA',
      message: `${name}: публикация поддерживает только JPEG, PNG и MP4. Замени неподдерживаемый файл.`,
    };
    if (!asset.byteSize || asset.byteSize > maxBytes) return {
      code: provider === 'TELEGRAM' ? 'TELEGRAM_MEDIA_SIZE' : 'MAX_MEDIA',
      message: `${name}: ${photo ? 'изображение' : 'видео'} должно быть непустым и не больше ${maxBytes / 1024 / 1024} МиБ.`,
    };
    if (photo && provider === 'TELEGRAM' && asset.width && asset.height &&
      (asset.width + asset.height > 10000 || Math.max(asset.width / asset.height, asset.height / asset.width) > 20)) return {
      code: 'TELEGRAM_PHOTO_DIMENSIONS',
      message: 'Telegram: сумма ширины и высоты изображения должна быть не больше 10000 px, соотношение сторон — не больше 20. Измени размер изображения.',
    };
    if (photo && provider === 'MAX' && ((asset.width ?? 0) > 7680 || (asset.height ?? 0) > 7680)) return {
      code: 'MAX_MEDIA',
      message: 'MAX: ширина и высота изображения должны быть не больше 7680 px. Измени размер изображения.',
    };
  }
  return null;
}

export class PublicationContentError extends Error {
  readonly code: string;
  constructor(issue: PublicationContentIssue) {
    super(issue.message);
    this.name = 'PublicationContentError';
    this.code = issue.code;
  }
}
