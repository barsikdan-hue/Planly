import { VkOAuthError, type VkOAuthDiagnostic } from './config.ts';

export function vkProviderFailureReason(value: unknown): VkOAuthDiagnostic['reason'] {
  switch (value) {
    case 'invalid_scope': return 'INVALID_SCOPE';
    case 'invalid_grant': return 'INVALID_GRANT';
    case 'invalid_client': return 'INVALID_CLIENT';
    case 'access_denied': return 'ACCESS_DENIED';
    default: return 'PROVIDER_REJECTED';
  }
}

// Never pass errors, URLs, grant bodies, state, codes, IDs or provider text to the logger.
// Recheck allowlists here, rather than trusting mutable error properties at runtime.
export function logVkOAuthFailure(error: unknown): void {
  const codes: readonly unknown[] = ['AUTH', 'CONFIG', 'NOT_FOUND', 'STATE', 'VALIDATION'];
  const stages: readonly unknown[] = ['CALLBACK', 'OAUTH_INTENT', 'TOKEN_EXCHANGE', 'GRANT_VALIDATION', 'COMMUNITY_VALIDATION', 'CREDENTIAL_PERSISTENCE'];
  const reasons: readonly unknown[] = ['FAILED', 'INVALID_SCOPE', 'INVALID_GRANT', 'INVALID_CLIENT', 'ACCESS_DENIED', 'PROVIDER_REJECTED', 'HTTP_REJECTED', 'INVALID_RESPONSE', 'TRANSPORT_FAILED', 'STATE_MISMATCH', 'MISSING_PUBLISHING_SCOPES'];
  const known = error instanceof VkOAuthError ? error : undefined;
  console.warn(JSON.stringify({
    event: 'VK_OAUTH_FAILURE',
    code: known && codes.includes(known.code) ? known.code : 'AUTH',
    stage: stages.includes(known?.diagnostic?.stage) ? known?.diagnostic?.stage : 'CALLBACK',
    reason: reasons.includes(known?.diagnostic?.reason) ? known?.diagnostic?.reason : 'FAILED',
  }));
}
