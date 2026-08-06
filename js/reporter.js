/* ============================================================
   reporter.js
   ------------------------------------------------------------
   Renders validation results into the UI: the summary card
   and the collapsible file card list (with filter + search).
   ============================================================ */

let currentResults = [];
let activeFilters = new Set(["front", "body", "end"]);
let statusFilter = "all"; // "all" | "fail" | "warning"
let searchTerm = "";
let lastParsedFiles = []; // set by app.js runValidation(); feeds the Tag → Class panel

/**
 * Renders the summary card (total / passed / failed counts,
 * plus a per-matter-type breakdown).
 */
function lineColBox(line, col) {
  if (!line && !col) return '';
  return `
    <span class="line-col-box">
      <span class="lc-header">Line</span>
      <span class="lc-header">Col</span>
      <span class="lc-value">${line || '—'}</span>
      <span class="lc-value">${col || '—'}</span>
    </span>`;
}

function ensureWarningSummaryCard() {
  let warningItem = document.getElementById("summaryWarningItem");
  if (warningItem) return warningItem;

  const failItem = document.getElementById("summaryFail").closest(".summary-item");
  warningItem = document.createElement("div");
  warningItem.id = "summaryWarningItem";
  warningItem.className = "summary-item warning";
  warningItem.innerHTML = `
    <span id="summaryWarning" class="summary-value">0</span>
    <span class="summary-label">Warnings</span>
  `;
  failItem.after(warningItem);
  return warningItem;
}

function renderSummary(results) {
  const summarySection = document.getElementById("summarySection");
  const totalEl = document.getElementById("summaryTotal");
  const passEl = document.getElementById("summaryPass");
  const failEl = document.getElementById("summaryFail");
  const breakdownEl = document.getElementById("matterBreakdown");

  ensureWarningSummaryCard();
  const warningEl = document.getElementById("summaryWarning");

  const total = results.length;
  const passed = results.filter(r => r.status === "PASS").length;
  const warnings = results.filter(r => r.status === "WARNING").length;
  const failed = total - passed - warnings;

  totalEl.textContent = total;
  passEl.textContent = passed;
  failEl.textContent = failed;
  warningEl.textContent = warnings;
  summarySection.classList.add("has-warnings");

  const groups = ["front", "body", "end"];
  breakdownEl.innerHTML = groups.map(group => {
    const groupResults = results.filter(r => r.matterType === group);
    const groupPassed = groupResults.filter(r => r.status === "PASS").length;
    return `<span class="matter-breakdown-item matter-${group}">${MATTER_LABELS[group]} (${groupPassed}/${groupResults.length})</span>`;
  }).join("") + `
    <span class="expand-collapse-controls">
      <button id="expandAllBtn" onclick="expandAllCards()">&#8862; Expand All</button>
      <button id="collapseAllBtn" onclick="collapseAllCards()">&#8863; Collapse All</button>
    </span>`;

  summarySection.hidden = false;
}

function expandAllCards() {
  document.querySelectorAll('.card-body, .rule-body').forEach(el => {
    el.hidden = false;
  });
  document.querySelectorAll('.result-card').forEach(card => {
    card.classList.add('expanded');
    card.classList.remove('collapsed');
  });
}

function collapseAllCards() {
  document.querySelectorAll('.card-body, .rule-body').forEach(el => {
    el.hidden = true;
  });
  document.querySelectorAll('.result-card').forEach(card => {
    card.classList.add('collapsed');
    card.classList.remove('expanded');
  });
}

/**
 * Builds the rule table for a file's card body.
 * Columns = fields, rows = each rule in fileData.ruleResults.
 */
/**
 * Renders the "Pagebreaks found in order:" chip row for the
 * Pagebreak Check rule, plus separate Missing/Extra chip lines.
 * Reads originalOrder/missing/extra off the rule's own row data
 * (r.pagebreakRows) so it works whether the rule passed or failed.
 */
function buildPagebreakOrderDisplay(r) {
  const rows = r.pagebreakRows || [];
  const consecutiveRow = rows.find(row => row.check === 'Consecutive Series');
  const foundRow = consecutiveRow || rows.find(row => row.check === 'Order Check');
  if (!foundRow || !foundRow.found) return '';

  const originalOrder = foundRow.found.split(',').map(s => s.trim()).filter(Boolean).map(Number);
  if (originalOrder.length === 0) return '';

  const missing = (consecutiveRow && consecutiveRow.missing) || [];
  const extra = (consecutiveRow && consecutiveRow.extra) || [];

  const minVal = Math.min(...originalOrder);
  const expectedSequence = originalOrder.map((_, i) => minVal + i);

  const chipStyle = (bg, color, border) =>
    `display:inline-block;margin:2px;padding:2px 9px;border-radius:12px;font-size:0.75rem;font-weight:700;background:${bg};color:${color};${border || ''}`;

  const sequenceHtml = originalOrder.map((n, i) => {
    const isWrong = n !== expectedSequence[i];
    const style = isWrong ? chipStyle('#ef4444', '#fff') : chipStyle('#22c55e', '#fff');
    return `<span style="${style}">${escapeHtml(String(n))}</span>`;
  }).join('');

  const missingHtml = missing.map(n =>
    `<span style="${chipStyle('transparent', '#888', 'border:1px dashed #888;')}">?${escapeHtml(String(n))}</span>`
  ).join('');

  const extraHtml = extra.map(n =>
    `<span style="${chipStyle('#f97316', '#fff')}">${escapeHtml(String(n))}</span>`
  ).join('');

  return `
    <div class="pagebreak-order-display" style="margin-top:10px;">
      <p style="margin:4px 0;font-weight:600;">Pagebreaks found in order:</p>
      <div>${sequenceHtml}</div>
      ${missing.length ? `<p style="margin:8px 0 2px;">Missing: ${missingHtml}</p>` : ''}
      ${extra.length ? `<p style="margin:2px 0;">Extra: ${extraHtml}</p>` : ''}
    </div>`;
}

function buildFixedCheckbox(fileName, ruleName) {
  return `
      <label class="fixed-label" onclick="event.stopPropagation()">
        <input
          type="checkbox"
          class="fixed-checkbox"
          data-file="${escapeHtml(fileName)}"
          data-rule="${escapeHtml(ruleName)}"
          onchange="handleFixedChange(this)"
        />
        <span class="fixed-text">Mark as Fixed</span>
      </label>`;
}

function buildRuleTable(result) {
  const rules = result.ruleResults || [];
  if (rules.length === 0) return `<p class="status-message">No rules configured.</p>`;

  const fileName = shortFileName(result.fileName);

  return rules.map((r, index) => {
    if (r.name === 'pagebreakCheck' && window.fullEpubPagebreak) {
      return ''; // skip rendering this rule in the card — shown in Pagebreak Check (06) instead
    }
    const ruleNumber = index + 1;
    if (r.notApplicable) {
      const naText = r.name === 'superscriptLink' ? '&mdash; Body matter only'
        : r.name === 'pagebreakCheck' ? '&mdash; Page count not provided'
        : r.name === 'tableImage' ? (result.matterType !== 'body' ? '&mdash; Body matter only' : '&mdash; No table image blocks found')
        : r.name === 'referenceCheck' ? '&mdash; No reference tags found in this file'
        : r.name === 'cssClassCheck' ? '&mdash; No classes found in file'
        : r.name === 'figureImage' ? (result.matterType !== 'body' ? '&mdash; Body matter only' : '&mdash; No figure blocks found')
        : r.name === 'imageNameCheck' ? (result.matterType !== 'body' ? '&mdash; Body matter only' : '&mdash; No images found')
        : r.name === 'anchorTextDisplay' ? '&mdash; No anchor tags found'
        : r.name === 'crossFileHrefCheck' ? '&mdash; No cross-file anchor tags found'
        : r.name === 'crossFileAnchorDisplay' ? '&mdash; No cross-file .xhtml anchors found'
        : r.name === 'boldSpaceCheck' ? '&mdash; No <b> tags found in this file'
        : 'Not applicable for this matter type';
      return `
        <div class="rule-group" data-rule-status="NA">
          <div class="rule-group-header">
            <span class="rule-number">${ruleNumber}.</span>
            <span class="rule-badge">${escapeHtml(r.label)}</span>
            <span class="rule-group-status na">N/A</span>
          </div>
          <div class="rule-group-body">
            <p class="rule-na-text">${naText}</p>
          </div>
        </div>`;
    }

    // Build mini table rows based on rule type
    let tableBody = '';

    if (r.name === 'stylesheetLinkCheck') {
      if (r.pass) {
        tableBody = `<div style="display:flex;align-items:center;gap:10px;padding:0.75rem 1.2rem;"><p style="color:var(--pass);font-weight:600;margin:0;">&#10003; Correct stylesheet link found.</p>${lineColBox(r.line, r.col)}</div>`;
      } else {
        tableBody = `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:0.75rem 1.2rem;">
            <div>
              <p style="color:var(--fail);font-weight:600;margin-bottom:0.5rem;">&#10007; ${escapeHtml(r.reason)}</p>
              <p style="font-size:0.85rem;color:var(--text-muted);">Expected:
                <code style="color:var(--accent);">&lt;link rel="stylesheet" type="text/css" href="../styles/stylesheet.css"/&gt;</code>
              </p>
              ${r.actual ? `<p style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">Found:
                <code style="color:var(--fail);">${escapeHtml(r.actual)}</code>
              </p>` : ''}
            </div>
            ${lineColBox(r.line, r.col)}
          </div>`;
      }
    } else if (r.name === 'headingStyles' && r.headingRows && r.headingRows.length > 0) {
      // Multiple rows — one per unique heading
      const visibleRows = r.headingRows.filter(h => !h.notApplicable && !/skipped/i.test(h.reason || ''));

      if (visibleRows.length === 0) {
        tableBody = `<p class="rule-na-text">&mdash; No matching headings found</p>`;
      } else {
      tableBody = `
      <div class="table-location-wrapper">
        <table class="rule-mini-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Class</th>
              <th>CSS Selector</th>
              <th>Margin-Top</th>
              <th>Margin-Bottom</th>
              <th>Font-Size</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${visibleRows.map(h => `
              <tr>
                <td>${escapeHtml(h.tagName)}</td>
                <td>${escapeHtml(h.className)}</td>
                <td>${escapeHtml(h.cssSelector)}</td>
                <td class="${h.marginTopPass ? 'val-pass' : 'val-fail'}">${escapeHtml(h.marginTop)}</td>
                <td class="${h.marginBottomPass ? 'val-pass' : 'val-fail'}">${escapeHtml(h.marginBottom)}</td>
                <td class="${h.fontSizePass ? 'val-pass' : 'val-fail'}">${escapeHtml(h.fontSize)}</td>
                <td><span class="status-badge ${h.pass ? 'status-pass' : 'status-fail'}">${h.pass ? 'PASS' : 'FAIL'}</span></td>
                <td class="rule-fail-text">${escapeHtml(h.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="location-sidebar">
          ${visibleRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
        </div>
      </div>`;
      }
    } else if (r.name === 'footnoteClasses' && r.footnoteRows && r.footnoteRows.length > 0) {
      tableBody = `
      <div class="table-location-wrapper">
        <table class="rule-mini-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Class</th>
              <th>CSS Selector</th>
              <th>Font-Size</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${r.footnoteRows.map(h => `
              <tr class="${h.warning ? 'row-warning' : ''}">
                <td>${escapeHtml(h.tagName)}</td>
                <td>${escapeHtml(h.className)}</td>
                <td>${escapeHtml(h.cssSelector)}</td>
                <td class="${h.fontSizePass ? 'val-pass' : 'val-fail'}">${escapeHtml(h.fontSize)}</td>
                <td><span class="status-badge ${h.warning ? 'status-warn' : h.pass ? 'status-pass' : 'status-fail'}">${h.warning ? 'WARN' : h.pass ? 'PASS' : 'FAIL'}</span></td>
                <td class="${h.warning ? 'rule-warn-text' : 'rule-fail-text'}">${escapeHtml(h.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="location-sidebar">
          ${r.footnoteRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
        </div>
      </div>`;
    } else if (
      (r.name === 'h1AuthorH2' || r.name === 'h1AuthorP' || r.name === 'h1H2' || r.name === 'h1P') &&
      r.h1Rows && r.h1Rows.length > 0
    ) {
      const subRowsFor = (h) => {
        if (r.name === 'h1AuthorH2') {
          return [
            { tag: 'h1', cls: h.h1Class, expected: '1em / 0',      found: `${h.h1Top || 'not set'} / ${h.h1Bottom || 'not set'}` },
            { tag: 'p (author)', cls: h.authorClass, expected: '0 / 2.5em', found: `${h.pTop || 'not set'} / ${h.pBottom || 'not set'}` },
            { tag: 'h2', cls: h.h2Class, expected: '0 / 0.5em',    found: `${h.h2Top || 'not set'} / ${h.h2Bottom || 'not set'}` }
          ];
        }
        if (r.name === 'h1AuthorP') {
          return [
            { tag: 'h1', cls: h.h1Class, expected: '1em / 0',      found: `${h.h1Top || 'not set'} / ${h.h1Bottom || 'not set'}` },
            { tag: 'p (author)', cls: h.authorClass, expected: '0 / 2.5em', found: `${h.pTop || 'not set'} / ${h.pBottom || 'not set'}` },
            { tag: 'p', cls: h.paraClass, expected: '0 / —',       found: `${h.p2Top || 'not set'} / —` }
          ];
        }
        if (r.name === 'h1H2') {
          return [
            { tag: 'h1', cls: h.h1Class, expected: '1em / 2.5em', found: `${h.h1Top || 'not set'} / ${h.h1Bottom || 'not set'}` },
            { tag: 'h2', cls: h.h2Class, expected: '0 / 0.5em',   found: `${h.h2Top || 'not set'} / ${h.h2Bottom || 'not set'}` }
          ];
        }
        return [
          { tag: 'h1', cls: h.h1Class, expected: '1em / 2.5em', found: `${h.h1Top || 'not set'} / ${h.h1Bottom || 'not set'}` },
          { tag: 'p', cls: h.paraClass, expected: '0 / —',      found: `${h.pTop || 'not set'} / —` }
        ];
      };

      tableBody = `
      <div class="table-location-wrapper">
        <table class="rule-mini-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Class</th>
              <th>Expected</th>
              <th>Found</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${r.h1Rows.map(h => subRowsFor(h).map((sub, i) => `
              <tr>
                <td>${escapeHtml(sub.tag)}</td>
                <td>${escapeHtml(sub.cls || '(none)')}</td>
                <td>${escapeHtml(sub.expected)}</td>
                <td>${escapeHtml(sub.found)}</td>
                <td>${i === 0 ? `<span class="status-badge ${h.pass ? 'status-pass' : 'status-fail'}">${h.pass ? 'PASS' : 'FAIL'}</span>` : ''}</td>
                <td class="${h.pass ? '' : 'rule-fail-text'}">${i === 0 ? (escapeHtml(h.reason) || '—') : ''}</td>
              </tr>
            `).join('')).join('')}
          </tbody>
        </table>
        <div class="location-sidebar">
          ${r.h1Rows.map(h => subRowsFor(h).map((sub, i) => `<div class="location-row">${i === 0 ? lineColBox(h.line, h.col) : ''}</div>`).join('')).join('')}
        </div>
      </div>`;
    } else if (r.name === 'copyrightFontSize' && r.copyrightRows && r.copyrightRows.length > 0) {
      tableBody = `
      <div class="table-location-wrapper">
        <table class="rule-mini-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Class</th>
              <th>CSS Selector</th>
              <th>Font-Size</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${r.copyrightRows.map(h => `
              <tr>
                <td>${escapeHtml(h.tagName)}</td>
                <td>${escapeHtml(h.className)}</td>
                <td>${escapeHtml(h.cssSelector)}</td>
                <td class="${h.fontSizePass ? 'val-pass' : 'val-fail'}">${escapeHtml(h.fontSize)}</td>
                <td><span class="status-badge ${h.pass ? 'status-pass' : 'status-fail'}">${h.pass ? 'PASS' : 'FAIL'}</span></td>
                <td class="${h.pass ? '' : 'rule-fail-text'}">${escapeHtml(h.reason) || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="location-sidebar">
          ${r.copyrightRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
        </div>
      </div>`;
    } else if (r.name === 'doubleSpace') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No double spaces found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.doubleSpaceRows.length} double space(s) found</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Content</th>
              </tr>
            </thead>
            <tbody>
              ${r.doubleSpaceRows.map(h => `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${escapeHtml(h.text).replace(/  /g, '<mark style="background:red;color:white;">&nbsp;&nbsp;</mark>')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.doubleSpaceRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'tabSpace') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No tab spaces found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.tabSpaceRows.length} tab space(s) found</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Content</th>
              </tr>
            </thead>
            <tbody>
              ${r.tabSpaceRows.map(h => `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${escapeHtml(h.text).replace(/ {3,}/g, '<mark style="background:orange;color:white;">&nbsp;&nbsp;&nbsp;</mark>')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.tabSpaceRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'capitalAfterP') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All &lt;p&gt; tags start with capital letter</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.capitalRows.length} &lt;p&gt; tag(s) start with lowercase</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Content</th>
              </tr>
            </thead>
            <tbody>
              ${r.capitalRows.map(h => {
                const escaped = escapeHtml(h.text);
                const highlighted = `<mark style="background:red;color:white;">${escaped.charAt(0)}</mark>${escaped.slice(1)}`;
                return `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${highlighted}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.capitalRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'endPunctuation') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All &lt;p&gt; tags end with . or ;</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.endPuncRows.length} &lt;p&gt; tag(s) missing end punctuation</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Content</th>
              </tr>
            </thead>
            <tbody>
              ${r.endPuncRows.map(h => {
                const escaped = escapeHtml(h.text);
                const highlighted = escaped.length
                  ? `${escaped.slice(0, -1)}<mark style="background:red;color:white;">${escaped.slice(-1)}</mark>`
                  : escaped;
                return `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${highlighted}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.endPuncRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'ampersand') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No double ampersands found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.ampersandRows.length} tag(s) contain &amp;&amp;</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Content</th>
              </tr>
            </thead>
            <tbody>
              ${r.ampersandRows.map(h => `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${escapeHtml(h.text).replace(/&amp;&amp;/g, '<mark style="background:red;color:white;">&amp;&amp;</mark>')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.ampersandRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'hyphenSpace') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No hyphen space issues found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.hyphenSpaceRows.length} tag(s) contain hyphen followed by space</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Content</th>
              </tr>
            </thead>
            <tbody>
              ${r.hyphenSpaceRows.map(h => `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${escapeHtml(h.text).replace(/- /g, '<mark style="background:red;color:white;">- </mark>')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.hyphenSpaceRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'numberHyphen') {
      const isWarning = r.warning === true || (r.numberHyphenRows && r.numberHyphenRows.length > 0);
      if (!isWarning && r.pass) {
        tableBody = `<p class="val-pass">No number hyphen issues found</p>`;
      } else if (!isWarning && !r.pass) {
        tableBody = `<p class="rule-fail-text">${escapeHtml(r.reason || 'Number Hyphen Check failed')}</p>`;
      } else {
        tableBody = `
          <p class="rule-warn-text">${r.numberHyphenRows.length} tag(s) contain number-hyphen-number pattern</p>
          <p class="rule-warn-text">Consider using en dash (&ndash;) instead of hyphen (-)</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Content</th>
                <th>Matches Found</th>
              </tr>
            </thead>
            <tbody>
              ${r.numberHyphenRows.map(h => {
                let highlighted = escapeHtml(h.text);
                (h.matches || []).forEach(m => {
                  const escapedMatch = escapeHtml(m);
                  highlighted = highlighted.split(escapedMatch).join(`<mark style="background:orange;color:white;">${escapedMatch}</mark>`);
                });
                return `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${highlighted}</td>
                  <td>${escapeHtml((h.matches || []).join(', '))}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.numberHyphenRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'trailingSpace') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No trailing space after &lt;/html&gt;</p>`;
      } else {
        const trailingRow = (r.trailingSpaceRows && r.trailingSpaceRows[0]) || {};
        const charCount = trailingRow.charCount || 0;
        tableBody = `
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <div>
              <p class="rule-fail-text">${charCount} character(s) found after &lt;/html&gt;</p>
              <p class="rule-fail-text">Extra whitespace or line breaks detected after closing &lt;/html&gt; tag</p>
              <p class="rule-fail-text">Characters found: ${charCount}</p>
            </div>
            ${lineColBox(trailingRow.line, trailingRow.col)}
          </div>`;
      }
    } else if (r.name === 'spaceAfterOpen') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No space after opening tags found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.spaceAfterOpenRows.length} tag(s) have space after opening tag</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Preview</th>
              </tr>
            </thead>
            <tbody>
              ${r.spaceAfterOpenRows.map(h => {
                const escaped = escapeHtml(h.text);
                const leadingMatch = escaped.match(/^(\s+)/);
                const highlighted = leadingMatch
                  ? '<mark style="background:red;color:white;">&middot;</mark>'.repeat(leadingMatch[1].length) + escaped.slice(leadingMatch[1].length)
                  : escaped;
                return `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${highlighted}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.spaceAfterOpenRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'spaceBeforeClose') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No space before closing tags found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.spaceBeforeCloseRows.length} tag(s) have space before closing tag</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Text Preview</th>
              </tr>
            </thead>
            <tbody>
              ${r.spaceBeforeCloseRows.map(h => {
                const escaped = escapeHtml(h.text);
                const trailingMatch = escaped.match(/(\s+)$/);
                const highlighted = trailingMatch
                  ? escaped.slice(0, escaped.length - trailingMatch[1].length) + '<mark style="background:red;color:white;">&middot;</mark>'.repeat(trailingMatch[1].length)
                  : escaped;
                return `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.className)}</td>
                  <td>${highlighted}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.spaceBeforeCloseRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'dotAfterClose') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No dot after closing tags found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.dotAfterCloseRows.length} closing tag(s) followed by a dot</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Snippet</th>
              </tr>
            </thead>
            <tbody>
              ${r.dotAfterCloseRows.map(h => `
                <tr>
                  <td>${escapeHtml(h.tagName)}</td>
                  <td>${escapeHtml(h.snippet).replace(/\./g, '<mark style="background:red;color:white;">.</mark>')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.dotAfterCloseRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'superscriptLink') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All superscripts are properly linked</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.superscriptRows.length} superscript(s) have link issues</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Superscript</th>
                <th>Issue</th>
                <th>Href</th>
                <th>Target Found</th>
              </tr>
            </thead>
            <tbody>
              ${r.superscriptRows.map(h => `
                <tr>
                  <td>${escapeHtml(h.text)}</td>
                  <td class="rule-fail-text">${escapeHtml(h.issue)}</td>
                  <td>${escapeHtml(h.href)}</td>
                  <td class="${h.targetExists ? 'val-pass' : 'val-fail'}">${h.targetExists ? 'Found' : 'Not Found'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.superscriptRows.map(h => `<div class="location-row">${lineColBox(h.line, h.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'pagebreakCheck') {
      const pagebreakOrderHtml = buildPagebreakOrderDisplay(r);
      if (r.pass) {
        tableBody = `<p class="val-pass">All pagebreaks correct</p><p class="pagebreak-summary-text">${escapeHtml(r.pagebreakSummary)}</p>${pagebreakOrderHtml}`;
      } else {
        tableBody = `
          <p class="rule-fail-text">Pagebreak series incorrect</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Expected</th>
                <th>Found</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${r.pagebreakRows.map(row => {
                let reasonHtml = escapeHtml(row.reason || '');
                if (row.missing && row.missing.length) {
                  reasonHtml = reasonHtml.replace(
                    `Missing: ${row.missing.join(', ')}`,
                    `<mark style="background:red;color:white;">Missing: ${row.missing.join(', ')}</mark>`
                  );
                }
                if (row.extra && row.extra.length) {
                  reasonHtml = reasonHtml.replace(
                    `Extra: ${row.extra.join(', ')}`,
                    `<mark style="background:orange;color:white;">Extra: ${row.extra.join(', ')}</mark>`
                  );
                }
                return `
                <tr>
                  <td>${escapeHtml(row.check)}</td>
                  <td>${escapeHtml(String(row.expected))}</td>
                  <td>${escapeHtml(String(row.found))}</td>
                  <td><span class="status-badge ${row.pass ? 'status-pass' : 'status-fail'}">${row.pass ? 'PASS' : 'FAIL'}</span></td>
                  <td class="${row.pass ? '' : 'rule-fail-text'}">${reasonHtml || '—'}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.pagebreakRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>
          ${pagebreakOrderHtml}`;
      }
    } else if (r.name === 'tableImage') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All table image blocks correct</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.tableImageRows.filter(row => !row.pass).length} table image block(s) have issues</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Caption</th>
                <th>Image</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${r.tableImageRows.map(row => `
                <tr>
                  <td>${escapeHtml(row.id)}</td>
                  <td class="${row.hasCaption ? 'val-pass' : 'val-fail'}">${row.hasCaption ? 'Found' : 'Missing'}</td>
                  <td class="${row.hasImage ? 'val-pass' : 'val-fail'}">${row.hasImage ? 'Found' : 'Missing'}</td>
                  <td><span class="status-badge ${row.pass ? 'status-pass' : 'status-fail'}">${row.pass ? 'PASS' : 'FAIL'}</span></td>
                  <td class="${row.pass ? '' : 'rule-fail-text'}">${escapeHtml(row.reason) || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.tableImageRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'referenceCheck') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All references are properly linked</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.referenceRows.length} issue(s) found</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>ID</th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              ${r.referenceRows.map(row => `
                <tr>
                  <td><span class="status-badge ${row.type === 'Broken Link' ? 'status-fail' : 'status-warn'}">${escapeHtml(row.type)}</span></td>
                  <td>${escapeHtml(row.id)}</td>
                  <td class="rule-fail-text">${escapeHtml(row.issue)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.referenceRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'cssClassCheck') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All CSS classes found in stylesheet</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.cssClassRows.length} class(es) not found in stylesheet</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Class</th>
                <th>Looked For</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              ${r.cssClassRows.map(row => `
                <tr>
                  <td>${escapeHtml(row.tagName)}</td>
                  <td>${escapeHtml(row.className)}</td>
                  <td>${escapeHtml(row.lookedFor.join(', '))}</td>
                  <td class="val-fail">Not Found</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.cssClassRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'figureImage') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All figure blocks correct</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.figureImageRows.filter(row => !row.pass).length} figure block(s) have issues</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Image Class</th>
                <th>Caption Class</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${r.figureImageRows.map(row => `
                <tr>
                  <td>${escapeHtml(row.id)}</td>
                  <td>${escapeHtml(row.imageClass)}</td>
                  <td>${escapeHtml(row.captionClass)}</td>
                  <td><span class="status-badge ${row.pass ? 'status-pass' : 'status-fail'}">${row.pass ? 'PASS' : 'FAIL'}</span></td>
                  <td class="${row.pass ? '' : 'rule-fail-text'}">${escapeHtml(row.reason) || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.figureImageRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'crossRefLink') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All cross references are linked</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.crossRefRows.length} cross reference(s) not linked</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Matched Text</th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              ${r.crossRefRows.map(row => `
                <tr>
                  <td class="rule-fail-text">${escapeHtml(row.matchedText)}</td>
                  <td>Not wrapped in &lt;a href&gt;</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.crossRefRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'figureAnchorCheck') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All IDs and href links are matched correctly</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.figureAnchorRows.length} anchor issue(s) found</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>ID / href</th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              ${r.figureAnchorRows.map(row => `
                <tr>
                  <td class="rule-fail-text">${escapeHtml(row.type)}</td>
                  <td><code>${escapeHtml(row.id)}</code></td>
                  <td>${escapeHtml(row.issue)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.figureAnchorRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'imageNameCheck') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All image filenames match expected pattern and sequence</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.imageNameRows.filter(row => !row.pass).length} image name issue(s) found</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Image File</th>
                <th>Pattern</th>
                <th>Sequence</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${r.imageNameRows.map(row => `
                <tr style="${row.pass ? '' : 'background:rgba(239,68,68,0.08);'}">
                  <td>${escapeHtml(row.filename)}</td>
                  <td class="${row.patternPass ? 'val-pass' : 'val-fail'}">${row.patternPass ? 'OK' : 'Mismatch'}</td>
                  <td class="${row.sequenceIssue ? 'val-fail' : 'val-pass'}">${row.sequenceIssue ? 'Out of sequence' : (row.patternPass ? 'OK' : '—')}</td>
                  <td><span class="status-badge ${row.pass ? 'status-pass' : 'status-fail'}">${row.pass ? 'PASS' : 'FAIL'}</span></td>
                  <td class="${row.pass ? '' : 'rule-fail-text'}">${escapeHtml(row.reason) || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.imageNameRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'unwantedTag') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No unwanted tags found</p>`;
      } else {
        const typeClass = {
          'Empty Tag': 'status-warn',
          'Orphan Closing Tag': 'status-fail',
          'Unclosed Tag': 'status-fail'
        };
        tableBody = `
          <p class="rule-fail-text">${r.unwantedTagRows.length} issue(s) found</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Tag</th>
                <th>Class</th>
                <th>Snippet</th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              ${r.unwantedTagRows.map(row => `
                <tr>
                  <td><span class="status-badge ${typeClass[row.type] || 'status-fail'}">${escapeHtml(row.type)}</span></td>
                  <td>${escapeHtml(row.tagName)}</td>
                  <td>${escapeHtml(row.className)}</td>
                  <td><code>${escapeHtml(row.snippet)}</code></td>
                  <td class="rule-fail-text">${escapeHtml(row.issue)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.unwantedTagRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'pagebreakChecker') {
      if (r.notApplicable) {
        tableBody = `<p class="rule-na-text">Not applicable for this matter type</p>`;
      } else if (!r.pagebreakRows || r.pagebreakRows.length === 0) {
        tableBody = `
          <div class="pagebreak-summary pass">
            <span class="val-pass">${escapeHtml(r.pagebreakSummary)}</span>
          </div>`;
      } else {
        const typeIcon = { missing: 'MISSING', duplicate: 'DUPLICATE', order: 'ORDER' };
        const typeClass = { missing: 'rule-fail-text', duplicate: 'rule-warn-text', order: 'rule-warn-text' };

        tableBody = `
          <div class="pagebreak-summary">
            <span class="pagebreak-summary-text">${escapeHtml(r.pagebreakSummary)}</span>
          </div>
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${r.pagebreakRows.map(row => `
                <tr>
                  <td>
                    <span class="status-badge ${row.type === 'missing' ? 'status-fail' : 'status-warn'}">
                      ${row.type.toUpperCase()}
                    </span>
                  </td>
                  <td class="${typeClass[row.type] || 'rule-fail-text'}">
                    ${typeIcon[row.type] || ''} ${escapeHtml(row.message)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>`;
      }
    } else if (r.name === 'anchorTextDisplay') {
      if (!r.anchorTexts || r.anchorTexts.length === 0) {
        tableBody = `<p class="rule-na-text">No anchor texts found.</p>`;
      } else {
        const items = r.anchorTexts.map((a, i) => `
          <li style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <span>
              <span style="font-weight:700;font-size:1rem;">${i + 1}. ${escapeHtml(a.text)}</span>
              <span style="color:var(--accent);margin-left:12px;font-family:monospace;font-size:0.95rem;">${escapeHtml(a.href)}</span>
            </span>
            ${lineColBox(a.line, a.col)}
          </li>`).join('');
        tableBody = `<ol style="list-style:none;padding:1rem 1.2rem;">${items}</ol>`;
      }
    } else if (r.name === 'crossFileHrefCheck') {
      if (r.pass) {
        tableBody = `<p class="val-pass">All cross-file hrefs end with .xhtml</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.crossFileHrefRows.filter(row => !row.pass).length} cross-file href(s) do not end with .xhtml</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Href</th>
                <th>Anchor Text</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${r.crossFileHrefRows.map(row => `
                <tr>
                  <td><code>${escapeHtml(row.href)}</code></td>
                  <td>${escapeHtml(row.text)}</td>
                  <td><span class="status-badge ${row.pass ? 'status-pass' : 'status-fail'}">${row.pass ? 'PASS' : 'FAIL'}</span></td>
                  <td class="${row.pass ? '' : 'rule-fail-text'}">${escapeHtml(row.reason) || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.crossFileHrefRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'crossFileAnchorDisplay') {
      if (!r.crossFileAnchors || r.crossFileAnchors.length === 0) {
        tableBody = `<p class="rule-na-text">No cross-file .xhtml anchors found.</p>`;
      } else {
        tableBody = `
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th style="padding-left:2rem;">Anchor Text</th>
              </tr>
            </thead>
            <tbody>
              ${r.crossFileAnchors.map(a => `
                <tr>
                  <td><code>${escapeHtml(a.href)}</code></td>
                  <td style="padding-left:2rem;">${escapeHtml(a.text)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.crossFileAnchors.map(a => `<div class="location-row">${lineColBox(a.line, a.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'tableStructureCheck') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No table structure issues found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.tableStructureRows.length} table structure issue(s) found</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Issue Type</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              ${r.tableStructureRows.map(row => `
                <tr>
                  <td class="rule-fail-text">${escapeHtml(row.type)}</td>
                  <td>${escapeHtml(row.detail)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.tableStructureRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'boldSpaceCheck') {
      if (r.pass) {
        tableBody = `<p class="val-pass">No <b> tags start with a space</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.boldSpaceRows.length} <b> tag(s) start with a space</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              ${r.boldSpaceRows.map(row => `
                <tr>
                  <td>${escapeHtml(row.context)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.boldSpaceRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'listParaCheck') {
      if (r.notApplicable) {
        tableBody = `<p class="val-na">— No list tags found in this file</p>`;
      } else if (r.pass) {
        tableBody = `<p class="val-pass">No list structure issues found</p>`;
      } else {
        tableBody = `
          <p class="rule-fail-text">${r.listParaRows.length} list structure issue(s) found</p>
          <div class="table-location-wrapper">
          <table class="rule-mini-table">
            <thead>
              <tr><th>Issue</th><th>Context</th></tr>
            </thead>
            <tbody>
              ${r.listParaRows.map(row => `
                <tr>
                  <td>${escapeHtml(row.type)}</td>
                  <td>${escapeHtml(row.context)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="location-sidebar">
            ${r.listParaRows.map(row => `<div class="location-row">${lineColBox(row.line, row.col)}</div>`).join('')}
          </div>
          </div>`;
      }
    } else if (r.name === 'titleConsistencyCheck') {
      if (r.pass) {
        tableBody = `
          <div style="padding:0.75rem 1.2rem;">
            <p style="color:var(--pass);font-weight:600;">
              &#10003; Title matches: <span style="font-style:italic;">"${escapeHtml(r.title)}"</span>
            </p>
          </div>`;
      } else if (r.warning) {
        tableBody = `
          <div style="padding:0.75rem 1.2rem;">
            <p style="color:var(--warning);font-weight:600;margin-bottom:0.5rem;">
              &#9888; Title mismatch detected
            </p>
            <table class="rule-mini-table" style="width:100%;">
              <thead><tr>
                <th>This File's Title</th>
                <th>Expected Title</th>
              </tr></thead>
              <tbody><tr>
                <td style="color:var(--warning);font-weight:600;">
                  "${escapeHtml(r.title)}"
                </td>
                <td style="color:var(--pass);">
                  "${escapeHtml(r.expectedTitle)}"
                </td>
              </tr></tbody>
            </table>
          </div>`;
      } else {
        tableBody = `
          <div style="padding:0.75rem 1.2rem;">
            <p style="color:var(--fail);font-weight:600;">
              &#10007; ${escapeHtml(r.reason)}
            </p>
          </div>`;
      }
    } else {
      // Single row rule
      tableBody = `
      <div class="table-location-wrapper">
        <table class="rule-mini-table">
          <thead>
            <tr>
              <th>First Tag</th>
              <th>Class</th>
              <th>CSS Selector</th>
              <th>CSS Block</th>
              <th>Margin-Top</th>
              <th>Margin-Bottom</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(r.firstTag)}</td>
              <td>${escapeHtml(r.className)}</td>
              <td>${escapeHtml(r.cssSelector)}</td>
              <td>
                <span class="css-block-selector"
                  data-selector="${escapeHtml(r.cssSelector)}"
                  data-block="${escapeHtml(r.cssBlock)}"
                >${escapeHtml(r.cssSelector)}</span>
              </td>
              <td>${escapeHtml(r.marginTopValue)}</td>
              <td>${escapeHtml(r.marginBottomValue || '—')}</td>
              <td><span class="status-badge ${r.pass ? 'status-pass' : 'status-fail'}">${r.pass ? 'PASS' : 'FAIL'}</span></td>
              <td class="${r.pass ? '' : 'rule-fail-text'}">${r.reason ? escapeHtml(r.reason) : '—'}</td>
            </tr>
          </tbody>
        </table>
        <div class="location-sidebar">
          <div class="location-row">${lineColBox(r.line, r.col)}</div>
        </div>
      </div>`;
    }

    const headerIsWarning = r.name === 'numberHyphen'
      ? (r.warning === true || (r.numberHyphenRows && r.numberHyphenRows.length > 0))
      : r.warning === true;

    const ruleStatus = headerIsWarning ? 'WARNING' : r.pass ? 'PASS' : 'FAIL';

    return `
      <div class="rule-group" data-rule-status="${ruleStatus}">
        <div class="rule-group-header">
          <span class="rule-number">${ruleNumber}.</span>
          <span class="rule-badge">${escapeHtml(r.label)}</span>
          <span class="rule-group-status ${headerIsWarning ? 'warn' : r.pass ? 'pass' : 'fail'}">${headerIsWarning ? 'WARN' : r.pass ? 'PASS' : 'FAIL'}</span>
          ${(!r.pass && !r.notApplicable) ? buildFixedCheckbox(fileName, r.name) : ''}
        </div>
        <div class="rule-group-body">
          ${tableBody}
        </div>
      </div>`;
  }).join('');
}

/**
 * Builds a single collapsible file card for a result.
 */
function createResultCard(result) {
  const isWarning = result.status === "WARNING";
  const isFail = result.status !== "PASS" && !isWarning;
  const matterLabel = MATTER_LABELS[result.matterType] || "Unassigned";

  const badgeClass = isWarning ? "status-warn" : isFail ? "status-fail" : "status-pass";
  const badgeText = isWarning ? "WARNING" : result.status;

  const card = document.createElement("div");
  card.className = "result-card collapsed";
  card.dataset.fileName = result.fileName.toLowerCase();
  card.dataset.matterType = result.matterType;
  card.dataset.status = result.status;

  card.innerHTML = `
    <button type="button" class="card-header">
      <span class="chevron">&#9656;</span>
      <span class="card-filename">${escapeHtml(result.fileName)}</span>
      ${result.title ? `<span class="card-title${result.title !== result.expectedTitle ? ' title-mismatch' : ''}">"${escapeHtml(result.title)}"</span>` : ''}
      <span class="matter-tag matter-${result.matterType}">${escapeHtml(matterLabel)}</span>
      <span class="status-badge ${badgeClass}">${badgeText}</span>
    </button>
    <div class="card-body" hidden>
      ${buildRuleTable(result)}
    </div>
  `;

  const header = card.querySelector(".card-header");
  header.addEventListener("click", () => {
    const body = card.querySelector(".card-body");
    const isExpanded = card.classList.toggle("expanded");
    card.classList.toggle("collapsed", !isExpanded);
    body.hidden = !isExpanded;
  });

  return card;
}

/**
 * Renders the full card list from currentResults, applying the
 * active matter-type filters, FAIL-only toggle, and search term.
 */
function renderCardList() {
  const cardList = document.getElementById("cardList");
  const statusMessage = document.getElementById("statusMessage");
  const toolbar = document.getElementById("reportToolbar");

  cardList.innerHTML = "";

  if (currentResults.length === 0) {
    cardList.hidden = true;
    toolbar.hidden = true;
    statusMessage.hidden = false;
    statusMessage.textContent = "No XHTML files found under OPS/xhtml/.";
    return;
  }

  const term = searchTerm.trim().toLowerCase();

  const visible = currentResults.filter(r => {
    if (!activeFilters.has(r.matterType)) return false;
    if (statusFilter === "fail" && r.status !== "FAIL") return false;
    if (statusFilter === "warning" && r.status !== "WARNING") return false;
    if (term && !r.fileName.toLowerCase().includes(term)) return false;
    return true;
  });

  if (visible.length === 0) {
    statusMessage.hidden = false;
    statusMessage.textContent = "No files match the current filters.";
  } else {
    statusMessage.hidden = true;
  }

  for (const result of visible) {
    const card = createResultCard(result);
    cardList.appendChild(card);
    applyRuleFilter(card, statusFilter);
  }

  cardList.hidden = false;
  toolbar.hidden = false;

  if (typeof restoreFixedStates === 'function') restoreFixedStates();
}

/**
 * Hides individual .rule-group blocks inside a file card that
 * don't match the active status filter. Pure DOM show/hide.
 */
function applyRuleFilter(card, filter) {
  card.querySelectorAll('.rule-group').forEach(group => {
    const s = group.dataset.ruleStatus;
    if (filter === 'fail') {
      group.hidden = s !== 'FAIL';
    } else if (filter === 'warning') {
      group.hidden = s !== 'WARNING';
    } else {
      group.hidden = false;
    }
  });
}

const RULE_ENABLED_KEY = 'epubValidator.rulesEnabled';

function getRuleStates() {
  try {
    const raw = localStorage.getItem(RULE_ENABLED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function setRuleEnabled(ruleName, enabled) {
  const states = getRuleStates();
  states[ruleName] = enabled;
  localStorage.setItem(RULE_ENABLED_KEY, JSON.stringify(states));
}

function isRuleEnabled(ruleName) {
  const states = getRuleStates();
  return states[ruleName] !== false; // default ON
}

function getPagebreakCount() {
  const val = localStorage.getItem('epubValidator.pagebreakCount');
  return val ? parseInt(val, 10) : null;
}

function isConfigRuleVisible(ruleName) {
  const cfg = window.CONFIG_RULES;
  return !(cfg && cfg[ruleName] === false);
}

function getActiveRuleNames() {
  return QC_RULES.filter(r => isConfigRuleVisible(r.name) && isRuleEnabled(r.name)).map(r => r.name);
}

const QC_RULES = [
  { name: 'stylesheetLinkCheck', label: 'Stylesheet Link Check',                applies: 'All files',                  checks: 'Verifies that the XHTML file contains exactly: <link rel="stylesheet" type="text/css" href="../styles/stylesheet.css"/>. FAILs if missing or different.' },
  { name: 'firstTagMarginTop', label: 'First Tag Margin Top',                applies: 'All matter types',           checks: 'First tag after <body> must have margin-top: 1em' },
  { name: 'fmtitleMargins',    label: 'FM Title Margins',                     applies: 'Front Matter only',          checks: 'fmtitle* class: margin-top 1em, margin-bottom 2em' },
  { name: 'headingStyles',     label: 'Heading Styles',                       applies: 'All matter types',           checks: 'h2/h3/h4/h5 margin and font-size checks' },
  { name: 'footnoteClasses',   label: 'Footnote Font Size',                   applies: 'All matter types',           checks: 'footnote* and ref classes must have font-size: 90%' },
  { name: 'h1AuthorH2',        label: 'H1 → Author → H2',                     applies: 'All matter types',           checks: 'h1, author p, h2 margins for this sequence' },
  { name: 'h1AuthorP',         label: 'H1 → Author → P',                      applies: 'All matter types',           checks: 'h1, author p, content p margins for this sequence' },
  { name: 'h1H2',              label: 'H1 → H2',                              applies: 'All matter types',           checks: 'h1, h2 margins for this sequence' },
  { name: 'h1P',               label: 'H1 → P',                               applies: 'All matter types',           checks: 'h1, p margins for this sequence' },
  { name: 'copyrightFontSize', label: 'Copyright Font Size',                  applies: 'Front Matter only',          checks: 'All classes in Copyright.xhtml must have font-size: 100%' },
  { name: 'doubleSpace',       label: 'Double Space Check',                   applies: 'All matter types',           checks: 'Text content must not contain double spaces' },
  { name: 'tabSpace',          label: 'Tab Space Check',                      applies: 'All matter types',           checks: 'Text content must not contain 3+ consecutive spaces' },
  { name: 'capitalAfterP',     label: 'Capital Letter Check',                 applies: 'All matter types',           checks: '<p> tags must start with a capital letter' },
  { name: 'endPunctuation',    label: 'End Punctuation Check',                applies: 'All matter types',           checks: '<p> tags must end with . or ;' },
  { name: 'ampersand',         label: 'Entity Ampersand Check',               applies: 'All matter types',           checks: 'Text content must not contain &&' },
  { name: 'hyphenSpace',       label: 'Hyphen Space Check',                   applies: 'All matter types',           checks: 'Text content must not contain a hyphen followed by a space' },
  { name: 'numberHyphen',      label: 'Number Hyphen Check',                  applies: 'All matter types',           checks: 'Warns when text contains number-hyphen-number (suggest en dash)' },
  { name: 'trailingSpace',     label: 'Trailing Space After HTML',            applies: 'All matter types',           checks: 'No characters allowed after closing </html> tag' },
  { name: 'spaceAfterOpen',    label: 'Space After Opening Tag',              applies: 'All matter types',           checks: 'Tag content must not start with a space' },
  { name: 'spaceBeforeClose',  label: 'Space Before Closing Tag',             applies: 'All matter types',           checks: 'Tag content must not end with a space' },
  { name: 'dotAfterClose',     label: 'Dot After Closing Tag',                applies: 'All matter types',           checks: 'Closing tag must not be immediately followed by a dot' },
  { name: 'superscriptLink',   label: 'Superscript Link Check',               applies: 'Body Matter only',           checks: '<sup> must be wrapped in <a href> and the link target must exist' },
  { name: 'pagebreakCheck',    label: 'Pagebreak Check',                      applies: 'All matter types',           checks: 'Pagebreak ids must be a complete, consecutive series matching the page count you enter' },
  { name: 'tableImage',        label: 'Table Image Check',                    applies: 'Body Matter only',           checks: 'pageavoid .tab blocks must contain tabcaption and tabimage with correct margins' },
  { name: 'referenceCheck',    label: 'Reference Check',                      applies: 'All matter types',           checks: 'Every ref must be linked, and every ref link must point to an existing ref' },
  { name: 'cssClassCheck',     label: 'CSS Class Check',                      applies: 'All matter types',           checks: 'Every class used in the file must exist in the stylesheet' },
  { name: 'figureImage',       label: 'Figure Image Check',                   applies: 'Body Matter only',           checks: 'pageavoid .fig blocks must have correctly styled image and caption paragraphs' },
  { name: 'crossRefLink',      label: 'Cross Reference Link Check',           applies: 'All matter types',           checks: 'Figure/Table/Chapter/Ref mentions must be wrapped in <a href>' },
  { name: 'unwantedTag',       label: 'Unwanted Tag Check',                   applies: 'All matter types',           checks: 'No empty tags, orphan closing tags, or unclosed tags' },
  { name: 'imageNameCheck',    label: 'Image Name Check',                     applies: 'Body Matter only',           checks: 'Image filenames must match {chapter}-###.png and be sequential from 001' },
  { name: 'anchorTextDisplay', label: 'Anchor Text Display',                  applies: 'All matter types',           checks: 'Displays the inner text of every <a> tag as a numbered list. Pagebreak markers are ignored. Informational only — always PASS.' },
  { name: 'figureAnchorCheck', label: 'Figure Anchor Check',                  applies: 'All matter types',           checks: 'Bidirectional integrity: every id must be linked by an <a href="#id"> in the same file, and every <a href="#id"> must point to an existing id. Pagebreak ids are skipped.' },
  { name: 'titleConsistencyCheck', label: 'Title Consistency Check',          applies: 'All files',                  checks: 'Checks that every XHTML file has a <title> tag matching the most common title across all files. FAIL if missing, WARNING if different.' },
  { name: 'crossFileHrefCheck', label: 'Cross-File Href Check',              applies: 'All matter types',            checks: 'Every <a href="..."> pointing to another file (no # in href) must end with .xhtml. FAILs otherwise.' },
  { name: 'crossFileAnchorDisplay', label: 'Cross-File Anchor Display',      applies: 'All matter types',            checks: 'Displays every cross-file .xhtml anchor (href, text) as a list. Informational only — always PASS.' },
  { name: 'tableStructureCheck', label: 'Table Structure Check', applies: 'All matter types', checks: 'Every <table> must have <thead> and <tbody>. No <td> directly inside <thead>/<tbody> without <tr>. No <th> tags allowed.' },
  { name: 'boldSpaceCheck', label: 'Bold Space Check', applies: 'All matter types', checks: '<b> tags must not have content starting with a space' },
  { name: 'listParaCheck', label: 'List Para Check', applies: 'All matter types', checks: 'Checks 6 list structure errors: <p> before <li>, nested list without <li>, orphan <li>, empty <li>, empty <p> in <li>, unclosed <li>' },
];

function ensureRulesContinueButton() {
  let btn = document.getElementById('rulesToolbarContinueBtn');
  if (btn) return btn;

  const toolbar = document.querySelector('.rules-toolbar');
  if (!toolbar) return null;

  btn = document.createElement('button');
  btn.id = 'rulesToolbarContinueBtn';
  btn.type = 'button';
  btn.className = 'btn primary small rules-toolbar-continue-btn';
  btn.innerHTML = 'Continue <span class="btn-arrow">&#8594;</span>';
  btn.addEventListener('click', () => {
    const continueBtn = document.getElementById('continueToReportBtn');
    if (continueBtn) continueBtn.click();
  });
  toolbar.appendChild(btn);
  return btn;
}

function renderRulesManager() {
  const list = document.getElementById('rulesManagerList');
  const toolbar = document.querySelector('.rules-toolbar');
  if (!list) return;

  const rules = QC_RULES.filter(r => isConfigRuleVisible(r.name));

  if (toolbar) toolbar.hidden = false;
  ensureRulesContinueButton();

  list.innerHTML = rules.map(r => {
    const enabled = isRuleEnabled(r.name);
    const extraConfig = r.name === 'pagebreakChecker' ? `
      <div class="rule-config-row">
        <label class="rule-config-label">Total Page Count:</label>
        <input
          type="number"
          id="pagebreakCountInput"
          class="rule-config-input"
          min="1"
          placeholder="e.g. 18"
          value="${getPagebreakCount() || ''}"
        >
        <span class="rule-config-hint">Enter total number of pages expected in this chapter</span>
      </div>
    ` : '';

    return `
      <div class="rule-manager-card ${enabled ? 'rule-enabled' : 'rule-disabled'}">
        <div class="rule-manager-info">
          <div class="rule-manager-label">${escapeHtml(r.label)}</div>
          <div class="rule-manager-applies">${escapeHtml(r.applies)}</div>
          <div class="rule-manager-checks">${escapeHtml(r.checks)}</div>
          ${extraConfig}
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="toggle-input" data-rule="${r.name}" ${enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }).join('');

  // Wire toggle inputs
  list.querySelectorAll('.toggle-input').forEach(input => {
    input.addEventListener('change', () => {
      setRuleEnabled(input.dataset.rule, input.checked);
      input.closest('.rule-manager-card').classList.toggle('rule-enabled', input.checked);
      input.closest('.rule-manager-card').classList.toggle('rule-disabled', !input.checked);
    });
  });

  // Wire pagebreak count input
  const pagebreakInput = document.getElementById('pagebreakCountInput');
  if (pagebreakInput) {
    pagebreakInput.addEventListener('input', () => {
      const val = parseInt(pagebreakInput.value, 10);
      if (!isNaN(val) && val > 0) {
        localStorage.setItem('epubValidator.pagebreakCount', val);
      }
    });
  }
}

/**
 * Removes the legacy "FAIL only" button (from index.html) and any
 * previously-injected "Warning only" button, wraps the remaining
 * matter-type buttons in .matter-filters, and appends the
 * Status: [All/FAIL only/Warning only] dropdown as a sibling —
 * all without touching index.html.
 */
function ensureStatusFilterDropdown() {
  const failBtn = document.querySelector('.filter-toggle[data-filter="failOnly"]');
  if (failBtn) failBtn.remove();

  const warningBtn = document.querySelector('.filter-toggle[data-filter="warningOnly"]');
  if (warningBtn) warningBtn.remove();

  const filterBar = document.querySelector('.filter-bar');
  if (!filterBar) return null;

  let matterWrapper = filterBar.querySelector('.matter-filters');
  if (!matterWrapper) {
    matterWrapper = document.createElement('div');
    matterWrapper.className = 'matter-filters';
    filterBar.querySelectorAll('.filter-toggle[data-filter="front"], .filter-toggle[data-filter="body"], .filter-toggle[data-filter="end"]')
      .forEach(btn => matterWrapper.appendChild(btn));
    filterBar.insertBefore(matterWrapper, filterBar.firstChild);
  }

  let wrapper = document.querySelector('.status-filter-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'status-filter-wrapper';
    wrapper.innerHTML = `
      <span class="status-filter-label">Status:</span>
      <select class="status-filter-select" id="status-filter">
        <option value="all">All</option>
        <option value="fail">FAIL only</option>
        <option value="warning">Warning only</option>
      </select>
    `;
    filterBar.appendChild(wrapper);
  }

  return wrapper;
}

function setupToolbarHandlers() {
  const toolbar = document.getElementById("reportToolbar");
  ensureStatusFilterDropdown();
  if (toolbar.dataset.wired) return;
  toolbar.dataset.wired = "true";

  toolbar.querySelectorAll(".filter-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.filter;

      if (activeFilters.has(key)) {
        activeFilters.delete(key);
        btn.classList.remove("active");
      } else {
        activeFilters.add(key);
        btn.classList.add("active");
      }

      renderCardList();
    });
  });

  const statusSelect = document.getElementById("status-filter");
  if (statusSelect) {
    statusSelect.addEventListener("change", () => {
      statusFilter = statusSelect.value;
      renderCardList();
    });
  }

  const searchInput = document.getElementById("searchInput");
  const searchClearBtn = document.getElementById("searchClearBtn");

  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value;
    searchClearBtn.hidden = searchTerm.length === 0;
    renderCardList();
  });

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchTerm = "";
    searchClearBtn.hidden = true;
    renderCardList();
    searchInput.focus();
  });
}

/**
 * Builds the Pagebreak Check (06) sidebar panel for Full EPUB mode.
 * Validates the stitched pagebreak sequence across all files, in
 * bucket order, and renders one chip block per file plus a total
 * expected/found status bar.
 */
const ROMAN_LOOKUP = {
  'i':1, 'ii':2, 'iii':3, 'iv':4, 'v':5,
  'vi':6, 'vii':7, 'viii':8, 'ix':9, 'x':10,
  'xi':11, 'xii':12, 'xiii':13, 'xiv':14, 'xv':15,
  'xvi':16, 'xvii':17, 'xviii':18, 'xix':19, 'xx':20
};
const ROMAN_TO_INT = s => ROMAN_LOOKUP[String(s).toLowerCase().trim()] || 0;
const INT_TO_ROMAN = Object.fromEntries(
  Object.entries(ROMAN_LOOKUP).map(([r, n]) => [n, r])
);

function buildPagebreakPanel(stitched, expectedTotal) {
  const content = document.getElementById('pagebreak-panel-content');
  if (!content) return;

  const isRomanVal = v => String(v).toLowerCase().trim() in ROMAN_LOOKUP;
  const isNumericVal = v => /^\d+$/.test(v);
  const fileIsRoman = f => f.pagebreaks.every(p => isRomanVal(p));

  stitched = [...stitched].sort((a, b) => {
    const aIsRoman = a.pagebreaks.every(p => isRomanVal(p)) ? 0 : 1;
    const bIsRoman = b.pagebreaks.every(p => isRomanVal(p)) ? 0 : 1;
    if (aIsRoman !== bIsRoman) return aIsRoman - bIsRoman;
    // both numeric — sort by minimum value
    const minVal = arr => Math.min(...arr.pagebreaks
      .filter(p => /^\d+$/.test(String(p)))
      .map(p => parseInt(p, 10)));
    return minVal(a) - minVal(b);
  });

  // PASS 1 — Roman files only, validated as their own consecutive
  // sequence (1, 2, 3, ...), completely independent of numeric files.
  const romanFiles = stitched.filter(f => f.pagebreaks.every(p => isRomanVal(p)));
  const romanEntries = romanFiles.flatMap(f =>
    f.pagebreaks.map(value => ({ fileName: f.fileName, value, n: ROMAN_TO_INT(String(value)) }))
  );

  // PASS 2 — Numeric files only, validated as their own consecutive
  // sequence (1, 2, 3, ...), completely independent of roman files.
  const numericFiles = stitched.filter(f => f.pagebreaks.some(p => isNumericVal(p)));
  numericFiles.sort((a, b) => {
    const nums = arr => arr.pagebreaks
      .filter(p => /^\d+$/.test(String(p)))
      .map(p => parseInt(p, 10));
    const aMin = Math.min(...nums(a));
    const bMin = Math.min(...nums(b));
    return aMin - bMin;
  });
  const numericEntries = numericFiles.flatMap(f =>
    f.pagebreaks.map(value => ({ fileName: f.fileName, value, n: parseInt(value, 10) }))
  );

  const statusByEntry = new Map(); // entry -> 'correct' | 'error'
  const missingByFile = new Map();    // fileName -> [values]
  const duplicatesByFile = new Map(); // fileName -> [values]

  function validatePass(group) {
    const counts = new Map();
    group.forEach(e => counts.set(e.n, (counts.get(e.n) || 0) + 1));

    const ints = group.map(e => e.n);
    const maxN = ints.length ? Math.max(...ints) : 0;
    const present = new Set(ints);

    const missing = [];
    for (let n = 1; n <= maxN; n++) {
      if (!present.has(n)) missing.push(n);
    }

    group.forEach(e => {
      const isDuplicate = counts.get(e.n) > 1;
      const inSequence = e.n >= 1 && e.n <= maxN;
      statusByEntry.set(e, isDuplicate || !inSequence ? 'error' : 'correct');
    });

    // Attribute missing/duplicate values to every file in this pass —
    // these are per-type (roman or numeric) issues, never mixed.
    const duplicateValues = [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n);
    const fileNames = new Set(group.map(e => e.fileName));
    fileNames.forEach(fileName => {
      missingByFile.set(fileName, missing);
      duplicatesByFile.set(fileName, duplicateValues);
    });
  }

  validatePass(romanEntries);
  validatePass(numericEntries);

  const allEntries = [...romanEntries, ...numericEntries];
  const actualTotal = allEntries.length;
  const totalPass = expectedTotal ? actualTotal === expectedTotal : true;

  let html = `
    <div class="pagebreak-total-bar">
      <span>Expected total: <strong>${escapeHtml(String(expectedTotal ?? '—'))}</strong></span>
      <span>Found total: <strong>${escapeHtml(String(actualTotal))}</strong></span>
      <span class="status-${totalPass ? 'pass' : 'fail'}">${totalPass ? 'PASS' : 'FAIL'}</span>
    </div>`;

  stitched.forEach(f => {
    const fileEntries = allEntries.filter(e => e.fileName === f.fileName);
    const fileMissing = missingByFile.get(f.fileName) || [];
    const fileDuplicates = duplicatesByFile.get(f.fileName) || [];
    const filePass = fileEntries.every(e => statusByEntry.get(e) === 'correct')
                  && fileMissing.length === 0
                  && fileDuplicates.length === 0;

    const chips = fileEntries.map(e => {
      const status = statusByEntry.get(e);
      return `<span class="pb-chip ${status === 'correct' ? 'pb-correct' : 'pb-error'}">${escapeHtml(String(e.value))}</span>`;
    }).join('');

    // Missing/duplicate values shown here always come from the SAME
    // type (roman or numeric) as this file's own pagebreaks.
    const isRomanFile = fileIsRoman(f);
    const displayN = n => isRomanFile ? (INT_TO_ROMAN[n] || n) : n;
    const fileIssues = (fileMissing.length || fileDuplicates.length)
      ? [
          fileMissing.length ? `Missing: ${fileMissing.map(displayN).join(', ')}` : '',
          fileDuplicates.length ? `Duplicates: ${fileDuplicates.map(displayN).join(', ')}` : ''
        ].filter(Boolean).join(' | ')
      : '';

    html += `
      <div class="pagebreak-file-block">
        <div class="pagebreak-file-header">
          &#128196; ${escapeHtml(f.fileName)}
          <span class="pagebreak-file-count">${fileEntries.length} pagebreaks</span>
          ${fileIssues ? `<span class="pagebreak-file-issues-inline">${fileIssues}</span>` : ''}
          <span class="status-${filePass ? 'pass' : 'fail'}">${filePass ? 'PASS' : 'FAIL'}</span>
        </div>
        <div class="pagebreak-chips">${chips}</div>
      </div>`;
  });

  content.innerHTML = html;
}

/**
 * Renders both the summary and the card list for a set of results.
 */
function renderReport(results) {
  currentResults = results;
  activeFilters = new Set(["front", "body", "end"]);
  statusFilter = "all";
  searchTerm = "";
  currentOutputFilter = "all";

  const outputFilterBar = document.getElementById("outputFilterBar");
  if (outputFilterBar) {
    outputFilterBar.querySelectorAll(".filter-toggle").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.outputFilter === "all");
    });
  }

  const searchInput = document.getElementById("searchInput");
  const searchClearBtn = document.getElementById("searchClearBtn");
  if (searchInput) searchInput.value = "";
  if (searchClearBtn) searchClearBtn.hidden = true;

  ensureStatusFilterDropdown();

  const statusSelect = document.getElementById("status-filter");
  if (statusSelect) statusSelect.value = "all";

  document.querySelectorAll(".filter-toggle").forEach(btn => {
    btn.classList.add("active");
  });

  setupToolbarHandlers();
  renderSummary(results);
  renderCardList();

  // switch to Validation Report tab
  rulesUnlocked = true;
  document.getElementById('navReport').classList.remove('nav-locked');
  switchTab('report');

  const revalidateBtn = document.getElementById('revalidateBtn');
  if (revalidateBtn) revalidateBtn.hidden = false;

  outputUnlocked = true;
  const navOutput = document.getElementById('navOutput');
  if (navOutput) navOutput.classList.remove('nav-locked');

  populateOutputSidebar(results);
  setupOutputFilterBar();
  populateOutputPanel(results);

  // Tag Index tab: only unlocked once validation has run
  renderTagClassPanel(lastParsedFiles);
  const navTagclass = document.getElementById('navTagclass');
  if (navTagclass) navTagclass.classList.remove('nav-locked');
}

function toggleOutputFile(header) {
  const rules = header.nextElementSibling;
  const arrow = header.querySelector('.output-toggle-arrow');
  rules.classList.toggle('collapsed');
  arrow.textContent = rules.classList.contains('collapsed') ? '>' : 'v';
}

function populateOutputPanel(results) {
  const content = document.getElementById('output-panel-content');
  if (!content) return;

  let html = '';

  for (const fileResult of results) {
    const applicableRules = fileResult.ruleResults.filter(r => !r.notApplicable && !(r.name === 'pagebreakCheck' && window.fullEpubPagebreak));
    const hasFail = applicableRules.some(r => !r.pass);
    const hasWarning = applicableRules.some(r => r.warning);

    const fileStatusClass = hasFail ? 'fail' : hasWarning ? 'warning' : 'pass';
    const fileStatusText = hasFail ? 'FAIL' : hasWarning ? 'WARNING' : 'PASS';

    html += `
      <div class="output-file" data-file-status="${fileStatusText}">
        <div class="output-file-header" onclick="toggleOutputFile(this)">
          <span class="output-toggle-arrow">&gt;</span>
          <span class="output-filename">${escapeHtml(fileResult.fileName)}</span>
          <span class="output-file-status ${fileStatusClass}">${fileStatusText}</span>
        </div>
        <div class="output-rules collapsed">
    `;

    fileResult.ruleResults.forEach((rule, ruleIndex) => {
      if (rule.name === 'pagebreakCheck' && window.fullEpubPagebreak) return;
      const ruleNumber = ruleIndex + 1;
      const isNA = rule.notApplicable;
      const icon = isNA
        ? '&mdash;'
        : rule.warning
          ? 'WARN'
          : rule.pass
            ? 'PASS'
            : 'FAIL';

      const statusClass = isNA
        ? 'na'
        : rule.warning
          ? 'warning'
          : rule.pass
            ? 'pass'
            : 'fail';

      const ruleStatus = isNA ? 'NA' : rule.warning ? 'WARNING' : rule.pass ? 'PASS' : 'FAIL';

      const naText = isNA ? ' (N/A)' : '';
      const clickable = !isNA && (!rule.pass || rule.warning);
      const ruleDataAttr = JSON.stringify(rule).replace(/'/g, '&#39;');

      html += `
        <div class="output-rule ${statusClass}"
             data-rule-status="${ruleStatus}"
             data-rule='${ruleDataAttr}'
             ${clickable ? 'onclick="showRuleDetail(this)"' : ''}>
          <span class="output-rule-icon">${icon}</span>
          <span class="rule-number">${ruleNumber}.</span>
          <span class="output-rule-label">
            ${escapeHtml(rule.label)}${naText}
          </span>
        </div>
      `;
    });

    html += `</div></div>`;
  }

  content.innerHTML = html || '<p class="no-output">No validation results yet.</p>';
  filterByRuleStatus(currentOutputFilter);
}

let currentOutputFilter = 'all';

/**
 * Pure DOM show/hide for the Output panel filter bar. Does not
 * re-validate — just toggles visibility of already-rendered
 * .output-rule blocks and their parent .output-file cards.
 */
function filterByRuleStatus(filter) {
  currentOutputFilter = filter;
  const content = document.getElementById('output-panel-content');
  if (!content) return;

  content.querySelectorAll('.output-file').forEach(fileCard => {
    let anyVisible = false;

    fileCard.querySelectorAll('.output-rule').forEach(ruleEl => {
      const status = ruleEl.dataset.ruleStatus;
      const show = filter === 'all'
        || (filter === 'fail' && status === 'FAIL')
        || (filter === 'warning' && status === 'WARNING');
      ruleEl.hidden = !show;
      if (show) anyVisible = true;
    });

    fileCard.hidden = filter === 'all' ? false : !anyVisible;
  });
}

function setupOutputFilterBar() {
  const bar = document.getElementById('outputFilterBar');
  if (!bar || bar.dataset.wired) return;
  bar.dataset.wired = 'true';

  bar.querySelectorAll('.filter-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.filter-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterByRuleStatus(btn.dataset.outputFilter);
    });
  });
}

function buildSimpleTable(headers, rows) {
  if (!rows || rows.length === 0) return '';
  let html = '<table class="rule-modal-table">';
  html += '<thead><tr>' + headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead>';
  html += '<tbody>';
  for (const row of rows) {
    html += '<tr>' + row.map(cell => {
      const str = String(cell ?? '—');
      // Cells pre-wrapped in <code>...</code> (already escaped by the
      // caller) render as-is; everything else is escaped here.
      const isPreformatted = /^<code>[\s\S]*<\/code>$/.test(str);
      return `<td>${isPreformatted ? str : escapeHtml(str)}</td>`;
    }).join('') + '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function showRuleDetail(el) {
  const rule = JSON.parse(el.getAttribute('data-rule'));

  // Only show popup for fail or warning
  if (rule.pass && !rule.warning) return;
  if (rule.notApplicable) return;

  const modal = document.getElementById('rule-detail-modal');
  const title = document.getElementById('rule-modal-title');
  const body  = document.getElementById('rule-modal-body');

  const icon = rule.warning ? 'WARN' : 'FAIL';
  title.innerHTML = `${icon} ${escapeHtml(rule.label)}`;

  let content = '';

  if (rule.reason) {
    content += `<p class="rule-modal-reason">${escapeHtml(rule.reason)}</p>`;
  }

  if (rule.doubleSpaceRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text'],
      rule.doubleSpaceRows.map(r => [r.tagName, r.className, r.text])
    );
  }
  if (rule.tabSpaceRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text'],
      rule.tabSpaceRows.map(r => [r.tagName, r.className, r.text])
    );
  }
  if (rule.capitalRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text'],
      rule.capitalRows.map(r => [r.tagName, r.className, r.text])
    );
  }
  if (rule.endPuncRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text'],
      rule.endPuncRows.map(r => [r.tagName, r.className, r.text])
    );
  }
  if (rule.ampersandRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text'],
      rule.ampersandRows.map(r => [r.tagName, r.className, r.text])
    );
  }
  if (rule.hyphenSpaceRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text'],
      rule.hyphenSpaceRows.map(r => [r.tagName, r.className, r.text])
    );
  }
  if (rule.numberHyphenRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text', 'Matches'],
      rule.numberHyphenRows.map(r => [r.tagName, r.className, r.text, (r.matches||[]).join(', ')])
    );
  }
  if (rule.spaceAfterOpenRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text'],
      rule.spaceAfterOpenRows.map(r => [r.tagName, r.className, r.rawSnippet ?? r.text])
    );
  }
  if (rule.spaceBeforeCloseRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Text'],
      rule.spaceBeforeCloseRows.map(r => [r.tagName, r.className, r.rawSnippet ?? r.text])
    );
  }
  if (rule.dotAfterCloseRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Snippet'],
      rule.dotAfterCloseRows.map(r => [r.tagName, r.snippet])
    );
  }
  if (rule.superscriptRows?.length) {
    content += buildSimpleTable(
      ['Superscript', 'Issue', 'Href', 'Target Found'],
      rule.superscriptRows.map(r => [r.text, r.issue, r.href, r.targetExists ? 'Yes' : 'No'])
    );
  }
  if (rule.pagebreakRows?.length) {
    content += buildSimpleTable(
      ['Check', 'Expected', 'Found', 'Status', 'Reason'],
      rule.pagebreakRows.map(r => [r.check, r.expected, r.found, r.pass ? 'PASS' : 'FAIL', r.reason])
    );
  }
  if (rule.headingRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Margin Top', 'Margin Bottom', 'Font Size', 'Status'],
      rule.headingRows.map(r => [r.tagName, r.className, r.marginTop, r.marginBottom, r.fontSize, r.pass ? 'PASS' : 'FAIL'])
    );
  }
  if (rule.footnoteRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Issue'],
      rule.footnoteRows.map(r => [r.tagName, r.className, r.reason])
    );
  }
  if (rule.h1Rows?.length) {
    content += buildSimpleTable(
      ['Scenario', 'Status', 'Reason'],
      rule.h1Rows.map(r => [r.scenario || r.check, r.pass ? 'PASS' : 'FAIL', r.reason])
    );
  }
  if (rule.copyrightRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Font Size', 'Status'],
      rule.copyrightRows.map(r => [r.tagName, r.className, r.fontSize, r.pass ? 'PASS' : 'FAIL'])
    );
  }
  if (rule.tableImageRows?.length) {
    content += buildSimpleTable(
      ['ID', 'Caption', 'Image', 'Status', 'Reason'],
      rule.tableImageRows.map(r => [r.id, r.hasCaption ? 'Yes' : 'No', r.hasImage ? 'Yes' : 'No', r.pass ? 'PASS' : 'FAIL', r.reason])
    );
  }
  if (rule.figureImageRows?.length) {
    content += buildSimpleTable(
      ['ID', 'Image Class', 'Caption Class', 'Status', 'Reason'],
      rule.figureImageRows.map(r => [r.id, r.imageClass, r.captionClass, r.pass ? 'PASS' : 'FAIL', r.reason])
    );
  }
  if (rule.referenceRows?.length) {
    content += buildSimpleTable(
      ['Type', 'ID', 'Issue'],
      rule.referenceRows.map(r => [r.type, r.id, r.issue])
    );
  }
  if (rule.cssClassRows?.length) {
    content += buildSimpleTable(
      ['Tag', 'Class', 'Looked For', 'Result'],
      rule.cssClassRows.map(r => [r.tagName, r.className, r.lookedFor.join(', '), 'Not Found'])
    );
  }
  if (rule.crossRefRows?.length) {
    content += buildSimpleTable(
      ['Matched Text', 'Issue'],
      rule.crossRefRows.map(r => [r.matchedText, r.issue])
    );
  }
  if (rule.figureAnchorRows?.length) {
    content += buildSimpleTable(
      ['Type', 'ID / href', 'Issue'],
      rule.figureAnchorRows.map(r => [r.type, r.id, r.issue])
    );
  }
  if (rule.unwantedTagRows?.length) {
    content += buildSimpleTable(
      ['Type', 'Tag', 'Class', 'Snippet', 'Issue'],
      rule.unwantedTagRows.map(r => [
        r.type,
        r.tagName,
        r.className || '—',
        `<code>${escapeHtml(r.snippet)}</code>`,
        r.issue
      ])
    );
  }
  if (rule.trailingSpaceRows?.length) {
    content += `<p class="rule-modal-reason">
      Characters found after &lt;/html&gt;:
      ${rule.trailingSpaceRows[0]?.charCount || 0}
    </p>`;
  }

  if (!content) {
    content = `<p class="rule-modal-reason">${escapeHtml(rule.reason || 'No details available')}</p>`;
  }

  body.innerHTML = content;
  modal.classList.remove('hidden');
}

document.getElementById('rule-modal-close')
  .addEventListener('click', () => {
    document.getElementById('rule-detail-modal').classList.add('hidden');
  });

document.getElementById('rule-detail-modal')
  .addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
    }
  });

function populateOutputSidebar(results) {
  const content = document.getElementById('output-sidebar-content');
  if (!content) return;

  let html = '';

  for (const fileResult of results) {
    html += `
      <div class="sidebar-file">
        <div class="sidebar-filename">${escapeHtml(fileResult.fileName)}</div>
        <div class="sidebar-rules">
    `;

    for (const rule of fileResult.ruleResults) {
      // Skip notApplicable rules
      if (rule.notApplicable) continue;
      if (rule.name === 'pagebreakCheck' && window.fullEpubPagebreak) continue;

      const icon = rule.warning
        ? 'WARN'
        : rule.pass
          ? 'PASS'
          : 'FAIL';

      const statusClass = rule.warning
        ? 'warning'
        : rule.pass
          ? 'pass'
          : 'fail';

      html += `
        <div class="sidebar-rule ${statusClass}">
          <span class="sidebar-rule-label">${escapeHtml(rule.label)}</span>
          <span class="sidebar-rule-icon">${icon}</span>
        </div>
      `;
    }

    html += `</div></div>`;
  }

  content.innerHTML = html;
}

/**
 * Aggregates tag/class usage across all parsed files into
 *   { tagName: { className: { totalCount, files: { fileName: count } } } }
 * Counts every occurrence using each file's allTags inventory from
 * parseXhtmlAllTags(). Multi-class attributes ("indent center") are
 * split so each class is counted separately.
 */
function buildTagClassIndex(parsedFiles) {
  const index = {};

  for (const file of parsedFiles || []) {
    for (const { tagName, className } of file.allTags || []) {
      if (!className) continue;
      const classes = className.split(/\s+/).filter(Boolean);
      for (const cls of classes) {
        if (!index[tagName]) index[tagName] = {};
        if (!index[tagName][cls]) {
          index[tagName][cls] = { totalCount: 0, files: {} };
        }
        const entry = index[tagName][cls];
        entry.totalCount++;
        entry.files[file.fileName] = (entry.files[file.fileName] || 0) + 1;
      }
    }
  }

  return index;
}

// cssBlocks map of the last validated run, for the class → CSS modal
let tagClassCssBlocks = {};

function tagClassShortName(fileName) {
  return fileName.split('/').pop();
}

/**
 * Renders the Tag Index tab pane. Tags sorted alphabetically as
 * collapsible groups; classes sorted by count descending.
 * Classes used in more than one file get a collapsible per-file
 * breakdown; single-file classes render flat with the file name
 * inline. Clicking a class name opens the CSS block modal.
 */
function renderTagClassPanel(parsedFiles) {
  const content = document.getElementById('tagclass-panel-content');
  if (!content) return;

  tagClassCssBlocks = (parsedFiles && parsedFiles[0] && parsedFiles[0].cssBlocks) || {};

  const index = buildTagClassIndex(parsedFiles);
  const tags = Object.keys(index).sort((a, b) => a.localeCompare(b));

  if (tags.length === 0) {
    content.innerHTML = '<p class="tagclass-empty">No class usage found. Run validation first.</p>';
    return;
  }

  content.innerHTML = tags.map(tag => {
    const classes = Object.entries(index[tag])
      .sort((a, b) => b[1].totalCount - a[1].totalCount || a[0].localeCompare(b[0]));

    const classRows = classes.map(([cls, data]) => {
      const fileEntries = Object.entries(data.files)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const multiFile = fileEntries.length > 1;

      const nameBtn = `
        <button type="button" class="tagclass-class-name"
          data-tag="${escapeHtml(tag)}" data-class="${escapeHtml(cls)}"
          title="Show CSS for ${escapeHtml(tag)}.${escapeHtml(cls)}"
        >${escapeHtml(cls)}</button>`;

      if (!multiFile) {
        const [fileName, count] = fileEntries[0];
        return `
          <div class="tagclass-class-row">
            <span class="tagclass-bullet">&bull;</span>
            ${nameBtn}
            <span class="tagclass-count">${count}&times;</span>
            <span class="tagclass-file-inline" title="${escapeHtml(fileName)}">&mdash; ${escapeHtml(tagClassShortName(fileName))}</span>
          </div>`;
      }

      const fileRows = fileEntries.map(([fileName, count], i) => {
        const branch = i === fileEntries.length - 1 ? '&#9492;&#9472;&#9472;' : '&#9500;&#9472;&#9472;';
        return `
          <div class="tagclass-file-row" title="${escapeHtml(fileName)}">
            <span class="tagclass-branch">${branch}</span>
            <span class="tagclass-file-name">${escapeHtml(tagClassShortName(fileName))}</span>
            <span class="tagclass-count">${count}&times;</span>
          </div>`;
      }).join('');

      return `
        <div class="tagclass-class">
          <div class="tagclass-class-row tagclass-expandable" role="button">
            <span class="tagclass-chevron">&#9654;</span>
            ${nameBtn}
            <span class="tagclass-count">${fileEntries.length} files, ${data.totalCount}&times;</span>
          </div>
          <div class="tagclass-files" hidden>${fileRows}</div>
        </div>`;
    }).join('');

    return `
      <div class="tagclass-group">
        <button type="button" class="tagclass-tag-header">
          <span class="tagclass-chevron">&#9656;</span>
          <span class="tagclass-tag-name">${escapeHtml(tag)}</span>
          <span class="tagclass-count">${classes.length} class${classes.length === 1 ? '' : 'es'}</span>
        </button>
        <div class="tagclass-classes" hidden>${classRows}</div>
      </div>`;
  }).join('');
}

// Delegated clicks for the Tag Index pane:
//  - class name → CSS block modal (reuses #cssModal)
//  - tag group header / multi-file class row → expand/collapse
document.addEventListener('click', (e) => {
  const nameBtn = e.target.closest('.tagclass-class-name');
  if (nameBtn) {
    const tag = nameBtn.dataset.tag;
    const cls = nameBtn.dataset.class;
    const selector = `${tag}.${cls}`;
    const blockMatch = lookupCssBlock(tagClassCssBlocks, cls, tag);
    openCssModal(
      selector,
      blockMatch ? blockMatch.block : `No CSS rule found for ${selector}`
    );
    return;
  }

  const expandRow = e.target.closest('.tagclass-expandable');
  if (expandRow) {
    const files = expandRow.closest('.tagclass-class').querySelector('.tagclass-files');
    files.hidden = !files.hidden;
    expandRow.classList.toggle('open', !files.hidden);
    return;
  }

  const tagHeader = e.target.closest('.tagclass-tag-header');
  if (tagHeader) {
    const body = tagHeader.closest('.tagclass-group').querySelector('.tagclass-classes');
    body.hidden = !body.hidden;
    tagHeader.classList.toggle('open', !body.hidden);
  }
});

function setupOutputSidebarHandlers() {
  const outputBtn = document.getElementById('output-btn');
  const sidebar = document.getElementById('output-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const closeBtn = document.getElementById('close-sidebar');
  if (!outputBtn || !sidebar || !overlay || !closeBtn) return;
  if (outputBtn.dataset.wired) return;
  outputBtn.dataset.wired = 'true';

  const closeSidebar = () => {
    sidebar.classList.add('hidden');
    overlay.classList.add('hidden');
  };

  outputBtn.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
    overlay.classList.toggle('hidden', sidebar.classList.contains('hidden'));
  });

  closeBtn.addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);
}

setupOutputSidebarHandlers();

/**
 * Shows a plain status message (used for loading/error states).
 */
function showStatusMessage(message) {
  const cardList = document.getElementById("cardList");
  const toolbar = document.getElementById("reportToolbar");
  const summarySection = document.getElementById("summarySection");
  const statusMessage = document.getElementById("statusMessage");

  cardList.hidden = true;
  toolbar.hidden = true;
  summarySection.hidden = true;
  statusMessage.hidden = false;
  statusMessage.textContent = message;
}

/**
 * Basic HTML escaping to safely display file names/classes that
 * might contain special characters.
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function openCssModal(selector, block) {
  document.getElementById('cssModalSelector').textContent = selector;
  document.getElementById('cssModalBlock').textContent = block;
  document.getElementById('cssModal').hidden = false;
}

function closeCssModal() {
  document.getElementById('cssModal').hidden = true;
}

// Single delegated listener on document for all .css-block-selector clicks
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('css-block-selector')) {
    const selector = e.target.dataset.selector || '';
    const block = e.target.dataset.block || '';
    openCssModal(selector, block);
  }
});

document.addEventListener('click', function(e) {
  if (e.target.id === 'cssModal') closeCssModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeCssModal();
});

document.getElementById('cssModalCloseBtn')
  .addEventListener('click', closeCssModal);
