import os from 'node:os';
import path from 'node:path';

type ReportStorageOptions = {
  debugDir?: string;
  downloadDir?: string;
  returnBuffer?: boolean;
};

export function getOhlqReportStorageDirectories(
  options: ReportStorageOptions = {},
  environment: Record<string, string | undefined> = process.env,
) {
  // CI exports and authenticated screenshots must never enter the workspace
  // artifact tree, including when a caller supplies a local output override.
  if (environment.GITHUB_ACTIONS === 'true') {
    const runnerTemp = environment.RUNNER_TEMP;
    if (!runnerTemp || !path.isAbsolute(runnerTemp)) {
      throw new Error('GitHub Actions OHLQ downloads require an absolute RUNNER_TEMP.');
    }
    const privateRoot = path.join(runnerTemp, 'ohlq-private');
    return {
      debugDir: path.join(privateRoot, 'playwright'),
      downloadDir: path.join(privateRoot, 'downloads'),
    };
  }

  return {
    debugDir: path.resolve(options.debugDir ?? (environment.VERCEL
      ? path.join(os.tmpdir(), 'ohlq-playwright')
      : path.join(process.cwd(), 'output', 'playwright'))),
    downloadDir: path.resolve(options.downloadDir ?? (options.returnBuffer
      ? path.join(os.tmpdir(), 'ohlq-downloads')
      : path.join(process.cwd(), 'output', 'ohlq-downloads'))),
  };
}
