# AI App Lab — CSCI 40, week 1

Prompt an AI to build a web app. Then watch it test its own work in a live browser.

```bash
npm run setup      # once: installs libraries + Playwright's Chromium
npm run dev        # hub at http://localhost:5173
npm run demo       # watch Claude race REDLINE MX in a real browser
```

Ask Claude Code or Codex for anything, e.g. *"make a 3D asteroid shooter"* or *"build a synth drum machine"*. The agent scaffolds `apps/<name>/`, builds it, writes a Playwright test, and runs it headed. You can watch the browser drive itself.

The rules every agent follows (folder ownership, libraries, test fixture) are in **[AGENTS.md](AGENTS.md)**.
