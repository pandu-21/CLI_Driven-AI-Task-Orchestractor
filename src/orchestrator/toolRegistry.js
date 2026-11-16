/**
 * Tool Registry
 * Whitelist and metadata specification for all approved CLI tools executable by the system.
 */

const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../');

const APPROVED_TOOLS = {
  'site-crawler': {
    id: 'site-crawler',
    name: 'Site Crawler & Content Extractor CLI',
    description: 'Crawls target websites, extracts HTML content, metadata, links, and produces structured summaries and JSON.',
    executable: process.execPath, // node
    scriptPath: path.join(ROOT_DIR, 'bin', 'crawler-cli.js'),
    allowedOptions: ['url', 'depth', 'maxPages', 'format', 'timeout', 'userAgent', 'extractImages', 'extractLinks'],
    buildArgs: (options) => {
      const args = [path.join(ROOT_DIR, 'bin', 'crawler-cli.js')];

      if (options.url) {
        args.push('--url', options.url);
      }
      if (options.depth) {
        args.push('--depth', String(options.depth));
      }
      if (options.maxPages) {
        args.push('--max-pages', String(options.maxPages));
      }
      if (options.format) {
        args.push('--format', options.format);
      }
      if (options.timeout) {
        args.push('--timeout', String(options.timeout));
      }
      if (options.userAgent) {
        args.push('--user-agent', options.userAgent);
      }
      if (options.extractImages) {
        args.push('--extract-images');
      }
      if (options.extractLinks === false) {
        args.push('--no-links');
      }

      return args;
    }
  }
};

/**
 * Retrieves tool specification by ID.
 * @param {string} toolId
 * @returns {object|null}
 */
function getApprovedTool(toolId) {
  return APPROVED_TOOLS[toolId] || null;
}

/**
 * Lists all registered approved tools.
 * @returns {Array<object>}
 */
function listApprovedTools() {
  return Object.values(APPROVED_TOOLS).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    allowedOptions: t.allowedOptions
  }));
}

module.exports = {
  APPROVED_TOOLS,
  getApprovedTool,
  listApprovedTools
};
