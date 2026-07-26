# Playwright Testing/Learning — Approach & Implementation Log

> Folder: `playright-test/` (GitHub: `gase69/playright-test`)
> This file contains the implementation log and architecture choices. `AGENTS.md` is the canonical agent context.

## Purpose

A self-contained sandbox to learn and test three Playwright surfaces, side by side:

1. **Playwright test scripts** (`@playwright/test`) — scripted, assertion-based tests in `tests/`.
2. **Playwright CLI & Generators** — interactive tooling (`codegen`, `inspector`) and standalone TS CLI tools (`scripts/generate-aws-rds-estimate.ts`).
3. **Playwright MCP** (`@playwright/mcp`) — agent-driven browsing, accessibility-tree based.

The teaching goal is to **contrast** the three: when you write a fixed assertion vs. record a script vs. let an agent drive the browser live.

## Environment Summary

| Technology | Detail |
|---|---|
| Node / npm / npx | `v22.23.1` / `10.9.8` |
| Playwright | `@playwright/test` `1.62.0` (pinned) |
| Playwright MCP | `@playwright/mcp` (pinned, project-scoped) |
| CLI Runtime | `tsx` (TypeScript executor) |
| Type Checking | TypeScript `tsc --noEmit` (`tsconfig.json`) |
| Linter & Security | ESLint flat config (`eslint.config.mjs`) with `eslint-plugin-playwright` & `eslint-plugin-security` |
| Repository | `https://github.com/gase69/playright-test` |

---

## Implementation Log — Completed Steps

### Step 0 & 1 — Git & Playwright Environment Setup
- Initialized Git repository on branch `main` with `.gitignore`.
- Installed `@playwright/test` and `@playwright/mcp`.
- Configured `playwright.config.ts` (Chromium, headless default, trace `retain-on-failure`, HTML report).

### Step 2 — Test Scripts Ladder (`tests/`)
1. `01-smoke.spec.ts` — Baseline Playwright page initialization & title assertion.
2. `02-locators.spec.ts` — Semantic locator strategy (`getByRole`, `getByText`, `getByLabel`).
3. `03-fixtures.spec.ts` — Custom test fixtures.
4. `04-auth.spec.ts` — `storageState` session cookie persistence & reuse.
5. `05-debug.spec.ts` — Interactive debugging, `page.pause()`, screenshots, and trace viewer.
6. `06-aws-rds-calculator.spec.ts` — Full E2E test simulating AWS RDS PostgreSQL Pricing calculation, CSV export, and public link saving.

### Step 3 — Standalone Executable CLI Generator (`scripts/generate-aws-rds-estimate.ts`)
- Built a standalone CLI script using Playwright's programmatic API (`chromium.launch()`).
- Direct execution supported via `chmod +x` and `#!/usr/bin/env -S npx tsx`.
- Supports CLI flags: `--engine` (`-e`), `--region` (`-r`), `--instance-type` (`-i`), `--storage-type` (`-t`), `--storage-gb` (`-s`), `--deployment` (`-d`), `--description`, `--name`, `--headed`, `--out-csv` (`-c`), `--out-url` (`-u`).
- Default output files incorporate ISO timestamp strings (`YYYY-MM-DD_HH-mm-ss`) to prevent overwriting across runs.

### Step 4 — Playwright MCP Integration
- Configured project-scoped MCP wiring in `.mcp.json` (Claude Code) and `.agents/mcp_config.json` (agy).
- Tested live agent-driven browsing on AWS Pricing Calculator in headed mode (`DISPLAY=:0`).

### Step 5 — Code Quality & Security Audit
- Created `tsconfig.json` for strict type checking (`npm run check`).
- Configured ESLint (`eslint.config.mjs`) with `eslint-plugin-playwright` and `eslint-plugin-security`.
- Added `npm run audit` and `npm run sec-check` for automated security validation.

---

## Resolved Decisions

1. **MCP scope**: Project-local for all AI tools (`.mcp.json` & `.agents/mcp_config.json`).
2. **Browsers**: Chromium (headless default, `--headed` opt-in).
3. **Target app**: AWS Pricing Calculator (`https://calculator.aws/#/`).
4. **CLI execution**: Direct `./scripts/generate-aws-rds-estimate.ts` with `env -S` shebang.
5. **Output safety**: Timestamped default filenames (`aws-rds-estimate-YYYY-MM-DD_HH-mm-ss.csv`).
6. **Type Safety & Security**: `tsc --noEmit`, `eslint-plugin-security`, `npm audit`.
