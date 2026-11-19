type SourceReadError = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  response?: { status?: unknown };
  cause?: unknown;
};

const transportCodes = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);
const transientStatuses = new Set([429, 502, 503, 504]);
const permanentMessage = /authentication|unauthori[sz]ed|forbidden|access denied|permission denied|invalid credentials|incorrect (?:username|password)|returned to login|(?:sign[ -]?in|login).*(?:failed|blocked|restricted|timeout|timed out)|AADSTS|multi.factor|missing required|schema|column .*does not exist|invalid (?:date|configuration)|must be configured/i;

/** Only use for source downloads. This never classifies accumulated process logs. */
export function isTransientOhlqSourceReadError(error: unknown): boolean {
  const errors: SourceReadError[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current) && errors.length < 5) {
    seen.add(current);
    const value = current as SourceReadError;
    errors.push(value);
    current = value.cause;
  }
  // A permanent/cancelled cause takes precedence over any transient wording.
  for (const value of errors) {
    const name = typeof value.name === 'string' ? value.name : '';
    const code = typeof value.code === 'string' ? value.code : '';
    const message = typeof value.message === 'string' ? value.message : '';
    const status = value.status ?? value.statusCode ?? value.response?.status;
    if (/AbortError|Prisma|OhlqSourceNotUpdatedError/.test(name) || /^P\d{4}$/.test(code) ||
        ['ABORT_ERR', 'ERR_CANCELED', 'EACCES', 'EPERM', 'ENOTFOUND'].includes(code) ||
        (typeof status === 'number' && !transientStatuses.has(status)) || permanentMessage.test(message)) return false;
  }
  return errors.some((value) => {
    const code = typeof value.code === 'string' ? value.code : '';
    const message = typeof value.message === 'string' ? value.message : '';
    const status = value.status ?? value.statusCode ?? value.response?.status;
    return transportCodes.has(code) || (typeof status === 'number' && transientStatuses.has(status)) ||
      /net::ERR_(?:CONNECTION_(?:ABORTED|CLOSED|RESET|REFUSED|FAILED)|NETWORK_CHANGED|TIMED_OUT|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE)\b/i.test(message) ||
      /\b(?:HTTP(?:\/\d(?:\.\d)?)?(?: response| status(?: code)?)?|response status|status(?: code)?)[\s:=]+(?:429|502|503|504)\b|\b503\s+Service Unavailable\b/i.test(message) ||
      /(?:page\.(?:goto|reload|waitForNavigation)|navigation).*\b(?:timeout|timed out)\b/i.test(message) ||
      /(?:download.*(?:timed out|did not finish saving within)|page\.waitForEvent:.*timeout.*download)/i.test(message);
  });
}

/** Retry only the read before parsing, importing or any reconciliation writes. */
export async function retryOhlqSourceRead<T>(read: () => Promise<T>, {
  sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  warn = (message: string) => console.warn(`::warning::${message}`),
}: { sleep?: (milliseconds: number) => Promise<void>; warn?: (message: string) => void } = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await read(); }
    catch (error) {
      if (attempt >= 3 || !isTransientOhlqSourceReadError(error)) throw error;
      warn(`Temporary source download failure; retrying in ${attempt * 15} seconds (attempt ${attempt + 1}/3).`);
      await sleep(attempt * 15_000);
    }
  }
}
