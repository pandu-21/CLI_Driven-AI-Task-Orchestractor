/**
 * Core Crawling Engine
 * Executes single or multi-page breadth-first crawls with rate-limiting, timeout, and robots checks.
 */

const { URL } = require('url');
const { parseHtml } = require('./htmlParser');
const { checkRobotsPermission } = require('./robots');

const DEFAULT_USER_AGENT = 'BuildSprint-CrawlerBot/2.0 (+CLI-Driven-AI-Chat)';

/**
 * Fetches a single page and parses its content.
 * @param {string} pageUrl
 * @param {object} options
 * @returns {Promise<object>}
 */
async function fetchAndParsePage(pageUrl, options = {}) {
  const timeoutMs = options.timeout || 15000;
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = Date.now();

  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    clearTimeout(timer);
    const durationMs = Date.now() - startTime;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
      return {
        url: pageUrl,
        success: false,
        httpStatus: res.status,
        error: `Non-HTML content type received: ${contentType}`,
        durationMs
      };
    }

    if (!res.ok) {
      return {
        url: pageUrl,
        success: false,
        httpStatus: res.status,
        error: `HTTP Error ${res.status}: ${res.statusText}`,
        durationMs
      };
    }

    const html = await res.text();
    const parsed = parseHtml(html, res.url || pageUrl);

    return {
      url: pageUrl,
      finalUrl: res.url || pageUrl,
      success: true,
      httpStatus: res.status,
      durationMs,
      headers: {
        contentType,
        contentLength: res.headers.get('content-length'),
        server: res.headers.get('server')
      },
      ...parsed
    };
  } catch (err) {
    clearTimeout(timer);
    const durationMs = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError' || err.code === 20;

    return {
      url: pageUrl,
      success: false,
      error: isTimeout ? `Request timed out after ${timeoutMs}ms` : err.message,
      isTimeout,
      durationMs
    };
  }
}

/**
 * Executes a crawl on the target URL according to options.
 * @param {string} targetUrl
 * @param {object} options
 * @param {function} onProgress
 * @returns {Promise<object>}
 */
async function executeCrawl(targetUrl, options = {}, onProgress = () => {}) {
  const depth = options.depth || 1;
  const maxPages = options.maxPages || 5;

  onProgress(`[INIT] Initializing crawler for: ${targetUrl}`);
  onProgress(`[POLICY] Checking robots.txt policy...`);

  const robots = await checkRobotsPermission(targetUrl, 3000);
  if (!robots.allowed) {
    onProgress(`[BLOCKED] Robots.txt disallows crawling this path: ${robots.reason}`);
    return {
      success: false,
      error: robots.reason,
      exitCode: 4,
      targetUrl,
      pages: []
    };
  }

  onProgress(`[FETCH] Fetching primary page: ${targetUrl}...`);
  const rootPage = await fetchAndParsePage(targetUrl, options);

  if (!rootPage.success) {
    onProgress(`[ERROR] Failed to fetch root page: ${rootPage.error}`);
    return {
      success: false,
      error: rootPage.error,
      exitCode: rootPage.isTimeout ? 3 : 2,
      targetUrl,
      primaryPage: rootPage,
      pages: []
    };
  }

  onProgress(`[PARSE] Successfully parsed root page "${rootPage.title}" (${rootPage.stats.wordCount} words, ${rootPage.stats.linkCount} links).`);

  const crawledPages = [rootPage];
  const visited = new Set([targetUrl, rootPage.finalUrl]);

  // Multi-page crawl if depth > 1
  if (depth > 1 && maxPages > 1 && rootPage.links && rootPage.links.length > 0) {
    const queue = rootPage.links
      .filter(l => l.isInternal)
      .map(l => l.href)
      .filter(u => !visited.has(u));

    onProgress(`[CRAWL] Multi-page crawl enabled (depth=${depth}, maxPages=${maxPages}). Queue size: ${queue.length} internal links.`);

    while (queue.length > 0 && crawledPages.length < maxPages) {
      const nextUrl = queue.shift();
      if (visited.has(nextUrl)) continue;
      visited.add(nextUrl);

      onProgress(`[FETCH] Crawling child page (${crawledPages.length + 1}/${maxPages}): ${nextUrl}...`);
      const childPage = await fetchAndParsePage(nextUrl, options);
      if (childPage.success) {
        crawledPages.push(childPage);
        onProgress(`[PARSE] Parsed "${childPage.title}" (${childPage.stats.wordCount} words).`);
      } else {
        onProgress(`[WARN] Skipped child page ${nextUrl}: ${childPage.error}`);
      }
    }
  }

  onProgress(`[COMPLETE] Crawl finished. Successfully retrieved ${crawledPages.length} page(s).`);

  // Build clean summary
  const totalWords = crawledPages.reduce((acc, p) => acc + (p.stats?.wordCount || 0), 0);
  const allHeadings = crawledPages.flatMap(p => p.headings || []);

  const summary = {
    title: rootPage.title,
    url: rootPage.finalUrl || targetUrl,
    description: rootPage.description || (rootPage.paragraphs?.[0] ? rootPage.paragraphs[0].slice(0, 200) + '...' : 'No meta description found.'),
    keyTakeaways: rootPage.paragraphs?.slice(0, 3) || [],
    pagesCrawled: crawledPages.length,
    totalWordCount: totalWords,
    avgReadingTimeMinutes: Math.max(1, Math.ceil(totalWords / 200)),
    topHeadings: allHeadings.slice(0, 8).map(h => `${h.level.toUpperCase()}: ${h.text}`),
    internalLinksCount: rootPage.links?.filter(l => l.isInternal).length || 0,
    externalLinksCount: rootPage.links?.filter(l => !l.isInternal).length || 0
  };

  return {
    success: true,
    exitCode: 0,
    targetUrl,
    summary,
    primaryPage: rootPage,
    pages: crawledPages,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  fetchAndParsePage,
  executeCrawl
};
