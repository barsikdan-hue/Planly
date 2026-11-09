import { VkOAuthError, type VkOAuthDiagnostic, type VkInvalidGrantReason, type VkDescriptionState, type VkDescriptionMention, type VkTokenExchangeMetadata, type VkServiceTokenTerm, type VkCommunityValidationMetadata } from './config.ts';
import { sanitizeVkPublicationDiagnostic, VkCommunityValidationError } from '../connectors/vk.ts';

function safeCommunityValidationMetadata(value: unknown): VkCommunityValidationMetadata | undefined {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    // Snapshot each untrusted field once; never retain a caller-owned object/getter.
    const { connectorCode, errorType, vkErrorCode, networkErrorClass } = value as Record<string, unknown>;
    const codes: readonly unknown[] = ['VK_COMMUNITY', 'VK_POST_PERMISSION', 'VK_RECONNECT_REQUIRED', 'VK_API_VERSION', 'VK_UNAVAILABLE',
      'VK_METHOD_PROFILE_DENIED', 'VK_GROUP_TOKEN_METHOD_DENIED', 'VK_API_ACCESS_NOT_GRANTED',
      'VK_5', 'VK_6', 'VK_7', 'VK_9', 'VK_14', 'VK_17', 'VK_20', 'VK_22', 'VK_24', 'VK_25', 'VK_28', 'VK_29',
      'VK_100', 'VK_118', 'VK_121', 'VK_214', 'VK_219', 'VK_220', 'VK_222', 'VK_224', 'VK_225', 'VK_704', 'VK_1117'];
    if (!codes.includes(connectorCode) || !['TEMPORARY', 'AUTH', 'VALIDATION', 'PERMANENT'].includes(errorType as string)) return;
    const safe: VkCommunityValidationMetadata = { connectorCode: connectorCode as VkCommunityValidationMetadata['connectorCode'], errorType: errorType as VkCommunityValidationMetadata['errorType'] };
    if (typeof vkErrorCode === 'number' && Number.isSafeInteger(vkErrorCode) && vkErrorCode > 0 && vkErrorCode <= 9999) safe.vkErrorCode = vkErrorCode;
    if (typeof networkErrorClass === 'string' && ['TIMEOUT', 'DNS', 'CONNECTION', 'TLS', 'OTHER'].includes(networkErrorClass)) safe.networkErrorClass = networkErrorClass as VkCommunityValidationMetadata['networkErrorClass'];
    return safe;
  } catch { return undefined; }
}

// Preserve only the connector's closed diagnosis, never its Error/message/cause.
export function vkCommunityOAuthFailure(error: unknown): VkOAuthError {
  let metadata: VkCommunityValidationMetadata | undefined;
  try {
    if (error instanceof VkCommunityValidationError) {
      const { code, errorType, vkDiagnostic } = error;
      const diagnostic = sanitizeVkPublicationDiagnostic(vkDiagnostic);
      const community = diagnostic?.stage === 'COMMUNITY_VALIDATION' && (!diagnostic.method || diagnostic.method === 'groups.getById') ? diagnostic : undefined;
      metadata = safeCommunityValidationMetadata({ connectorCode: code, errorType, vkErrorCode: community?.vkErrorCode, networkErrorClass: community?.networkErrorClass });
    }
  } catch { /* Unknown/mutable errors retain only the OAuth stage. */ }
  return new VkOAuthError('AUTH', { stage: 'COMMUNITY_VALIDATION', reason: 'FAILED' }, undefined, undefined, metadata);
}

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
  let output: Record<string, unknown> = { event: 'VK_OAUTH_FAILURE', code: 'AUTH', stage: 'CALLBACK', reason: 'FAILED' };
  try {
  const codes: readonly unknown[] = ['AUTH', 'CONFIG', 'NOT_FOUND', 'STATE', 'VALIDATION'];
  const stages: readonly unknown[] = ['CALLBACK', 'OAUTH_INTENT', 'TOKEN_EXCHANGE', 'GRANT_VALIDATION', 'COMMUNITY_VALIDATION', 'CREDENTIAL_PERSISTENCE'];
  const reasons: readonly unknown[] = ['FAILED', 'INVALID_SCOPE', 'INVALID_GRANT', 'INVALID_CLIENT', 'ACCESS_DENIED', 'PROVIDER_REJECTED', 'HTTP_REJECTED', 'INVALID_RESPONSE', 'TRANSPORT_FAILED', 'STATE_MISMATCH', 'MISSING_PUBLISHING_SCOPES'];
  const known = error instanceof VkOAuthError ? error : undefined;
  const diagnostic = known?.diagnostic;
  const code = known?.code, stage = diagnostic?.stage, reason = diagnostic?.reason;
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
  const communityValidation = stage === 'COMMUNITY_VALIDATION' ? safeCommunityValidationMetadata(known?.communityValidationMetadata) : undefined;
  const invalidGrantReason = known?.invalidGrantReason;
  output = {
    event: 'VK_OAUTH_FAILURE',
    code: codes.includes(code) ? code : 'AUTH',
    stage: stages.includes(stage) ? stage : 'CALLBACK',
    reason: reasons.includes(reason) ? reason : 'FAILED',
    ...(communityValidation ? { communityValidation } : {}),
    ...(stage === 'TOKEN_EXCHANGE' && reason === 'INVALID_GRANT' ? {
      invalidGrantReason: invalidGrantReasons.includes(invalidGrantReason) ? invalidGrantReason : 'OTHER_INVALID_GRANT',
      ...safeMetadata,
    } : {}),
  };
  } catch { /* A throwing getter must not escape or enter the log. */ }
  console.warn(JSON.stringify(output));
}
