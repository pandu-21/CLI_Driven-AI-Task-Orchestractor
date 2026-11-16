/**
 * Response Formatting & Summarization Layer
 * Converts raw CLI outputs into human-readable chat summaries and validated JSON data.
 */

/**
 * Formats a successful CLI crawl result into rich chat presentation.
 * @param {object} cliResult - Full result from cliOrchestrator
 * @param {object} plan - The execution plan used
 * @returns {object} Formatted chat response
 */
function formatSuccessfulResponse(cliResult, plan) {
  const data = cliResult.parsedData || {};
  const summary = data.summary || {};
  const extracted = data.extractedData || {};
  const pages = data.pagesCrawled || [];

  // Generate markdown summary
  let markdown = `### 🌐 Crawl & Content Summary for [${summary.title || data.targetUrl}](${data.targetUrl})\n\n`;

  if (summary.description) {
    markdown += `> **Overview:** ${summary.description}\n\n`;
  }

  // Key stats badge line
  markdown += `**📊 Metrics:**  \n`;
  markdown += `• **HTTP Status:** \`${extracted.httpStatus || 200} OK\`  \n`;
  markdown += `• **Pages Crawled:** \`${summary.pagesCrawled || 1}\`  \n`;
  markdown += `• **Total Words:** \`${(summary.totalWordCount || 0).toLocaleString()}\` (~${summary.avgReadingTimeMinutes || 1} min read)  \n`;
  markdown += `• **Links Found:** \`${summary.internalLinksCount || 0} internal\` | \`${summary.externalLinksCount || 0} external\`  \n`;
  markdown += `• **CLI Duration:** \`${cliResult.durationMs}ms\` (Exit Code: \`${cliResult.exitCode}\`)  \n\n`;

  // Key Takeaways
  if (summary.keyTakeaways && summary.keyTakeaways.length > 0) {
    markdown += `#### 💡 Key Takeaways & Content Snippets:\n`;
    for (const item of summary.keyTakeaways) {
      markdown += `- ${item}\n`;
    }
    markdown += '\n';
  }

  // Headings outline
  if (summary.topHeadings && summary.topHeadings.length > 0) {
    markdown += `#### 📑 Page Structure (Headings):\n`;
    for (const h of summary.topHeadings.slice(0, 5)) {
      markdown += `\`${h}\`  \n`;
    }
    markdown += '\n';
  }

  // Pages crawled breakdown if multi-page
  if (pages.length > 1) {
    markdown += `#### 📄 Crawled Pages Breakdown:\n`;
    for (const p of pages) {
      markdown += `- [${p.title || p.url}](${p.url}) — \`${p.wordCount || 0} words\` (${p.durationMs}ms)\n`;
    }
    markdown += '\n';
  }

  // Clean structured JSON payload
  const structuredJson = {
    targetUrl: data.targetUrl,
    executedAt: data.executedAt,
    cliExecution: {
      tool: data.tool,
      version: data.version,
      durationMs: data.durationMs,
      exitCode: cliResult.exitCode
    },
    summary: {
      title: summary.title,
      url: summary.url,
      description: summary.description,
      keyTakeaways: summary.keyTakeaways,
      stats: {
        pagesCrawled: summary.pagesCrawled,
        totalWordCount: summary.totalWordCount,
        readingTimeMinutes: summary.avgReadingTimeMinutes,
        internalLinksCount: summary.internalLinksCount,
        externalLinksCount: summary.externalLinksCount
      }
    },
    extractedData: {
      title: extracted.title,
      meta: extracted.meta,
      headings: extracted.headings,
      keyParagraphs: extracted.keyParagraphs,
      links: extracted.links,
      images: extracted.images
    }
  };

  return {
    success: true,
    markdown,
    json: structuredJson,
    telemetry: {
      taskId: cliResult.taskId,
      toolId: cliResult.toolId,
      pid: cliResult.pid,
      commandDisplay: cliResult.commandDisplay,
      exitCode: cliResult.exitCode,
      durationMs: cliResult.durationMs,
      status: cliResult.status
    }
  };
}

/**
 * Formats a failed execution or edge case into an honest diagnostic response.
 * @param {object} cliResult
 * @param {object} plan
 * @returns {object} Formatted error response
 */
function formatFailureResponse(cliResult, plan) {
  let markdown = `### ⚠️ Task Execution Incomplete / Failed\n\n`;
  markdown += `**Target URL:** \`${plan?.targetUrl || 'Unknown'}\`  \n`;
  markdown += `**Tool:** \`${cliResult.toolId || 'site-crawler'}\`  \n`;
  markdown += `**Exit Code:** \`${cliResult.exitCode}\` (Status: \`${cliResult.status}\`)  \n`;
  markdown += `**Execution Time:** \`${cliResult.durationMs || 0}ms\`  \n\n`;

  markdown += `#### 🔍 Diagnostic Cause:\n`;
  markdown += `> ${cliResult.error || 'The CLI process reported a failure.'}\n\n`;

  markdown += `#### 🛠️ Recommended Action:\n`;
  if (cliResult.error?.includes('SSRF') || cliResult.error?.includes('restricted for security')) {
    markdown += `- The target domain is a private, loopback, or metadata address. Provide a public website URL instead.\n`;
  } else if (cliResult.error?.includes('Robots.txt')) {
    markdown += `- The website's \`robots.txt\` restricts automated crawling of this path. Respect website access policies.\n`;
  } else if (cliResult.status === 'TIMEOUT') {
    markdown += `- The server took too long to respond. Try increasing the timeout parameter or checking site availability.\n`;
  } else {
    markdown += `- Verify that the website is online, permits HTTP requests, and that your internet connection is active.\n`;
  }

  return {
    success: false,
    markdown,
    json: {
      error: cliResult.error,
      status: cliResult.status,
      exitCode: cliResult.exitCode,
      targetUrl: plan?.targetUrl,
      durationMs: cliResult.durationMs
    },
    telemetry: {
      taskId: cliResult.taskId,
      toolId: cliResult.toolId,
      pid: cliResult.pid,
      commandDisplay: cliResult.commandDisplay,
      exitCode: cliResult.exitCode,
      durationMs: cliResult.durationMs,
      status: cliResult.status
    }
  };
}

module.exports = {
  formatSuccessfulResponse,
  formatFailureResponse
};
