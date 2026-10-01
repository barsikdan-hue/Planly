export type SocialProvider = 'TELEGRAM' | 'MAX';
export type PublicationErrorType = 'TEMPORARY' | 'AUTH' | 'VALIDATION' | 'PERMANENT';

export type PublishInput = {
  publicationId: string;
  provider: SocialProvider;
  destinationId: string | null;
  text: string;
};

export type PublishResult =
  | { ok: true; remoteId: string; remoteUrl?: string | null }
  | { ok: false; errorType: PublicationErrorType; code?: string | null; message: string };

export interface SocialConnector {
  provider: SocialProvider;
  publish(input: PublishInput): Promise<PublishResult>;
}

export type ConnectorResolver = (provider: SocialProvider) => SocialConnector;
