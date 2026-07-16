# EPUB XHTML Validator — Project Summary

## 1. Project Overview

**Purpose:** A browser-based (client-side only, no backend/server) tool for publishers/QC teams to validate the XHTML files inside an unpacked EPUB against a set of typographic, structural, and content-consistency rules (margins, heading styles, punctuation spacing, pagebreak sequencing, broken cross-references, unwanted tags, footnote/table/figure conventions, etc.). It also lets users group files into Front/Body/End Matter buckets, run validation, browse a rule-by-rule report, view an aggregated "Output" summary, inspect a Tag→Class usage index, and (optionally) check pagebreak continuity across an entire EPUB.

**Tech stack:**
- Vanilla HTML/CSS/JavaScript — no build step, no bundler, no npm dependencies, no framework (no React/Vue/etc.).
- Runs entirely in-browser using the File/FileReader APIs (`<input webkitdirectory>`) to read a locally selected folder — nothing is uploaded anywhere.
- Persistence via `localStorage` only (theme preference, bucket assignments/order, rule enable/disable state).
- Six `<script>` tags loaded in dependency order directly in `index.html` (no ES modules/imports).

**Architecture:** A single-page app with a step-based wizard UI (sidebar nav with locked/unlocked steps):
1. **Epub Select** — pick a folder (expects `OPS/xhtml/` and `OPS/styles/` subfolders).
2. **Rules** — enable/disable individual validation rules.
3. **Validation Report** — drag-and-drop bucketing (Front/Body/End/Isolate/Unassigned) then run validation; shows per-file pass/fail/warning cards.
4. **Output** — aggregated rule-centric summary (all/fail/warning filters).
5. **Tag Index** — tag → CSS class usage index across all validated files.
6. **Pagebreak Check** — full-EPUB pagebreak sequence/continuity check (only unlocked if that rule + "Full EPUB" mode is used).

Data flow: `parser.js` (extract data from XHTML/CSS) → `validator.js` (run `rules.js` functions over parsed data) → `reporter.js` (render results to DOM) → `bucketing.js` (pre-validation grouping UI) → `app.js` (glue/event wiring, orchestrates the whole flow).

## 2. Directory Structure

```
validator/
├── index.html              # Single-page app shell; all 6 step panes + modals
├── css/
│   └── style.css           # ~2300 lines; CSS-variable-driven light/dark theme
├── js/
│   ├── rules.js            # ~2066 lines; all validation rule functions + RULES[] registry
│   ├── parser.js           # ~764 lines; XHTML/CSS text parsing (regex-based, no DOM parser)
│   ├── validator.js        # ~103 lines; runs active rules against each parsed file
│   ├── reporter.js         # ~2059 lines; all UI rendering (cards, tables, panels, modals)
│   ├── bucketing.js        # ~292 lines; drag/drop Front/Body/End Matter grouping UI
│   └── app.js               # ~611 lines; entry point, event wiring, orchestration
└── Entity Excel/
    └── Entities List.xlsx  # Reference spreadsheet (likely HTML entity reference; not loaded by the app)
```

Key folders explained:
- **`js/`** — the entire application logic, split by responsibility (parse / validate / render / bucket / wire-up). No subfolders, no module system — all files rely on global functions/variables being defined by load order in `index.html`.
- **`css/`** — single stylesheet using CSS custom properties for theming, driven by a `data-theme` attribute on `<html>`.
- **`Entity Excel/`** — a standalone reference file, not referenced anywhere in code; appears to be supporting documentation/reference material for whoever configures validation rules (e.g., special character/entity mapping), not consumed by the app at runtime.

## 3. Core Files and Their Roles

| File | Role |
|---|---|
| `index.html` | Defines the full DOM: sidebar nav, 6 tab panes (`tabEpubSelect`, `tabRules`, `tabReport`, `tabOutput`, `tabTagclass`, `tabPagebreak`), and several modals (CSS detail modal, copyright-file warning modal, rule detail modal, output sidebar, pagebreak count modal). Loads scripts in strict dependency order: `rules.js` → `parser.js` → `validator.js` → `reporter.js` → `bucketing.js` → `app.js`. |
| `js/parser.js` | Pure functions that take raw XHTML/CSS text and extract structured data: first tag after `<body>`, headings, all tags, tag sequences, text-content issues (double spaces, tabs, capitalization, punctuation, hyphens), pagebreak markers (numeric or Roman numeral), table/figure image blocks, footnote/cross-reference IDs and hrefs, CSS class usage, unwanted/empty/unclosed tags, trailing whitespace, and stylesheet declarations (`parseStylesheet`, `lookupCssBlock`). Also `findEpubFiles()` locates `OPS/xhtml/*.xhtml` and the stylesheet in the selected `FileList`. |
| `js/rules.js` | Defines ~28 rule functions (`ruleFirstTagMarginTop`, `ruleFmtitleMargins`, `ruleHeadingStyles`, `ruleFootnoteClasses`, `ruleH1AuthorH2/P`, `ruleH1H2/P`, `ruleCopyrightFontSize`, `ruleDoubleSpace`, `ruleTabSpace`, `ruleCapitalAfterP`, `ruleEndPunctuation`, `ruleAmpersand`, `ruleHyphenSpace`, `ruleNumberHyphen`, `ruleTrailingSpace`, `ruleSpaceAfterOpen/BeforeClose`, `ruleDotAfterClose`, `ruleSuperscriptLink`, `rulePagebreakCheck` + `rulePagebreakCheckFullEpub`, `ruleTableImage`, `ruleReferenceCheck`, `ruleCssClassCheck`, `ruleFigureImage`, `ruleCrossRefLink`, `ruleUnwantedTag`), each returning a `{ name, label, pass, ...details, reason }` object. All rules are registered in the `RULES` array at the bottom of the file. Adding a new rule = write a function + add it to `RULES`. |
| `js/validator.js` | `validateFile(fileData)` runs every *active* rule (filtered against `getActiveRuleNames()`) over one parsed file and aggregates pass/fail/warning status plus all rule-specific row data into one result object. `validateAll(parsedFiles)` maps this over all files. |
| `js/reporter.js` | All rendering logic: summary card, per-file result cards with collapsible rule tables, pagebreak order chip visualization, rule enable/disable manager UI, status/matter/search filtering, Output tab panel (rule-centric grouped view), Tag→Class index panel, Pagebreak full-EPUB panel, CSS/rule detail modals, output sidebar. Holds UI state (`currentResults`, `activeFilters`, `statusFilter`, `searchTerm`, `lastParsedFiles`). |
| `js/bucketing.js` | Drag-and-drop UI to assign each XHTML file to Front/Body/End/Isolate/Unassigned zones before validation, with per-folder persistence in `localStorage`, auto-detection of body-matter files via numeric filename suffix, and zone reordering. |
| `js/app.js` | Application entry point: theme toggle, tab-switching/locking logic, folder picker wiring, rule enable/disable buttons, the main `executeValidation()`/`runValidation()` orchestration (calls parser → validator → reporter), copyright-file presence check with a confirmation modal, pagebreak-count modal flow, full-EPUB pagebreak stitching logic, and a custom cursor tooltip system. |
| `css/style.css` | Theming (CSS variables for light/dark via `[data-theme]`), layout for the sidebar/wizard shell, cards, chips, modals, badges, filter bars. |

## 4. Dependencies

**None.** This is a dependency-free vanilla JS project:
- No `package.json`, no `node_modules`, no npm/yarn/pnpm lockfile.
- No CDN-loaded libraries in `index.html` (no jQuery, no framework, no icon library — icons are inline SVG/HTML entities).
- No build tooling (no Webpack/Vite/bundler config).
- Runs by opening `index.html` directly in a browser (or serving statically) — relies on browser support for `<input webkitdirectory>` (Chromium-based browsers primarily; not standard/cross-browser guaranteed).

## 5. Entry Points and Main Flows

**Entry point:** `index.html`, loaded directly in a browser. All logic bootstraps via script execution order + `switchTab('epubSelect')` at the bottom of `app.js`.

**Main flow:**
1. User selects a folder via `uploadZone` click or drag-drop → `folderInput` (`webkitdirectory`) fires `change`.
2. `findEpubFiles()` (parser.js) filters the `FileList` for `OPS/xhtml/*.xhtml` files and the stylesheet.
3. `initBucketing()` (bucketing.js) sets up the drag/drop grouping UI, restoring any saved assignment from `localStorage`.
4. User proceeds to **Rules** tab, toggles rules on/off via `renderRulesManager()` (reporter.js), state persisted via `setRuleEnabled`/`isRuleEnabled`.
5. User proceeds to **Report** tab, assigns files to matter buckets (or clicks "Skip grouping / validate all"), then clicks **Run Validation** → `executeValidation()` (app.js):
   - Copyright.xhtml presence check (if any Front Matter files exist) with confirm/cancel modal.
   - If `pagebreakCheck` rule is active, prompts for expected page count + "Full EPUB" mode via `showPagebreakModal()`.
   - Calls `runValidation(selectedFileList)`: reads + parses every XHTML file (parser.js functions), parses the stylesheet, sorts files by matter order, filters out "isolate" files, and calls `validateAll()` (validator.js).
   - `renderReport(results)` (reporter.js) renders the summary card and result cards.
   - If "Full EPUB" pagebreak mode was chosen, stitches all files' pagebreak sequences together in reading order and opens the **Pagebreak Check** tab (`buildPagebreakPanel`).
6. User can revalidate (`revalidateBtn`), inspect **Output** (rule-centric aggregated view, `populateOutputPanel`) and **Tag Index** (`renderTagClassPanel`) tabs, which unlock after the first successful validation.

## 6. Key Functions / "APIs" Exposed (all global, in-browser — not a network API)

- **Parsing:** `findEpubFiles`, `readFileAsText`, `parseXhtmlFirstTag`, `parseXhtmlHeadings`, `parseXhtmlAllTags`, `parseXhtmlTagSequence`, `parseStylesheet`, `lookupCssBlock`, `parseTextContent`, `parseUnwantedTags`, `parseCrossRefs`, `parseFigureBlocks`, `parseCssClassUsage`, `parseReferences`, `parseTableImages`, `parsePagebreaks`, `parseSuperscripts`, `parseDotAfterClose`, `parseTrailingSpace`, `parseXhtmlTitle`.
- **Validation:** `validateFile`, `validateAll`, and the 28 `rule*` functions in `rules.js` (registered via the `RULES` array).
- **Reporting/UI:** `renderReport`, `renderSummary`, `buildRuleTable`, `createResultCard`, `renderCardList`, `populateOutputPanel`, `renderTagClassPanel`, `buildPagebreakPanel`, `showRuleDetail`, `openCssModal`.
- **Bucketing:** `initBucketing`, `getMatterType`, `rebuildBucketOrder`, `renderBucketZones`.
- **Orchestration:** `runValidation`, `executeValidation`, `switchTab`, `applyTheme`.

## 7. Config Files and Environment Variables

- **None.** There is no `.env`, no config JSON, no server, no environment variables of any kind.
- The only "configuration" is runtime, user-driven, and persisted client-side in `localStorage` under keys like:
  - `theme` — light/dark preference.
  - `epubValidator.bucketing.<folderName>` — file → matter-type assignment.
  - `epubValidator.bucketOrder.<folderName>` — per-zone file ordering.
  - Rule enable/disable state (via `setRuleEnabled`/`getRuleStates` in reporter.js).
- Expected **input folder structure** (a convention, not a config file) is `<EpubRoot>/OPS/xhtml/*.xhtml` and `<EpubRoot>/OPS/styles/*.css`; the copyright check specifically looks for `OPS/xhtml/Copyright.xhtml`.

## 8. Notable / Unusual Points

- **No build step or package manager whatsoever** — genuinely just static files; unusual for a project of this size (~8,600 lines across HTML/CSS/JS).
- **Regex-based XHTML parsing**, not a DOM parser (`DOMParser`) — all tag/class/attribute extraction in `parser.js` uses hand-written regular expressions operating on raw text. This is fragile against edge cases (malformed markup, unusual whitespace, nested comments) but avoids DOM parser quirks/namespace issues with XHTML.
- **All processing is 100% client-side/local** — files never leave the browser; no server, no telemetry, no network calls at all. Good for privacy/security since it may handle pre-release publishing content.
- **`webkitdirectory` dependency** — folder selection relies on a non-standard (though widely supported in Chromium browsers) API; Firefox/Safari support is inconsistent, which may limit cross-browser usage.
- **Global-script architecture with implicit load-order dependencies** — no `import`/`export`, so `index.html`'s `<script>` ordering (`rules.js` → `parser.js` → `validator.js` → `reporter.js` → `bucketing.js` → `app.js`) is load-bearing; reordering would break things silently (e.g., `RULES` must exist before `validator.js` runs).
- **Extensibility is explicitly documented in comments**: `rules.js` states that adding a new validation rule only requires writing a function of a specific shape and adding it to the `RULES` array — validator.js and reporter.js auto-adapt (new report columns appear automatically).
- **Full-EPUB pagebreak stitching logic** (in `app.js`/`rules.js`) is notably more complex than other rules — it merges pagebreak sequences across all files in bucket order, auto-detects Roman-numeral vs numeric pagination, and sorts files accordingly before checking global continuity.
- **Custom cursor tooltip system** in `app.js` (mousemove-driven contextual tooltip) is a distinctive, non-essential UX flourish that adds noticeable code complexity for a QC tool.
- **`Entity Excel/Entities List.xlsx`** sits in the repo but is not referenced by any code — likely a manual reference doc for whoever authors/extends the punctuation/entity-related rules (e.g., ampersand, en-dash/hyphen rules), worth clarifying with the project owner if still needed.
- **Copyright file naming is enforced strictly** (`Copyright.xhtml`, exact case) with a dedicated wrong-case detection and confirmation modal — reflects a specific publisher QC convention baked into the tool.
