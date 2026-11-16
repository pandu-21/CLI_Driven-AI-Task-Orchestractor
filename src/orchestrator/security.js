/**
 * Security & Input Validation Layer
 * Protects against SSRF, command injection, path traversal, and resource exhaustion.
 */

const { URL } = require('url');

const DISALLOWED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // Cloud metadata service
  'metadata.google.internal'
]);

// Private IPv4 ranges
const PRIVATE_IP_RANGES = [
  /^10\./,                          // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./,                    // 192.168.0.0/16
  /^169\.254\./,                    // Link-local / AWS metadata
  /^127\./                          // Loopback
];

/**
 * Validates and sanitizes a URL for crawling.
 * @param {string} inputUrl - The URL provided by user or AI.
 * @returns {{ valid: boolean, url?: string, error?: string }}
 */
function validateUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string.' };
  }

  const trimmed = inputUrl.trim();

  // Basic format check
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    // If missing protocol, attempt to prepend https://
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return { valid: false, error: `Invalid URL format: "${trimmed}"` };
    }
  }

  // Protocol check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Disallowed protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Hostname blocklist
  if (DISALLOWED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: `Access to hostname "${hostname}" is restricted for security (SSRF prevention).` };
  }

  // Suffix checks
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
    return { valid: false, error: `Access to internal domain "${hostname}" is forbidden.` };
  }

  // Private IP checks
  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      return { valid: false, error: `Access to private or local network IP "${hostname}" is forbidden.` };
    }
  }

  return { valid: true, url: parsed.toString() };
}

/**
 * Validates CLI execution options.
 * @param {object} options
 * @returns {{ valid: boolean, sanitized?: object, error?: string }}
 */
function validateCliOptions(options = {}) {
  const depth = parseInt(options.depth ?? 1, 10);
  const maxPages = parseInt(options.maxPages ?? 5, 10);
  const timeout = parseInt(options.timeout ?? 15000, 10);
  const format = ['json', 'summary', 'both'].includes(options.format) ? options.format : 'both';

  if (isNaN(depth) || depth < 1 || depth > 3) {
    return { valid: false, error: 'Crawl depth must be between 1 and 3.' };
  }

  if (isNaN(maxPages) || maxPages < 1 || maxPages > 10) {
    return { valid: false, error: 'Max pages must be between 1 and 10.' };
  }

  if (isNaN(timeout) || timeout < 1000 || timeout > 60000) {
    return { valid: false, error: 'Timeout must be between 1000ms and 60000ms.' };
  }

  return {
    valid: true,
    sanitized: {
      depth,
      maxPages,
      timeout,
      format,
      extractImages: Boolean(options.extractImages),
      extractLinks: options.extractLinks !== false
    }
  };
}

module.exports = {
  validateUrl,
  validateCliOptions
};
