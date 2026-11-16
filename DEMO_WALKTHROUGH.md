# Video Demonstration & Explanation Script (4–7 Minutes)
### BuildSprint Round 2: CLI-Driven AI Chat Execution for Complex Tasks

Use this guide as an exact, minute-by-minute blueprint for recording your explanation and live product demonstration video.

---

## 📋 Pre-Recording Checklist
1. **Start the application**:
   Open a terminal and run:
   ```bash
   npm start
   ```
   Confirm you see: `🚀 BuildSprint CLI-Driven AI Chat Server Active! http://localhost:3000`
2. **Open browser**: Go to `http://localhost:3000`. Keep the browser window clean and readable (zoom to 110% or 125% for clarity).
3. **Open a second terminal window**: Positioned alongside or ready to toggle, to show `node bin/crawler-cli.js --help` or terminal test scripts if desired.
4. **Audio & Screen**: Ensure microphone input is clear and screen resolution is at least 1080p.

---

## ⏱️ Minute-by-Minute Script & Walkthrough

### Part 1: Problem Introduction & Solution Overview (0:00 – 1:00)
- **What to say**:
  > *"Hello everyone! Welcome to my demonstration for BuildSprint Round 2: CLI-Driven AI Chat Execution for Complex Tasks.*
  >
  > *Most chat applications simply take a user's prompt, send it to a large language model, and output generated text. But in real-world engineering, users need systems that perform real work—crawling websites, running scripts, transforming data, and returning verified, structured results.*
  >
  > *To solve this challenge, I designed and built **TaskCLI**—a full-stack conversational system that translates natural-language requests into controlled, multi-step tasks, invokes a dedicated CLI tool from the backend, captures live execution streams, and returns verified summaries and structured JSON."*

---

### Part 2: Architecture & Component Walkthrough (1:00 – 2:00)
- **What to show**:
  Show the system architecture diagram or walk through the 6 components in the README / Web UI.
- **What to say**:
  > *"Our architecture consists of six modular layers:*
  > 1. *The **Frontend Chat Workspace**, featuring a real-time message stream and a slide-out Live CLI Process Inspector.*
  > 2. *The **AI Intent & Planning Layer**, which uses Groq Llama 3.3 / Gemini with an automatic, resilient heuristic NLP fallback to parse target URLs, depth parameters, and output formats into a structured ExecutionPlan.*
  > 3. *The **Security & SSRF Validation Boundary**, which blocks attempts to crawl internal addresses, localhost, or cloud metadata endpoints.*
  > 4. *The **Backend CLI Orchestrator**, which consults an approved tool registry and safely spawns the CLI process using `child_process.spawn` with `shell: false`—strictly preventing shell injection.*
  > 5. *The **Standalone CLI Tool** (`bin/crawler-cli.js`), which performs the real HTTP crawling, respects robots.txt, parses the HTML DOM, and outputs structured data to stdout and progress logs to stderr.*
  > 6. *The **Output Capture & Response Layer**, which formats the result into an executive summary card, syntactically valid JSON, and telemetry metrics."*

---

### Part 3: Mandatory Demonstration Use Case (2:00 – 3:45)
- **What to show**:
  1. Click on the first chip in the UI:
     `"Crawl https://example.com, extract the important information, give me a summary, and return the extracted data in JSON format."`
  2. Click **Execute** (or press Enter).
  3. Show the live workflow progression:
     - Step 1: AI Intent Understanding box appears.
     - Step 2: Approved CLI Command box appears:
       `node bin/crawler-cli.js --url "https://example.com" --depth 1 --format both`
     - Step 3: Open the **CLI Console** drawer on the right. Point out the live timestamped progress logs streaming from `stderr` (`[INIT]`, `[POLICY]`, `[FETCH]`, `[PARSE]`, `[SUCCESS]`).
  4. Show the final result tabs:
     - **Tab 1: Executive Summary**: Show the page title ("Example Domain"), HTTP status (200 OK), reading time, word count, key takeaways, and heading outline.
     - **Tab 2: Structured JSON**: Click the tab, show the syntactically valid JSON with title, meta, headings, and links. Click **Copy JSON** (show confirmation alert) and mention the **Download JSON** button.
     - **Tab 3: Execution Telemetry**: Show the CLI Tool ID, Exit Code (0), Execution Time in milliseconds, and Process PID.
- **What to say**:
  > *"Now let's demonstrate the mandatory challenge use case: 'Crawl https://example.com, extract the important information, give me a summary, and return the extracted data in JSON format.'*
  >
  > *When I submit the prompt, watch what happens behind the scenes:*
  > *First, our AI intent layer extracts the target URL and determines the tool and options.*
  > *Second, our backend orchestrator spawns the approved CLI tool—notice the exact command line displayed here.*
  > *Third, if we open our Live CLI Terminal drawer, we can see real-time stderr logs streaming directly from the child process: checking robots.txt, making the HTTP request, parsing the DOM, and completing.*
  > *Finally, the application synthesizes the output into an Executive Summary, a verified structured JSON document conforming to our schema, and a complete telemetry breakdown showing process PID and exit code 0."*

---

### Part 4: Edge Case & Security Safeguards Demonstration (3:45 – 4:45)
- **What to show**:
  1. Click the warning chip: `"Crawl http://127.0.0.1:8080 and get secret data."`
  2. Click **Execute**.
  3. Show how the security validation layer intercepts the request *before* any connection occurs:
     - Status: `FAILED`
     - Diagnostic message: `Access to hostname "127.0.0.1" is restricted for security (SSRF prevention).`
  4. (Optional) In terminal, run: `node bin/crawler-cli.js --url http://169.254.169.254` to demonstrate that even when invoked standalone from the command line, the CLI rejects cloud metadata SSRF attempts.
- **What to say**:
  > *"Security and responsible execution are essential in production AI systems. We treat all user inputs and web contents as untrusted.*
  >
  > *Notice what happens when a user attempts an SSRF attack, asking to crawl `http://127.0.0.1:8080` or `169.254.169.254`. The validation layer immediately identifies the loopback or cloud metadata address, halts execution, and returns an honest diagnostic explaining that access is restricted.*
  >
  > *Furthermore, commands are strictly passed as argument arrays without `shell: true`, preventing shell command injection. We also enforce maximum crawl depths and timeout watchdogs with full user cancellation support."*

---

### Part 5: Tech Stack, AI Tools Disclosure & Conclusion (4:45 – 5:30)
- **What to say**:
  > *"To summarize the technology stack:*
  > - *Backend: Modern Node.js with native HTTP and child process lifecycle management—built with **zero external runtime dependencies**, ensuring instant startup on any platform.*
  > - *Frontend: Responsive dark-mode interface with Server-Sent Events (SSE) streaming.*
  > - *CLI Engine: Standalone `bin/crawler-cli.js` with depth-limited crawling, robots.txt compliance, and DOM extraction.*
  > - *AI Intent: Groq Llama 3.3 70B and Google Gemini API, paired with a deterministic heuristic NLP fallback.*
  > - *AI Disclosure: Google DeepMind's Antigravity assistant was utilized during development for rapid scaffolding, architectural refinement, and comprehensive end-to-end test verification.*
  >
  > *TaskCLI demonstrates that conversational AI can reliably control and execute real backend tools while maintaining strict security, transparency, and structure. Thank you!"*

---

## 🎬 Tips for Video Submission
- Recommended length: **4 to 6 minutes**.
- Upload to Google Drive, YouTube (Unlisted), Loom, or Vimeo.
- Submit the link via the official submission form:
  `https://form.workelate.com/previewform/6af8bd0090174e8d87484e41`
