# Playwright Testing/Learning — Approach

> Folder: `playright-test/` (name kept as-is; the tool is spelled **Playwright**).
> This file is the plan. `AGENTS.md` (created next) is the canonical agent context.

## What this repo is for

A self-contained sandbox to learn and test three Playwright surfaces, side by side:

1. **Playwright test scripts** (`@playwright/test`) — scripted, assertion-based tests.
2. **Playwright CLI** (`npx playwright …`) — interactive tooling: codegen, inspector, traces, screenshots, pdf.
3. **Playwright MCP** (`@playwright/mcp`) — agent-driven browsing, accessibility-tree based.

The teaching goal is to **contrast** the three: when you write a fixed assertion vs. record a script vs. let an agent drive the browser live.

## Environment (verified 2026-07-26)

| Thing | Status |
|---|---|
| Node / npm / npx | v22.23.1 / 10.9.8 / 10.9.8 — OK |
| pnpm / yarn | absent (npm only) |
| Playwright (local) | not installed; `npx playwright@latest --version` → **1.62.0** |
| Playwright browsers | partially cached (`~/.cache/ms-playwright`: chromium 1228/1232, headless shells, ffmpeg). Current build wants chromium-1234 + firefox-1538 + webkit → **needs `playwright install`** |
| System browser | `/usr/bin/chromium-browser` exists; `DISPLAY=:0` (WSL2 GUI) → **headed mode works** |
| Claude Code | `2.1.220` at `~/.local/bin/claude`; project has entry in `~/.claude.json`, **no MCP servers yet** |
| agy | `~/.local/bin/agy` — gemini-cli-derived CLI; reads **`AGENTS.md`**; imports MCP from `~/.gemini/settings.json` (currently `context7`, `github`, `conductor`) |
| aider | not installed |
| git | **not initialized** in this folder (no `.git`) — Step 1 runs `git init` |

## Approach — step by step

### Step 0 — Git
- `git init` + a `.gitignore` excluding `node_modules/`, `test-results/`, `playwright-report/`, `blob-report/`, `.auth/` (storageState). The sandbox should be a real repo so agent tooling doesn't scan `node_modules` and diffs stay clean.

### Step 1 — Init a local Playwright project + fixture server
- `git init` + `.gitignore` (Step 0), then `npm init -y`.
- `npm i -D @playwright/test` (pinned version recorded in `package.json`).
- `npm i -D @playwright/mcp` (pinned in `package.json` devDependencies — MCP launch references the **local** install, not `@latest`).
- Minimal `playwright.config.ts`:
  - chromium project (headless by default; `--headed` opt-in).
  - optional firefox project (commented out, to keep first runs fast).
  - trace `retain-on-failure`, screenshot `only-on-failure`, HTML reporter.
  - **`webServer` runs the local fixture app** (see Step 1b) — the auth and contrast exercises depend on it.
- `npx playwright install chromium` (bring cache up to chromium-1234).
- Sanity test: one trivial test against the local fixture, run `npm test`.

### Step 1b — Local fixture server (`server/`)
A tiny Node app (no framework — just `http` or a 30-line Express) that serves the deterministic target for
auth + the contrast exercise. Keep it dependency-free or single-dep so it's trivial to audit:

- `POST /login` with `{user, pass}` → sets a signed cookie session; invalid creds → 401.
- `GET /` protected: requires session cookie, returns a small HTML page.
- `GET /api/todos` + `POST /api/todos` (session-scoped) for the todo flow.
- Served by Playwright's `webServer` in the config (port e.g. 3300); `reuseExistingServer: true`.
- This resolves the contradiction the earlier plan had: it both **enables `04-auth`** (real login, real
  session cookie, real `storageState`) **and provides the single stable target for "same task, three
  ways"** (Step 4b).

### Step 2 — Test scripts ladder (`tests/`)
A progressive set, each file teaching one concept and documented in its header. The ladder targets the
**local fixture server** (Step 1b), so flows are deterministic and reproducible, not dependent on a public
site's layout or availability.

1. `01-smoke.spec.ts` — page opens, title assertion. Baseline.
2. `02-locators.spec.ts` — `getByRole` / `getByText` / `getByLabel`, auto-waiting.
3. `03-fixtures.spec.ts` — custom test fixture (e.g. authenticated page object).
4. `04-auth.spec.ts` — `storageState` reuse across tests; login once, reuse the saved state. *(Requires the fixture server's login endpoint — this is why the server exists in Step 1b, not deferred.)*
5. `05-debug.spec.ts` — `--debug`, `page.pause()`, trace viewer, screenshots.

Documented run recipes (in `AGENTS.md` + `package.json` scripts):
- `npm test` — full headless run
- `npm run test:headed` — watch it run
- `npm run test:ui` — UI mode / watch mode
- `npm run test:trace` — `--trace on` + `npx playwright show-trace`
- `npm run report` — open HTML report

### Step 3 — Playwright CLI exercises (`docs/cli.md` + `tests/recorded/`)
Hands-on reference for the CLI, each with the exact command and expected output:
- `npx playwright codegen http://localhost:3300` → record into `tests/recorded/` (record the same todo flow used in Step 4b).
- `npx playwright open http://localhost:3300` — inspector + pick locator.
- `npx playwright screenshot --full-page …` and `… pdf …`.
- `npx playwright show-trace trace.zip`.
- `npx playwright install --dry-run` — inspect what would be downloaded.

### Step 4 — Playwright MCP, wired to BOTH agents
Install `@playwright/mcp` locally (`npm i -D @playwright/mcp`, pinned in `package.json` devDependencies)
and expose it to each tool **project-scoped**, so the sandbox owns its config:

- **Claude Code:** project `.mcp.json` declaring the `playwright` MCP server
  (command `npx`, args `@playwright/mcp` — resolves to the **local pinned** install). Confined to this project, not global.
- **agy:** since agy pulls MCP servers from gemini-cli config, add the
  `playwright` `mcpServers` entry to **project-local** `.gemini/settings.json` (loaded via `agy --add-dir .`) to keep the sandbox self-contained and avoid leaking the server into every agy project.

**WSL/headed note:** with `DISPLAY=:0`, run the MCP server **headed** for the contrast exercise so the
agent's browsing is visible (`--headed` / `--browser chromium` flags in the server args). Default to
headless for routine runs; flip to headed when the lesson is "watch the agent drive."

Then an exercise that is the real point of this surface (see Step 4b for the concrete task):
- Drive the browser **through the agent** (MCP: navigate, snapshot, click, fill, evaluate)
  vs. the **scripted** `@playwright/test` version of the same flow.
- Capture the contrast: agent sees the **accessibility tree** (snapshots, roles, labels) and acts semantically; the script asserts on fixed locators/expectations. Note reliability and cost trade-offs.

### Step 4b — "Same task, three ways" (the keystone exercise)
One fixed flow against the **local fixture server** (Step 1b), implemented three ways, with a short note
in each capturing the contrast. Task: **"log in, add a todo item, verify it appears in the list."**

1. **Scripted** — `tests/06-three-ways.spec.ts`: a `@playwright/test` spec that logs in via UI, adds a
   todo, asserts it appears. Fixed locators, web-first assertions, deterministic.
2. **Recorded** — `tests/recorded/three-ways.codegen.ts`: the same flow captured by `npx playwright codegen`.
   Shows what the recorder emits (often CSS/id-based, less resilient) vs. hand-written semantic locators.
3. **Agent-driven** — run via the Playwright MCP: the agent navigates, takes an accessibility snapshot,
   fills by role/label, clicks, and verifies by reading the snapshot back. No fixed selectors written by
   a human; the agent adapts to the a11y tree.

Each artifact ends with a short doc comment contrasting that surface's strengths/weaknesses
(reliability, authoring speed, maintenance cost, ability to handle UI change).

### Step 5 — `AGENTS.md` (canonical context for Claude + agy)
One file both tools read, containing:
- Repo purpose and the three surfaces and how they relate.
- Setup: install + browser install commands.
- Run recipes (test / headed / ui / trace / report / codegen / mcp).
- Spec conventions (naming, header doc comment, locators via `getBy*`, no hard sleeps).
- Default trace/screenshot/report settings.
- Per-tool MCP wiring summary (Claude `.mcp.json`, agy gemini settings) + how to verify the server connected.
- A **status line** marking the repo as "scaffolding in progress" until Step 1 lands, so the doc doesn't mislead agents into running commands against missing files. Removed once built.
- A tiny `CLAUDE.md` stub that just points to `AGENTS.md` so there is **one source of truth**.

## Resolved decisions (was "Open")

1. **MCP scope** — **project-local** for both tools (Claude `.mcp.json`, agy `.gemini/settings.json` via `--add-dir`). Keeps the sandbox self-contained.
2. **Second browser** — **chromium only** (firefox/webkit commented in config). Fast first runs.
3. **Target site** — **local fixture server** (Step 1b) via `webServer`. Resolves the auth contradiction and provides the single target for "same task, three ways." Public sites kept only for Step 3 CLI demos (codegen/open/screenshot).
4. **agy context mechanism** — **`AGENTS.md` from cwd**, confirmed by convention (gemini-cli standard; agy is gemini-cli-derived). Empirical check at wiring: run `agy` in this folder and confirm it loads `AGENTS.md`; fall back to `GEMINI.md` if it does not. *(Confirmed-by-convention, verified-empirically-at-wiring.)*
5. **MCP version** — pin `@playwright/mcp` in `package.json` devDependencies; launch references the local install, not `@latest`.
6. **git** — `git init` + `.gitignore` (Step 0/1). Real repo, not a loose folder.
