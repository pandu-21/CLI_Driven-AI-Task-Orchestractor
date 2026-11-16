/**
 * Backend Server & API Layer
 * Serves the web chat application, handles intent translation, invokes CLI orchestrator,
 * and streams real-time CLI logs via Server-Sent Events (SSE).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { planExecution } = require('./ai/intentParser');
const { executeCliTask, cancelCliTask } = require('./orchestrator/cliOrchestrator');
const { formatSuccessfulResponse, formatFailureResponse } = require('./ai/summarizer');
const { listApprovedTools } = require('./orchestrator/toolRegistry');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Health check
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      nodeVersion: process.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 2. Tools listing
  if (pathname === '/api/tools' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: listApprovedTools() }));
    return;
  }

  // 3. Cancel task
  if (pathname === '/api/task/cancel' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const success = cancelCliTask(body.taskId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success, message: success ? 'Task cancelled' : 'Task not found or finished' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 4. Chat execution endpoint (standard JSON request/response)
  if (pathname === '/api/chat' && req.method === 'POST') {
    try {
      const { prompt, explicitUrl } = await parseJsonBody(req);

      if (!prompt && !explicitUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Please provide a prompt or URL.' }));
        return;
      }

      // Step 1: AI Intent & Plan Interpretation
      const plan = await planExecution(prompt, explicitUrl);

      if (!plan.success) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          plan: null,
          needsInput: true,
          message: plan.message || 'Please provide a target website URL.',
          response: {
            markdown: `👋 **How can I help you?**\n\n${plan.message || 'Please enter a target URL to crawl, e.g.:'}\n- \`Crawl https://example.com and summarize it\`\n- \`Scrape https://example.com and return JSON\``,
            json: null
          }
        }));
        return;
      }

      // Step 2: Invoke Approved CLI via Orchestrator
      const cliResult = await executeCliTask(plan.toolId, {
        url: plan.targetUrl,
        ...plan.options
      });

      // Step 3: Format Chat Response
      const formatted = cliResult.success
        ? formatSuccessfulResponse(cliResult, plan)
        : formatFailureResponse(cliResult, plan);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        plan,
        result: formatted,
        logs: {
          stdout: cliResult.stdout,
          stderr: cliResult.stderr
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. Real-Time Streaming Execution Endpoint (Server-Sent Events)
  if (pathname === '/api/chat/stream' && req.method === 'POST') {
    try {
      const { prompt, explicitUrl } = await parseJsonBody(req);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent('status', { message: 'Analyzing prompt and interpreting intent...' });

      // Step 1: Plan Execution
      const plan = await planExecution(prompt, explicitUrl);

      if (!plan.success) {
        sendEvent('needs_input', {
          message: plan.message || 'Target URL is required.',
          missingField: 'url'
        });
        res.end();
        return;
      }

      sendEvent('plan', plan);

      // Step 2: Invoke CLI with real-time stream forwarding
      const cliResult = await executeCliTask(
        plan.toolId,
        { url: plan.targetUrl, ...plan.options },
        {
          onStdout: (chunk) => sendEvent('stdout', { chunk }),
          onStderr: (line) => sendEvent('stderr', { line }),
          onStatus: (status, message) => sendEvent('status', { status, message })
        }
      );

      // Step 3: Format and send final response
      const formatted = cliResult.success
        ? formatSuccessfulResponse(cliResult, plan)
        : formatFailureResponse(cliResult, plan);

      sendEvent('done', {
        plan,
        result: formatted,
        rawTelemetry: {
          taskId: cliResult.taskId,
          exitCode: cliResult.exitCode,
          durationMs: cliResult.durationMs,
          status: cliResult.status
        }
      });

      res.end();
    } catch (streamErr) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: streamErr.message })}\n\n`);
      res.end();
    }
    return;
  }

  // 6. Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
    } else {
      serveStatic(res, filePath);
    }
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` 🚀 BuildSprint CLI-Driven AI Chat Server Active!`);
    console.log(` 🌐 Web UI: http://localhost:${PORT}`);
    console.log(` 📡 Health: http://localhost:${PORT}/api/health`);
    console.log(` ⚙️  CLI Tool: bin/crawler-cli.js`);
    console.log(`=======================================================`);
  });
}

module.exports = { server };
