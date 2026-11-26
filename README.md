# Switchboard

**Open-source, cross-platform desktop AI task orchestrator with smart model routing and automatic rate-limit failover.**

Connect your paid AI subscriptions and APIs in one studio app — including **multiple Claude accounts on the same Gmail (Personal + Team)**, **Google AI Pro (Gemini CLI)**, **OpenAI Codex CLI**, **Anthropic API**, **Google Gemini API**, **OpenRouter**, or local **Ollama** — queue single or multi-step tasks, and let Switchboard pick the right model for every step and switch automatically when an account hits its usage limit.

---

## Why Switchboard?

Most "subscription proxy" tools extract browser cookies or spoof OAuth tokens — which violates provider Terms of Service and gets accounts banned.

**Switchboard takes the clean, ToS-safe approach:**
1. **Official CLIs with Isolated Profiles:** For subscription plans, Switchboard spawns the official CLIs (`claude`, `gemini`, `codex`) with isolated config directories (`CLAUDE_CONFIG_DIR`, `GEMINI_CLI_HOME`, `CODEX_HOME`). You can keep **Claude Personal** and **Claude Team** logged in simultaneously — even under the same Gmail — without session collisions.
2. **Smart Task Classification & Step Splitting:** Multi-step prompts (`1. ... 2. ... 3. ...`) are automatically decomposed into sequential subtasks and classified across 8 categories (`Architecture`, `Coding`, `Frontend UI`, `Debugging`, `Large Context`, `Research`, `Writing`, `Quick Edit`).
3. **Automatic Rate-Limit Failover with Handoff Context:** When an account hits a quota or rate limit (`429`, `usage limit reached`, `RESOURCE_EXHAUSTED`, etc.), Switchboard parses the reset window, puts that account in cooldown with a live timer, packages the partial output as handoff context, and seamlessly switches to the next eligible model.
4. **Personal vs. Team Isolation Guards:** Keep work repositories pinned to Team accounts, or allow automatic cross-scope fallback per category.
5. **Projects, Multi-Turn Chats & GitHub Cloud Sync:** Organize work into persistent projects with multi-turn chat threads (context carries over even across model switches and failovers), create & push new GitHub repos directly from the app, and sync your settings, accounts, projects, and chat history across macOS/Windows/Linux via a Private GitHub Gist.
6. **Cross-Platform Desktop App:** Built with Electron, React 19, and TypeScript for **macOS**, **Windows**, and **Linux**.

---

## Quick Start (macOS, Linux, Windows)

### Prerequisites
- Node.js 20+ and `pnpm`
- Any combination of official CLIs and/or API keys:
  ```bash
  # Claude Code (supports multiple accounts via isolated CLAUDE_CONFIG_DIR)
  npm install -g @anthropic-ai/claude-code

  # Google Gemini CLI (for Google AI Pro / Gemini models)
  npm install -g @google/gemini-cli

  # OpenAI Codex CLI (optional)
  npm install -g @openai/codex
  ```

### Run in Development
```bash
pnpm install
pnpm dev
```

### Build Desktop Installers
```bash
# macOS (.dmg & .zip)
pnpm package:mac

# Windows (.exe NSIS installer)
pnpm package:win

# Linux (.AppImage & .deb)
pnpm package:linux
```

---

## Connecting Two Claude Accounts on the Same Gmail (Personal + Team)

1. Open **Accounts & Quotas** in Switchboard.
2. Starter profiles **Claude Team** (`~/.switchboard/profiles/claude-team`) and **Claude Personal** (`~/.switchboard/profiles/claude-personal`) are already created for you.
3. Click **Sign In in Terminal** on **Claude Team** — sign in with your Gmail and select your **Team** organization.
4. Click **Sign In in Terminal** on **Claude Personal** — sign in with the same Gmail and select your **Personal** organization.
5. Click **Sign In in Terminal** on **Google AI Pro** (once `gemini` CLI is installed) to authenticate your Google account.
6. Click **Test** on each card to verify connectivity.

Now go to **Command Deck**, drop in a task, and Switchboard will execute each step with the best available model and fail over automatically if one hits its limit.

---

## Architecture

```text
src/
├── shared/          # Domain types, IPC contracts, and provider presets
├── core/
│   ├── classifier.ts    # Prompt classification + multi-step task decomposer
│   ├── router.ts        # Capability scoring, workspace scope guards, cooldown filtering
│   ├── rateLimit.ts     # Cross-provider 429 & CLI quota limit detector + reset parser
│   ├── orchestrator.ts  # Sequential queue runner + mid-task failover handoff engine
│   ├── store.ts         # Atomic local persistence (~/.switchboard/state.json)
│   └── runners/         # Official CLI runners (Claude, Gemini, Codex) + streaming API runner
├── main/            # Electron main process, IPC bridge, native OS terminal login launcher
└── renderer/        # React 19 + TypeScript studio UI (adaptive light/dark theme)
```

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT © Switchboard Contributors
