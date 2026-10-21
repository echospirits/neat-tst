// Only for idempotent status upserts with a stable key and fixed values.
// Never use for imports, increments, external side effects, or multi-step workflows.
export async function retryDatabaseStatusWrite<T>(write: () => PromiseLike<T>, options: {
  sleep?: (milliseconds: number) => Promise<void>;
  warn?: (message: string) => void;
} = {}): Promise<T> {
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const warn = options.warn ?? console.warn;
  for (let attempt = 1; ; attempt++) {
    try { return await write(); }
    catch (error) {
      const value = error as { code?: string; errorCode?: string } | null;
      const code = value?.code ?? value?.errorCode;
      if (!code || !['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(code) || attempt >= 3) throw error;
      warn(`Transient database status failure (${code}); retry ${attempt}/2.`);
      await sleep(2_000 * attempt);
    }
  }
}
