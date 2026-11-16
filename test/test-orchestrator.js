/**
 * Integration Test: CLI Orchestrator & Security
 */

const { executeCliTask } = require('../src/orchestrator/cliOrchestrator');

async function runTests() {
  console.log('--- 1. Testing SSRF Rejection via Orchestrator ---');
  const res1 = await executeCliTask('site-crawler', { url: 'http://127.0.0.1:3000' });
  console.log('SSRF test result success:', res1.success);
  console.log('SSRF error message:', res1.error);
  if (res1.success === false && res1.error.includes('restricted for security')) {
    console.log('PASS: SSRF blocked successfully.\n');
  } else {
    console.error('FAIL: SSRF not blocked properly.\n');
  }

  console.log('--- 2. Testing Help Flag via Orchestrator ---');
  const res2 = await executeCliTask('site-crawler', { url: 'https://example.com' });
  console.log('Task status:', res2.status);
  console.log('Duration:', res2.durationMs, 'ms');
  console.log('Stderr lines:', res2.stderr.split('\n').filter(Boolean).length);
  console.log('Stdout length:', res2.stdout.length);
  console.log('Parsed JSON present:', !!res2.parsedData);
  if (res2.parsedData) {
    console.log('Parsed title:', res2.parsedData.summary?.title);
  }
}

runTests();
