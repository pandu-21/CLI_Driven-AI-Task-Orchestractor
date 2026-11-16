/**
 * Robots.txt Checker
 * Validates whether crawling a given URL path is permitted under site policies.
 */

const { URL } = require('url');

/**
 * Parses robots.txt content for User-agent: * rules.
 * @param {string} text
 * @returns {{ disallows: string[], allows: string[] }}
 */
function parseRobotsTxt(text = '') {
  const lines = text.split('\n');
  const disallows = [];
  const allows = [];
  let isTargetAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const [key, ...valParts] = line.split(':');
    const value = valParts.join(':').trim();
    const directive = key.trim().toLowerCase();

    if (directive === 'user-agent') {
      isTargetAgent = (value === '*' || value.toLowerCase().includes('bot'));
    } else if (isTargetAgent) {
      if (directive === 'disallow' && value) {
        disallows.push(value);
      } else if (directive === 'allow' && value) {
        allows.push(value);
      }
    }
  }

  return { disallows, allows };
}

/**
 * Checks if a specific target URL path is permitted by robots.txt
 * @param {string} targetUrl
 * @param {number} timeoutMs
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
async function checkRobotsPermission(targetUrl, timeoutMs = 3000) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { allowed: true };
  }

  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BuildSprintBot/1.0 (+https://buildsprint.local)' }
    });
    clearTimeout(timer);

    if (!res.ok) {
      // 404 or inaccessible robots.txt means no restrictions declared
      return { allowed: true };
    }

    const text = await res.text();
    const { disallows } = parseRobotsTxt(text);

    const path = parsed.pathname || '/';
    for (const rule of disallows) {
      if (rule === '/' && disallows.length === 1) {
        return { allowed: false, reason: 'Site disallows all crawling in robots.txt (Disallow: /)' };
      }
      if (rule !== '/' && path.startsWith(rule)) {
        return { allowed: false, reason: `Path "${path}" disallowed by rule: Disallow: ${rule}` };
      }
    }

    return { allowed: true };
  } catch (err) {
    // If robots.txt check fails (e.g. timeout or no network), default to allowing with notice
    return { allowed: true, notice: 'Robots.txt check skipped or unavailable.' };
  }
}

module.exports = {
  checkRobotsPermission,
  parseRobotsTxt
};
