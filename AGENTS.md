# AGENTS.md — Canonical context for this repo

> This is the **single source of truth** for AI agents working in this repo
> (Claude Code, agy). `CLAUDE.md` just points here. If something is true about
> this repo, it belongs in this file. See `APPROACH.md` for the full plan this
> repo is built from.

## Purpose

A self-contained Playwright automation sandbox and learning environment demonstrating **three Playwright surfaces**:

1. **Playwright test scripts** (`@playwright/test`) — scripted, assertion-based E2E tests in `tests/`.
2. **Playwright CLI & Tools** — interactive tools: `codegen`, inspector, trace viewer, and standalone TS CLI generators.
3. **Playwright MCP** (`@playwright/mcp`) — agent-driven browsing (accessibility-tree based), wired to Claude Code and agy.

The teaching goal is to **contrast** the three: fixed assertions (scripts) vs. recorded scripts (codegen) vs. semantic agent-driven browsing (MCP).

## Environment

- Node `v22.23.1`, npm `10.9.8`. No pnpm/yarn — use **npm/npx**.
- Playwright `1.62.0` via `@playwright/test` (pinned in `package.json`).
- TypeScript with strict type checking (`tsc --noEmit`).
- ESLint flat configuration (`eslint.config.mjs`) with `eslint-plugin-playwright` and `eslint-plugin-security`.
- Browsers cached at `~/.cache/ms-playwright`.
- `DISPLAY=:0` (WSL2 GUI) → **headed mode supported**.
- GitHub Repository: **[gase69/playright-test](https://github.com/gase69/playright-test)** (branch: `main`).

## Run recipes

| Task | Command |
|---|---|
| Full test run (headless) | `npm test` |
| Headed test run | `npm run test:headed` |
| UI / watch mode | `npm run test:ui` |
| Trace & Report | `npm run test:trace` / `npm run trace` / `npm run report` |
| Record a script (codegen) | `npm run codegen` |
| Inspector on a URL | `npm run open` |
| **AWS RDS CLI Generator (TS)** | `npm run estimate -- [options]` / `./scripts/generate-aws-rds-estimate.ts` |
| **AWS RDS CLI Generator (Python)** | `npm run estimate:py -- [options]` / `uv run --directory python generate-aws-rds-estimate-py` |
| **TypeScript Type Check** | `npm run check` |
| **Python Quality Check** | `npm run check:py` (`ruff` + `pyright`) |
| **ESLint & Security Linting** | `npm run lint` |
| **Dependency Security Audit** | `npm run audit` |
| **Full Security & Type Check** | `npm run sec-check` |

## Repo layout

```
package.json                      # scripts + pinned deps (@playwright/test, @playwright/mcp, tsx, eslint)
playwright.config.ts              # chromium (headless default), trace=retain-on-failure, HTML report
tsconfig.json                     # TypeScript strict type checking config (noEmit)
eslint.config.mjs                 # ESLint flat config with Playwright & Security rules
.gitignore                        # node_modules/, test-results/, playwright-report/, blob-report/, .auth/
AGENTS.md                         # this file — single source of truth
CLAUDE.md                         # stub → AGENTS.md
APPROACH.md                       # full plan / decisions log
scripts/
  generate-aws-rds-estimate.ts    # Executable TS CLI generator for AWS RDS Pricing Calculator estimates
python/                           # Python sub-project workspace (uv, hatchling, typer, pydantic, rich, ruff)
  pyproject.toml                 # Package configuration, dependencies, and tool settings
  generate_aws_rds_estimate.py    # Python CLI generator for AWS RDS estimates
  test_estimate.py                # Pytest unit tests for config validation
tests/
  01-smoke.spec.ts
  02-locators.spec.ts
  03-fixtures.spec.ts
  04-auth.spec.ts                 # storageState reuse
  05-debug.spec.ts                # trace, pause, screenshots
  06-aws-rds-calculator.spec.ts   # AWS Pricing Calculator RDS PostgreSQL E2E test
  recorded/                       # output of `npx playwright codegen`
docs/cli.md                       # Playwright CLI exercises (commands + expected output)
.mcp.json                         # project-scoped Playwright MCP for Claude Code
.agents/mcp_config.json             # project-scoped Playwright MCP for agy (mcpServers)
```

## Conventions (follow these when writing tests & scripts)

- Spec files numbered `NN-name.spec.ts`, each with a short header doc comment naming the concept it teaches.
- Locators via `getByRole` / `getByText` / `getByLabel` (semantic, resilient). Avoid CSS selectors except where unavoidable.
- **No hard sleeps** — rely on auto-waiting and web-first assertions (`expect(locator).toBeVisible()` etc.).
- CLI scripts must be executable (`chmod +x`), use `#!/usr/bin/env -S npx tsx`, and timestamp output filenames by default (`aws-rds-estimate-YYYY-MM-DD_HH-mm-ss.csv`) to prevent accidental overwrites.
- Trace `retain-on-failure`, screenshots `only-on-failure`, HTML reporter — all set in the config.

## Playwright MCP wiring

MCP server name: `playwright`. Pinned in `package.json` devDependencies; launched via local install (`npx @playwright/mcp`).

- **Claude Code:** declared in project `.mcp.json` (project-scoped).
- **agy:** declared in project `.agents/mcp_config.json` under `mcpServers`.
- **WSL/headed:** with `DISPLAY=:0`, pass `--headed` (and `--browser chromium`) in the server args for headed browsing.

## Decisions (resolved)

- MCP scope = **project-local** for both tools.
- Browsers = **chromium only** (firefox/webkit commented in config).
- Target = AWS Pricing Calculator (`https://calculator.aws/#/`).
- Executable scripts = `chmod +x` with `#!/usr/bin/env -S npx tsx` and timestamped output files (`YYYY-MM-DD_HH-mm-ss`).
- Type Checking & Security = `tsc --noEmit`, `eslint-plugin-playwright`, `eslint-plugin-security`, and `npm audit`.