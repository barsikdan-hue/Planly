import { VkOAuthError, type VkOAuthDiagnostic, type VkInvalidGrantReason, type VkDescriptionState, type VkDescriptionMention, type VkTokenExchangeMetadata, type VkServiceTokenTerm } from './config.ts';

// Mentions are lexical signals only, not provider-reported causes or proof of a request bug.
// Retain no description/body. Bound work before trimming or matching untrusted text.
export function vkTokenExchangeMetadata(httpStatus: number, description: unknown): VkTokenExchangeMetadata {
  const state: VkDescriptionState = description === undefined ? 'MISSING' : typeof description !== 'string' ? 'NON_STRING' : description.length > 4096 ? 'TOO_LONG' : !description.trim() ? 'EMPTY' : 'PRESENT';
  const mentions: VkDescriptionMention[] = [];
  if (state === 'PRESENT' && typeof description === 'string') {
    const patterns: readonly [VkDescriptionMention, RegExp][] = [
      ['PKCE', /\b(?:pkce|code_verifier|code_challenge)\b/i],
      ['CODE', /\b(?:code|authorization_code)\b/i],
      ['DEVICE_ID', /\bdevice_id\b/i],
      ['REDIRECT_URI', /\bredirect_uri\b/i],
      ['SERVICE_TOKEN', /\bservice_token\b/i],
    ];
    for (const [mention, pattern] of patterns) if (pattern.test(description)) mentions.push(mention);
  }
  const terms: VkServiceTokenTerm[] = [];
  if (state === 'PRESENT' && typeof description === 'string' && mentions.includes('SERVICE_TOKEN')) {
    // These are word-presence signals, including in negated/quoted text, never causal classifications.
    const patterns: readonly [VkServiceTokenTerm, RegExp][] = [
      ['INVALID', /\b(?:invalid|incorrect|wrong|bad)\b/i],
      ['MISSING', /\b(?:missing|absent)\b/i],
      ['REQUIRED', /\b(?:required|require|requires|mandatory)\b/i],
      ['EXPIRED', /\bexpired\b/i],
      ['REVOKED', /\brevoked\b/i],
      ['IP', /\b(?:ip|ip_address|ipaddress)\b/i],
      ['APPLICATION', /\b(?:app|application|client|client_id)\b/i],
      ['CONFIDENTIAL', /\bconfidential\b/i],
      ['RESTRICTED', /\b(?:restricted|forbidden|disallowed|not_allowed)\b|\bnot[ \t]+allowed\b/i],
      ['ALLOWLIST', /\b(?:allowed|allowlist|whitelist)\b/i],
    ];
    for (const [term, pattern] of patterns) if (pattern.test(description)) terms.push(term);
  }
  return { providerHttpStatus: httpStatus, providerDescriptionState: state, providerDescriptionMentions: mentions, ...(terms.length ? { providerServiceTokenTerms: terms } : {}) };
}

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
  const descriptionStates: readonly unknown[] = ['MISSING', 'NON_STRING', 'EMPTY', 'PRESENT', 'TOO_LONG'];
  const descriptionMentions: readonly unknown[] = ['PKCE', 'CODE', 'DEVICE_ID', 'REDIRECT_URI', 'SERVICE_TOKEN'];
  const serviceTokenTerms: readonly unknown[] = ['INVALID', 'MISSING', 'REQUIRED', 'EXPIRED', 'REVOKED', 'IP', 'APPLICATION', 'CONFIDENTIAL', 'RESTRICTED', 'ALLOWLIST'];
  const metadata = known?.tokenExchangeMetadata;
  const httpStatus = metadata?.providerHttpStatus; const descriptionState = metadata?.providerDescriptionState;
  const suppliedMentions = metadata?.providerDescriptionMentions;
  // Snapshot bounded entries by index: sparse holes must fail validation, not become JSON null.
  const mentions = Array.isArray(suppliedMentions) && suppliedMentions.length <= 5 ? Array.from({ length: suppliedMentions.length }, (_, index) => suppliedMentions[index]) : undefined;
  const suppliedTerms = metadata?.providerServiceTokenTerms;
  const terms = Array.isArray(suppliedTerms) && suppliedTerms.length > 0 && suppliedTerms.length <= 10 ? Array.from({ length: suppliedTerms.length }, (_, index) => suppliedTerms[index]) : undefined;
  const safeTerms = descriptionState === 'PRESENT' && mentions?.includes('SERVICE_TOKEN') && terms && terms.every(term => serviceTokenTerms.includes(term)) ? [...new Set(terms)] : undefined;
  const safeMetadata = httpStatus !== undefined && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 && descriptionStates.includes(descriptionState) && mentions && mentions.every(mention => descriptionMentions.includes(mention)) ? {
    providerHttpStatus: httpStatus,
    providerDescriptionState: descriptionState,
    providerDescriptionMentions: [...new Set(mentions)],
    ...(safeTerms ? { providerServiceTokenTerms: safeTerms } : {}),
  } : undefined;
  console.warn(JSON.stringify({
    event: 'VK_OAUTH_FAILURE',
    code: known && codes.includes(known.code) ? known.code : 'AUTH',
    stage: stages.includes(known?.diagnostic?.stage) ? known?.diagnostic?.stage : 'CALLBACK',
    reason: reasons.includes(known?.diagnostic?.reason) ? known?.diagnostic?.reason : 'FAILED',
    ...(known?.diagnostic?.stage === 'TOKEN_EXCHANGE' && known.diagnostic.reason === 'INVALID_GRANT' ? {
      invalidGrantReason: invalidGrantReasons.includes(known.invalidGrantReason) ? known.invalidGrantReason : 'OTHER_INVALID_GRANT',
      ...safeMetadata,
    } : {}),
  }));
}
