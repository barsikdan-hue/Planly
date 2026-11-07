export type SocialProvider = 'TELEGRAM' | 'MAX' | 'VK';
export type PublicationErrorType = 'TEMPORARY' | 'AUTH' | 'VALIDATION' | 'PERMANENT';

export type VkPublicationDiagnostic = {
  stage: 'COMMUNITY_VALIDATION' | 'GET_UPLOAD_SERVER' | 'UPLOAD' | 'UPLOAD_RESPONSE' | 'SAVE_PHOTO' | 'PHOTO_RECEIPT' | 'WALL_POST';
  method?: 'groups.getById' | 'photos.getWallUploadServer' | 'photos.saveWallPhoto' | 'wall.post';
  vkErrorCode?: number;
  uploadHttpStatus?: number;
  uploadHostClass?: 'VK_RU_PHOTO_UPLOAD' | 'VK_COM_PHOTO_UPLOAD';
  uploadAttempt?: 'PRIMARY' | 'FALLBACK';
  networkErrorClass?: 'TIMEOUT' | 'DNS' | 'CONNECTION' | 'TLS' | 'OTHER';
  photoReceiptReason?: 'RESPONSE_SHAPE' | 'PHOTO_COUNT' | 'PHOTO_ID_INVALID' | 'PHOTO_OWNER_INVALID' | 'PHOTO_OWNER_MISMATCH' | 'PHOTO_ACCESS_KEY_PRESENT' | 'DUPLICATE_ATTACHMENT';
};

export type PublishInput = {
  publicationId: string;
  socialAccountId?: string;
  provider: SocialProvider;
  destinationId: string | null;
  text: string;
  media?: Array<{ name: string; mimeType: string; bytes: Uint8Array; width?: number | null; height?: number | null }>;
};

export type PublishResult =
  | { ok: true; remoteId: string; remoteUrl?: string | null }
  | { ok: false; errorType: PublicationErrorType; code?: string | null; message: string; retryAfterMs?: number; vkDiagnostic?: VkPublicationDiagnostic };

export type ControlValidationResult =
  | { ok: true; destinationId: string; displayName: string; humanId: string; botId: string }
  | Extract<PublishResult, { ok: false }>;

export interface SocialConnector {
  provider: SocialProvider;
  publish(input: PublishInput): Promise<PublishResult>;
}

export type ConnectorResolver = (provider: SocialProvider) => SocialConnector;
