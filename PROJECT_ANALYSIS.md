# EPUB XHTML Validator — Project Analysis

## 1. Project Overview & Purpose

A **browser-only, client-side QC tool** for publishers/EPUB production teams. It validates the unpacked XHTML files of an EPUB against 32 typographic/structural/content rules (margins, heading styles, spacing, punctuation, pagebreak sequencing, broken cross-references, footnote/table/figure conventions, image naming, stylesheet link presence, anchor text display, title consistency, etc.), lets the user group chapters into Front/Body/End Matter, run validation, browse a per-file report, view an aggregated rule-centric "Output" panel, inspect a Tag→Class usage index, and optionally check pagebreak continuity across an entire EPUB.

No files ever leave the browser — everything is read via the File/FileReader API from a locally selected folder. There is no backend, no build step, and no package manager.

## 2. File Structure Tree

```
validator/
├── index.html                    # Single-page shell: sidebar nav, 6 step panes, 5 modals
├── config.json                   # Developer-level rule on/off switches (wins over localStorage)
├── project-summary.md            # Pre-existing internal architecture summary
├── css/
│   └── style.css                 # ~2441 lines — CSS-variable light/dark theme, full component styling
├── js/
│   ├── rules.js                  # ~2272 lines — 32 rule functions + RULES[] registry
│   ├── parser.js                 # ~828 lines — regex-based XHTML/CSS text extraction
│   ├── validator.js              # ~110 lines — runs active rules over parsed files
│   ├── reporter.js                # ~2206 lines — all DOM rendering (cards, tables, panels, modals)
│   ├── bucketing.js              # ~292 lines — drag/drop Front/Body/End Matter grouping UI
│   └── app.js                    # ~751 lines — entry point, event wiring, orchestration, cursor FX
└── Entity Excel/
    └── Entities List.xlsx        # Reference spreadsheet, not loaded by the app
```

Script load order in `index.html` is load-bearing (no ES modules): `rules.js → parser.js → validator.js → reporter.js → bucketing.js → app.js`.

## 3. Features & Functionality Breakdown

The UI is a 6-step wizard, gated by sidebar locks that unlock progressively:

1. **Epub Select (01)** — folder picker (`<input webkitdirectory>`) or drag-drop fallback; expects `OPS/xhtml/` and `OPS/styles/` subfolders.
2. **Rules (02)** — enable/disable each of the 32 rules individually (persisted in `localStorage`); developer `config.json` can permanently strip rules from the UI entirely.
3. **Validation Report (03)** — drag-and-drop bucketing of files into Front/Body/End/Isolate/Unassigned zones (auto-detects body matter via `_NNNN.xhtml` filename suffix), then "Run Validation" or "Skip grouping". Shows a summary card (total/pass/fail/warning + per-matter breakdown) and a collapsible, filterable/searchable card list per file.
4. **Output (04)** — same results reorganized rule-centric (file → list of rule outcomes), with All/Fail/Warning filters and click-to-expand detail modal.
5. **Tag Index (05)** — aggregated tag→class usage index across all validated files, click a class name to view its raw CSS block.
6. **Pagebreak Check (06)** — only unlocked when "Full EPUB" pagebreak mode is chosen; stitches every file's pagebreak markers in bucket order and validates global continuity (handles mixed Roman/numeric pagination independently).

Supporting features:
- **Copyright.xhtml presence check** — if any Front Matter files exist, warns (with proceed/cancel modal) if `OPS/xhtml/Copyright.xhtml` is missing or wrong-case.
- **Light/dark theme** toggle, persisted in `localStorage`.
- **Custom cursor + contextual tooltip** system (mousemove-driven, shows context-aware labels over badges/buttons/chips).
- **Revalidate** button to re-run without reselecting the folder.

## 4. Tech Stack

- **Vanilla HTML/CSS/JavaScript** — zero dependencies, zero build tooling.
- No `package.json`, no npm/yarn, no bundler, no framework, no icon library (inline SVG/HTML entities only).
- Browser APIs used: `File`/`FileReader`, `<input webkitdirectory>` (Chromium-centric, not universally supported), `localStorage`, HTML5 Drag-and-Drop API.
- Styling via CSS custom properties (`:root` / `[data-theme="dark"]`) — no preprocessor.

## 5. Key Functions / Modules Explained

### `parser.js` — text-extraction layer (regex-based, not `DOMParser`)
- `findEpubFiles(fileList)` — filters the selected `FileList` for `OPS/xhtml/*.xhtml` and the stylesheet under `OPS/styles/*.css`.
- `parseXhtmlFirstTag`, `parseXhtmlHeadings`, `parseXhtmlAllTags`, `parseXhtmlTagSequence` — extract the first body tag, h2–h5 headings, every tag+class+id, and the full tag sequence (used for h1→h2/p pattern matching).
- `parseTextContent` — single-pass extractor for double-space, tab-space, capital-after-`<p>`, end-punctuation, `&&`, hyphen-space, and number-hyphen-number hits, plus delegates to `scanTagSpacingHits` for space-after-open/before-close tag checks.
- `parseStylesheet(cssText)` — builds a `{ "tag.class" or "class": { prop: value } }` lookup map (`cssRules`) plus a parallel `cssBlocks` map holding the raw CSS text for display/modal purposes. Tag-qualified keys prevent `h1.fmtitle` colliding with `h4.fmtitle`.
- `parseUnwantedTags` — stack-based scan for orphan closing tags, empty tags, and unclosed tags (skips self-closing/table/structural tags).
- `parseCrossRefs`, `parseReferences`, `parseSuperscripts`, `parseFigureBlocks`, `parseTableImages`, `parsePagebreaks`, `parseCssClassUsage`, `parseImageSrcs`, `parseDotAfterClose`, `parseTrailingSpace`, `parseXhtmlTitle` — each backs one specific rule.
- `romanToInt` / pagebreak mode detection (`numeric`/`roman`/`mixed`) support both numbering schemes.

### `rules.js` — 32 rule functions, registered in the `RULES` array
Each rule takes `(fileData, cssRules)` and returns `{ name, label, pass, notApplicable?, warning?, ...rows, reason }`. Categories:
- **Margin/typography rules**: `firstTagMarginTop`, `fmtitleMargins`, `headingStyles` (h2–h5), `footnoteClasses`, `copyrightFontSize`, and 4 heading-sequence rules (`h1AuthorH2`, `h1AuthorP`, `h1H2`, `h1P`) that pattern-match consecutive tag sequences and check margin combinations.
- **Text-content rules**: `doubleSpace`, `tabSpace`, `capitalAfterP`, `endPunctuation`, `ampersand`, `hyphenSpace` (off by default), `numberHyphen` (warning-only, off by default), `trailingSpace`, `spaceAfterOpen`, `spaceBeforeClose`, `dotAfterClose`.
- **Link/reference rules**: `superscriptLink`, `referenceCheck` (ref id/href round-trip), `crossRefLink` (figure/table/chapter mentions must be `<a href>`-wrapped), `anchorTextDisplay` (informational — lists anchor tags found, always passes, `notApplicable` if none).
- **Structural rules**: `pagebreakCheck` (+ `rulePagebreakCheckFullEpub` variant for cross-file stitched validation), `tableImage`, `figureImage`, `cssClassCheck`, `unwantedTag`, `imageNameCheck` (filename pattern + sequential numbering).
- **Head/metadata rules**: `stylesheetLinkCheck` (fails if `<link>` to stylesheet missing/wrong from `<head>`), `titleConsistencyCheck` (fails if `<title>` empty/missing, warns if it differs from the expected filename-derived title, off by default in `config.json`).

Extensibility is explicit: adding a rule = write a function of this shape + push it into `RULES`; `validator.js`/`reporter.js` auto-adapt without further changes.

### `validator.js`
- `validateFile(fileData)` — runs every rule whose name is in `getActiveRuleNames()` (config.json ∩ localStorage-enabled), aggregates `pass`/`warning` flags into an overall `status` (`PASS`/`WARNING`/`FAIL`), and normalizes every rule's optional row arrays into one consistent result shape.
- `validateAll(parsedFiles)` — maps `validateFile` over every file.

### `reporter.js` — all rendering
- `renderReport(results)` — top-level render entry: summary, card list, output sidebar/panel, tag index, unlocks Output/Tag Index nav tabs.
- `buildRuleTable(result)` — the single largest function; a big `if/else` chain producing a different mini-table layout per rule name (heading rows, h1-sequence sub-rows, pagebreak chip visualization, table/figure image rows, etc.).
- `renderRulesManager()` — builds the Rules-tab toggle cards from the static `QC_RULES` metadata array (label/applies/checks text — separate from the `RULES` functions array in `rules.js`).
- `populateOutputPanel`, `buildPagebreakPanel`, `renderTagClassPanel`, `buildTagClassIndex` — the three secondary tab renderers.
- `escapeHtml` — DOM-based sanitization used everywhere user/file content is interpolated into `innerHTML`.

### `bucketing.js`
- `initBucketing`, `rebuildBucketOrder`, `renderBucketZones`, `createFileChip`, drag handlers — implements the 5-zone (unassigned/front/body/end/isolate) drag-and-drop grouping with per-folder `localStorage` persistence and numeric auto-sort for detected body-matter files (`bodyMatterSequenceNumber`).

### `app.js`
- `loadRuleConfig()` — fetches `config.json` at startup and strips any rule set to `false` from the `RULES` array entirely (permanent, developer-level override).
- `switchTab`, nav lock/unlock wiring — the wizard state machine.
- `executeValidation()` / `runValidation(fileList)` — orchestrates: copyright check → pagebreak modal (if rule active) → parse every file → parse stylesheet → sort by matter order → filter out "isolate" files → `validateAll()` → render → (optionally) stitch full-EPUB pagebreak data and open tab 06.
- `checkCopyrightFile`, `showPagebreakModal`, `showCopyrightModal` — Promise-wrapped modal flows.
- Custom cursor tooltip block (`mousemove` listener with a long context-detection `if/else` chain).

## 6. UI Components & Flow

```
Folder select ──▶ Rules config ──▶ Bucket assignment ──▶ Run Validation
                                                              │
                          ┌───────────────────────────────────┤
                          ▼                                   ▼
                 Validation Report (03)              (if Full EPUB pagebreak)
                 per-file collapsible cards           Pagebreak Check (06)
                          │
              ┌───────────┼───────────┐
              ▼           ▼
        Output (04)  Tag Index (05)
     rule-centric    tag→class usage
        view
```

- **State**: plain global `let` variables (`selectedFileList`, `bucketAssignments`, `currentResults`, `activeFilters`, etc.) — no framework state management.
- **Persistence**: `localStorage` keys — `theme`, `epubValidator.bucketing.<folder>`, `epubValidator.bucketOrder.<folder>`, `epubValidator.rulesEnabled`, `epubValidator.pagebreakCount`.
- **Modals**: CSS-block viewer, copyright warning, rule-detail (Output tab), pagebreak-count prompt — all plain `hidden`-attribute overlays with `Promise`-based confirm/cancel flows.

## 7. Validation Logic Summary

For each XHTML file, `runValidation()` extracts a rich `fileData` object (tags, headings, text-content hit lists, pagebreak markers, image srcs, reference ids, CSS class usage, etc.) plus a shared `cssRules`/`cssBlocks` map parsed once from the stylesheet. Every active rule receives `(fileData, cssRules)` and independently decides pass/fail/notApplicable/warning; `validateFile` folds these into one overall status per file (`FAIL` > `WARNING` > `PASS`). Matter-type-scoped rules (`endPunctuation`, `superscriptLink`, `tableImage`, `figureImage`, `imageNameCheck`, `fmtitleMargins`, `copyrightFontSize`) self-report `notApplicable: true` when run against a non-matching bucket rather than being skipped externally — filtering happens per-rule, not per-file.

Pagebreak validation is the most complex path: it supports numeric or Roman-numeral pagebreak ids, single-file or "Full EPUB" (bucket-ordered, cross-file stitched) modes, and validates total count + gapless consecutive series + strict ordering independently per numbering type.

## 8. Dependencies

**None.** No `package.json`, no CDN scripts, no build tooling. Runs by opening `index.html` directly or serving it statically. The only external "dependency" is browser support for `webkitdirectory`, which is solid in Chromium-based browsers but inconsistent elsewhere.

## 9. Known Issues / Improvement Suggestions

- **Regex-based markup parsing** (`parser.js`) instead of `DOMParser` — fast and avoids XHTML-namespace parser quirks, but fragile against malformed markup, nested/odd comments, or attributes containing `<`/`>` characters. A `DOMParser`-based rewrite would be more robust but is a nontrivial change given how many rules depend on the current regex-extracted shapes.
- **`webkitdirectory` browser lock-in** — no fallback for Firefox/Safari users; worth a documented browser-support note or a File System Access API alternative.
- **Two parallel rule metadata sources**: `RULES` (functions, `rules.js`) and `QC_RULES` (display metadata, `reporter.js`) must be kept in sync by hand — adding a rule requires touching both files even though the code comments in `rules.js` claim only one addition is needed. Worth consolidating (e.g. attach `label`/`applies`/`checks` directly to each rule function).
- **`buildRuleTable` in reporter.js** is a ~800-line single function with a long `if (r.name === ...)` chain — a lookup-table of renderer functions keyed by rule name would reduce cyclomatic complexity and make adding new rule UIs safer.
- **`showRuleDetail`** duplicates a large chunk of the same per-rule-type row rendering already done in `buildRuleTable`/`buildSimpleTable` — could share a single row-formatting layer.
- **Global mutable state** (`bucketAssignments`, `currentResults`, `window.expectedPageCount`, `window.fullEpubPagebreak`, etc.) spread across files with implicit script-load-order coupling — normal for a no-build vanilla project, but any future refactor toward modules would need to make these dependencies explicit.
- **`Entity Excel/Entities List.xlsx`** is unreferenced by any code — confirm with the project owner whether it's still needed or can be removed/documented as a manual reference.
- **`parseTrailingSpace`** function body has a redundant/confusing double-ternary (`afterHtml.length > 0 && /\S/.test(afterHtml) === false ? afterHtml.length > 0 : /[\s\S]/.test(afterHtml)`) that always simplifies to `afterHtml.length > 0` — dead complexity worth cleaning up.
- **No automated tests** — all 32 rules and the parsing layer are validated manually; given the regex-heavy parsing, unit tests around `parser.js` edge cases (self-closing tags, nested classes, comment handling) would catch regressions cheaply.

## 10. Code Quality Observations

- **Consistent rule-function contract** — every rule returns the same result shape (`name`, `label`, `pass`, `notApplicable`, `reason`, plus rule-specific `*Rows` arrays), which is what makes the auto-adapting report/column system in `validator.js`/`reporter.js` work well. This is a genuinely good extensibility pattern for a no-framework codebase.
- **Good separation of concerns** despite no module system: parsing, rule logic, orchestration, and rendering are cleanly split into their own files even though everything shares the global scope.
- **`escapeHtml` used consistently** wherever file/user content is interpolated into `innerHTML`, avoiding the most obvious XSS vector — appropriate given content originates from user-selected local files.
- **CSS uses design tokens throughout** (`--bg-surface`, `--accent`, `--fail`, etc.) with a clean dark-mode override block — theming is centralized and consistent.
- **Comments are used purposefully** — explaining *why* (e.g. the tag-qualified CSS key rationale in `parseStylesheet`, the roman/numeric independence in pagebreak validation) rather than restating code.
- **Some duplication** in the four `h1*` sequence rules (`ruleH1AuthorH2`, `ruleH1AuthorP`, `ruleH1H2`, `ruleH1P`) — near-identical scenario-scanning and margin-pass logic repeated four times with minor variations; a shared helper parameterized by expected margins/tag sequence would cut ~150 lines.
- **Long files** (`rules.js` ~2272 lines, `reporter.js` ~2206 lines) are large for a single file but remain navigable due to consistent per-rule/per-section structuring and clear comment banners.

## 11. Rules Registry (all 32)

| Rule (`name`) | Checks | Fail condition |
|---|---|---|
| `firstTagMarginTop` | First body tag's top margin | Margin doesn't match expected CSS value for that tag/class |
| `fmtitleMargins` | `.fmtitle` class margins (Front Matter only) | Margin-top/bottom mismatch vs. CSS; `notApplicable` outside Front Matter |
| `headingStyles` | h2–h5 styling consistency | Heading class/margin doesn't match its CSS rule |
| `footnoteClasses` | Footnote paragraph classes | Class missing/incorrect on footnote-marked paragraphs |
| `h1AuthorH2` / `h1AuthorP` / `h1H2` / `h1P` | Consecutive tag-sequence + margin combos after `<h1>` | Sequence present but margins don't match expected pattern |
| `copyrightFontSize` | Font size on `Copyright.xhtml` (End/Front Matter only) | Font-size doesn't match required value; `notApplicable` elsewhere |
| `doubleSpace` | Two-or-more consecutive spaces in text | Any hit found |
| `tabSpace` | Literal tab characters in text | Any hit found |
| `capitalAfterP` | First letter after `<p>` is capitalized | Lowercase first letter found |
| `endPunctuation` | Paragraphs end with terminal punctuation (Body Matter) | Missing terminal punctuation; `notApplicable` outside Body |
| `ampersand` | Literal `&&` in text | Any hit found |
| `hyphenSpace` (off by default) | Hyphen surrounded by spaces | Any hit found |
| `numberHyphen` (warning-only, off by default) | `number-hyphen-number` patterns | Warns, never fails |
| `trailingSpace` | Trailing whitespace before closing tags | Any hit found |
| `spaceAfterOpen` / `spaceBeforeClose` | Space immediately after `<tag>` / before `</tag>` | Any hit found |
| `dotAfterClose` | Stray `.` immediately after a closing tag | Any hit found |
| `superscriptLink` | Superscript footnote markers wrapped in `<a>` (Body Matter) | Superscript without link; `notApplicable` outside Body |
| `referenceCheck` | Footnote/reference id ↔ href round-trip | Orphan id or href with no matching target |
| `crossRefLink` | Figure/table/chapter mentions in text are `<a href>`-wrapped | Plain-text mention without a link |
| `pagebreakCheck` / `rulePagebreakCheckFullEpub` | Pagebreak id sequencing (single file / stitched across bucket order) | Gap, duplicate, or out-of-order id in numeric or Roman series |
| `tableImage` | Table images have required wrapper/class (Body Matter) | Missing wrapper/class; `notApplicable` outside Body |
| `cssClassCheck` | Every class used in markup exists in the stylesheet | Class used in XHTML but not defined in CSS |
| `figureImage` | Figure images have required wrapper/class (Body Matter) | Missing wrapper/class; `notApplicable` outside Body |
| `unwantedTag` | Orphan closing tags, empty tags, unclosed tags | Any structural mismatch found |
| `imageNameCheck` | Image filename pattern + sequential numbering (Body Matter) | Filename doesn't match pattern or breaks sequence; `notApplicable` outside Body |
| `anchorTextDisplay` | Informational — lists all `<a>` anchor texts found | Never fails; `notApplicable` if no anchors in file |
| `stylesheetLinkCheck` | `<link>` to stylesheet present in `<head>` | Missing, or points to wrong file |
| `titleConsistencyCheck` (off by default) | `<title>` present and matches expected value | Empty/missing `<title>` = FAIL; mismatched title = WARNING |

## 12. Config System

`config.json` (`{ "rules": { "<ruleName>": true/false } }`) is fetched once at startup by `loadRuleConfig()` in `app.js`. Any rule explicitly set to `false` is **spliced out of the `RULES` array entirely** — it never appears in the Rules (02) tab and can't be re-enabled by the user, even via localStorage. This is a developer/deployment-level override, one level above the per-user toggle.

Currently disabled by default in `config.json`: `hyphenSpace`, `numberHyphen`, `titleConsistencyCheck`.

The Rules (02) tab then lets the user toggle any *remaining* (config-enabled) rule on/off, persisted to `localStorage['epubValidator.rulesEnabled']`. `getActiveRuleNames()` (used by `validator.js`) is effectively the intersection of `config.json`-enabled ∩ user-enabled rules.

## 13. localStorage Usage

| Key | Purpose |
|---|---|
| `theme` | Light/dark theme preference |
| `epubValidator.rulesEnabled` | Per-user rule on/off state (JSON map), scoped by config.json's allowed rule set |
| `epubValidator.bucketing.<folder>` | Front/Body/End/Isolate bucket assignment per selected folder name |
| `epubValidator.bucketOrder.<folder>` | Explicit ordering within each bucket, per folder |
| `epubValidator.pagebreakCount` | Last-entered expected pagebreak count (prompt convenience) |

Folder-scoped keys use the selected directory name as part of the key, so switching folders doesn't clobber another project's bucket layout.

## 14. Known Quirks / Gotchas

- Rule count has grown from 29 → 32 across recent commits (`stylesheetLinkCheck`, `anchorTextDisplay`, `titleConsistencyCheck` added; `numberHyphen` turned off by default per commit `dbd4804`).
- `titleConsistencyCheck` ships **off** in `config.json` — don't assume it runs by default when debugging title-related reports.
- `anchorTextDisplay` always `pass: true` — it's a display/inventory rule, not a real QC gate; don't expect it to ever fail a file.
- Matter-scoped rules self-report `notApplicable` rather than being filtered out — a rule showing up as "N/A" in a report is expected behavior for the wrong bucket type, not a bug.
- `config.json`-disabled rules are invisible in the UI entirely (not just unchecked) — if a rule seems to be "missing" from the Rules tab, check `config.json` before assuming a code bug.
- Script load order in `index.html` is load-bearing — no ES modules, no bundler, so `rules.js` must load before `parser.js`/`validator.js`/`reporter.js`, which must load before `app.js`.
- `webkitdirectory` is Chromium-only; Firefox/Safari users get degraded/no folder-picker support.

## 15. How to Run

**Do not open `index.html` via `file://`** — `fetch('config.json')` and some File/FileReader flows are blocked or unreliable under the `file://` origin in most browsers.

Serve the folder over HTTP instead:

```
python -m http.server 8000
```

Then open `http://localhost:8000/` in a Chromium-based browser (Chrome/Edge) for full `webkitdirectory` folder-picker support.
