/**
 * CLI Orchestration Layer
 * Spawns approved CLI processes, captures real-time I/O streams, handles timeouts, and enforces security.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const { getApprovedTool } = require('./toolRegistry');
const { validateUrl, validateCliOptions } = require('./security');

// Map of currently running active jobs for cancellation
const activeJobs = new Map();

/**
 * Spawns and manages an approved CLI tool execution.
 * @param {string} toolId - Registered tool identifier (e.g., 'site-crawler')
 * @param {object} inputOptions - Raw options from AI intent parser or user
 * @param {object} callbacks - Optional real-time hooks { onStdout, onStderr, onStatus }
 * @returns {Promise<object>} Complete execution result
 */
function executeCliTask(toolId, inputOptions = {}, callbacks = {}) {
  const { onStdout = () => {}, onStderr = () => {}, onStatus = () => {} } = callbacks;
  const taskId = crypto.randomUUID();

  return new Promise((resolve) => {
    // 1. Tool authorization check
    const tool = getApprovedTool(toolId);
    if (!tool) {
      const errRes = {
        taskId,
        success: false,
        error: `Tool "${toolId}" is not in the approved CLI registry.`,
        exitCode: 1,
        status: 'FAILED'
      };
      onStatus('FAILED', errRes.error);
      return resolve(errRes);
    }

    // 2. Validate URL if present
    if (inputOptions.url) {
      const urlCheck = validateUrl(inputOptions.url);
      if (!urlCheck.valid) {
        const errRes = {
          taskId,
          success: false,
          error: urlCheck.error,
          exitCode: 1,
          status: 'FAILED'
        };
        onStatus('FAILED', errRes.error);
        return resolve(errRes);
      }
      inputOptions.url = urlCheck.url;
    }

    // 3. Validate and sanitize options
    const optCheck = validateCliOptions(inputOptions);
    if (!optCheck.valid) {
      const errRes = {
        taskId,
        success: false,
        error: optCheck.error,
        exitCode: 1,
        status: 'FAILED'
      };
      onStatus('FAILED', errRes.error);
      return resolve(errRes);
    }
    const sanitizedOptions = { ...optCheck.sanitized, url: inputOptions.url };

    // 4. Construct secure argv array (NO shell expansion)
    const cliArgs = tool.buildArgs(sanitizedOptions);
    const commandDisplay = `${tool.executable} ${cliArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`;

    const maxTimeoutMs = (sanitizedOptions.timeout || 15000) + 5000; // grace buffer
    const startTime = Date.now();

    onStatus('SPAWNING', `Starting CLI process for ${tool.name}...`);
    onStderr(`[ORCHESTRATOR] Spawning CLI process: ${commandDisplay}\n`);

    let child;
    try {
      child = spawn(tool.executable, cliArgs, {
        shell: false, // CRITICAL: strictly prevent shell command injection
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: 'production'
        }
      });
    } catch (spawnErr) {
      const errRes = {
        taskId,
        success: false,
        error: `Failed to spawn CLI process: ${spawnErr.message}`,
        exitCode: 1,
        status: 'FAILED'
      };
      onStatus('FAILED', errRes.error);
      return resolve(errRes);
    }

    const pid = child.pid;
    onStatus('RUNNING', `CLI process running (PID: ${pid})`);

    let stdoutData = '';
    let stderrData = '';
    let isTerminated = false;
    let completionStatus = 'RUNNING';

    // Store in active jobs for cancellation
    activeJobs.set(taskId, {
      child,
      cancel: () => {
        if (!isTerminated) {
          isTerminated = true;
          completionStatus = 'CANCELLED';
          onStderr(`[ORCHESTRATOR] Cancellation requested by user. Terminating PID ${pid}...\n`);
          child.kill('SIGTERM');
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
          }, 2000);
        }
      }
    });

    // Handle stdout
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutData += text;
      onStdout(text);
    });

    // Handle stderr
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrData += text;
      onStderr(text);
    });

    // Setup watchdog timeout
    const timeoutTimer = setTimeout(() => {
      if (!isTerminated) {
        isTerminated = true;
        completionStatus = 'TIMEOUT';
        onStderr(`[ORCHESTRATOR] Process exceeded timeout limit of ${maxTimeoutMs}ms. Terminating PID ${pid}...\n`);
        child.kill('SIGTERM');
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
        }, 2000);
      }
    }, maxTimeoutMs);

    // Error event
    child.on('error', (err) => {
      clearTimeout(timeoutTimer);
      activeJobs.delete(taskId);
      isTerminated = true;
      completionStatus = 'FAILED';
      const durationMs = Date.now() - startTime;
      const errRes = {
        taskId,
        toolId,
        pid,
        commandDisplay,
        success: false,
        exitCode: 1,
        status: 'FAILED',
        error: `Process error: ${err.message}`,
        stdout: stdoutData,
        stderr: stderrData,
        durationMs
      };
      onStatus('FAILED', errRes.error);
      resolve(errRes);
    });

    // Close event
    child.on('close', (code, signal) => {
      clearTimeout(timeoutTimer);
      activeJobs.delete(taskId);
      const durationMs = Date.now() - startTime;

      let finalStatus = completionStatus === 'RUNNING'
        ? (code === 0 ? 'COMPLETED' : 'FAILED')
        : completionStatus;

      // Attempt parsing JSON output from stdout
      let parsedJson = null;
      try {
        const trimmed = stdoutData.trim();
        // If stdout contains JSON, parse it
        const jsonStart = trimmed.indexOf('{');
        const jsonEnd = trimmed.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          const jsonString = trimmed.substring(jsonStart, jsonEnd + 1);
          parsedJson = JSON.parse(jsonString);
        }
      } catch (jsonErr) {
        // Not valid JSON on stdout
      }

      const success = (code === 0) && (finalStatus === 'COMPLETED');
      let errorMessage = null;

      if (!success) {
        if (finalStatus === 'TIMEOUT') {
          errorMessage = `Execution timed out after ${maxTimeoutMs}ms.`;
        } else if (finalStatus === 'CANCELLED') {
          errorMessage = 'Execution was cancelled by the user.';
        } else if (parsedJson && parsedJson.error) {
          errorMessage = parsedJson.error;
        } else {
          // Extract last meaningful line from stderr
          const stderrLines = stderrData.split('\n').map(l => l.trim()).filter(Boolean);
          errorMessage = stderrLines[stderrLines.length - 1] || `Process exited with code ${code}`;
        }
      }

      onStatus(finalStatus, success ? 'Task completed successfully.' : errorMessage);

      resolve({
        taskId,
        toolId,
        pid,
        commandDisplay,
        success,
        exitCode: code,
        exitSignal: signal,
        status: finalStatus,
        durationMs,
        stdout: stdoutData,
        stderr: stderrData,
        parsedData: parsedJson,
        error: errorMessage
      });
    });
  });
}

/**
 * Cancels an active CLI job by taskId.
 * @param {string} taskId
 * @returns {boolean}
 */
function cancelCliTask(taskId) {
  const job = activeJobs.get(taskId);
  if (job) {
    job.cancel();
    return true;
  }
  return false;
}

module.exports = {
  executeCliTask,
  cancelCliTask
};
