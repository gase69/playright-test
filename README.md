# Playwright Automation Sandbox & AWS RDS Pricing Generator

[![Playwright](https://img.shields.io/badge/Playwright-1.62.0-blue?logo=playwright)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A self-contained Playwright automation repository demonstrating **three Playwright surfaces** side by side:

1. **Scripted E2E Tests (`@playwright/test`)**: Automated, assertion-based test ladder in `tests/`.
2. **Interactive CLI & Executable TS Generators**: Standalone CLI script (`./scripts/generate-aws-rds-estimate.ts`) for parameterized AWS RDS pricing simulations.
3. **Agent-Driven Browsing (`@playwright/mcp`)**: Accessibility-tree based browsing wired to AI agents (Claude Code & agy).

---

## 🚀 Quickstart

### Prerequisites
* Node.js `v22.x` & `npm`
* Chromium (installed via Playwright)

### Installation
```bash
git clone https://github.com/gase69/playright-test.git
cd playright-test
npm install
npx playwright install chromium
```

---

## ⚡ AWS RDS Estimate CLI Generator

A standalone, executable CLI script that programmatically automates the [AWS Pricing Calculator](https://calculator.aws/#/), exports custom CSV cost breakdown files, and extracts public share links.

### Direct Execution Examples

```bash
# PostgreSQL (db.r7g.xlarge, gp3, 50 GB) in eu-central-1
./scripts/generate-aws-rds-estimate.ts -e PostgreSQL -r eu-central-1 -i db.r7g.xlarge -t gp3 -s 50

# Oracle EE BYOL (db.m6i.xlarge, Single-AZ, gp3, 500 GB)
./scripts/generate-aws-rds-estimate.ts -e Oracle -r eu-central-1 -i db.m6i.xlarge -t gp3 -s 500 -d Single-AZ

# Headed Mode (Watch the browser run live on screen)
./scripts/generate-aws-rds-estimate.ts -e MySQL -r us-east-1 -i db.m6g.large -t gp2 -s 250 --headed
```

### Supported CLI Flags

| Flag | Parameter | Description | Default |
| :--- | :--- | :--- | :--- |
| `-e`, `--engine` | Engine | DB Engine (`PostgreSQL`, `Oracle`, `MySQL`, `MariaDB`, `SQL Server`) | `PostgreSQL` |
| `-r`, `--region` | Region | AWS Region Code (`eu-central-1`, `us-east-1`, `eu-west-1`, etc.) | `eu-central-1` |
| `-i`, `--instance-type` | Instance | DB Instance class shape (`db.r7g.xlarge`, `db.m6i.xlarge`, etc.) | `db.r7g.xlarge` |
| `-t`, `--storage-type` | Storage Type | Storage Volume (`gp3`, `gp2`, `io1`) | `gp3` |
| `-s`, `--storage-gb` | Storage GB | Storage Size in GB | `50` |
| `-d`, `--deployment` | Deployment | Deployment Option (`Multi-AZ` or `Single-AZ`) | `Multi-AZ` |
| `--description` | Description | Custom service description | `RDS Database` |
| `--name` | Estimate Title | Custom title for the estimate summary | `RDS Estimate` |
| `--headed` | Visible Mode | Run browser in headed window mode | `false` |
| `-c`, `--out-csv` | CSV Output | Target export CSV path | `test-results/aws-rds-estimate-YYYY-MM-DD_HH-mm-ss.csv` |
| `-u`, `--out-url` | URL Output | Target share URL text file path | `test-results/aws-rds-url-YYYY-MM-DD_HH-mm-ss.txt` |

---

## 🧪 Running E2E Tests

```bash
# Run full test suite in headless mode
npm test

# Run tests in headed mode (visible browser)
npm run test:headed

# Open interactive Playwright UI Mode
npm run test:ui

# View HTML Test Report
npm run report
```

---

## 🛡️ Code Quality & Security Auditing

This repository enforces strict TypeScript type safety, Playwright best practices, and security rules:

```bash
# 1. TypeScript Type Check (noEmit)
npm run check

# 2. ESLint (with eslint-plugin-playwright & eslint-plugin-security)
npm run lint

# 3. Dependency Vulnerability Audit
npm run audit

# 4. Full Combined Security & Type Check
npm run sec-check
```

---

## 📂 Repository Layout

```
.
├── scripts/
│   └── generate-aws-rds-estimate.ts    # Executable TS CLI generator for AWS RDS Pricing
├── tests/
│   ├── 01-smoke.spec.ts                # Baseline Playwright page initialization
│   ├── 02-locators.spec.ts             # Semantic locator strategies
│   ├── 03-fixtures.spec.ts             # Custom test fixtures
│   ├── 04-auth.spec.ts                 # storageState session cookie persistence
│   ├── 05-debug.spec.ts                # Debugging, pause, screenshots, and trace viewer
│   └── 06-aws-rds-calculator.spec.ts   # E2E spec for AWS RDS PostgreSQL Pricing simulation
├── docs/
│   └── cli.md                          # Playwright CLI commands reference
├── .mcp.json                           # Project-scoped Playwright MCP for Claude Code
├── .agents/mcp_config.json               # Project-scoped Playwright MCP for agy
├── tsconfig.json                       # TypeScript strict compiler config
├── eslint.config.mjs                   # ESLint flat configuration (Playwright + Security)
└── AGENTS.md                           # Canonical context documentation for AI agents
```

---

## 📜 License

[MIT](LICENSE)
