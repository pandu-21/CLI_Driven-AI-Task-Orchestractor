/**
 * AI Intent-Understanding & Task Planning Layer
 * Analyzes natural-language requests and generates validated CLI execution plans.
 * Supports LLM (Groq / Gemini / OpenAI) with automatic fallback to high-precision heuristic NLP.
 */

const fs = require('fs');
const path = require('path');

// Read environment variables manually if dotenv isn't loaded
function getEnvKey(key) {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(new RegExp(`${key}=["']?([^"'\\r\\n]+)`));
      if (match) return match[1].trim();
    }
  } catch {}
  return null;
}

/**
 * High-precision heuristic NLP parser as primary or fallback.
 * @param {string} prompt
 * @returns {object} Extracted parameters and intent
 */
function parseIntentHeuristic(prompt = '') {
  const text = prompt.trim();

  // Extract URL using regex
  const urlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)/i;
  const urlMatch = text.match(urlRegex);
  let targetUrl = urlMatch ? urlMatch[1].replace(/[.,;!?)]+$/, '') : null;

  // If no protocol was provided but looks like a domain (e.g. "crawl example.com")
  if (!targetUrl) {
    const domainRegex = /\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s,;!?]*)?)\b/i;
    const domainMatch = text.match(domainRegex);
    if (domainMatch && !domainMatch[1].startsWith('node') && !domainMatch[1].endsWith('.js')) {
      targetUrl = `https://${domainMatch[1].replace(/[.,;!?)]+$/, '')}`;
    }
  }

  // Detect format preferences
  const lower = text.toLowerCase();
  let format = 'both';
  if (lower.includes('only json') || lower.includes('json only') || (lower.includes('json') && !lower.includes('summary'))) {
    format = 'json';
  } else if (lower.includes('only summary') || (lower.includes('summary') && !lower.includes('json'))) {
    format = 'summary';
  }

  // Detect depth
  let depth = 1;
  const depthMatch = lower.match(/depth\s*(?:of\s*)?(\d+)/i) || lower.match(/(\d+)\s*levels?\s*deep/i);
  if (depthMatch) {
    depth = Math.min(3, Math.max(1, parseInt(depthMatch[1], 10)));
  } else if (lower.includes('multi-page') || lower.includes('crawl pages') || lower.includes('follow links')) {
    depth = 2;
  }

  // Detect max pages
  let maxPages = 3;
  const maxPagesMatch = lower.match(/max(?:imum)?\s*(?:pages)?\s*(\d+)/i) || lower.match(/(\d+)\s*pages/i);
  if (maxPagesMatch) {
    maxPages = Math.min(10, Math.max(1, parseInt(maxPagesMatch[1], 10)));
  }

  // Detect options
  const extractImages = lower.includes('image') || lower.includes('pictures');
  const extractLinks = !lower.includes('no links') && !lower.includes('without links');

  // Determine intent category
  let intent = 'crawl_and_extract';
  if (lower.includes('help') || lower.includes('what can you do') || lower.includes('how to use')) {
    intent = 'help';
  } else if (!targetUrl && (lower.includes('crawl') || lower.includes('scrape') || lower.includes('extract'))) {
    intent = 'needs_url';
  }

  return {
    intent,
    targetUrl,
    options: {
      depth,
      maxPages,
      format,
      extractImages,
      extractLinks,
      timeout: 15000
    },
    confidence: targetUrl ? 0.95 : 0.6,
    engine: 'heuristic-nlp'
  };
}

/**
 * Attempts LLM intent extraction via Groq API.
 * @param {string} prompt
 * @returns {Promise<object|null>}
 */
async function parseIntentWithGroq(prompt) {
  const groqKey = getEnvKey('GROQ_API_KEY');
  if (!groqKey || groqKey.includes('XXXX')) return null;

  const systemMessage = `You are an AI task planner for a CLI execution system.
Analyze the user prompt and return ONLY a valid JSON object with:
{
  "intent": "crawl_and_extract" | "summarize_site" | "help" | "unknown",
  "targetUrl": "<extracted URL string or null>",
  "options": {
    "depth": 1, 2, or 3,
    "maxPages": 1 to 10,
    "format": "json" | "summary" | "both",
    "extractImages": boolean,
    "extractLinks": boolean
  },
  "explanation": "<one sentence explaining the planned CLI action>"
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = await res.json();
    const parsed = JSON.parse(json.choices[0].message.content);

    return {
      intent: parsed.intent || 'crawl_and_extract',
      targetUrl: parsed.targetUrl || null,
      options: {
        depth: parsed.options?.depth || 1,
        maxPages: parsed.options?.maxPages || 3,
        format: parsed.options?.format || 'both',
        extractImages: Boolean(parsed.options?.extractImages),
        extractLinks: parsed.options?.extractLinks !== false,
        timeout: 15000
      },
      explanation: parsed.explanation,
      confidence: 0.98,
      engine: 'groq-llama-3.3-70b'
    };
  } catch (err) {
    return null;
  }
}

/**
 * Interprets a user request and generates a validated ExecutionPlan.
 * @param {string} prompt
 * @param {string} [explicitUrl]
 * @returns {Promise<object>} Complete plan with tool selection and CLI args
 */
async function planExecution(prompt = '', explicitUrl = null) {
  // Try LLM parsing first
  let parsed = await parseIntentWithGroq(prompt);

  // Fallback to high-precision heuristic NLP
  if (!parsed) {
    parsed = parseIntentHeuristic(prompt);
  }

  // Use explicit URL if provided by UI
  if (explicitUrl) {
    parsed.targetUrl = explicitUrl;
  }

  // If still no URL, return plan requiring URL
  if (!parsed.targetUrl && parsed.intent !== 'help') {
    return {
      success: false,
      needsInput: true,
      missingField: 'url',
      message: 'Please provide a valid website URL to crawl (e.g., https://example.com).',
      plan: null
    };
  }

  // Construct final ExecutionPlan
  const toolId = 'site-crawler';
  const explanation = parsed.explanation ||
    `Invoking approved CLI crawler tool to fetch and extract content from ${parsed.targetUrl} (depth=${parsed.options.depth}, format=${parsed.options.format}).`;

  return {
    success: true,
    intent: parsed.intent,
    targetUrl: parsed.targetUrl,
    engine: parsed.engine,
    toolId,
    toolRationale: 'site-crawler-cli was selected because it is a dedicated, sandboxed command-line process that enforces SSRF validation, handles depth limits, extracts structured DOM metadata, and streams real-time stdout/stderr.',
    options: parsed.options,
    explanation,
    plannedCommand: `node bin/crawler-cli.js --url "${parsed.targetUrl}" --depth ${parsed.options.depth} --max-pages ${parsed.options.maxPages} --format ${parsed.options.format}`
  };
}

module.exports = {
  planExecution,
  parseIntentHeuristic,
  parseIntentWithGroq
};
