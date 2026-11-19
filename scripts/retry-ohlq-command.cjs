const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');

// Only setup commands use this wrapper: replaying a failed process can repeat
// committed writes. Provider downloads use the typed read-only helper instead.
// It never retries authentication/validation errors.
function isTransientFailure(text) {
  if (/P1000\b|P200[23]\b|invalid credentials|incorrect (?:username|password)|authentication failed|access denied|permission denied|Missing required|must be|schema.*(?:missing|invalid)|column .*does not exist/i.test(text)) return false;
  return /\b(?:P1001|P1002|P1008|P1017|P2024|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN)\b|net::ERR_(?:CONNECTION|NETWORK|TIMED_OUT)|Can.t reach database server|(?:HTTP|status|code|response|error|fetch).*\b(?:429|502|503|504)\b|\b503\s+Service Unavailable|connection (?:closed|terminated|timed out)|socket hang up|Temporary failure resolving/i.test(text);
}

async function retryCommand(command, args, {
  execute = executeCommand,
  wait = sleep,
  warn = message => console.warn(`::warning::${message}`),
} = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await execute(command, args);
    if (result.code === 0) return 0;
    // A terminated process is not evidence of a safe transient failure.
    if (result.signal || attempt === 3 || !isTransientFailure(result.tail)) return result.code || 1;
    warn(`Temporary load-stage failure; retrying in ${attempt * 15} seconds (attempt ${attempt + 1}/3).`);
    await wait(attempt * 15_000);
  }
  return 1;
}

function executeCommand(command, args) {
  return new Promise(resolve => {
    let tail = '';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    const forward = stream => chunk => {
      stream.write(chunk);
      tail = (tail + chunk.toString()).slice(-262_144);
    };
    child.stdout.on('data', forward(process.stdout));
    child.stderr.on('data', forward(process.stderr));
    child.on('error', error => { tail += error.code || 'COMMAND_START_FAILED'; });
    // Forward cancellation to the child; never retry it as a network failure.
    const terminate = signal => child.kill(signal);
    const onTerm = () => terminate('SIGTERM');
    const onInt = () => terminate('SIGINT');
    process.once('SIGTERM', onTerm);
    process.once('SIGINT', onInt);
    child.on('close', (code, signal) => {
      process.removeListener('SIGTERM', onTerm);
      process.removeListener('SIGINT', onInt);
      resolve({ code: code ?? 1, signal, tail });
    });
  });
}

module.exports = { isTransientFailure, retryCommand };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const command = args.shift();
  if (!command) { console.error('Pass a load command after --.'); process.exitCode = 1; }
  else retryCommand(command, args).then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
}
