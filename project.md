# EPUB XHTML Validator — Project Documentation

## 1. Project Overview

Browser-only QC tool for validating unpacked EPUB XHTML/CSS files against 32 publishing-house style rules. No backend, no build step, no file ever leaves the browser. Target users: EPUB production/QC teams checking margin/typography, text-content, link/reference, structural, and metadata rules before an EPUB ships.

## 2. Tech Stack

- Vanilla JavaScript (ES6+, global scope, no modules), HTML5, CSS3.
- Zero frameworks, zero npm dependencies, no build tooling.
- Browser APIs used: `File`/`FileReader`, `<input webkitdirectory>` (Chromium-only folder picker), `localStorage`, HTML5 Drag-and-Drop.
- CSS: custom properties for light/dark theme (`:root`, `[data-theme="dark"]`), no preprocessor.

## 3. Project Structure

```
validator/
├── index.html          6-step wizard UI shell + 5 modals
├── config.json          developer-level rule on/off switches
├── PROJECT_ANALYSIS.md  pre-existing architecture writeup (slightly stale)
├── css/
│   └── style.css        all styling, light/dark theme (~2,441 lines)
└── js/
    ├── rules.js          32 validation rule functions, RULES array (~2,309 lines)
    ├── parser.js          regex-based XHTML/CSS text extraction (~849 lines)
    ├── validator.js       runs active rules over parsed files (~111 lines)
    ├── reporter.js        all DOM rendering (~2,238 lines)
    ├── bucketing.js       drag/drop matter-grouping UI (~292 lines)
    └── app.js             entry point, orchestration, event wiring (~753 lines)
```

Note: PROJECT_ANALYSIS.md references `project-summary.md` and `Entity Excel/Entities List.xlsx` — neither exists in current tree (pruned since that doc was written; git status shows the xlsx as deleted).

## 4. Core Modules

**index.html** — 6 wizard tabs, each unlocked only after prior step completes: Epub Select (folder picker) → Rules (toggle list) → Validation Report (bucketing + summary + per-file cards) → Output (rule-centric view) → Tag Index (tag→class usage) → Pagebreak Check (hidden unless Full-EPUB mode chosen). Plus modals: CSS-block viewer, copyright warning, rule-detail, output sidebar, pagebreak prompt.

**js/parser.js** — regex (not DOMParser) extraction layer:
- `findEpubFiles` — filters FileList for `OPS/xhtml/*.xhtml` + `OPS/styles/*.css`.
- `parseXhtmlFirstTag`, `parseXhtmlHeadings`, `parseXhtmlAllTags`, `parseXhtmlTagSequence` — tag-structure extraction.
- `parseTextContent` — single-pass scan for double-space, tab-space, capital-after-`<p>`, end-punctuation, `&&`, hyphen-space, number-hyphen, space-after-open/before-close.
- `parseStylesheet` — builds `cssRules` (`"tag.class"` → props) and `cssBlocks` (raw CSS text) maps.
- `parseUnwantedTags` — stack-based orphan/empty/unclosed tag detection.
- Plus one extractor each for cross-refs, references, superscripts, figures, table images, pagebreaks (numeric/roman/mixed), CSS class usage, image srcs, dot-after-close, trailing space, title, anchor texts, figure anchors, stylesheet link.

**js/rules.js** — 32 rule functions, each `(fileData, cssRules) => {name, label, pass, notApplicable?, warning?, reason, ...rows}`, registered in `RULES`. Categories: margin/typography, text-content, link/reference, structural, head/metadata. Matter-scoped rules (e.g. Front/Body/End Matter-only) self-report `notApplicable: true` rather than being filtered externally.

**js/validator.js** — `validateFile` filters `RULES` to active set (config.json ∩ localStorage), runs each, aggregates overall status (`FAIL` > `WARNING` > `PASS`). `validateAll` maps over all files.

**js/reporter.js** — `renderReport` (top-level), `buildRuleTable` (large per-rule-name if/else chain), `renderRulesManager` (built from separate `QC_RULES` metadata array — must be hand-kept in sync with `rules.js`), plus Output/Pagebreak/Tag-Index panel builders. `escapeHtml` sanitizes all file content before `innerHTML` insertion.

**js/bucketing.js** — 5-zone drag-and-drop grouping (`unassigned/front/body/end/isolate`), persisted per-folder to `localStorage` (`epubValidator.bucketing.<folder>`, `epubValidator.bucketOrder.<folder>`). Auto-detects body matter via numeric filename suffix.

**js/app.js** — orchestration/entry point: "Mark as Fixed" checkboxes (persisted per rule+file), `loadRuleConfig` (fetches config.json, splices disabled rules out permanently), theme toggle, `switchTab` (lock-gated nav), upload-zone wiring, `executeValidation` (copyright check → pagebreak modal → `runValidation` → `renderReport`), `runValidation` (core pipeline), `checkCopyrightFile`, custom cursor/tooltip system.

**css/style.css** — component styling for sidebar, wizard, upload zone, bucketing chips, cards, rule tables, modals, tooltip, output/tag-index panels.

## 5. Entry Points

Single entry point: `index.html`. Load order in `<script>` tags matters (all globals, no modules): `rules.js` → `parser.js` → `validator.js` → `reporter.js` → `bucketing.js` → `app.js`.

**How to run:** must be served over HTTP (not `file://`), since `app.js` does `fetch('config.json')` at startup and `file://` breaks/degrades this in most browsers:
```
python -m http.server 8000
```
Open `http://localhost:8000/` in a Chromium-based browser (Chrome/Edge required for `webkitdirectory`; Firefox/Safari have degraded folder-picker support).

## 6. Data Flow

```
User selects unpacked EPUB folder (webkitdirectory)
  → findEpubFiles: filters OPS/xhtml/*.xhtml + OPS/styles/*.css
  → Rules tab: active rules = config.json ∩ localStorage toggles
  → Bucketing (drag/drop into Front/Body/End/Isolate/Unassigned, or skip)
  → executeValidation():
      - Copyright.xhtml presence/case check (modal if issue)
      - Pagebreak count / Full-EPUB mode prompt (if pagebreakCheck active)
      - runValidation(fileList):
          parseStylesheet → cssRules/cssBlocks
          per-file: read text, run all parse* functions → fileData
          sort by matter order, drop "isolate" files
          compute expected title (frequency-based) for titleConsistencyCheck
      - validateAll(activeFiles): each active rule fn → pass/fail/warning/notApplicable
      - validateFile aggregates per-file status
  → renderReport(results):
      Summary card, per-file filterable/searchable card list,
      Output tab (rule-centric), Tag Index tab, optional stitched Pagebreak Check tab
```

Input: unpacked EPUB folder (must already contain `OPS/xhtml/` + `OPS/styles/`, no `.epub` zip parsing). Output: in-browser rendered report only — nothing written to disk, no export; `localStorage` persists preferences/progress (theme, rule toggles, bucket assignments, fixed-checkbox states).

## 7. Key Features

- 32-rule validation engine covering margins/typography, text-content hygiene, link/cross-reference integrity, structural tags (pagebreaks, figures, tables, images), and head/metadata consistency.
- Matter-type bucketing (Front/Body/End/Isolate) via drag-and-drop, feeding matter-scoped rule applicability.
- Per-rule enable/disable at two levels: developer override (`config.json`, permanent) and user toggle (`localStorage`, session-persisted).
- "Mark as Fixed" workflow — check off individual rule failures per file, persisted across sessions, with bulk-clear.
- Full-EPUB pagebreak continuity check — stitches pagebreak markers across all files in bucket order.
- Tag→class usage index with click-to-view raw CSS block.
- Light/dark theme toggle.
- Custom cursor/tooltip system giving contextual hints across badges, chips, nav items.

## 8. Configuration

**config.json** — the only configuration file (no `.env`, no `.ini`, no YAML). Fetched once at startup by `app.js`'s `loadRuleConfig()`. Structure: `{ "rules": { "<ruleName>": true|false, ... } }` for all 32 rules. Rules set to `false` (`hyphenSpace`, `numberHyphen`, `titleConsistencyCheck`) are permanently spliced out of the `RULES` array — invisible in the Rules UI, cannot be re-enabled by end users via localStorage. Falls back to "all rules on" if fetch fails (e.g. under `file://`).

**localStorage keys**: `theme`, rule-toggle state, `epubValidator.bucketing.<folder>`, `epubValidator.bucketOrder.<folder>`, `fixed_<fileName>_<ruleName>`.

No environment variables — purely static client-side app.

## 9. Dependencies

None. No `package.json`, no `requirements.txt`, no CDN scripts, no icon library (inline SVG/entities used instead). Fully dependency-free by design.

## 10. Known Issues / TODOs

No `TODO`/`FIXME`/`XXX` markers found anywhere in the codebase (searched all files recursively). Issues are instead documented as prose in `PROJECT_ANALYSIS.md`'s "Known Issues / Improvement Suggestions" section:
- Regex-based parsing instead of a real `DOMParser`/XML parser.
- `webkitdirectory` folder picker is Chromium-only — no standard cross-browser equivalent.
- Rule metadata duplicated across two sources: `RULES` (rules.js, functional) and `QC_RULES` (reporter.js, display metadata) — must be kept in sync by hand; a rule added to one without the other silently breaks the Rules-tab UI or the actual validation.
- `buildRuleTable` in reporter.js is an oversized if/else chain, one branch per rule name.
- Rendering logic duplicated between `buildRuleTable` and `showRuleDetail`.
- Global mutable state (`selectedFileList`, `bucketAssignments`, `window.allPagebreakData`, etc.) spread across script-load-order-dependent files — fragile if load order in `index.html` changes.
- Stray reference to a now-deleted `Entity Excel/Entities List.xlsx` (git status confirms this file is deleted but still tracked).
- Redundant double-ternary in `parseTrailingSpace` (parser.js).
- No automated test suite of any kind.
