import { VkOAuthError, type VkOAuthDiagnostic, type VkInvalidGrantReason } from './config.ts';

// Exact whole-string matches only. Unknown descriptions and provider echoes are discarded.
// These classify what the provider reports; they do not independently prove the underlying cause.
export function vkInvalidGrantReason(description: unknown): VkInvalidGrantReason {
  switch (description) {
    case 'code_challenge does not match code_verifier': return 'PKCE_MISMATCH';
    case 'code_verifier is invalid': return 'CODE_VERIFIER_REJECTED';
    case 'code is invalid or expired':
    case 'code was already used': return 'CODE_INVALID_EXPIRED_OR_USED';
    case 'device_id is invalid': return 'DEVICE_ID_REJECTED';
    case 'redirect_uri is invalid, please pass same redirect_uri, you used in authorize method.': return 'REDIRECT_REJECTED';
    case 'service_token is invalid': return 'SERVICE_TOKEN_REJECTED';
    default: return 'OTHER_INVALID_GRANT';
  }
}

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
  const invalidGrantReasons: readonly unknown[] = ['PKCE_MISMATCH', 'CODE_VERIFIER_REJECTED', 'CODE_INVALID_EXPIRED_OR_USED', 'DEVICE_ID_REJECTED', 'REDIRECT_REJECTED', 'SERVICE_TOKEN_REJECTED', 'OTHER_INVALID_GRANT'];
  console.warn(JSON.stringify({
    event: 'VK_OAUTH_FAILURE',
    code: known && codes.includes(known.code) ? known.code : 'AUTH',
    stage: stages.includes(known?.diagnostic?.stage) ? known?.diagnostic?.stage : 'CALLBACK',
    reason: reasons.includes(known?.diagnostic?.reason) ? known?.diagnostic?.reason : 'FAILED',
    ...(known?.diagnostic?.stage === 'TOKEN_EXCHANGE' && known.diagnostic.reason === 'INVALID_GRANT' ? {
      invalidGrantReason: invalidGrantReasons.includes(known.invalidGrantReason) ? known.invalidGrantReason : 'OTHER_INVALID_GRANT',
    } : {}),
  }));
}
