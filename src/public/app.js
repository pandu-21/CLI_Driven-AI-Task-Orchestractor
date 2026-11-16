/**
 * Client-Side Application Logic
 * Manages real-time SSE streaming, CLI log visualization, JSON formatting, and UI interactions.
 */

// DOM Elements
const messagesContainer = document.getElementById('messagesContainer');
const welcomeCard = document.getElementById('welcomeCard');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const toggleTerminalBtn = document.getElementById('toggleTerminalBtn');
const closeTerminalBtn = document.getElementById('closeTerminalBtn');
const terminalDrawer = document.getElementById('terminalDrawer');
const terminalOutput = document.getElementById('terminalOutput');
const termStatusBadge = document.getElementById('termStatusBadge');
const termClearBtn = document.getElementById('termClearBtn');
const metaTool = document.getElementById('metaTool');
const metaPid = document.getElementById('metaPid');
const metaDuration = document.getElementById('metaDuration');
const activeTaskBar = document.getElementById('activeTaskBar');
const activeTaskText = document.getElementById('activeTaskText');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');
const depthSelect = document.getElementById('depthSelect');
const formatSelect = document.getElementById('formatSelect');
const maxPagesSelect = document.getElementById('maxPagesSelect');

let currentTaskId = null;
let activeEventSource = null;
let taskStartTime = 0;
let taskTimerInterval = null;

// Initialize
function init() {
  setupEventListeners();
  checkBackendHealth();
}

function setupEventListeners() {
  // Send message on Enter (without Shift)
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  });

  // Auto-resize textarea
  promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = `${Math.min(promptInput.scrollHeight, 120)}px`;
  });

  sendBtn.addEventListener('click', handleSendPrompt);

  // Clear chat
  clearChatBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = '';
    if (welcomeCard) messagesContainer.appendChild(welcomeCard);
  });

  // Toggle terminal drawer
  toggleTerminalBtn.addEventListener('click', () => {
    terminalDrawer.classList.toggle('collapsed');
  });

  closeTerminalBtn.addEventListener('click', () => {
    terminalDrawer.classList.add('collapsed');
  });

  termClearBtn.addEventListener('click', () => {
    terminalOutput.innerHTML = '<code class="terminal-code">// Console cleared</code>';
  });

  cancelTaskBtn.addEventListener('click', handleCancelTask);

  // Demo prompt chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const promptText = chip.getAttribute('data-prompt');
      promptInput.value = promptText;
      promptInput.dispatchEvent(new Event('input'));
      handleSendPrompt();
    });
  });
}

async function checkBackendHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const statusText = document.querySelector('.status-text');
    if (data.status === 'healthy') {
      statusText.textContent = `Online (Node ${data.nodeVersion})`;
    }
  } catch {
    const statusText = document.querySelector('.status-text');
    statusText.textContent = 'Offline / Connecting...';
  }
}

// Append User Message to Chat
function appendUserMessage(text) {
  if (welcomeCard && welcomeCard.parentElement) {
    welcomeCard.style.display = 'none';
  }

  const row = document.createElement('div');
  row.className = 'chat-row user';
  row.innerHTML = `
    <div class="chat-bubble">${escapeHtml(text)}</div>
    <div class="chat-avatar">👤</div>
  `;
  messagesContainer.appendChild(row);
  scrollToBottom();
}

// Create Assistant Message Container with Live Workflow Steps
function createAssistantMessage() {
  const row = document.createElement('div');
  row.className = 'chat-row assistant';

  const assistantId = `assistant-${Date.now()}`;
  row.innerHTML = `
    <div class="chat-avatar">⚡</div>
    <div class="chat-bubble" id="${assistantId}">
      <div class="workflow-step" id="${assistantId}-intent-step" style="display: none;">
        <div class="workflow-header intent">
          <span>🧠 1. AI Intent Understanding & Execution Plan</span>
          <span class="badge" id="${assistantId}-engine-badge">PLANNING</span>
        </div>
        <div class="workflow-body" id="${assistantId}-intent-body"></div>
      </div>

      <div class="workflow-step" id="${assistantId}-cli-step" style="display: none;">
        <div class="workflow-header command">
          <span>⚙️ 2. Approved CLI Invocation</span>
          <span class="badge" id="${assistantId}-cli-badge">STARTING</span>
        </div>
        <div class="workflow-body">
          <div class="command-box" id="${assistantId}-command-box"></div>
          <div style="margin-top: 6px; font-size: 0.75rem; color: #94a3b8;" id="${assistantId}-tool-rationale"></div>
        </div>
      </div>

      <div class="workflow-step" id="${assistantId}-live-step" style="display: none;">
        <div class="workflow-header status">
          <span>📡 3. Live Process Stream</span>
          <span class="badge" id="${assistantId}-stream-badge">RUNNING</span>
        </div>
        <div class="workflow-body">
          <pre style="background: #000; padding: 8px; border-radius: 4px; max-height: 140px; overflow-y: auto; font-size: 0.75rem; color: #67e8f9;"><code id="${assistantId}-live-logs"></code></pre>
        </div>
      </div>

      <div id="${assistantId}-result-area">
        <div style="display: flex; align-items: center; gap: 8px; color: #94a3b8; font-size: 0.85rem;">
          <span class="spinner"></span> Interpreting natural language request...
        </div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(row);
  scrollToBottom();

  return {
    row,
    assistantId,
    intentStep: document.getElementById(`${assistantId}-intent-step`),
    engineBadge: document.getElementById(`${assistantId}-engine-badge`),
    intentBody: document.getElementById(`${assistantId}-intent-body`),
    cliStep: document.getElementById(`${assistantId}-cli-step`),
    cliBadge: document.getElementById(`${assistantId}-cli-badge`),
    commandBox: document.getElementById(`${assistantId}-command-box`),
    toolRationale: document.getElementById(`${assistantId}-tool-rationale`),
    liveStep: document.getElementById(`${assistantId}-live-step`),
    streamBadge: document.getElementById(`${assistantId}-stream-badge`),
    liveLogs: document.getElementById(`${assistantId}-live-logs`),
    resultArea: document.getElementById(`${assistantId}-result-area`)
  };
}

// Send Prompt Handler using Server-Sent Events / Fetch Streaming
async function handleSendPrompt() {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  // Clear input
  promptInput.value = '';
  promptInput.style.height = 'auto';
  promptInput.disabled = true;
  sendBtn.disabled = true;

  appendUserMessage(prompt);
  const elements = createAssistantMessage();

  // Reset Live Terminal Drawer
  terminalOutput.innerHTML = '';
  termStatusBadge.className = 'badge running';
  termStatusBadge.textContent = 'RUNNING';
  metaDuration.textContent = '0ms';

  // Show Active Task Bar
  activeTaskBar.style.display = 'flex';
  activeTaskText.textContent = 'Executing CLI task...';

  taskStartTime = Date.now();
  clearInterval(taskTimerInterval);
  taskTimerInterval = setInterval(() => {
    const elapsed = Date.now() - taskStartTime;
    metaDuration.textContent = `${elapsed}ms`;
  }, 100);

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        options: {
          depth: parseInt(depthSelect.value, 10),
          format: formatSelect.value,
          maxPages: parseInt(maxPagesSelect.value, 10)
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // Retain incomplete event data

      for (const line of lines) {
        if (!line.trim()) continue;

        let eventType = 'message';
        let dataString = '';

        const eventMatch = line.match(/^event:\s*(\w+)/m);
        if (eventMatch) eventType = eventMatch[1];

        const dataMatch = line.match(/^data:\s*(.*)$/m);
        if (dataMatch) dataString = dataMatch[1];

        let eventData = {};
        try {
          eventData = JSON.parse(dataString);
        } catch {
          eventData = { raw: dataString };
        }

        processStreamEvent(eventType, eventData, elements);
      }
    }
  } catch (err) {
    elements.resultArea.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 6px; padding: 12px; color: #fca5a5;">
        <strong>Communication Error:</strong> ${escapeHtml(err.message)}
      </div>
    `;
    termStatusBadge.className = 'badge failed';
    termStatusBadge.textContent = 'FAILED';
  } finally {
    clearInterval(taskTimerInterval);
    activeTaskBar.style.display = 'none';
    promptInput.disabled = false;
    sendBtn.disabled = false;
    promptInput.focus();
  }
}

// Process Real-time SSE Events
function processStreamEvent(eventType, data, el) {
  if (eventType === 'status') {
    if (data.message) {
      appendTerminalLog(`[STATUS] ${data.message}`);
    }
  } else if (eventType === 'plan') {
    // Reveal Step 1: AI Intent
    el.intentStep.style.display = 'block';
    el.engineBadge.textContent = data.engine || 'AI INTENT';
    el.intentBody.innerHTML = `
      <div><strong>Target URL:</strong> <a href="${data.targetUrl}" target="_blank" style="color: #38bdf8;">${data.targetUrl}</a></div>
      <div style="margin-top: 4px;"><strong>Intent:</strong> \`${data.intent}\` | <strong>Depth:</strong> \`${data.options?.depth}\` | <strong>Format:</strong> \`${data.options?.format}\`</div>
      <div style="margin-top: 4px; color: #94a3b8; font-size: 0.75rem;">${escapeHtml(data.explanation || '')}</div>
    `;

    // Reveal Step 2: Approved CLI Command
    el.cliStep.style.display = 'block';
    el.cliBadge.textContent = 'SPAWNED';
    el.commandBox.textContent = `$ ${data.plannedCommand}`;
    el.toolRationale.textContent = `Tool: ${data.toolId} — ${data.toolRationale || ''}`;

    // Reveal Step 3: Stream area
    el.liveStep.style.display = 'block';

    metaTool.textContent = data.toolId || 'site-crawler';
    appendTerminalLog(`[PLAN] Tool: ${data.toolId} | Target: ${data.targetUrl}`);
    appendTerminalLog(`[COMMAND] $ ${data.plannedCommand}`);
    scrollToBottom();
  } else if (eventType === 'stderr') {
    const line = data.line || '';
    el.liveLogs.textContent += line;
    el.liveLogs.parentElement.scrollTop = el.liveLogs.parentElement.scrollHeight;
    appendTerminalLog(line);

    // Extract PID if present
    const pidMatch = line.match(/PID:\s*(\d+)/i) || line.match(/PID\s*(\d+)/i);
    if (pidMatch) {
      metaPid.textContent = pidMatch[1];
    }
  } else if (eventType === 'stdout') {
    // Captured stdout chunks
    appendTerminalLog(data.chunk);
  } else if (eventType === 'needs_input') {
    el.resultArea.innerHTML = `
      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; color: #fde68a;">
        ⚠️ <strong>URL Required:</strong> ${escapeHtml(data.message)}
      </div>
    `;
  } else if (eventType === 'done') {
    renderFinalResult(data, el);
  }
}

// Render Final Chat Presentation with Tabs (Summary, JSON, Telemetry)
function renderFinalResult(data, el) {
  const result = data.result || {};
  const isSuccess = result.success;
  const telemetry = result.telemetry || data.rawTelemetry || {};

  currentTaskId = telemetry.taskId || null;

  // Update badges
  el.streamBadge.className = isSuccess ? 'badge success' : 'badge failed';
  el.streamBadge.textContent = isSuccess ? 'COMPLETED (0)' : `EXIT (${telemetry.exitCode || 1})`;

  termStatusBadge.className = isSuccess ? 'badge success' : 'badge failed';
  termStatusBadge.textContent = isSuccess ? 'COMPLETED (0)' : `FAILED (${telemetry.exitCode || 1})`;
  metaDuration.textContent = `${telemetry.durationMs || 0}ms`;

  const tabsId = `tabs-${Date.now()}`;
  const jsonString = JSON.stringify(result.json || {}, null, 2);

  el.resultArea.innerHTML = `
    <div class="result-tabs-container">
      <div class="tabs-nav">
        <button class="tab-btn active" data-tab="${tabsId}-summary">📑 Executive Summary</button>
        <button class="tab-btn" data-tab="${tabsId}-json">📦 Structured JSON</button>
        <button class="tab-btn" data-tab="${tabsId}-telemetry">⏱️ Execution Telemetry</button>
      </div>

      <!-- Tab 1: Summary -->
      <div class="tab-content active" id="${tabsId}-summary">
        <div class="markdown-view">${convertMarkdownToHtml(result.markdown || '')}</div>
      </div>

      <!-- Tab 2: Structured JSON -->
      <div class="tab-content" id="${tabsId}-json">
        <div class="json-view-wrapper">
          <div class="json-actions-bar">
            <button class="btn-copy" onclick="copyJsonToClipboard('${tabsId}-code')">📋 Copy JSON</button>
            <button class="btn-download" onclick="downloadJsonFile('${tabsId}-code', 'crawl-data.json')">⬇️ Download JSON</button>
          </div>
          <pre class="json-code"><code id="${tabsId}-code">${escapeHtml(jsonString)}</code></pre>
        </div>
      </div>

      <!-- Tab 3: Telemetry -->
      <div class="tab-content" id="${tabsId}-telemetry">
        <div class="telemetry-grid">
          <div class="telem-card">
            <div class="telem-key">CLI Tool</div>
            <div class="telem-val">${escapeHtml(telemetry.toolId || 'site-crawler')}</div>
          </div>
          <div class="telem-card">
            <div class="telem-key">Exit Code</div>
            <div class="telem-val" style="color: ${telemetry.exitCode === 0 ? '#10b981' : '#ef4444'};">${telemetry.exitCode ?? 0}</div>
          </div>
          <div class="telem-card">
            <div class="telem-key">Execution Time</div>
            <div class="telem-val">${telemetry.durationMs || 0}ms</div>
          </div>
          <div class="telem-card">
            <div class="telem-key">Process PID</div>
            <div class="telem-val">${telemetry.pid || '-'}</div>
          </div>
          <div class="telem-card">
            <div class="telem-key">Task ID</div>
            <div class="telem-val" style="font-size: 0.65rem; word-break: break-all;">${telemetry.taskId || '-'}</div>
          </div>
          <div class="telem-card">
            <div class="telem-key">Security Sandbox</div>
            <div class="telem-val" style="color: #10b981;">SSRF Validated</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach tab switching events
  const tabButtons = el.resultArea.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      el.resultArea.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  scrollToBottom();
}

// Cancel Task Handler
async function handleCancelTask() {
  if (!currentTaskId) return;
  try {
    activeTaskText.textContent = 'Aborting process...';
    await fetch('/api/task/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: currentTaskId })
    });
    appendTerminalLog('[ORCHESTRATOR] User sent cancellation request.');
  } catch (err) {
    console.error('Failed to cancel task:', err);
  }
}

// Helpers
function appendTerminalLog(text) {
  const span = document.createElement('span');
  span.textContent = text;
  terminalOutput.appendChild(span);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function scrollToBottom() {
  setTimeout(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 50);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function convertMarkdownToHtml(md = '') {
  let html = md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" style="color: #38bdf8;">$1</a>')
    .replace(/\n\n/gim, '<br/><br/>')
    .replace(/\n/gim, '<br/>');
  return html;
}

// Global window helpers for copy & download
window.copyJsonToClipboard = function(elementId) {
  const codeEl = document.getElementById(elementId);
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.innerText).then(() => {
    alert('Structured JSON copied to clipboard!');
  }).catch(() => {
    alert('Failed to copy to clipboard.');
  });
};

window.downloadJsonFile = function(elementId, filename = 'crawl-data.json') {
  const codeEl = document.getElementById(elementId);
  if (!codeEl) return;
  const blob = new Blob([codeEl.innerText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Start
document.addEventListener('DOMContentLoaded', init);
