# Contributing to Switchboard

Thank you for your interest in contributing to Switchboard!

## Development Setup

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

## Project Guidelines

- **No ToS-violating OAuth proxying:** Subscription integrations must launch official provider CLIs or use official API keys.
- **Cross-platform first:** Avoid macOS-only shell assumptions in `src/core/` or `src/main/`. Always support `darwin`, `linux`, and `win32`.
- **Tests:** Add Vitest unit tests in `src/core/__tests__/` for routing, classification, rate-limit detection, or orchestration changes.

## Opening a Pull Request

1. Fork the repository and create a descriptive branch (`feat/add-ollama-healthcheck`).
2. Run `pnpm typecheck && pnpm test && pnpm build` to verify everything passes cleanly.
3. Open a Pull Request describing the change and how you tested it.
