#!/usr/bin/env node
/**
 * CLI Site Crawler & Content Extractor
 * Standalone Command Line Interface for automated, depth-limited website crawling and structured data extraction.
 *
 * Usage:
 *   node bin/crawler-cli.js --url https://example.com [options]
 */

const { executeCrawl } = require('../src/crawler/engine');
const { validateUrl, validateCliOptions } = require('../src/orchestrator/security');

const VERSION = '2.4.0';

function showHelp() {
  console.log(`
BuildSprint Site Crawler CLI (v${VERSION})
A controlled, secure CLI tool for website content extraction and structured summarization.

USAGE:
  crawler-cli --url <target-url> [options]
  node bin/crawler-cli.js --url <target-url> [options]

REQUIRED:
  --url <string>              Target website URL to crawl (e.g., https://example.com)

OPTIONS:
  --depth <number>            Crawl depth (1 = single page, 2-3 = follow internal links; default: 1)
  --max-pages <number>        Max pages to crawl in multi-page mode (1 to 10; default: 3)
  --format <type>             Output format: "json", "summary", or "both" (default: "both")
  --timeout <ms>              Network request timeout in milliseconds (default: 15000)
  --user-agent <string>       Custom HTTP User-Agent header
  --no-links                  Disable extracting and resolving hyperlink lists
  --extract-images            Include image alt tags and URLs in output
  -h, --help                  Show this help manual
  -v, --version               Show version information

EXIT CODES:
  0   Success (Crawl completed, output generated)
  1   Invalid CLI arguments or input validation failure
  2   Network / HTTP connection failure (DNS error, 4xx/5xx status)
  3   Operation timed out
  4   Blocked by robots.txt or security policy
  5   Internal runtime error
`);
}

// Parse argv manually without external dependencies
function parseArgs(args) {
  const options = {
    format: 'both',
    depth: 1,
    maxPages: 3,
    timeout: 15000,
    extractLinks: true,
    extractImages: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--url') {
      options.url = args[++i];
    } else if (arg.startsWith('--url=')) {
      options.url = arg.split('=')[1];
    } else if (arg === '--depth') {
      options.depth = parseInt(args[++i], 10);
    } else if (arg.startsWith('--depth=')) {
      options.depth = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--max-pages') {
      options.maxPages = parseInt(args[++i], 10);
    } else if (arg.startsWith('--max-pages=')) {
      options.maxPages = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--format') {
      options.format = args[++i];
    } else if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1];
    } else if (arg === '--timeout') {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg.startsWith('--timeout=')) {
      options.timeout = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--user-agent') {
      options.userAgent = args[++i];
    } else if (arg === '--no-links') {
      options.extractLinks = false;
    } else if (arg === '--extract-images') {
      options.extractImages = true;
    }
  }

  return options;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const options = parseArgs(rawArgs);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log(`crawler-cli version ${VERSION}`);
    process.exit(0);
  }

  if (!options.url) {
    console.error('[CLI ERROR] Missing required argument: --url <target-url>');
    console.error('Run "crawler-cli --help" for complete usage instructions.');
    process.exit(1);
  }

  // 1. Validate URL & Security
  const urlCheck = validateUrl(options.url);
  if (!urlCheck.valid) {
    console.error(`[SECURITY ERROR] ${urlCheck.error}`);
    process.exit(4);
  }
  const targetUrl = urlCheck.url;

  // 2. Validate Options
  const optCheck = validateCliOptions(options);
  if (!optCheck.valid) {
    console.error(`[VALIDATION ERROR] ${optCheck.error}`);
    process.exit(1);
  }
  const sanitizedOptions = optCheck.sanitized;

  // Real-time progress logger sending to stderr
  const logProgress = (msg) => {
    process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${msg}\n`);
  };

  logProgress(`[START] CLI tool invoked for target: ${targetUrl}`);
  logProgress(`[CONFIG] Depth=${sanitizedOptions.depth}, MaxPages=${sanitizedOptions.maxPages}, Timeout=${sanitizedOptions.timeout}ms, Format=${sanitizedOptions.format}`);

  try {
    const startTime = Date.now();
    const result = await executeCrawl(targetUrl, sanitizedOptions, logProgress);
    const elapsedMs = Date.now() - startTime;

    if (!result.success) {
      console.error(`[EXECUTION FAILED] ${result.error}`);
      // Output structured error object on stdout so caller can inspect JSON error
      console.log(JSON.stringify({
        success: false,
        exitCode: result.exitCode || 2,
        error: result.error,
        targetUrl,
        elapsedMs
      }, null, 2));
      process.exit(result.exitCode || 2);
    }

    logProgress(`[SUCCESS] Crawl finished in ${elapsedMs}ms. Exit code: 0`);

    // Output formatted result to stdout based on requested format
    const outputPayload = {
      tool: 'site-crawler-cli',
      version: VERSION,
      targetUrl,
      executedAt: new Date().toISOString(),
      durationMs: elapsedMs,
      summary: result.summary,
      extractedData: {
        title: result.primaryPage?.title,
        url: result.primaryPage?.finalUrl,
        httpStatus: result.primaryPage?.httpStatus,
        meta: result.primaryPage?.meta,
        headings: result.primaryPage?.headings,
        keyParagraphs: result.primaryPage?.paragraphs,
        stats: result.primaryPage?.stats,
        links: sanitizedOptions.extractLinks ? result.primaryPage?.links : undefined,
        images: sanitizedOptions.extractImages ? result.primaryPage?.images : undefined
      },
      pagesCrawled: result.pages.map(p => ({
        url: p.finalUrl || p.url,
        title: p.title,
        httpStatus: p.httpStatus,
        wordCount: p.stats?.wordCount,
        durationMs: p.durationMs
      }))
    };

    if (sanitizedOptions.format === 'json') {
      console.log(JSON.stringify(outputPayload, null, 2));
    } else if (sanitizedOptions.format === 'summary') {
      console.log(`=== WEBSITE SUMMARY ===`);
      console.log(`Title: ${outputPayload.summary.title}`);
      console.log(`URL: ${outputPayload.summary.url}`);
      console.log(`Description: ${outputPayload.summary.description}`);
      console.log(`Pages Crawled: ${outputPayload.summary.pagesCrawled}`);
      console.log(`Total Words: ${outputPayload.summary.totalWordCount}`);
      console.log(`Reading Time: ~${outputPayload.summary.avgReadingTimeMinutes} min`);
      console.log(`Top Headings:\n${outputPayload.summary.topHeadings.map(h => ' - ' + h).join('\n')}`);
    } else {
      // 'both': JSON is strictly valid JSON on stdout
      console.log(JSON.stringify(outputPayload, null, 2));
    }

    process.exit(0);
  } catch (fatalErr) {
    console.error(`[FATAL ERROR] Unexpected exception: ${fatalErr.message}\n${fatalErr.stack}`);
    process.exit(5);
  }
}

main();
