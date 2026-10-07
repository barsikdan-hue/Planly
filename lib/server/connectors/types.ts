export type SocialProvider = 'TELEGRAM' | 'MAX' | 'VK';
export type PublicationErrorType = 'TEMPORARY' | 'AUTH' | 'VALIDATION' | 'PERMANENT';

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
  | { ok: false; errorType: PublicationErrorType; code?: string | null; message: string; retryAfterMs?: number };

export interface SocialConnector {
  provider: SocialProvider;
  publish(input: PublishInput): Promise<PublishResult>;
}

export type ConnectorResolver = (provider: SocialProvider) => SocialConnector;
