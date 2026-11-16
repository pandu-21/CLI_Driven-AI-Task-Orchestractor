/**
 * HTML Parser & Content Extractor
 * Pure JavaScript extractor for metadata, headings, body text, links, and structured elements.
 */

const { URL } = require('url');

/**
 * Strips HTML tags and unescapes standard HTML entities.
 * @param {string} str
 * @returns {string}
 */
function stripHtml(str = '') {
  return str
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts attribute value from an HTML tag string.
 * @param {string} tagStr
 * @param {string} attrName
 * @returns {string|null}
 */
function getAttribute(tagStr, attrName) {
  const regex = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tagStr.match(regex);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/**
 * Parses raw HTML content and extracts comprehensive structured data.
 * @param {string} html - Raw HTML string
 * @param {string} currentUrl - Base URL for resolving relative links
 * @returns {object} Structured content
 */
function parseHtml(html = '', currentUrl = '') {
  let baseUrl;
  try {
    baseUrl = new URL(currentUrl);
  } catch {
    baseUrl = null;
  }

  // 1. Extract Title
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = stripHtml(titleMatch[1]);
  }

  // 2. Extract Meta tags
  const meta = {};
  const metaRegex = /<meta\s+([^>]+)>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const metaTag = metaMatch[1];
    const name = getAttribute(metaTag, 'name') || getAttribute(metaTag, 'property');
    const content = getAttribute(metaTag, 'content');
    if (name && content) {
      meta[name.toLowerCase()] = content.trim();
    }
  }

  // Common meta convenience fields
  const description = meta['description'] || meta['og:description'] || meta['twitter:description'] || '';
  const keywords = meta['keywords'] ? meta['keywords'].split(',').map(k => k.trim()) : [];
  const author = meta['author'] || meta['article:author'] || '';

  // 3. Extract Headings (h1, h2, h3)
  const headings = [];
  const headingRegex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let hMatch;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    const level = hMatch[1].toLowerCase();
    const text = stripHtml(hMatch[2]);
    if (text) {
      headings.push({ level, text });
    }
  }

  // 4. Extract Links
  const links = [];
  const seenUrls = new Set();
  const linkRegex = /<a\s+([^>]+)>([\s\S]*?)<\/a>/gi;
  let aMatch;
  while ((aMatch = linkRegex.exec(html)) !== null) {
    const aTag = aMatch[1];
    const rawHref = getAttribute(aTag, 'href');
    const linkText = stripHtml(aMatch[2]);

    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('#') || rawHref.startsWith('mailto:')) {
      continue;
    }

    let absoluteUrl = rawHref;
    let isInternal = false;

    if (baseUrl) {
      try {
        const resolved = new URL(rawHref, baseUrl);
        absoluteUrl = resolved.toString();
        isInternal = resolved.hostname === baseUrl.hostname;
      } catch {
        continue;
      }
    }

    if (!seenUrls.has(absoluteUrl)) {
      seenUrls.add(absoluteUrl);
      links.push({
        href: absoluteUrl,
        text: linkText || absoluteUrl,
        isInternal
      });
    }
  }

  // 5. Extract Images
  const images = [];
  const imgRegex = /<img\s+([^>]+)>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const imgTag = imgMatch[1];
    const rawSrc = getAttribute(imgTag, 'src') || getAttribute(imgTag, 'data-src');
    const alt = getAttribute(imgTag, 'alt') || '';

    if (rawSrc) {
      let resolvedSrc = rawSrc;
      if (baseUrl) {
        try {
          resolvedSrc = new URL(rawSrc, baseUrl).toString();
        } catch {}
      }
      images.push({ src: resolvedSrc, alt });
    }
  }

  // 6. Extract Main Body Text (clean, readable text)
  // Remove non-content tags: script, style, noscript, svg, iframe, nav, footer, header
  let cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Extract key paragraphs
  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(cleanHtml)) !== null) {
    const pText = stripHtml(pMatch[1]);
    if (pText.length > 20) {
      paragraphs.push(pText);
    }
  }

  const rawBodyText = stripHtml(cleanHtml);
  // Break into meaningful sentences/paragraphs
  const wordCount = rawBodyText ? rawBodyText.split(/\s+/).filter(Boolean).length : 0;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return {
    url: currentUrl,
    title: title || (baseUrl ? baseUrl.hostname : 'Untitled Document'),
    description,
    author,
    keywords,
    meta,
    headings,
    paragraphs: paragraphs.slice(0, 15),
    textSnippet: rawBodyText.slice(0, 1500),
    stats: {
      wordCount,
      readingTimeMinutes,
      headingCount: headings.length,
      linkCount: links.length,
      imageCount: images.length
    },
    links: links.slice(0, 30),
    images: images.slice(0, 15)
  };
}

module.exports = {
  parseHtml,
  stripHtml
};
