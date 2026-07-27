# PYTHON_APPROACH.md — Implementation Plan for Python AWS RDS Generator

This document outlines the implementation plan for building a Python version of [generate-aws-rds-estimate.ts](file:///home/gs/code/playright-test/scripts/generate-aws-rds-estimate.ts) within this repository using **`uv`**, **`hatchling`**, **`playwright`**, **`typer`**, **`pydantic`**, **`rich`**, **`ruff`**, and **`pyright`**.

---

## 🎯 Architectural Goals

1. **Parity with TypeScript:** Provide 100% equivalent functionality, supporting all CLI arguments (`--engine`, `--region`, `--instance-type`, `--storage-type`, `--storage-gb`, `--deployment`, `--license`, `--edition`, `--headed`, `--out-csv`, `--out-url`).
2. **Modern Python Toolchain:**
   - **`uv`**: Fast package management, environment isolation (`.venv`), and script execution (`uv run`).
   - **`hatchling`**: PEP 517 build backend enabling binary CLI registration (`[project.scripts]`).
   - **`typer` + `pydantic`**: Type-safe CLI options with strict parameter validation and structured data models.
   - **`rich`**: Terminal spinners, colored logs, and formatted console tables.
   - **`ruff` + `pyright`**: Code formatting, linting, and static type checking to mirror `eslint` + `tsc --noEmit`.
3. **Clean Isolation:** Keep all Python dependencies, virtual environments, and configuration inside a dedicated `python/` directory.

---

## 📁 Repository Layout

```text
playright-test/
├── scripts/
│   └── generate-aws-rds-estimate.ts     # Existing TypeScript generator
├── python/                              # Python sub-project workspace
│   ├── .venv/                           # Local virtual environment (git-ignored)
│   ├── pyproject.toml                 # Package dependencies & tool settings
│   ├── generate_aws_rds_estimate.py     # Main Python generator script
│   └── test_estimate.py               # Pytest suite
├── PYTHON_APPROACH.md                   # This implementation plan
├── AGENTS.md                            # Single source of truth for repo
└── package.json                         # NPM scripts (includes estimate:py wrapper)
```

---

## 🛠️ Step-by-Step Implementation Phases

### Phase 1: Environment & Project Scaffolding

1. **Scaffold `python/pyproject.toml`**
   ```toml
   [build-system]
   requires = ["hatchling"]
   build-backend = "hatchling.build"

   [project]
   name = "aws-rds-estimate-python"
   version = "0.1.0"
   description = "Python CLI generator for AWS RDS Pricing Calculator estimates"
   readme = "README.md"
   requires-python = ">=3.10"
   dependencies = [
       "playwright>=1.40.0",
       "pydantic>=2.5.0",
       "typer>=0.9.0",
       "rich>=13.0.0",
   ]

   [project.optional-dependencies]
   dev = [
       "pytest>=8.0.0",
       "pytest-asyncio>=0.23.0",
       "ruff>=0.2.0",
       "pyright>=1.1.350",
   ]

   [project.scripts]
   generate-aws-rds-estimate-py = "generate_aws_rds_estimate:app"

   [tool.ruff]
   line-length = 88
   target-version = "py310"

   [tool.ruff.lint]
   select = ["E", "F", "I", "B", "UP", "S"]
   ```

2. **Update `.gitignore`**
   Add Python build/venv artifacts to `.gitignore`:
   ```gitignore
   # Python & uv
   python/.venv/
   python/dist/
   python/*.egg-info/
   __pycache__/
   .pytest_cache/
   .ruff_cache/
   ```

3. **Install Dependencies**
   - Initialize venv & lockfile: `uv sync --directory python`
   - Install Playwright Chromium binaries: `uv run --directory python playwright install chromium`

---

### Phase 2: Python Generator Implementation (`python/generate_aws_rds_estimate.py`)

1. **Pydantic Validation Models**
   - `RdsEstimateConfig`: Validates `--storage-gb > 0`, region formatting, engine defaults.
   - `RdsEstimateResult`: Data container for scraped costs, timestamped output paths, and share URL.

2. **Typer CLI Options & Rich UX**
   - Define CLI app with flags matching `generate-aws-rds-estimate.ts`.
   - Wrap Playwright execution steps in `rich.console.Console().status(...)` status spinners.

3. **Playwright Async Automation**
   - Navigate to AWS Pricing Calculator.
   - Interact with selectors for Region, Engine, License, Edition, Deployment model, Instance type, and Storage options.
   - Poll for inline validation errors (`"Invalid Selection"`).
   - Export shareable URL and download CSV report.

---

### Phase 3: Testing & Code Quality Enforcement

1. **Linting & Formatting:** `uv run --directory python ruff check . && uv run --directory python ruff format --check .`
2. **Static Type Checking:** `uv run --directory python pyright`
3. **Unit Tests:** `uv run --directory python pytest`

---

### Phase 4: NPM Integration & Documentation

1. **Add `package.json` npm scripts:**
   ```json
   "scripts": {
     "estimate:py": "uv run --directory python generate-aws-rds-estimate-py",
     "check:py": "uv run --directory python ruff check . && uv run --directory python pyright"
   }
   ```
2. **Update `AGENTS.md`** to document Python generator commands alongside TypeScript generator commands.

---

## 🚀 Execution & Verification Commands

```bash
# Run TypeScript Generator
npm run estimate

# Run Python Generator
npm run estimate:py

# Compare CSV output in test-results/
```
