import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function auditFixture(addForecast: boolean) {
  const parent = path.resolve(tmpdir());
  const directory = mkdtempSync(path.join(parent, 'neat-release-audit-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const save = (file: string, content: string) => { mkdirSync(path.dirname(path.join(directory, file)), { recursive: true }); writeFileSync(path.join(directory, file), content); };
  const registry = (extra: string) => `export const FEATURE_KEYS = ['CORE_CRM'${extra}] as const;\n`;
  const released = () => {
    save('package.json', '{"version":"0.2.3"}\n');
    save('lib/featureRegistry.ts', registry(", 'COMMUNICATIONS'"));
    save('prisma/migrations/already_released/migration.sql', '-- already deployed\n');
    save('.env.example', 'EXISTING_PROVIDER=\n');
  };
  const output: string[] = [];
  try {
    git('init', '--initial-branch=production'); git('config', 'user.name', 'Release fixture'); git('config', 'user.email', 'fixture@example.invalid');
    save('package.json', '{"version":"0.14.0"}\n'); save('lib/featureRegistry.ts', registry(''));
    git('add', '.'); git('commit', '-m', 'Historical numbering'); git('tag', 'v0.14.0');
    released(); git('add', '.'); git('commit', '-m', 'Released application tree'); git('tag', 'v0.2.3');
    const production = git('rev-parse', 'production');
    // Independently promoted histories can contain equivalent trees under
    // different commits. Release contents must not include those old changes.
    git('checkout', '-b', 'tst', 'production~1'); released(); git('add', '.'); git('commit', '-m', 'Equivalent TST application tree');
    if (addForecast) {
      save('lib/featureRegistry.ts', registry(", 'COMMUNICATIONS', 'PRODUCTION_FORECASTING'"));
      save('prisma/migrations/new_forecast/migration.sql', '-- new tables\n');
      save('.env.example', 'EXISTING_PROVIDER=\nNEW_FORECAST_INPUT=\n');
      git('add', '.'); git('commit', '-m', 'Candidate forecast');
    }
    const compiled = ts.transpileModule(readFileSync('scripts/release-check.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(compiled, { exports: {}, process: { argv: ['node', 'release-check.ts', '--production-ref', 'production', '--tst-ref', 'tst'], exit: () => assert.fail('unexpected exit') },
      console: { log: (...items: unknown[]) => output.push(items.join(' ')) },
      require: (name: string) => { assert.equal(name, 'node:child_process'); return { execFileSync: (command: string, args: string[], options: object) => { assert.equal(command, 'git'); return execFileSync(command, args, { ...options, cwd: directory }); } }; },
    });
    return { text: output.join('\n'), production };
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith('neat-release-audit-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('release audit compares current production even when an older tag has a higher version number', () => {
  const result = auditFixture(true);
  assert.match(result.text, new RegExp(`Comparison base: production @ ${result.production}`));
  assert.match(result.text, /A\s+prisma\/migrations\/new_forecast\/migration.sql/);
  assert.doesNotMatch(result.text, /already_released|ADDED COMMUNICATIONS|Release base: v0.14.0/);
  assert.match(result.text, /ADDED PRODUCTION_FORECASTING/); assert.match(result.text, /NEW_FORECAST_INPUT/);
  assert.doesNotMatch(result.text.split('Potentially new environment variable names')[1].split('Feature flag')[0], /EXISTING_PROVIDER/);
});

test('equivalent trees on divergent histories have no release changes or pending migrations', () => {
  const result = auditFixture(false);
  assert.match(result.text, /TST-only history commits: 1; changed paths: 0/);
  assert.match(result.text, /Migration changes\n  None/);
  assert.match(result.text, /Feature flag\/registry changes\n  None/);
  assert.doesNotMatch(result.text, /Pending commits:/);
});
