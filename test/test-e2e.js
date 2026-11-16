/**
 * End-to-End Test Suite for CLI-Driven AI Chat Execution System
 */

const assert = require('assert');
const { planExecution } = require('../src/ai/intentParser');
const { getApprovedTool, listApprovedTools } = require('../src/orchestrator/toolRegistry');
const { validateUrl, validateCliOptions } = require('../src/orchestrator/security');
const { parseHtml } = require('../src/crawler/htmlParser');
const { executeCliTask } = require('../src/orchestrator/cliOrchestrator');
const { formatSuccessfulResponse, formatFailureResponse } = require('../src/ai/summarizer');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(` ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(` ❌ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(` ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(` ❌ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function main() {
  console.log(`\n=======================================================`);
  console.log(` 🧪 Starting End-to-End Verification Test Suite`);
  console.log(`=======================================================\n`);

  // 1. Tool Registry Tests
  runTest('Tool Registry - Validates site-crawler existence', () => {
    const tool = getApprovedTool('site-crawler');
    assert.ok(tool, 'site-crawler must be registered');
    assert.strictEqual(tool.id, 'site-crawler');
    assert.ok(tool.buildArgs({ url: 'https://example.com' }).length > 1);
  });

  runTest('Tool Registry - Rejects unapproved tool', () => {
    const tool = getApprovedTool('arbitrary-bash');
    assert.strictEqual(tool, null, 'Unapproved tool must return null');
  });

  // 2. Security & SSRF Protection Tests
  runTest('Security - Blocks Localhost SSRF', () => {
    const res = validateUrl('http://localhost:3000');
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes('restricted for security'));
  });

  runTest('Security - Blocks 127.0.0.1 Loopback', () => {
    const res = validateUrl('http://127.0.0.1:8080/admin');
    assert.strictEqual(res.valid, false);
  });

  runTest('Security - Blocks AWS/Cloud Metadata IP (169.254.169.254)', () => {
    const res = validateUrl('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(res.valid, false);
  });

  runTest('Security - Blocks Private RFC1918 IPs (192.168.1.1, 10.0.0.1)', () => {
    assert.strictEqual(validateUrl('http://192.168.1.1').valid, false);
    assert.strictEqual(validateUrl('http://10.0.0.5').valid, false);
  });

  runTest('Security - Allows Public HTTPS domain', () => {
    const res = validateUrl('https://example.com');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.url, 'https://example.com/');
  });

  runTest('Security - Enforces Depth and Max Pages Bounds', () => {
    const invalidDepth = validateCliOptions({ depth: 99 });
    assert.strictEqual(invalidDepth.valid, false);

    const validOpts = validateCliOptions({ depth: 2, maxPages: 5, format: 'json' });
    assert.strictEqual(validOpts.valid, true);
    assert.strictEqual(validOpts.sanitized.depth, 2);
  });

  // 3. AI Intent Understanding Tests
  await runAsyncTest('AI Intent - Interprets Mandatory Demo Prompt', async () => {
    const prompt = 'Crawl https://example.com, extract the important information, give me a summary, and return the extracted data in JSON format.';
    const plan = await planExecution(prompt);
    assert.strictEqual(plan.success, true);
    assert.strictEqual(plan.targetUrl, 'https://example.com');
    assert.strictEqual(plan.toolId, 'site-crawler');
    assert.strictEqual(plan.options.format, 'both');
    assert.ok(plan.plannedCommand.includes('bin/crawler-cli.js'));
  });

  await runAsyncTest('AI Intent - Interprets Multi-page Depth Prompt', async () => {
    const prompt = 'Scrape https://httpbin.org with depth 2 and max 5 pages';
    const plan = await planExecution(prompt);
    assert.strictEqual(plan.success, true);
    assert.strictEqual(plan.targetUrl, 'https://httpbin.org');
    assert.strictEqual(plan.options.depth, 2);
    assert.strictEqual(plan.options.maxPages, 5);
  });

  await runAsyncTest('AI Intent - Handles Prompt Missing URL Gracefully', async () => {
    const prompt = 'Please crawl a website and summarize it';
    const plan = await planExecution(prompt);
    assert.strictEqual(plan.success, false);
    assert.strictEqual(plan.needsInput, true);
    assert.strictEqual(plan.missingField, 'url');
  });

  // 4. HTML Parser & Content Extractor Tests
  runTest('HTML Parser - Extracts metadata, headings, paragraphs, and links', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="A comprehensive test description.">
          <meta name="author" content="BuildSprint Team">
        </head>
        <body>
          <h1>Main Subject</h1>
          <p>This is the first paragraph with important textual information about the system.</p>
          <h2>Sub Subject</h2>
          <p>This is another paragraph containing additional details for the extraction engine.</p>
          <a href="/about">About Us</a>
          <a href="https://google.com">External Search</a>
          <img src="/logo.png" alt="Company Logo">
        </body>
      </html>
    `;

    const parsed = parseHtml(sampleHtml, 'https://testsite.org/index.html');
    assert.strictEqual(parsed.title, 'Test Page Title');
    assert.strictEqual(parsed.description, 'A comprehensive test description.');
    assert.strictEqual(parsed.author, 'BuildSprint Team');
    assert.strictEqual(parsed.headings.length, 2);
    assert.strictEqual(parsed.headings[0].text, 'Main Subject');
    assert.strictEqual(parsed.stats.headingCount, 2);
    assert.strictEqual(parsed.links.length, 2);
    assert.strictEqual(parsed.links[0].href, 'https://testsite.org/about');
    assert.strictEqual(parsed.links[0].isInternal, true);
    assert.strictEqual(parsed.links[1].isInternal, false);
    assert.strictEqual(parsed.images.length, 1);
    assert.strictEqual(parsed.images[0].alt, 'Company Logo');
  });

  // 5. Response Layer Formatting
  runTest('Response Layer - Generates valid markdown and JSON structure', () => {
    const mockResult = {
      taskId: 'test-uuid-1234',
      toolId: 'site-crawler',
      pid: 9999,
      commandDisplay: 'node bin/crawler-cli.js --url https://example.com',
      success: true,
      exitCode: 0,
      durationMs: 450,
      status: 'COMPLETED',
      parsedData: {
        tool: 'site-crawler-cli',
        version: '2.4.0',
        targetUrl: 'https://example.com',
        executedAt: new Date().toISOString(),
        durationMs: 450,
        summary: {
          title: 'Example Domain',
          url: 'https://example.com',
          description: 'This domain is for use in illustrative examples in documents.',
          keyTakeaways: ['Example Domain used for illustrative examples.'],
          pagesCrawled: 1,
          totalWordCount: 150,
          avgReadingTimeMinutes: 1,
          topHeadings: ['H1: Example Domain'],
          internalLinksCount: 1,
          externalLinksCount: 0
        },
        extractedData: {
          title: 'Example Domain',
          httpStatus: 200,
          meta: {},
          headings: [{ level: 'h1', text: 'Example Domain' }],
          keyParagraphs: ['Example domain text'],
          stats: { wordCount: 150, headingCount: 1, linkCount: 1 }
        },
        pagesCrawled: [{ url: 'https://example.com', title: 'Example Domain', httpStatus: 200, wordCount: 150, durationMs: 450 }]
      }
    };

    const formatted = formatSuccessfulResponse(mockResult, { targetUrl: 'https://example.com' });
    assert.strictEqual(formatted.success, true);
    assert.ok(formatted.markdown.includes('Example Domain'));
    assert.strictEqual(formatted.json.summary.title, 'Example Domain');
    assert.strictEqual(formatted.json.cliExecution.exitCode, 0);
  });

  console.log(`\n=======================================================`);
  console.log(` 🏁 Test Results: ${passedTests}/${totalTests} Passed (${Math.round(passedTests/totalTests*100)}%)`);
  console.log(`=======================================================\n`);
}

main();
