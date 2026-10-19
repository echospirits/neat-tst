import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assertOrganizationId } from '../lib/organizationId';

const workflow = readFileSync(new URL('../.github/workflows/ohlq-annual-sales.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const repairStep = workflow.split('      - name: Repair selected tenant OHLQ credentials\n')[1]?.split('\n      - name: ')[0];
assert.ok(repairStep, 'Missing tenant credential repair step.');
const bash = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
  : 'bash';
const validIds = ['c' + 'a'.repeat(24), 'org_echo_spirits', 'org_neat_staging'];
const invalidIds = [
  '', ' ', 'org_unknown', 'org-echo-spirits', 'c' + 'a'.repeat(23), 'c' + 'a'.repeat(25),
  'C' + 'a'.repeat(24), 'c' + 'A'.repeat(24), 'org_echo_spirits\n', 'org_echo_spirits\r\n',
  ' org_echo_spirits', 'org_echo_spirits ', '--apply',
  '$(touch injection-marker)', '`touch injection-marker`',
  '"; touch injection-marker; #', 'org_echo_spirits\ntouch injection-marker',
  '${APP_ENV}', 'org_echo_spirits;touch injection-marker',
];

test('repair validates the exact organization ID before database lookup or credential writes', () => {
  for (const id of validIds) assert.doesNotThrow(() => assertOrganizationId(id));
  for (const id of invalidIds) assert.throws(() => assertOrganizationId(id), /organization/);
  const script = readFileSync(new URL('../scripts/repair-ohlq-tenant-credentials.ts', import.meta.url), 'utf8');
  const validation = script.indexOf('assertOrganizationId(organizationId);');
  assert.ok(validation >= 0 && validation < script.indexOf('validateRuntimeEnvironment();'));
  assert.ok(validation < script.indexOf('await prisma.organization.findUnique'));
  assert.ok(validation < script.indexOf('await saveOrganizationOhlqCredentials'));
  assert.match(script, /process\.argv\.includes\('--apply'\)/);
  assert.match(script, /runtime\.appEnvironment !== environment/);
  assert.match(script, /assertSideEffectEnabled\('ohlqImport'\)/);
});

test('repair dispatch input crosses into Bash only through the step environment', () => {
  assert.match(repairStep, /TENANT_ORGANIZATION_ID: \$\{\{ inputs\.tenantOrganizationId \}\}/);
  assert.match(repairStep, /shell: bash/);
  const run = repairStep.split('        run: |\n')[1];
  assert.ok(run);
  assert.doesNotMatch(run, /\$\{\{/);
});

test('the actual workflow shell rejects payloads without executing them or invoking repair', () => {
  const run = repairStep.split('        run: |\n')[1];
  assert.ok(run, 'Repair must use a literal run block.');
  const shellSource = run.split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n');
  const dir = mkdtempSync(path.join(tmpdir(), 'neat-credential-repair-'));
  try {
    for (const id of [...validIds, ...invalidIds]) {
      const result = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, APP_ENV: 'test', TENANT_ORGANIZATION_ID: id },
        // Stub npm: this test cannot reach a database, portal or credential writer.
        input: 'set -euo pipefail\nnpm() { printf "%s\\0" "$@"; }\n' + shellSource,
        timeout: 10000,
      });
      assert.ifError(result.error);
      assert.equal(existsSync(path.join(dir, 'injection-marker')), false, `Shell executed input ${JSON.stringify(id)}`);
      if (validIds.includes(id)) {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(result.stdout.split('\0').slice(0, -1), [
          'run', 'repair:ohlq-tenant-credentials', '--', '--environment', 'test', '--organization', id, '--apply',
        ]);
      } else {
        assert.equal(result.status, 1, `Accepted input ${JSON.stringify(id)}`);
        assert.equal(result.stdout, '', 'Invalid input invoked npm.');
        assert.match(result.stderr, /organization/);
      }
    }
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()), 'Cleanup must stay in the test temp directory.');
    rmSync(dir, { recursive: true, force: true });
  }
});
