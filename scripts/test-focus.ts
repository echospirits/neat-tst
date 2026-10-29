import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// Require explicit files: invoking node --test without files would discover
// unrelated tests in the developer's scratch copies and old worktrees.
const files = [...new Set(process.argv.slice(2).map(file => resolve(file)))];
if (!files.length) {
  console.error('Usage: npm run test:focus -- tests/example.test.ts [tests/another.test.ts]');
  process.exit(1);
}

for (const file of files) {
  const withinTests = relative(resolve('tests'), file);
  if (isAbsolute(withinTests) || withinTests === '..' || withinTests.startsWith(`..${sep}`)
    || !withinTests.endsWith('.test.ts') || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    console.error(`Expected an existing .test.ts file inside tests/: ${file}`);
    process.exit(1);
  }
}

console.log(`Running ${files.length} selected test file(s). Full suite: npm test`);
const result = spawnSync(process.execPath, [
  '--import', 'tsx', '--test', '--import', './tests/setup.ts', ...files,
], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
