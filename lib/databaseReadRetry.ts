const transientCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

// Only pass reads here: a lost response must never replay a committed write.
export async function retryDatabaseRead<T>(read: () => PromiseLike<T>, options: {
  sleep?: (milliseconds: number) => Promise<void>;
  warn?: (message: string) => void;
} = {}): Promise<T> {
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const warn = options.warn ?? console.warn;
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      const value = error as { code?: string; errorCode?: string } | null;
      const code = value?.code ?? value?.errorCode;
      if (!code || !transientCodes.has(code) || attempt >= 3) throw error;
      warn(`Transient database read failure (${code}); retry ${attempt}/2.`);
      await sleep(2_000 * attempt);
    }
  }
}
