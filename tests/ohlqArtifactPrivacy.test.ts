import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getOhlqReportStorageDirectories } from '../lib/ohlqReportStorage';

const workflow = readFileSync(new URL('../.github/workflows/ohlq-annual-sales.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const summaryScript = fileURLToPath(new URL('../scripts/write-ohlq-artifact-summary.cjs', import.meta.url));
const step = (name: string) => {
  const body = workflow.split(`      - name: ${name}\n`)[1];
  assert.ok(body, `Missing workflow step: ${name}`);
  return body.split('\n      - name: ')[0];
};

test('Actions stores every report and authenticated screenshot outside the workspace, overriding local paths', () => {
  const runnerTemp = path.join(os.tmpdir(), 'ohlq-test-runner');
  for (const returnBuffer of [true, false]) {
    const directories = getOhlqReportStorageDirectories({
      debugDir: path.join(process.cwd(), 'output', 'playwright'),
      downloadDir: path.join(process.cwd(), 'output', 'ohlq-downloads'),
      returnBuffer,
    }, { GITHUB_ACTIONS: 'true', RUNNER_TEMP: runnerTemp });
    assert.deepEqual(directories, {
      debugDir: path.join(runnerTemp, 'ohlq-private', 'playwright'),
      downloadDir: path.join(runnerTemp, 'ohlq-private', 'downloads'),
    });
  }
});

test('Actions fails closed without absolute private runner storage', () => {
  for (const runnerTemp of [undefined, '', 'relative-directory']) {
    assert.throws(() => getOhlqReportStorageDirectories({}, {
      GITHUB_ACTIONS: 'true', RUNNER_TEMP: runnerTemp,
    }), /absolute RUNNER_TEMP/);
  }
});

test('local file downloads, explicit paths and serverless buffer defaults remain supported', () => {
  assert.deepEqual(getOhlqReportStorageDirectories({}, {}), {
    debugDir: path.join(process.cwd(), 'output', 'playwright'),
    downloadDir: path.join(process.cwd(), 'output', 'ohlq-downloads'),
  });
  assert.deepEqual(getOhlqReportStorageDirectories({ debugDir: 'debug', downloadDir: 'downloads' }, {}), {
    debugDir: path.resolve('debug'), downloadDir: path.resolve('downloads'),
  });
  assert.deepEqual(getOhlqReportStorageDirectories({ returnBuffer: true }, { VERCEL: '1' }), {
    debugDir: path.join(os.tmpdir(), 'ohlq-playwright'),
    downloadDir: path.join(os.tmpdir(), 'ohlq-downloads'),
  });
});

test('the shared browser runtime routes master, sales and inventory downloads through private storage', () => {
  const source = readFileSync(new URL('../lib/ohlqAnnualSalesReport.ts', import.meta.url), 'utf8');
  assert.match(source, /const \{ downloadDir, debugDir \} = getOhlqReportStorageDirectories\(options\)/);
  assert.doesNotMatch(source, /path\.join\(APP_ROOT, 'output'/);
});

test('the only published artifact is a single sanitized JSON file, on failure after generation, retained for one day', () => {
  assert.equal((workflow.match(/uses: actions\/upload-artifact@/g) ?? []).length, 1);
  const upload = step('Upload sanitized OHLQ failure summary');
  assert.match(upload, /if: failure\(\) && steps\.artifact_summary\.outcome == 'success' && steps\.schedule_window\.outputs\.should_run == 'true'/);
  assert.match(upload, /path: \$\{\{ runner\.temp \}\}\/ohlq-artifacts\/status\.json\n/);
  assert.match(upload, /retention-days: 1\n/);
  assert.match(upload, /if-no-files-found: error/);
  assert.doesNotMatch(upload, /always\(\)|output\/|\*|\.csv|\.png/);
  const generate = step('Generate sanitized OHLQ failure summary');
  assert.match(generate, /if: failure\(\) && steps\.schedule_window\.outputs\.should_run == 'true'/);
  assert.match(generate, /run: node scripts\/write-ohlq-artifact-summary\.cjs/);
  for (const id of ['account_master', 'brand_master', 'sales_import', 'tenant_inventory', 'intelligence']) {
    assert.match(workflow, new RegExp(`id: ${id}\\n`));
    assert.ok(generate.includes(`steps.${id}.outcome`));
  }
});

test('artifact generation excludes raw reports, screenshots, logs, secrets and arbitrary status text', () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'ohlq-artifact-privacy-'));
  try {
    const runnerTemp = path.join(fixture, 'runner');
    const workspace = path.join(fixture, 'workspace');
    const privateDirectories = getOhlqReportStorageDirectories({}, { GITHUB_ACTIONS: 'true', RUNNER_TEMP: runnerTemp });
    for (const directory of [privateDirectories.downloadDir, privateDirectories.debugDir, path.join(workspace, 'output')]) {
      mkdirSync(directory, { recursive: true });
    }
    const sensitive = 'PRIVATE-REPORT-CREDENTIAL-CANARY';
    for (const report of ['accounts', 'brands', 'annual-sales', 'wholesale-sales', 'tenant-inventory']) {
      writeFileSync(path.join(privateDirectories.downloadDir, `${report}.csv`), `account,sales\n${sensitive},100\n`);
    }
    writeFileSync(path.join(privateDirectories.debugDir, 'authenticated.png'), sensitive);
    writeFileSync(path.join(workspace, 'output', 'old-report.csv'), sensitive);
    writeFileSync(path.join(workspace, 'output', 'debug.log'), sensitive);
    const result = spawnSync(process.execPath, [summaryScript], {
      cwd: workspace,
      env: {
        ...process.env, RUNNER_TEMP: runnerTemp,
        OHLQ_JOB_STATUS: 'failure',
        OHLQ_ACCOUNT_MASTER_STATUS: 'success',
        OHLQ_BRAND_MASTER_STATUS: 'failure',
        OHLQ_SALES_IMPORT_STATUS: 'skipped',
        OHLQ_TENANT_INVENTORY_STATUS: 'cancelled',
        OHLQ_INTELLIGENCE_STATUS: sensitive,
        OHLQ_OPS_PASSWORD: sensitive,
        OHLQ_MICROSOFT_PASSWORD: sensitive,
        DATABASE_URL: sensitive,
        ERROR_MESSAGE: sensitive,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    const artifactDirectory = path.join(runnerTemp, 'ohlq-artifacts');
    assert.deepEqual(readdirSync(artifactDirectory), ['status.json']);
    const published = readFileSync(path.join(artifactDirectory, 'status.json'), 'utf8');
    assert.ok(!published.includes(sensitive));
    assert.deepEqual(JSON.parse(published), {
      job: 'failure',
      steps: {
        accountMaster: 'success', brandMaster: 'failure', salesImport: 'skipped',
        tenantInventory: 'cancelled', intelligence: 'unknown',
      },
    });
    assert.equal(readFileSync(path.join(privateDirectories.downloadDir, 'accounts.csv'), 'utf8'), `account,sales\n${sensitive},100\n`);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('artifact generation cannot fall back to publishing the workspace when RUNNER_TEMP is missing', () => {
  const result = spawnSync(process.execPath, [summaryScript], {
    env: { ...process.env, RUNNER_TEMP: '' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absolute RUNNER_TEMP/);
});
