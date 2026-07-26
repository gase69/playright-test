# Playwright CLI Reference & Exercises

This document provides a hands-on reference for the Playwright CLI (`npx playwright`).

## 1. Codegen (Record Test Script)
Generate automated test code as you interact with a web page in the browser.

```bash
npx playwright codegen https://demo.playwright.dev/todomvc/
```

*Output can be copied directly into a `.spec.ts` file in `tests/recorded/`.*

---

## 2. Playwright Inspector & Locator Picker
Open a site with the interactive Playwright Inspector to inspect element locators.

```bash
npx playwright open https://example.com
```

---

## 3. Screenshots & PDF Generation
Capture full-page screenshots or render PDFs directly from the command line:

```bash
# Capture full page PNG screenshot
npx playwright screenshot --full-page https://example.com example-full.png

# Render page as PDF (Chromium only)
npx playwright pdf https://example.com output.pdf
```

---

## 4. Viewing Traces
Inspect execution traces recorded from failed test runs:

```bash
npx playwright show-trace trace.zip
```

---

## 5. Browser Binary Management
Check which browsers would be installed or sync browser cache:

```bash
# Dry run to view target browser binaries
npx playwright install --dry-run

# Install or refresh Chromium
npx playwright install chromium
```
