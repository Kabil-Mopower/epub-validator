/* ============================================================
   app.js
   ------------------------------------------------------------
   Main entry point. Wires together the folder picker, parser,
   validator, and reporter modules.
   ============================================================ */

const SHOW_ANNOUNCEMENT = false; // set false to disable popup

function showAnnouncementPopup() {
  const message = [
    'Hi Team,',
    'File-ஐ server-ல் upload செய்யும்போது, Export HTML-ல் இருக்கும் report-ஐயும் upload செய்ய வேண்டும்.',
    'Original XHTML file மற்றும் HTML report இரண்டையும் Completed folder-ல் upload செய்ய வேண்டும்.',
    'ஏதேனும் doubt இருந்தால், QC Team அல்லது Team In-charge-ஐ தொடர்பு கொள்ளவும்.'
  ].join('\n');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <div class="announcement-box" style="background:#fff;border-radius:10px;max-width:480px;width:90%;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
      <div style="background:#f97316;color:#fff;padding:14px 18px;font-weight:700;font-size:16px;">
        📢 Team Notice
      </div>
      <div style="padding:18px;color:#222;font-size:15px;line-height:1.6;white-space:pre-line;">${escapeHtml(message)}</div>
      <div style="padding:12px 18px;text-align:right;border-top:1px solid #eee;">
        <button id="announcementCloseBtn" style="background:#f97316;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-weight:600;cursor:pointer;">Got it &#10003;</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#announcementCloseBtn').addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
}

// ── Mark as Fixed ──────────────────────────────
function getFixedKey(fileName, ruleName) {
  return `fixed_${fileName}_${ruleName}`;
}

function handleFixedChange(checkbox) {
  const fileName = checkbox.dataset.file;
  const ruleName = checkbox.dataset.rule;
  const key = getFixedKey(fileName, ruleName);

  const ruleBlock = checkbox.closest('.rule-group, .rule-block, .rule-row, .rule-card');
  if (!ruleBlock) return;

  if (checkbox.checked) {
    localStorage.setItem(key, '1');
    ruleBlock.classList.add('rule-fixed');
    checkbox.nextElementSibling.textContent = '✓ Fixed';
  } else {
    localStorage.removeItem(key);
    ruleBlock.classList.remove('rule-fixed');
    checkbox.nextElementSibling.textContent = 'Mark as Fixed';
  }

  updateClearAllButton();
}

function restoreFixedStates() {
  document.querySelectorAll('.fixed-checkbox').forEach(cb => {
    const key = getFixedKey(cb.dataset.file, cb.dataset.rule);
    if (localStorage.getItem(key) === '1') {
      cb.checked = true;
      cb.nextElementSibling.textContent = '✓ Fixed';
      const ruleBlock = cb.closest('.rule-group, .rule-block, .rule-row, .rule-card');
      if (ruleBlock) ruleBlock.classList.add('rule-fixed');
    }
  });
  updateClearAllButton();
}

function updateClearAllButton() {
  const anyChecked = document.querySelectorAll('.fixed-checkbox:checked').length > 0;
  let btn = document.getElementById('clearAllFixedBtn');
  if (anyChecked && !btn) {
    // Place button top-right of results — not full width prepend
    const resultsContainer = document.getElementById('cardList') ||
                             document.getElementById('results') ||
                             document.querySelector('.results-container');
    if (resultsContainer && !document.getElementById('clearAllFixedBtn')) {
      // Create a wrapper aligned to the right
      const wrapper = document.createElement('div');
      wrapper.id = 'clearAllFixedWrapper';
      wrapper.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:0.75rem;';
      btn = document.createElement('button');
      btn.id = 'clearAllFixedBtn';
      btn.textContent = '✕ Clear All Fixed';
      btn.className = 'clear-fixed-btn';
      btn.onclick = clearAllFixed;
      wrapper.appendChild(btn);
      resultsContainer.prepend(wrapper);
    }
  } else if (!anyChecked && btn) {
    const wrapper = document.getElementById('clearAllFixedWrapper');
    if (wrapper) wrapper.remove();
  }
}

function clearAllFixed() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('fixed_'))
    .forEach(k => localStorage.removeItem(k));
  document.querySelectorAll('.fixed-checkbox').forEach(cb => {
    cb.checked = false;
    cb.nextElementSibling.textContent = 'Mark as Fixed';
  });
  document.querySelectorAll('.rule-fixed').forEach(el => {
    el.classList.remove('rule-fixed');
  });
  updateClearAllButton();
}

// ── State ──────────────────────────────────────
let selectedFileList = null;
let groupingSkipped = false;
let folderUnlocked = false;
let rulesUnlocked = false;
let outputUnlocked = false;

// ── Rule config (config.json) ──────────────────
// config.json = developer control (permanent on/off, wins over localStorage).
// Loaded once at startup; any rule set to false here is stripped out of
// RULES entirely (never runs) and hidden from the Rules manager UI.
window.CONFIG_RULES = {};

async function loadRuleConfig() {
  try {
    const resp = await fetch('config.json');
    if (!resp.ok) throw new Error('config.json not found');
    const data = await resp.json();
    window.CONFIG_RULES = (data && data.rules) || {};
  } catch (err) {
    // No config.json (e.g. running from local file) — default all rules on.
    window.CONFIG_RULES = {};
  }

  for (let i = RULES.length - 1; i >= 0; i--) {
    const ruleFn = RULES[i];
    const name = ruleFn.ruleName || ruleFn.name;
    if (window.CONFIG_RULES[name] === false) RULES.splice(i, 1);
  }
}

fetch('title.json')
  .then(r => r.json())
  .then(data => { window.TITLE_MAP = data; })
  .catch(() => { window.TITLE_MAP = {}; });

const configReadyPromise = loadRuleConfig();

// ── Theme ──────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
const htmlEl = document.documentElement;

function applyTheme(dark) {
  htmlEl.setAttribute('data-theme', dark ? 'dark' : 'light');
  const moon = document.getElementById('iconMoon');
  const sun  = document.getElementById('iconSun');
  if (moon) moon.hidden = dark;
  if (sun)  sun.hidden  = !dark;
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}
applyTheme(localStorage.getItem('theme') === 'dark');
themeToggle.addEventListener('click', () => {
  applyTheme(htmlEl.getAttribute('data-theme') !== 'dark');
});

// ── Tab switcher ───────────────────────────────
function switchTab(tabName) {
  const panes = {
    epubSelect: document.getElementById('tabEpubSelect'),
    rules:      document.getElementById('tabRules'),
    report:     document.getElementById('tabReport'),
    output:     document.getElementById('tabOutput'),
    tagclass:   document.getElementById('tabTagclass'),
    pagebreak:  document.getElementById('tabPagebreak')
  };
  const navItems = {
    epubSelect: document.getElementById('navEpubSelect'),
    rules:      document.getElementById('navRules'),
    report:     document.getElementById('navReport'),
    output:     document.getElementById('navOutput'),
    tagclass:   document.getElementById('navTagclass'),
    pagebreak:  document.getElementById('navPagebreak')
  };

  Object.keys(panes).forEach(key => {
    const pane = panes[key];
    if (key === tabName) {
      pane.hidden = false;
      pane.classList.add('pane-enter');
      setTimeout(() => pane.classList.remove('pane-enter'), 400);
    } else {
      pane.hidden = true;
    }
    navItems[key].classList.toggle('active', key === tabName);
  });
}

// Sidebar nav clicks with lock check
document.getElementById('navEpubSelect').addEventListener('click', e => {
  e.preventDefault();
  switchTab('epubSelect');
});

document.getElementById('navRules').addEventListener('click', e => {
  e.preventDefault();
  if (!folderUnlocked) return;
  switchTab('rules');
});

document.getElementById('navReport').addEventListener('click', e => {
  e.preventDefault();
  if (!rulesUnlocked) return;
  switchTab('report');
});

document.getElementById('navOutput').addEventListener('click', e => {
  e.preventDefault();
  if (!outputUnlocked) return;
  switchTab('output');
});

document.getElementById('navTagclass').addEventListener('click', e => {
  e.preventDefault();
  if (!outputUnlocked) return; // unlocks together with Output, after validation
  switchTab('tagclass');
});

document.getElementById('navPagebreak').addEventListener('click', e => {
  e.preventDefault();
  if (document.getElementById('navPagebreak').classList.contains('nav-locked')) return;
  switchTab('pagebreak');
});

// ── Upload Zone ────────────────────────────────
const uploadZone     = document.getElementById('uploadZone');
const folderInput    = document.getElementById('folderInput');
const folderInfoCard = document.getElementById('folderInfoCard');
const nextToRulesBtn = document.getElementById('nextToRulesBtn');

uploadZone.addEventListener('click', () => folderInput.click());

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  // Drag and drop folder not supported in all browsers; fall back to picker.
  folderInput.click();
});

document.getElementById('changeFolderBtn').addEventListener('click', () => {
  folderInput.click();
});

folderInput.addEventListener('change', () => {
  if (folderInput.files.length === 0) {
    selectedFileList = null;
    folderInfoCard.hidden = true;
    uploadZone.hidden = false;
    nextToRulesBtn.disabled = true;
    folderUnlocked = false;
    document.getElementById('navRules').classList.add('nav-locked');
    return;
  }

  selectedFileList = folderInput.files;
  groupingSkipped = false;

  const firstPath = folderInput.files[0].webkitRelativePath.replace(/\\/g, '/');
  const rootFolderName = firstPath.split('/')[0];
  const fileCount = folderInput.files.length;
  const { xhtmlFiles } = findEpubFiles(selectedFileList);

  document.getElementById('folderName').textContent = rootFolderName;
  document.getElementById('folderMeta').textContent = `${fileCount} files · ${xhtmlFiles.length} XHTML files found`;

  uploadZone.hidden = true;
  folderInfoCard.hidden = false;
  nextToRulesBtn.disabled = false;

  folderUnlocked = true;
  document.getElementById('navRules').classList.remove('nav-locked');

  // Init bucketing for this folder
  const fileNames = xhtmlFiles.map(f => f.webkitRelativePath.replace(/\\/g, '/'));
  if (fileNames.length > 0) {
    initBucketing(rootFolderName, fileNames);
    document.getElementById('bucketingSection').hidden = false;
  }
});

// ── Step navigation buttons ────────────────────
nextToRulesBtn.addEventListener('click', async () => {
  await configReadyPromise;
  renderRulesManager();
  switchTab('rules');
});

document.getElementById('backToEpubBtn').addEventListener('click', () => {
  switchTab('epubSelect');
});

document.getElementById('continueToReportBtn').addEventListener('click', () => {
  rulesUnlocked = true;
  document.getElementById('navReport').classList.remove('nav-locked');
  switchTab('report');
});

const revalidateBtn = document.getElementById('revalidateBtn');

if (revalidateBtn) revalidateBtn.addEventListener('click', async () => {
  if (!selectedFileList) return;

  revalidateBtn.disabled = true;
  revalidateBtn.textContent = 'Revalidating...';
  showStatusMessage('Revalidating... please wait.');

  try {
    const results = await runValidation(selectedFileList);
    window.lastValidationResults = results;
    window.currentFolderName = document.getElementById('folderName').textContent;
    renderReport(results);
  } catch (err) {
    console.error(err);
    showStatusMessage(`Error: ${err.message}`);
  } finally {
    revalidateBtn.disabled = false;
    revalidateBtn.innerHTML = '&#8635; Revalidate';
  }
});

// ── Enable / Disable All rules ─────────────────
document.getElementById('enableAllRulesBtn').addEventListener('click', () => {
  const rules = QC_RULES;
  rules.forEach(r => setRuleEnabled(r.name, true));
  renderRulesManager();
});

document.getElementById('disableAllRulesBtn').addEventListener('click', () => {
  const rules = QC_RULES;
  rules.forEach(r => setRuleEnabled(r.name, false));
  renderRulesManager();
});

// ── Validation ────────────────────────────────
const runValidationBtn = document.getElementById('runValidationBtn');
const skipGroupingBtn  = document.getElementById('skipGroupingBtn');

runValidationBtn.addEventListener('click', async () => {
  await executeValidation();
});

skipGroupingBtn.addEventListener('click', async () => {
  groupingSkipped = true;
  await executeValidation();
});

async function executeValidation() {
  if (!selectedFileList) return;

  // Clear all fixed states from previous run
  Object.keys(localStorage)
    .filter(k => k.startsWith('fixed_'))
    .forEach(k => localStorage.removeItem(k));

  // Also remove the Clear All Fixed button if visible
  const oldWrapper = document.getElementById('clearAllFixedWrapper');
  if (oldWrapper) oldWrapper.remove();

  await configReadyPromise;

  runValidationBtn.disabled = true;
  skipGroupingBtn.disabled  = true;
  showStatusMessage('Validating... please wait.');

  try {
    // Copyright check
    const hasFrontMatter = Object.values(bucketAssignments).some(v => v === 'front');
    if (hasFrontMatter) {
      const copyrightCheck = checkCopyrightFile(selectedFileList);
      if (!copyrightCheck.found) {
        let message = copyrightCheck.wrongCase
          ? `Copyright.xhtml not found. Found "${copyrightCheck.foundName}" instead — please rename it to exactly "Copyright.xhtml". Do you want to proceed anyway?`
          : `Copyright.xhtml not found in OPS/xhtml/. Do you want to proceed anyway?`;
        const proceed = await showCopyrightModal(message);
        if (!proceed) {
          showStatusMessage('Validation cancelled. Please check your Copyright.xhtml file.');
          runValidationBtn.disabled  = false;
          skipGroupingBtn.disabled   = false;
          return;
        }
      }
    }

    // Pagebreak check page count prompt
    const pagebreakEnabled = getActiveRuleNames().includes('pagebreakCheck');
    if (pagebreakEnabled) {
      const pagebreakChoice = await showPagebreakModal();
      if (!pagebreakChoice) {
        showStatusMessage('Validation cancelled.');
        runValidationBtn.disabled = false;
        skipGroupingBtn.disabled  = false;
        return;
      }
      window.expectedPageCount = pagebreakChoice.pageCount;
      window.fullEpubPagebreak = pagebreakChoice.fullEpub;
    } else {
      window.expectedPageCount = null;
      window.fullEpubPagebreak = false;
    }

    const results = await runValidation(selectedFileList);
    window.lastValidationResults = results;
    window.currentFolderName = document.getElementById('folderName').textContent;
    renderReport(results);
    document.getElementById('bucketingSection').hidden = true;

    if (window.fullEpubPagebreak) {
      const orderedFiles = [
        ...(window.bucketOrder.front || []),
        ...(window.bucketOrder.body || []),
        ...(window.bucketOrder.end || [])
      ];

      const stitched = orderedFiles.map(fileName => {
        const fileData = lastParsedFiles.find(f => f.fileName === fileName);
        return {
          fileName: shortFileName(fileName),
          pagebreaks: fileData?.pagebreakOriginalOrder || []
        };
      }).filter(f => f.pagebreaks.length > 0);

      const isRoman = (val) => /^[ivxlcdm]+$/i.test(val);
      const fileIsRoman = (file) => file.pagebreaks.every(p => isRoman(p));

      stitched.sort((a, b) => {
        const aRoman = fileIsRoman(a) ? 0 : 1;
        const bRoman = fileIsRoman(b) ? 0 : 1;
        return aRoman - bRoman;
      });

      window.stitchedPagebreaks = stitched;

      buildPagebreakPanel(stitched, window.expectedPageCount);

      const navPagebreak = document.getElementById('navPagebreak');
      navPagebreak.classList.remove('nav-locked');
      switchTab('pagebreak');
    }
  } catch (err) {
    console.error(err);
    showStatusMessage(`Error: ${err.message}`);
  } finally {
    runValidationBtn.disabled  = false;
    skipGroupingBtn.disabled   = false;
    window.expectedPageCount = null;
    window.fullEpubPagebreak = false;
  }
}

async function runValidation(fileList) {
  const { xhtmlFiles, stylesheetFile } = findEpubFiles(fileList);
  if (xhtmlFiles.length === 0) return [];

  let cssRules = {}, cssBlocks = {};
  if (stylesheetFile) {
    const cssText = await readFileAsText(stylesheetFile);
    const parsed  = parseStylesheet(cssText);
    cssRules  = parsed.rules;
    cssBlocks = parsed.blocks;
  }

  const parsedFiles = [];
  for (const file of xhtmlFiles) {
    const xhtmlText   = await readFileAsText(file);
    const { firstTag, firstTagClass, line: firstTagLine } = parseXhtmlFirstTag(xhtmlText);
    const headings    = parseXhtmlHeadings(xhtmlText);
    const allTags     = parseXhtmlAllTags(xhtmlText);
    const tagSequence = parseXhtmlTagSequence(xhtmlText);
    const { doubleSpaceHits, tabSpaceHits, capitalHits, endPuncHits, ampersandHits, hyphenSpaceHits, numberHyphenHits, spaceAfterOpenHits, spaceBeforeCloseHits } = parseTextContent(xhtmlText);
    const title       = parseXhtmlTitle(xhtmlText);
    const fileName    = file.webkitRelativePath.replace(/\\/g, '/');
    const dotAfterCloseHits = parseDotAfterClose(xhtmlText);
    const superscriptHits = parseSuperscripts(xhtmlText);
    const pagebreakResult = parsePagebreaks(xhtmlText);
    const tableImageBlocks = parseTableImages(xhtmlText);
    const { refIds, refHrefs, uncalledRefs, brokenLinks, refLocations, hrefLocations } = parseReferences(xhtmlText);
    const usedCssClasses = parseCssClassUsage(xhtmlText);
    const figureBlocks = parseFigureBlocks(xhtmlText);
    const crossRefHits = parseCrossRefs(xhtmlText);
    const imageSrcs = parseImageSrcs(xhtmlText);
    const imageSrcLocations = parseImageSrcLocations(xhtmlText);
    const anchorTexts = parseAnchorTexts(xhtmlText);
    const figureAnchors = parseFigureAnchors(xhtmlText);
    const externalUrlSpaceHits = parseExternalUrlSpace(xhtmlText);
    const crossFileAnchors = parseCrossFileAnchors(xhtmlText);
    const stylesheetLink = parseStylesheetLink(xhtmlText);
    const { emptyTags, orphanClose, unclosedTags } = parseUnwantedTags(xhtmlText);
    const malformedAttrHits = parseMalformedAttr(xhtmlText);
    const uppercaseTagAttrHits = parseUppercaseTagAttr(xhtmlText);
    const tableStructure = parseTableStructure(xhtmlText);
    const boldSpaceHits = parseBoldSpace(xhtmlText);
    const listParaHits = parseListParaCheck(xhtmlText);
    const hasTrailingSpace = parseTrailingSpace(xhtmlText);
    const trailingSpaceLocation = parseTrailingSpaceLocation(xhtmlText);
    const trailingSpaceContent = xhtmlText.slice(
      xhtmlText.search(/<\/html\s*>/i) + '</html>'.length
    ).length;

    // Extract key from filename: bgc_64195_015.xhtml → bgc_64195
    const shortName = file.name.split('/').pop();
    const keyMatch = shortName.match(/^([^_]+_[^_]+)_/);
    const titleKey = keyMatch ? keyMatch[1] : null;
    const expectedTitleFromJson = titleKey && window.TITLE_MAP ? (window.TITLE_MAP[titleKey] || null) : null;

    parsedFiles.push({
      fileName,
      expectedTitleFromJson,
      matterType: groupingSkipped ? 'unassigned' : getMatterType(fileName),
      firstTag,
      firstTagClass,
      line: firstTagLine,
      headings,
      allTags,
      tagSequence,
      doubleSpaceHits,
      tabSpaceHits,
      capitalHits,
      endPuncHits,
      ampersandHits,
      hyphenSpaceHits,
      numberHyphenHits,
      spaceAfterOpenHits,
      spaceBeforeCloseHits,
      dotAfterCloseHits,
      superscriptHits,
      pagebreakNumbers: pagebreakResult.sorted,
      pagebreakOriginalOrder: pagebreakResult.originalOrder,
      pagebreakMode: pagebreakResult.mode,
      tableImageBlocks,
      refIds,
      refHrefTargets: refHrefs,
      uncalledRefs,
      brokenRefLinks: brokenLinks,
      refLocations,
      hrefLocations,
      usedCssClasses,
      figureBlocks,
      crossRefHits,
      imageSrcs,
      imageSrcLocations,
      anchorTexts,
      figureAnchors,
      externalUrlSpaceHits,
      crossFileAnchors,
      stylesheetLink,
      emptyTags,
      orphanClose,
      unclosedTags,
      malformedAttrHits,
      uppercaseTagAttrHits,
      tableStructure,
      boldSpaceHits,
      listParaHits,
      hasTrailingSpace,
      trailingSpaceLocation,
      trailingSpaceContent,
      title,
      cssRules,
      cssBlocks
    });
  }

  parsedFiles.sort((a, b) => {
    const orderA = MATTER_ORDER[a.matterType] ?? 3;
    const orderB = MATTER_ORDER[b.matterType] ?? 3;
    if (orderA !== orderB) return orderA - orderB;
    return a.fileName.localeCompare(b.fileName);
  });

  const activeFiles = parsedFiles.filter(f => f.matterType !== 'isolate');
  lastParsedFiles = activeFiles; // shared with reporter.js for the Tag → Class panel

  // Shared with rules.js so the "Full EPUB" pagebreak check can look up
  // any file's pagebreak data by name, not just the one it's validating.
  window.allPagebreakData = {};
  for (const f of activeFiles) {
    window.allPagebreakData[f.fileName] = {
      originalOrder: f.pagebreakOriginalOrder || [],
      mode: f.pagebreakMode || 'numeric'
    };
  }

  // ── Title Consistency: calculate expected title ──────────────
  const allFileData = activeFiles;
  const allTitles = allFileData.map(f => f.title || '').filter(Boolean);
  const titleFreq = {};
  for (const t of allTitles) {
    titleFreq[t] = (titleFreq[t] || 0) + 1;
  }
  const expectedTitle = Object.keys(titleFreq).sort(
    (a, b) => titleFreq[b] - titleFreq[a]
  )[0] || '';

  for (const f of allFileData) {
    f.expectedTitle = expectedTitle;
  }
  // ─────────────────────────────────────────────────────────────

  const results = validateAll(activeFiles);

  if (window.fullEpubPagebreak) {
    results.forEach(result => {
      result.ruleResults = result.ruleResults
        .map(r => (r.name === 'pagebreakCheck' && window.fullEpubPagebreak === true) ? null : r)
        .filter(r => r !== null);
    });
  }

  return results;
}

// ── Copyright check helpers ───────────────────
function checkCopyrightFile(fileList) {
  const files = Array.from(fileList);
  const exactMatch = files.find(f =>
    /\/OPS\/xhtml\/Copyright\.xhtml$/.test(f.webkitRelativePath.replace(/\\/g, '/'))
  );
  if (exactMatch) return { found: true, wrongCase: false, foundName: 'Copyright.xhtml' };

  const wrongCase = files.find(f =>
    /\/OPS\/xhtml\/copyright\.xhtml$/i.test(f.webkitRelativePath.replace(/\\/g, '/'))
  );
  if (wrongCase) {
    return { found: false, wrongCase: true, foundName: wrongCase.webkitRelativePath.split('/').pop() };
  }
  return { found: false, wrongCase: false, foundName: null };
}

function showPagebreakModal() {
  return new Promise(resolve => {
    const modal = document.getElementById('pagebreak-modal');
    const input = document.getElementById('pagebreak-count');
    const errorEl = document.getElementById('pagebreak-error');
    const fullEpubCheckbox = document.getElementById('pagebreak-full-epub');
    const multiWarnEl = document.getElementById('pagebreak-multi-warn');

    // Count files across the matter-type buckets (front + body + end)
    // that will actually be validated together, in reading order.
    const bucketFileCount = ['front', 'body', 'end']
      .reduce((sum, zone) => sum + ((window.bucketOrder && window.bucketOrder[zone]) || []).length, 0);

    input.value = '';
    errorEl.hidden = true;
    fullEpubCheckbox.checked = false;
    multiWarnEl.hidden = !(bucketFileCount > 1);
    document.getElementById('navPagebreak').style.display = 'none';
    modal.hidden = false;
    input.focus();

    fullEpubCheckbox.onchange = () => {
      multiWarnEl.hidden = fullEpubCheckbox.checked || !(bucketFileCount > 1);
      const navPagebreak = document.getElementById('navPagebreak');
      navPagebreak.style.display = fullEpubCheckbox.checked ? '' : 'none';
    };

    document.getElementById('pagebreak-confirm').onclick = () => {
      const pageCount = parseInt(input.value, 10);
      if (!pageCount || pageCount < 1) {
        errorEl.hidden = false;
        return;
      }
      modal.hidden = true;
      resolve({ pageCount, fullEpub: fullEpubCheckbox.checked });
    };

    document.getElementById('pagebreak-cancel').onclick = () => {
      modal.hidden = true;
      resolve(null);
    };
  });
}

function showCopyrightModal(message) {
  return new Promise(resolve => {
    document.getElementById('copyrightModalMessage').textContent = message;
    document.getElementById('copyrightModal').hidden = false;
    document.getElementById('copyrightProceedBtn').onclick = () => {
      document.getElementById('copyrightModal').hidden = true;
      resolve(true);
    };
    document.getElementById('copyrightCancelBtn').onclick = () => {
      document.getElementById('copyrightModal').hidden = true;
      resolve(false);
    };
  });
}

// Default tab on load
switchTab('epubSelect');

if (SHOW_ANNOUNCEMENT) showAnnouncementPopup();

// Last modified stamp
document.getElementById('lastModifiedStamp').textContent =
  'Last updated: ' + new Date(document.lastModified).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

// ── Custom Cursor ─────────────────────────────

const tooltip     = document.getElementById('cursorTooltip');
const tooltipText = document.getElementById('cursorTooltipText');

let mouseX = 0, mouseY = 0;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;

  // Move tooltip
  tooltip.style.left = mouseX + 'px';
  tooltip.style.top  = mouseY + 'px';
  tooltip.classList.add('visible');

  // Detect context
  const target = e.target;
  let text  = 'EPUB Validator';
  let theme = '';

  // PASS badge
  if (target.classList.contains('status-pass') || target.closest('.status-pass')) {
    text = 'Passed'; theme = 'tooltip-pass';

  // FAIL badge
  } else if (target.classList.contains('status-fail') || target.closest('.status-fail')) {
    text = 'Failed'; theme = 'tooltip-fail';

  // WARN badge
  } else if (target.classList.contains('status-warn') || target.closest('.status-warn')) {
    text = 'Warning'; theme = 'tooltip-warn';

  // Matter tags
  } else if (target.classList.contains('matter-front') || target.closest('.matter-front')) {
    text = 'Front Matter'; theme = 'tooltip-front';
  } else if (target.classList.contains('matter-body') || target.closest('.matter-body')) {
    text = 'Body Matter'; theme = 'tooltip-body';
  } else if (target.classList.contains('matter-end') || target.closest('.matter-end')) {
    text = 'End Matter'; theme = 'tooltip-end';
  } else if (target.classList.contains('matter-unassigned') || target.closest('.matter-unassigned')) {
    text = 'Unassigned'; theme = 'tooltip-isolate';

  // File chips
  } else if (target.classList.contains('file-chip') || target.closest('.file-chip')) {
    const chip = target.classList.contains('file-chip') ? target : target.closest('.file-chip');
    const zone = chip.dataset.zone || chip.className.match(/chip-(\w+)/)?.[1] || '';
    const zoneLabels = { front: 'Front Matter', body: 'Body Matter', end: 'End Matter', isolate: 'Isolated', unassigned: 'Unassigned' };
    text = zoneLabels[zone] || 'File'; theme = `tooltip-${zone}`;

  // Rule toggle cards
  } else if (target.closest('.rule-manager-card')) {
    const card = target.closest('.rule-manager-card');
    const checkbox = card.querySelector('.toggle-input');
    const isOn = checkbox ? checkbox.checked : false;
    text = isOn ? '● Rule: ON' : '○ Rule: OFF';
    theme = isOn ? 'tooltip-rule' : 'tooltip-na';

  // Rule badge
  } else if (target.classList.contains('rule-badge') || target.closest('.rule-badge')) {
    text = 'Rule'; theme = 'tooltip-rule';

  // Nav items
  } else if (target.closest('.nav-item')) {
    const nav = target.closest('.nav-item');
    const label = nav.querySelector('.nav-label')?.textContent || 'Navigate';
    text = '→ ' + label; theme = '';

  // Buttons
  } else if (target.tagName === 'BUTTON' || target.closest('button')) {
    const btn = target.tagName === 'BUTTON' ? target : target.closest('button');
    text = btn.textContent.trim().slice(0, 30) || 'Click';
    theme = '';

  // Card headers (file results)
  } else if (target.closest('.card-header')) {
    const card = target.closest('.result-card');
    const status = card?.dataset.status || '';
    text = status === 'PASS' ? 'View Details' : 'View Errors';
    theme = status === 'PASS' ? 'tooltip-pass' : 'tooltip-fail';

  // Default
  } else {
    text = 'EPUB Validator'; theme = '';
  }

  // Apply
  tooltipText.textContent = text;
  tooltip.className = 'cursor-tooltip visible' + (theme ? ' ' + theme : '');
});

document.addEventListener('mouseleave', () => {
  tooltip.classList.remove('visible');
});

document.addEventListener('mouseenter', () => {
  tooltip.classList.add('visible');
});
