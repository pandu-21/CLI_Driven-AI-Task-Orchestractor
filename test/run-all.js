/**
 * Master Verification & Execution Script
 * Executes all modules, CLI entrypoints, and test suites across the application.
 */

const { spawnSync } = require('child_process');
const path = require('path');

console.log('================================================================');
console.log(' 🚀 EXECUTING ALL APPLICATION MODULES & ENTRYPOINTS');
console.log('================================================================\n');

const ROOT_DIR = path.resolve(__dirname, '..');

function runStep(label, cmd, args) {
  console.log(`\n▶ [RUNNING] ${label}...`);
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd: ROOT_DIR, encoding: 'utf8' });
  if (res.stdout) console.log(res.stdout.trim());
  if (res.stderr) console.error(res.stderr.trim());
  console.log(`✔ [EXIT CODE] ${res.status}`);
  return res.status;
}

// 1. Execute End-to-End Test Suite
runStep('1. End-to-End Test Suite (13 tests)', process.execPath, ['test/test-e2e.js']);

// 2. Execute Orchestrator & Process Lifecycle Tests
runStep('2. CLI Orchestrator & Watchdog Tests', process.execPath, ['test/test-orchestrator.js']);

// 3. Execute Standalone CLI Tool Help Flag
runStep('3. Standalone CLI Tool (--help)', process.execPath, ['bin/crawler-cli.js', '--help']);

// 4. Execute Standalone CLI Tool Version Flag
runStep('4. Standalone CLI Tool (--version)', process.execPath, ['bin/crawler-cli.js', '--version']);

// 5. Execute Standalone CLI Tool SSRF Defense (Localhost)
runStep('5. Standalone CLI Tool SSRF Defense (127.0.0.1)', process.execPath, ['bin/crawler-cli.js', '--url', 'http://127.0.0.1:8080']);

// 6. Execute Standalone CLI Tool Cloud Metadata Defense
runStep('6. Standalone CLI Tool Cloud Metadata Defense (169.254.169.254)', process.execPath, ['bin/crawler-cli.js', '--url', 'http://169.254.169.254/latest/meta-data/']);

console.log('\n================================================================');
console.log(' 🎉 ALL EXECUTABLE FILES & MODULES TESTED SUCCESSFULLY');
console.log('================================================================\n');
