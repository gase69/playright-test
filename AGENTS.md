# AGENTS.md — Canonical context for this repo

> This is the **single source of truth** for AI agents working in this repo
> (Claude Code, agy). `CLAUDE.md` just points here. If something is true about
> this repo, it belongs in this file. See `APPROACH.md` for the full plan this
> repo is built from.

> **Status: scaffolding in progress.** The files and commands below describe the
> *intended* end state. Until `package.json`, `playwright.config.ts`, `server/`,
> and the spec files exist, commands like `npm test` will fail. See `APPROACH.md`
> for the build sequence. This banner is removed once Step 1 lands.

## Purpose

A self-contained sandbox to learn and test **three Playwright surfaces** side by side:

1. **Playwright test scripts** (`@playwright/test`) — scripted, assertion-based tests in `tests/`.
2. **Playwright CLI** (`npx playwright …`) — interactive tooling: codegen, inspector, traces, screenshots, pdf.
3. **Playwright MCP** (`@playwright/mcp`) — agent-driven browsing (accessibility-tree based), wired to both Claude and agy.

The teaching goal is to **contrast** the three: fixed assertions (scripts) vs. recorded scripts (codegen) vs. semantic agent-driven browsing (MCP).

## Environment (verified 2026-07-26)

- Node `v22.23.1`, npm `10.9.8`. No pnpm/yarn — use **npm/npx**.
- Playwright `1.62.0` via `@playwright/test` (pinned in `package.json`).
- Browsers cached at `~/.cache/ms-playwright`; run `npx playwright install chromium` to bring cache current.
- `/usr/bin/chromium-browser` exists; `DISPLAY=:0` (WSL2 GUI) → **headed mode works**.
- Agents present: Claude Code (`2.1.220`), agy (gemini-cli-derived, reads `AGENTS.md`).

## Setup (one-time)

```bash
git init && git add -A && git commit -m "init"   # real repo first
npm install                       # install @playwright/test + @playwright/mcp (pinned)
npx playwright install chromium   # download/refresh browser
```

`playwright.config.ts` runs the local fixture server (`server/`) via `webServer`
on port 3300, `reuseExistingServer: true`. Tests point at `http://localhost:3300`.

## Run recipes

| Task | Command |
|---|---|
| Full test run (headless) | `npm test` |
| Headed run | `npm run test:headed` |
| UI / watch mode | `npm run test:ui` |
| Run with tracing on | `npm run test:trace` |
| Open last trace | `npm run trace` |
| Open HTML report | `npm run report` |
| Record a script (codegen) | `npm run codegen` |
| Inspector on a URL | `npm run open` |
| Screenshot / PDF | `npx playwright screenshot <url> out.png` / `… pdf <url> out.pdf` |
| Run fixture server standalone | `npm run serve` |

## Repo layout

```
package.json            # scripts + pinned deps (@playwright/test, @playwright/mcp)
playwright.config.ts    # chromium (headless default), trace=retain-on-failure, HTML report, webServer→server/
.gitignore              # node_modules/, test-results/, playwright-report/, blob-report/, .auth/
AGENTS.md               # this file — source of truth
CLAUDE.md               # stub → AGENTS.md
APPROACH.md             # full plan / decisions log
server/                 # local fixture app (login + todo) — deterministic target for tests + MCP + codegen
tests/
  01-smoke.spec.ts
  02-locators.spec.ts
  03-fixtures.spec.ts
  04-auth.spec.ts       # storageState reuse (login via fixture server)
  05-debug.spec.ts      # trace, pause, screenshots
  06-three-ways.spec.ts # "same task, three ways" — scripted version
  recorded/             # output of `npx playwright codegen` (incl. three-ways.codegen.ts)
docs/cli.md             # Playwright CLI exercises (commands + expected output)
.mcp.json               # project-scoped Playwright MCP for Claude Code
.agents/mcp_config.json   # project-scoped Playwright MCP for agy (mcpServers)
```

## Conventions (follow these when writing tests)

- Spec files numbered `NN-name.spec.ts`, each with a short header doc comment naming the concept it teaches.
- Locators via `getByRole` / `getByText` / `getByLabel` (semantic, resilient). Avoid CSS selectors except where unavoidable.
- **No hard sleeps** — rely on auto-waiting and web-first assertions (`expect(locator).toBeVisible()` etc.).
- Custom reusable state via fixtures or `storageState`, not duplicated login blocks.
- Trace `retain-on-failure`, screenshots `only-on-failure`, HTML reporter — all set in the config; do not override per-test unless debugging.

## Playwright MCP wiring

MCP server name: `playwright`. Pinned in `package.json` devDependencies; launched via the **local**
install (`npx @playwright/mcp` — resolves to the pinned version, not `@latest`).

- **Claude Code:** declared in project `.mcp.json` (project-scoped, not global). Verify with `claude mcp list`.
- **agy:** declared in project `.agents/mcp_config.json` under `mcpServers` (project-scoped). Verify the server is reachable before relying on it.
- **WSL/headed:** with `DISPLAY=:0`, pass `--headed` (and `--browser chromium`) in the server args for the contrast exercise so the agent's browsing is visible. Default to headless for routine runs.

The point of this surface is the **contrast** with scripts — made concrete in the **"same task, three ways"** exercise (`tests/06-three-ways.spec.ts` + `tests/recorded/three-ways.codegen.ts` + an MCP-driven run): log in, add a todo, verify it appears, done (1) scripted, (2) codegen-recorded, (3) agent-driven via MCP. An agent driving the browser sees the **accessibility tree** (roles, labels, snapshots) and acts semantically; a `@playwright/test` script asserts on fixed locators/expectations; a codegen recording tends toward CSS/id-based locators. When asked to "test a flow," pick the surface deliberately and note the trade-off (reliability / cost / authoring speed / resilience to UI change).

## Decisions (resolved)

See `APPROACH.md` § "Resolved decisions" for rationale.
- MCP scope = **project-local** for both tools.
- Browsers = **chromium only** (firefox/webkit commented in config).
- Target = **local fixture server** (`server/`, port 3300) via `webServer` — for auth + contrast exercise. Public sites only for Step 3 CLI demos.
- agy context = `AGENTS.md` from cwd (gemini-cli convention; confirmed-by-convention, verified-empirically-at-wiring). Fallback `GEMINI.md`.
- MCP version = pinned in devDependencies; launch uses the local install, not `@latest`.
- git = `git init` + `.gitignore`.