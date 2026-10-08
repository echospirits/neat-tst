const fs = require('node:fs');
const path = require('node:path');

const runnerTemp = process.env.RUNNER_TEMP;
if (!runnerTemp || !path.isAbsolute(runnerTemp)) {
  throw new Error('OHLQ artifact summaries require an absolute RUNNER_TEMP.');
}

// Build a new document from enum values only. Never read or copy reports,
// screenshots, logs, error messages, credentials, or arbitrary environment data.
const statuses = new Set(['success', 'failure', 'cancelled', 'skipped']);
const status = (value) => statuses.has(value) ? value : 'unknown';
const summary = {
  job: status(process.env.OHLQ_JOB_STATUS),
  steps: {
    accountMaster: status(process.env.OHLQ_ACCOUNT_MASTER_STATUS),
    brandMaster: status(process.env.OHLQ_BRAND_MASTER_STATUS),
    salesImport: status(process.env.OHLQ_SALES_IMPORT_STATUS),
    tenantInventory: status(process.env.OHLQ_TENANT_INVENTORY_STATUS),
    intelligence: status(process.env.OHLQ_INTELLIGENCE_STATUS),
  },
};

const directory = path.join(runnerTemp, 'ohlq-artifacts');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(directory, 'status.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
