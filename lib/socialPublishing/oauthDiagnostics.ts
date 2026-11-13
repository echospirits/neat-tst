const setupCodes = new Set([
  'oauth_not_configured',
  'oauth_encryption_key_invalid',
  'meta_config_id_invalid',
  'meta_config_user_type_required',
]);

/** Never serialize an exception, message, stack, URL or arbitrary provider code. */
export function socialOAuthStartDiagnostic(error: unknown): { event: 'social_oauth_start_failed'; code: string } {
  let code: unknown;
  try {
    if (error && typeof error === 'object') code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  } catch { /* A hostile accessor/proxy is not diagnostic data. */ }
  return {
    event: 'social_oauth_start_failed',
    code: typeof code === 'string' && (code.length === 5 && /^P[0-9]{4}$/.test(code) || setupCodes.has(code)) ? code : 'unexpected',
  };
}
