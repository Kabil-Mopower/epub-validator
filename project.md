# EPUB XHTML Validator — Project Documentation

## 1. Project Overview

A client-side, browser-only tool for QC-validating unpacked EPUB XHTML/CSS
files against a publishing house's style-guide rules before final output.
The user selects a local EPUB folder (via `<input webkitdirectory>`),
optionally groups files into Front/Body/End Matter buckets, picks which
validation rules to run, and gets a per-file, per-rule PASS/FAIL/WARNING
report plus an aggregated "Output" summary, a tag→class usage index, and an
optional full-EPUB pagebreak-continuity check. No backend, no build step, no
file ever leaves the browser.

## 2. Tech Stack

- Vanilla JavaScript (ES6+, global scope, no modules), HTML5, CSS3
- Zero frameworks, zero npm dependencies, no build tooling, no `package.json`
- Browser APIs used: `File`/`FileReader`, `<input webkitdirectory>`
  (Chromium-only folder picker), `fetch`, `localStorage`, HTML5 Drag-and-Drop
- CSS: custom properties for light/dark theme (`:root`, `[data-theme="dark"]`),
  no preprocessor

## 3. Project Structure

```
validator/
├── index.html          6-step wizard UI shell + 5 modals
├── config.json          developer-level rule on/off switches
├── project.md            this file
├── css/
│   └── style.css        all styling, light/dark theme
└── js/
    ├── rules.js          validation rule functions + RULES array + QC_RULES metadata
    ├── parser.js          regex-based XHTML/CSS text extraction (parseXxx functions)
    ├── validator.js       runs active rules over parsed files → ruleResults
    ├── reporter.js        all DOM rendering (summary, cards, rule tables, rules manager)
    ├── bucketing.js       drag/drop Front/Body/End Matter grouping UI
    └── app.js             entry point, orchestration, event wiring, runValidation()
```

## 4. Core Modules

### index.html
6 wizard tabs, each unlocked only after the prior step completes:
**Epub Select** (folder picker) → **Rules** (per-rule toggle list) →
**Validation Report** (bucketing UI + summary card + per-file collapsible
cards, filterable by matter/status/search) → **Output** (rule-centric
aggregated view) → **Tag Index** (tag→class usage across all files) →
**Pagebreak Check** (hidden unless "Full EPUB" pagebreak mode was chosen).
Plus modals: CSS-block viewer, copyright-missing warning, rule-detail,
output sidebar, pagebreak count/mode prompt. Script load order (no module
system, everything global): `rules.js` → `parser.js` → `validator.js` →
`reporter.js` → `bucketing.js` → `app.js`.

### js/parser.js
Pure regex-based (not `DOMParser`) extraction layer — no DOM, no state, text
in / structured data out. Key functions:
- `findEpubFiles(fileList)` — filters a FileList into `{xhtmlFiles, stylesheetFile}` via path regex (`/xhtml/*.xhtml`, `/styles/*.css`)
- `readFileAsText(file)` — Promise-wrapped `FileReader`
- `parseXhtmlFirstTag`, `parseXhtmlHeadings`, `parseXhtmlAllTags`, `parseXhtmlTagSequence` — tag-structure extraction after `<body>`
- `parseStylesheet(cssText)` — builds `cssRules` (`"tag.class"` → `{prop: value}`) and `cssBlocks` (raw CSS selector+declaration text) maps
- `lookupCssBlock`, `parseDeclarations` — CSS lookup helpers
- `parseTextContent` — single-pass scan for double-space, tab-space, capital-after-`<p>`, end-punctuation, `&&`, hyphen-space, number-hyphen, space-after-open-tag, space-before-close-tag hits (via `scanTagSpacingHits`)
- `parseUnwantedTags` — stack-based orphan-closing-tag / empty-tag / unclosed-tag detection (skips self-closing, table, and structural tags)
- `parseCrossRefs`, `parseFigureBlocks`, `parseCssClassUsage`, `parseReferences`, `parseTableImages`
- `romanToInt`, `parsePagebreaks` — pagebreak id sequence extraction + roman/numeric/mixed mode detection
- `parseSuperscripts` — `<sup>` link-target validation (two link patterns: wrapping `<a>` or nested `<a>`)
- `parseDotAfterClose`, `parseTrailingSpace`, `parseImageSrcs`, `parseXhtmlTitle`, `parseStylesheetLink`
- `parseAnchorTexts`, `parseCrossFileAnchors` — in-file vs cross-file `<a>` link extraction
- `parseFigureAnchors` — id/href pairs for the bidirectional figure-anchor check
- **`parseTableStructure(text)`** — scans every `<table>...</table>` block and runs 18 structural checks (thead/tbody/tr/td nesting, ordering, emptiness, mismatched closing tags); returns `{ issues: [{type, detail}] }`
- **`parseBoldSpace(text)`** — finds every `<b>...</b>` tag whose content starts with a space; returns `[{context: '<b> ...</b>'}]`
- **`parseListParaCheck(text)`** — per `<ol>`/`<ul>` block: `<p>` outside `<li>`, nested list without `<li>` wrapper, orphan `<li>`, empty `<li>`, empty `<p>` inside `<li>`, unclosed `<li>`

### js/rules.js
One `ruleXxx(fileData, cssRules)` function per rule, each returning
`{name, label, pass, notApplicable?, warning?, reason, ...ruleSpecificRows}`.
Matter-scoped rules (Front/Body/End-Matter-only) self-report
`notApplicable: true` rather than being filtered externally. All rule
functions are collected into the `RULES` array at the bottom of the file
(execution order); `stylesheetLinkCheck` is unshifted to the front. Most
functions also set `ruleXxx.ruleName` so `config.json`/localStorage can key
off a stable identifier.

### js/validator.js
`validateFile(fileData)` filters `RULES` to the active set (already
pre-filtered by `config.json` in `app.js`), runs each rule function, and
normalizes every result into a `ruleResults[]` entry with default fallbacks
(`|| []`, `|| ''`, etc.) for every possible row-array field across every
rule, so `reporter.js` never hits `undefined`. Also aggregates overall file
`status` (`FAIL` > `WARNING` > `PASS`, factoring in title mismatch).
`validateAll(parsedFiles)` maps this over every file.

### js/reporter.js
All DOM rendering for the report UI:
- `renderSummary` — total/pass/fail/warning counts + matter-type breakdown, Expand All/Collapse All
- `buildRuleTable(result)` — large per-rule-name if/else chain rendering each rule's mini-table; this is the single place a new rule's UI must be added
- `createResultCard`, `renderCardList` — collapsible per-file cards, filterable by matter type / PASS-FAIL-WARNING / filename search
- `buildFixedCheckbox` — "Mark as Fixed" checkbox wiring per rule-failure-per-file
- `QC_RULES` — the metadata array (`name, label, applies, checks`) driving both the Rules Manager UI (Step 2) and rule ordering/descriptions in the Output tab — a separate list from `RULES` that must be hand-kept in sync
- `renderRulesManager`, `getActiveRuleNames`, `isRuleEnabled`, `setRuleEnabled`, `isConfigRuleVisible` — rule enable/disable persistence layered: `config.json` (hard kill-switch, always wins) over `localStorage` (`epubValidator.rulesEnabled`, user toggle)
- `escapeHtml` sanitizes all file content before `innerHTML` insertion

### js/bucketing.js
5-zone drag-and-drop grouping UI (`unassigned` / `front` / `body` / `end` /
`isolate`). Auto-detects body matter via numeric filename suffix
(`..._0004.xhtml`). Persists `bucketAssignments` and `bucketOrder` per
folder name in localStorage. `getMatterType(fileName)` is the lookup used by
matter-scoped rules (e.g. `fmtitleMargins`, `copyrightFontSize`,
`superscriptLink`, `endPunctuation`, `tableImage`, `figureImage`,
`imageNameCheck` are body/front-matter-only). Files bucketed to `isolate`
are dropped entirely before validation runs.

### js/app.js
Entry point / orchestration:
- Theme toggle, `switchTab` (lock-gated sidebar nav — each tab unlocks only after the prior step)
- Folder picker wiring, Copyright.xhtml existence/case check with modal prompt before validating
- `loadRuleConfig()` — fetches `config.json`, permanently splices disabled rules out of `RULES`
- `showPagebreakModal` — page-count input + "Full EPUB" continuity-mode checkbox
- `runValidation(fileList)` — the core pipeline: finds files → parses stylesheet → loops every XHTML file calling every `parseXxx` function → assembles `parsedFiles[]` → sorts by matter order → drops `isolate` files → computes title-consistency's majority-vote `expectedTitle` → calls `validateAll` → strips `pagebreakCheck` rows if Full-EPUB mode is on (shown in the dedicated Pagebreak tab instead) → returns results
- `executeValidation()` — UI wrapper (button disable/enable, status messages, clears "Mark as Fixed" state from the previous run, triggers Full-EPUB pagebreak panel)
- "Mark as Fixed" checkbox persistence (`localStorage` keys `fixed_<fileName>_<ruleName>`), with a dynamically-inserted "Clear All Fixed" button
- Custom cursor/tooltip system — context-aware hover text over badges, chips, nav items, buttons

### css/style.css
Component styling for sidebar, wizard steps, upload zone, bucketing chips,
result cards, rule mini-tables, modals, tooltip, output/tag-index panels.
Theme-aware via `data-theme` attribute on `<html>`.

## 5. Entry Points and How to Run

Single entry point: `index.html`. No build step. Best served over HTTP (not
`file://`), since `app.js` does `fetch('config.json')` at startup and that
call fails silently (defaulting all rules to enabled) under `file://` in
most browsers:

```
python -m http.server 8000
```

Open `http://localhost:8000/` in a Chromium-based browser (Chrome/Edge
required for `webkitdirectory`; Firefox/Safari have no or degraded
folder-picker support).

Workflow inside the app:
1. **Epub Select** — pick the root folder containing `OPS/xhtml/` and `OPS/styles/`
2. **Rules** — enable/disable individual rules (localStorage-persisted; rules disabled in `config.json` never appear here)
3. **Validation Report** — drag files into Front/Body/End Matter (or "Skip grouping / validate all"), click "Run Validation"
4. **Output** — aggregated summary of every enabled rule's pass/fail across all files
5. **Tag Index** — tag → class usage table across all validated files, click-to-view raw CSS block
6. **Pagebreak Check** (only shown if "Full EPUB" pagebreak mode was chosen) — stitched pagebreak continuity across the whole book in bucket order

## 6. Data Flow (Upload → Report)

```
User selects unpacked EPUB folder (webkitdirectory)
  → findEpubFiles: filters OPS/xhtml/*.xhtml + OPS/styles/*.css   [parser.js]
  → initBucketing(folderName, fileNames)                          [bucketing.js]
      (user drags file chips into Front/Body/End/Isolate, or skips grouping)
  → "Run Validation" click → executeValidation()                  [app.js]
      → Copyright.xhtml presence/case check (modal if missing/misnamed)
      → pagebreak count / Full-EPUB mode prompt (if pagebreakCheck rule active)
      → runValidation(fileList):                                  [app.js]
          → parseStylesheet(cssText) → cssRules, cssBlocks         [parser.js]
          → for each xhtml file, read text and run every parse* function:
              parseXhtmlFirstTag, parseXhtmlHeadings, parseXhtmlAllTags,
              parseXhtmlTagSequence, parseTextContent, parseXhtmlTitle,
              parseDotAfterClose, parseSuperscripts, parsePagebreaks,
              parseTableImages, parseReferences, parseCssClassUsage,
              parseFigureBlocks, parseCrossRefs, parseImageSrcs,
              parseAnchorTexts, parseFigureAnchors, parseCrossFileAnchors,
              parseStylesheetLink, parseUnwantedTags, parseTableStructure,
              parseBoldSpace, parseTrailingSpace
              → pushed into parsedFiles[]
          → sort by matter order (front/body/end/unassigned), drop "isolate" files
          → compute expectedTitle (majority-vote across all files' <title>)
          → validateAll(parsedFiles)                               [validator.js]
              → for each file: validateFile(fileData)
                  → for each fn in RULES: fn(fileData, cssRules) → normalized ruleResults[] entry
                  → aggregate file status (PASS/FAIL/WARNING)
          → strip pagebreakCheck rows if Full-EPUB mode (shown in dedicated tab instead)
      → renderReport(results)                                      [reporter.js]
          → renderSummary(results)
          → renderCardList() → createResultCard() per file → buildRuleTable() per rule
      → (if Full-EPUB pagebreak mode) buildPagebreakPanel(stitched pagebreaks)
```

Input: an already-unpacked EPUB folder (no `.epub` zip parsing). Output:
in-browser rendered report only — nothing written to disk, no export;
`localStorage` persists preferences/progress across sessions (theme, rule
toggles, bucket assignments, "fixed" checkbox states).

## 7. All Validation Rules

| # | name (ruleName) | Label | Applies To | Checks | Pass / Fail Condition |
|---|---|---|---|---|---|
| 0 | `stylesheetLinkCheck` | Stylesheet Link Check | All files | `<link rel="stylesheet" type="text/css" href="../styles/stylesheet.css"/>` present | FAIL if missing or href/rel/type differ from expected |
| 1 | `firstTagMarginTop` | First Tag Margin Top | All matter types | First tag after `<body>` | FAIL if no tag, no class, or `margin-top` ≠ `1em` |
| 2 | `fmtitleMargins` | FM Title Margins | Front Matter only | `fmtitle*` class on first tag | FAIL unless `margin-top: 1em` and `margin-bottom: 2em` |
| 3 | `headingStyles` | Heading Styles | All matter types | Every unique `h2`/`h3`/`h4`/`h5` whose class matches the tag name | FAIL unless margin-top 1em, margin-bottom 0.5em, and font-size per level (h2 130%, h3 120%, h4 110%, h5 100%) |
| 4 | `footnoteClasses` | Footnote Font Size | All matter types | Any tag with class in `footnote, footnote1, footnoteh, footnote2, ref, tsource, tsource1, tsource2` | WARN if not on a `<p>`; FAIL if class not in CSS or `font-size` ≠ `90%` |
| 5 | `h1AuthorH2` | H1 → Author → H2 | All matter types | Sequence `<h1>` → author `<p>` → `<h2>` | FAIL unless h1 (1em/0), author-p (0/2.5em), h2 (0/0.5em) margins match |
| 6 | `h1AuthorP` | H1 → Author → P | All matter types | Sequence `<h1>` → author `<p>` → non-author `<p>` | FAIL unless h1 (1em/0), author-p (0/2.5em), content-p margin-top 0 |
| 7 | `h1H2` | H1 → H2 | All matter types | Sequence `<h1>` → `<h2>` | FAIL unless h1 (1em/2.5em), h2 (0/0.5em) |
| 8 | `h1P` | H1 → P | All matter types | Sequence `<h1>` → non-author `<p>` | FAIL unless h1 (1em/2.5em), p margin-top 0 |
| 9 | `copyrightFontSize` | Copyright Font Size | Front Matter, `Copyright.xhtml` only | Every classed tag in the file | FAIL if class not in CSS or `font-size` ≠ `100%` |
| 10 | `doubleSpace` | Double Space Check | All matter types | Text content | FAIL if any double space `"  "` found |
| 11 | `tabSpace` | Tab Space Check | All matter types | Text content | FAIL if 3+ consecutive spaces found |
| 12 | `capitalAfterP` | Capital Letter Check | All matter types | `<p>` text start | FAIL if any `<p>` starts with a lowercase letter |
| 13 | `endPunctuation` | End Punctuation Check | Body Matter only | Consecutive `<p>` tags (excluding pagebreak paragraphs) | FAIL if a `<p>` doesn't end in `.` or `;` before the next `<p>` |
| 14 | `ampersand` | Entity Ampersand Check | All matter types | Text content | FAIL if `&&` found |
| 15 | `hyphenSpace` | Hyphen Space Check | All matter types (**disabled** in config.json) | Text content | FAIL if `- ` (hyphen + space) found |
| 16 | `numberHyphen` | Number Hyphen Check | All matter types (**disabled** in config.json) | Text content | WARNING (not FAIL) if `\d+-\d+` found — suggests en dash |
| 17 | `trailingSpace` | Trailing Space After HTML | All matter types | Content after `</html>` | FAIL if any characters exist after the closing `</html>` tag |
| 18 | `spaceAfterOpen` | Space After Opening Tag | All matter types | Whitelisted tags (`p, h1-h5, li, dt, dd, title`) | FAIL if tag content starts with a space/tab |
| 19 | `spaceBeforeClose` | Space Before Closing Tag | All matter types | Same whitelist | FAIL if tag content ends with a space/tab |
| 20 | `dotAfterClose` | Dot After Closing Tag | All matter types | `</p>`, `</h1-5>`, `</li>`, `</dt>`, `</dd>`, `</title>` immediately followed by `.` | FAIL if found |
| 21 | `superscriptLink` | Superscript Link Check | Body Matter only | `<sup>` tags | FAIL if not wrapped in `<a href>`, or the href target id doesn't exist in the file |
| 22 | `pagebreakCheck` | Pagebreak Check | All matter types (requires page-count input) | `pagebreak_N` anchor ids | FAIL if count ≠ expected, series has gaps/extras, or order isn't strictly consecutive; WARNING if roman/numeric ids are mixed. Has a "Full EPUB" variant (`rulePagebreakCheckFullEpub`) that stitches all bucketed files together |
| 23 | `tableImage` | Table Image Check | Body Matter only | `pageavoid` divs whose `id` contains `.tab` | FAIL if missing `tabcaption`/`tabimage` class, or their margins aren't 1em/0.5em (caption) |
| 24 | `referenceCheck` | Reference Check | All matter types | `ref`-classed `<p id>` vs `href="#...b#"` anchors | FAIL: any uncalled ref (never linked) or broken link (href points to a non-existent ref id) |
| 25 | `cssClassCheck` | CSS Class Check | All matter types | Every class used in the file | FAIL if a used class isn't found anywhere in the stylesheet |
| 26 | `figureImage` | Figure Image Check | Body Matter only | `pageavoid` divs whose `id` contains `.fig` | FAIL if image/caption paragraph classes/styling incorrect |
| 27 | `crossRefLink` | Cross Reference Link Check | All matter types | Text matching `figure N`, `fig. N`, `table N`, `tab. N`, `chapter N`, `ref N`, `reference N` | FAIL if the matched text isn't wrapped in an `<a href>` |
| 28 | `unwantedTag` | Unwanted Tag Check | All matter types | All non-self-closing, non-table, non-structural tags | FAIL on empty tags, orphan closing tags, or unclosed tags |
| 29 | `imageNameCheck` | Image Name Check | Body Matter only | `<img src>` filenames | FAIL if filename doesn't match `{chapter}-###.png` pattern or isn't sequential from 001 |
| 30 | `anchorTextDisplay` | Anchor Text Display | All matter types | Every `<a>` inner text (pagebreak anchors excluded) | Informational only — always PASS, lists text+href |
| 31 | `figureAnchorCheck` | Figure Anchor Check | All matter types | Every `id` vs every `<a href="#id">` (pagebreak ids skipped) | FAIL on any id never linked, or any href pointing to a missing id |
| 32 | `titleConsistencyCheck` | Title Consistency Check | All files (**disabled** in config.json) | `<title>` text vs majority-vote title across all files | FAIL if missing; WARNING if it differs from the expected (most common) title |
| 33 | `crossFileHrefCheck` | Cross-File Href Check | All matter types | `<a href>` without `#` (points to another file) | FAIL if href doesn't end in `.xhtml` |
| 34 | `crossFileAnchorDisplay` | Cross-File Anchor Display | All matter types | Every cross-file `.xhtml` anchor | Informational only — always PASS, lists href+text |
| 35 | `tableStructureCheck` | Table Structure Check | All matter types | Every `<table>` block — 18 structural checks: missing/unclosed/empty `<thead>`, `<tr>` before `<thead>`, `<td>` without `<tr>` in `<thead>`, `<thead>` after `<tbody>`, `<tbody>` opened inside `<thead>`, `</thead>` after `<tbody>` started, missing/unclosed/empty `<tbody>`, `<td>` without `<tr>` in `<tbody>`, multiple `<tbody>`, `<tr>` directly inside `<table>`, unclosed `<tr>`, empty `<tr>`, `<td>` directly inside `<table>`, mismatched closing tag on `<td>` | notApplicable if no `<table>` tag found; FAIL if any issue found; PASS otherwise |
| 36 | `boldSpaceCheck` | Bold Space Check | All matter types | Every `<b>...</b>` tag | notApplicable if `fileData.boldSpaceHits` is `undefined`; PASS if `[]` (no hits); FAIL if any `<b>` tag's content starts with a space |
| 37 | `listParaCheck` | List Para Check | All matter types | Every `<ol>`/`<ul>` block: `<p>` directly inside list without `<li>`, nested list without `<li>` wrapper, orphan `<li>` outside any list, empty `<li>`, empty `<p>` inside `<li>`, unclosed `<li>` | notApplicable if `fileData.listParaHits` is `undefined`; PASS if `[]` (no hits); FAIL if any structural issue found |

Rule execution order in `RULES` (rules.js) puts `stylesheetLinkCheck` first
via `RULES.unshift(...)`, then the rest in declaration order. Display/metadata
order in the UI follows `QC_RULES` (reporter.js) — a separately maintained,
currently-parallel ordered list.

## 8. Configuration

### config.json — `{ "rules": { "<ruleName>": true|false, ... } }`
The only configuration file (no `.env`, no `.ini`, no YAML). Fetched once at
startup by `app.js`'s `loadRuleConfig()`. Rules set to `false` are
permanently spliced out of the `RULES` array — invisible in the Rules tab,
cannot be re-enabled by end users via localStorage. Falls back to "all rules
on" if the fetch fails (e.g. under `file://`). Currently `false`:
`hyphenSpace`, `numberHyphen`, `titleConsistencyCheck`. All others
(including `tableStructureCheck` and `boldSpaceCheck`) are `true`.

### localStorage keys
- `theme` — `'dark'` | `'light'`
- `epubValidator.rulesEnabled` — JSON map `{ruleName: boolean}`, user-level toggle in Step 2 (layered under config.json)
- `epubValidator.pagebreakCount` — last-entered page count (input prefill)
- `epubValidator.bucketing.<folderName>` — JSON map `{fileName: zone}`
- `epubValidator.bucketOrder.<folderName>` — JSON map `{zone: [fileName, ...]}`
- `fixed_<fileName>_<ruleName>` — presence = `'1'`, marks a specific rule-failure-on-a-file as manually fixed (UI-only bookkeeping; doesn't affect pass/fail logic)

No environment variables — purely static client-side app.

## 9. Dependencies

None. No `package.json`, no CDN scripts, no icon library (inline SVG/HTML
entities used instead). Fully dependency-free by design; relies solely on
native browser APIs (`FileReader`, `<input webkitdirectory>`, `fetch`,
`localStorage`, HTML5 Drag-and-Drop).

## 10. Known Issues and TODOs

- Regex-based parsing throughout instead of a real `DOMParser`/XML parser —
  fast and dependency-free, but fragile against malformed or unusual markup.
- `webkitdirectory` folder picker is Chromium-only — Firefox and Safari
  cannot select a folder, so the tool is effectively Chrome/Edge/Opera-only.
- `fetch('config.json')` fails silently under `file://` in some browsers
  (local CORS restrictions), silently defaulting every rule to enabled;
  serving over `http://` avoids this.
- Rule metadata is duplicated across two independently maintained lists:
  `RULES` (rules.js, execution order/functional) and `QC_RULES` (reporter.js,
  display order/metadata) — adding a new rule requires updating both, plus
  `validator.js`'s `ruleResults.push({})` default-fallback block, plus a
  rendering branch in `buildRuleTable`, plus (optionally) a `notApplicable`
  message string in `buildRuleTable`'s NA-text ternary chain — up to five
  touch points per rule with no single source of truth.
- `buildRuleTable` in reporter.js is a very large if/else chain, one branch
  per rule name — hard to navigate and easy to fat-finger when adding a rule.
- `ruleBoldSpaceCheck`'s notApplicable logic checks
  `fileData.boldSpaceHits === undefined` rather than re-scanning the file
  for `<b>` tags directly — it depends on `app.js` always populating that
  field via `parseBoldSpace`, so if that wiring were ever skipped for a
  file, the rule would silently report `notApplicable` for the wrong reason
  (this was iterated on live and intentionally left keyed off the
  hits-array presence rather than actual `<b>` tag presence).
- `parseTableStructure`'s tag-walk uses a single regex pass per
  `<table>...</table>` match and does not special-case a `<table>` nested
  inside another `<table>`'s cell — nested tables will produce
  cross-contaminated/duplicate issue reports across the outer and inner
  table.
- Full-EPUB pagebreak mode reorders files with a "roman-numeral files
  first" heuristic (`fileIsRoman`), assuming front matter uses roman
  numerals and body matter uses numeric ids — will misorder atypical
  numbering schemes.
- Global mutable state (`selectedFileList`, `bucketAssignments`,
  `window.allPagebreakData`, `window.CONFIG_RULES`, etc.) is spread across
  script-load-order-dependent files — fragile if the `<script>` order in
  `index.html` ever changes.
- No automated test suite of any kind exists for any parser or rule
  function.
