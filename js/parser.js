/* ============================================================
   parser.js
   ------------------------------------------------------------
   Responsible for:
     - Finding the relevant files inside a selected EPUB folder
       (FileList from <input webkitdirectory>).
     - Parsing each XHTML file to find the first tag after <body>
       and that tag's class attribute.
     - Parsing OPS/styles/stylesheet.css into a lookup map of
       { className: { property: value, ... } }.
   ============================================================ */

/**
 * Given the FileList from the folder picker, find:
 *  - all XHTML files under OPS/xhtml/**
 *  - the stylesheet.css file under OPS/styles/
 *
 * webkitRelativePath looks like:
 *   "EpubRoot/OPS/xhtml/ch1/chapter1.xhtml"
 */
function findEpubFiles(fileList) {
  const xhtmlFiles = [];
  let stylesheetFile = null;

  for (const file of fileList) {
    const path = file.webkitRelativePath.replace(/\\/g, "/");

    if (/\/xhtml\/.*\.xhtml$/i.test(path)) {
      xhtmlFiles.push(file);
    } else if (/\/styles\/.*\.css$/i.test(path)) {
      stylesheetFile = file;
    }
  }

  return { xhtmlFiles, stylesheetFile };
}

/**
 * Reads a File object's contents as text.
 * Returns a Promise<string>.
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Parses a single XHTML file's text content and finds the first
 * HTML tag that appears directly after the opening <body> tag.
 *
 * Returns:
 *   { firstTag: "h1", firstTagClass: "fmtitle" }
 * or
 *   { firstTag: "", firstTagClass: "" } if nothing found.
 */
function parseXhtmlFirstTag(xhtmlText) {
  const bodyMatch = xhtmlText.match(/<body[^>]*>/i);
  if (!bodyMatch) return { firstTag: "", firstTagClass: "" };

  // Remove all self-closing pagebreak anchors before parsing
  // e.g. <a id="pagebreak_52"/> so they don't get picked as first tag
  const afterBody = xhtmlText
    .slice(bodyMatch.index + bodyMatch[0].length)
    .replace(/<a\s[^>]*id\s*=\s*["']pagebreak_[^"']*["'][^>]*\/>/gi, '');

  const tagMatch = afterBody.match(
    /<!--[\s\S]*?-->|<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*)?)>/
  );

  if (!tagMatch) return { firstTag: "", firstTagClass: "" };

  if (!tagMatch[1]) {
    const remaining = afterBody.slice(tagMatch.index + tagMatch[0].length);
    return parseXhtmlFirstTag("<body>" + remaining);
  }

  const tagName   = tagMatch[1];
  const attributes = tagMatch[2] || "";
  const classMatch = attributes.match(
    /class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i
  );
  const className = classMatch
    ? (classMatch[1] || classMatch[2] || "")
    : "";

  return { firstTag: tagName, firstTagClass: className.trim() };
}

function parseXhtmlHeadings(xhtmlText) {
  const bodyMatch = xhtmlText.match(/<body[^>]*>/i);
  if (!bodyMatch) return [];

  const afterBody = xhtmlText.slice(bodyMatch.index + bodyMatch[0].length);

  const results = [];
  const tagRegex = /<(h[2-5])(\s[^<>]*)?>/gi;
  let match;

  while ((match = tagRegex.exec(afterBody)) !== null) {
    const tagName = match[1].toLowerCase();
    const attributes = match[2] || '';
    const classMatch = attributes.match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i);
    const className = classMatch ? (classMatch[1] || classMatch[2] || '').trim() : '';
    results.push({ tagName, className });
  }

  return results; // e.g. [{ tagName: 'h2', className: 'fty' }, ...]
}

function parseXhtmlAllTags(xhtmlText) {
  const bodyMatch = xhtmlText.match(/<body[^>]*>/i);
  if (!bodyMatch) return [];

  const afterBody = xhtmlText.slice(bodyMatch.index + bodyMatch[0].length);
  const results = [];
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?>/g;
  let match;

  while ((match = tagRegex.exec(afterBody)) !== null) {
    const tagName = match[1].toLowerCase();
    const attributes = match[2] || '';
    const classMatch = attributes.match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i);
    const className = classMatch ? (classMatch[1] || classMatch[2] || '').trim() : '';
    const idMatch = attributes.match(/id\s*=\s*"([^"]*)"|id\s*=\s*'([^']*)'/i);
    const id = idMatch ? (idMatch[1] || idMatch[2] || '').trim() : '';
    results.push({ tagName, className, id });
  }

  return results;
}

function parseXhtmlTagSequence(xhtmlText) {
  const bodyMatch = xhtmlText.match(/<body[^>]*>/i);
  if (!bodyMatch) return [];

  const afterBody = xhtmlText.slice(bodyMatch.index + bodyMatch[0].length);
  const results = [];
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?>/g;
  let match;

  while ((match = tagRegex.exec(afterBody)) !== null) {
    const tagName = match[1].toLowerCase();
    const attributes = match[2] || '';
    const classMatch = attributes.match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i);
    const className = classMatch ? (classMatch[1] || classMatch[2] || '').trim() : '';
    results.push({ tagName, className });
  }

  return results;
}

/**
 * Parses stylesheet.css text into a lookup map:
 *   { "className": { "property": "value", ... }, ... }
 *
 * Only simple class selectors are indexed (e.g. ".fmtitle", ".fmtitle.center").
 * Each class name found in a selector gets an entry pointing to that
 * rule block's declarations, so ".fmtitle, .other { margin-top: 1em }"
 * indexes both "fmtitle" and "other".
 */
function parseStylesheet(cssText) {
  const cssRules = {};
  // Maps className -> { selector, block } holding the full raw CSS block
  // text (selector + declarations) that class was found in, for display
  // in the "CSS Block" report column.
  const cssBlocks = {};

  // Strip comments first.
  const cleanCss = cssText.replace(/\/\*[\s\S]*?\*\//g, "");

  // Match each "selector { declarations }" block.
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = ruleRegex.exec(cleanCss)) !== null) {
    const selectorText = match[1].trim();
    const declarationText = match[2].trim();

    if (!selectorText || !declarationText) continue;

    const declarations = parseDeclarations(declarationText);
    const fullBlockText = `${selectorText} {\n  ${declarationText.replace(/\s*;\s*/g, ";\n  ").replace(/;\s*$/, ";").trim()}\n}`;

    // A selector list can be comma separated: ".a, .b.c"
    const selectors = selectorText.split(",").map(s => s.trim());

    for (const selector of selectors) {
      // Extract every class name referenced in this selector
      // (handles ".fmtitle", "h1.fmtitle", ".fmtitle.center", etc.)
      const classNames = selector.match(/\.[a-zA-Z0-9_-]+/g);
      if (!classNames) continue;

      // Exact-match guard: a leading tag name (e.g. "h1" in "h1.fmtitle")
      // must be part of the index key so "h1.fmtitle" and "h4.fmtitle"
      // never collide/overwrite each other. Selectors with no leading
      // tag (e.g. ".fmtitle") keep the old bare-class key as a
      // tag-agnostic fallback.
      const tagMatch = selector.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)(?=\.)/);
      const tag = tagMatch ? tagMatch[1] : "";

      for (const rawClass of classNames) {
        const cls = rawClass.slice(1); // remove leading "."
        const key = tag ? `${tag}.${cls}` : cls;

        if (!cssRules[key]) cssRules[key] = {};
        Object.assign(cssRules[key], declarations);

        // Keep the first matching block's selector/full text for this key.
        if (!cssBlocks[key]) {
          cssBlocks[key] = { selector: selector, block: fullBlockText };
        }
      }
    }
  }

  return { rules: cssRules, blocks: cssBlocks };
}

/**
 * Looks up the full CSS block (selector + declarations) for a given
 * tag name + class name (or space-separated list of classes) inside
 * the cssBlocks map returned by parseStylesheet().
 *
 * Tries the exact "tag.class" key first (so "h1.fmtitle" never matches
 * a "h4.fmtitle" rule), then falls back to the bare class key for
 * tag-agnostic selectors like ".fmtitle".
 *
 * Returns { selector, block } or null if no class matched.
 */
function lookupCssBlock(cssBlocks, className, tagName) {
  if (!cssBlocks || !className) return null;

  const classNames = className.split(/\s+/).filter(Boolean);

  for (const cls of classNames) {
    if (tagName && cssBlocks[`${tagName}.${cls}`]) return cssBlocks[`${tagName}.${cls}`];
  }
  for (const cls of classNames) {
    if (cssBlocks[cls]) return cssBlocks[cls];
  }
  return null;
}

/**
 * Parses "prop: value; prop2: value2" into { prop: "value", prop2: "value2" }.
 */
function parseDeclarations(declarationText) {
  const declarations = {};
  const parts = declarationText.split(";");

  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex === -1) continue;

    const prop = part.slice(0, colonIndex).trim().toLowerCase();
    const value = part.slice(colonIndex + 1).trim();

    if (prop) declarations[prop] = value;
  }

  return declarations;
}

const SPACING_CHECK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'li', 'dt', 'dd', 'title'];

/**
 * Scans raw (unparsed) body text for whitelisted tags (SPACING_CHECK_TAGS)
 * that have both an opening and a matching closing tag, and flags
 * whitespace sitting immediately inside the opening tag or immediately
 * before the closing tag. Self-closing tags (<br/>, <a id="x"/>, ...)
 * and any tag not in the whitelist are skipped.
 */
function scanTagSpacingHits(afterBody) {
  const spaceAfterOpenHits = [];
  const spaceBeforeCloseHits = [];

  const openTagRegex = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*)?)(\/)?>/g;
  let m;

  while ((m = openTagRegex.exec(afterBody)) !== null) {
    const tagName = m[1].toLowerCase();
    const attributes = m[2] || '';
    const selfClosed = !!m[3];

    if (selfClosed) continue;
    if (!SPACING_CHECK_TAGS.includes(tagName)) continue;

    const closeIdx = afterBody.indexOf(`</${tagName}`, openTagRegex.lastIndex);
    if (closeIdx === -1) continue;

    const rawInner = afterBody.slice(openTagRegex.lastIndex, closeIdx);
    if (rawInner.length === 0) continue;

    const classMatch = attributes.match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i);
    const className = classMatch ? (classMatch[1] || classMatch[2] || '').trim() : '';

    const textOnly = rawInner.replace(/<[^>]+>/g, '');
    if (/^[ \t]/.test(textOnly)) {
      spaceAfterOpenHits.push({ tagName, className, text: rawInner.slice(0, 80) });
    }

    if (/[ \t]$/.test(textOnly)) {
      spaceBeforeCloseHits.push({ tagName, className, text: rawInner.slice(-80) });
    }
  }

  return { spaceAfterOpenHits, spaceBeforeCloseHits };
}

function parseTextContent(xhtmlText) {
  const bodyMatch = xhtmlText.match(/<body[^>]*>/i);
  if (!bodyMatch) return { doubleSpaceHits: [], tabSpaceHits: [], capitalHits: [], endPuncHits: [], ampersandHits: [], hyphenSpaceHits: [], numberHyphenHits: [], spaceAfterOpenHits: [], spaceBeforeCloseHits: [] };

  const afterBody = xhtmlText.slice(bodyMatch.index + bodyMatch[0].length);
  const results = [];
  const doubleSpaceHits = [];
  const tabSpaceHits = [];
  const capitalHits = [];
  const endPuncHits = [];
  const ampersandHits = [];
  const hyphenSpaceHits = [];
  const numberHyphenHits = [];
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = tagRegex.exec(afterBody)) !== null) {
    const tagName = match[1].toLowerCase();
    const attributes = match[2] || '';
    const rawInner = match[3];
    const innerText = rawInner.replace(/<[^>]+>/g, '').trim();

    if (!innerText) continue;

    const classMatch = attributes.match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i);
    const className = classMatch ? (classMatch[1] || classMatch[2] || '').trim() : '';

    results.push({ tagName, className, text: innerText, rawInner });

    if (/(?<! ) {2}(?! )/.test(innerText)) {
      doubleSpaceHits.push({ tagName, className, text: innerText });
    }

    if (/   /.test(innerText)) {
      tabSpaceHits.push({ tagName, className, text: innerText });
    }

    if (tagName === 'p' && /^[a-z]/.test(innerText)) {
      capitalHits.push({ tagName, className, text: innerText });
    }

    if (/&&/.test(innerText)) {
      ampersandHits.push({ tagName, className, text: innerText });
    }

    if (/- \S/.test(innerText)) {
      hyphenSpaceHits.push({ tagName, className, text: innerText });
    }

    if (/\d+-\d+/.test(innerText)) {
      numberHyphenHits.push({ tagName, className, text: innerText, matches: innerText.match(/\d+-\d+/g) });
    }
  }

  const { spaceAfterOpenHits, spaceBeforeCloseHits } = scanTagSpacingHits(afterBody);

  const pTags = results.filter(t => {
    if (t.tagName !== 'p') return false;
    if (/pagebreak/i.test(t.rawInner)) return false;
    return true;
  });
  for (let i = 0; i < pTags.length - 1; i++) {
    const current = pTags[i];
    const next = pTags[i + 1];
    if (next) {
      const trimmed = current.text.trim();
      if (!/[.;]$/.test(trimmed)) {
        endPuncHits.push(current);
      }
    }
  }

  return { doubleSpaceHits, tabSpaceHits, capitalHits, endPuncHits, ampersandHits, hyphenSpaceHits, numberHyphenHits, spaceAfterOpenHits, spaceBeforeCloseHits };
}

function parseUnwantedTags(xhtmlText) {
  const selfClosing = ['br','img','hr','input','link',
                       'meta','col','area','base','embed',
                       'param','source','track','wbr'];
  const tableTags = ['td','th','tr','table','tbody','thead','tfoot'];
  const structuralTags = ['html', 'head', 'body', 'div',
                          'span', 'section', 'article',
                          'header', 'footer', 'nav', 'main'];
  const skipTags = [...selfClosing, ...tableTags, ...structuralTags];

  const bodyMatch = xhtmlText.match(/<body[^>]*>/i);
  if (!bodyMatch) return { emptyTags: [], orphanClose: [], unclosedTags: [] };
  const bodyContent = xhtmlText.slice(bodyMatch.index);

  // CHECK 1: Orphan closing tags
  const orphanClose = [];
  const stack = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?\/?>/g;
  let match;

  while ((match = tagRegex.exec(bodyContent)) !== null) {
    const full = match[0];
    const tagName = match[1].toLowerCase();

    if (skipTags.includes(tagName)) continue;
    if (/\/>$/.test(full)) continue; // self closing

    if (full.startsWith('</')) {
      if (stack.length === 0 || stack[stack.length - 1].tag !== tagName) {
        orphanClose.push({
          tagName,
          snippet: full
        });
      } else {
        stack.pop();
      }
    } else {
      stack.push({ tag: tagName, full });
    }
  }

  // CHECK 2: Empty tags
  const emptyTags = [];
  const emptyRegex = /<([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?>\s*<\/\1>/g;

  while ((match = emptyRegex.exec(bodyContent)) !== null) {
    const tagName = match[1].toLowerCase();
    if (skipTags.includes(tagName)) continue;
    emptyTags.push({
      tagName,
      className: (match[2] || '').match(/class\s*=\s*["']([^"']*)["']/i)?.[1] || '',
      snippet: match[0]
    });
  }

  // CHECK 3: Unclosed tags
  const unclosedTags = [];
  const stack2 = [];
  const tagRegex2 = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?\/?>/g;

  while ((match = tagRegex2.exec(bodyContent)) !== null) {
    const full = match[0];
    const tagName = match[1].toLowerCase();

    if (skipTags.includes(tagName)) continue;
    if (/\/>$/.test(full)) continue;

    if (full.startsWith('</')) {
      if (stack2.length > 0 && stack2[stack2.length - 1].tag === tagName) {
        stack2.pop();
      }
    } else {
      stack2.push({ tag: tagName, full, snippet: full });
    }
  }

  for (const t of stack2) {
    if (['html', 'head', 'body'].includes(t.tag)) continue;
    unclosedTags.push({
      tagName: t.tag,
      snippet: t.snippet
    });
  }

  return { emptyTags, orphanClose, unclosedTags };
}

function parseCrossRefs(xhtmlText) {
  const patterns = [
    /figure\s*\d+(\.\d+)?/gi,
    /fig\.\s*\d+(\.\d+)?/gi,
    /table\s*\d+(\.\d+)?/gi,
    /tab\.\s*\d+(\.\d+)?/gi,
    /chapter\s*\d+/gi,
    /ref\s*\.?\s*\d+/gi,
    /reference\s*\d+/gi
  ];

  const linkedTexts = [];
  const aRegex = /<a\s[^>]*href\s*=\s*["'][^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let aMatch;
  while ((aMatch = aRegex.exec(xhtmlText)) !== null) {
    const innerText = aMatch[1].replace(/<[^>]+>/g, '').trim();
    linkedTexts.push(innerText.toLowerCase());
  }

  const plainText = xhtmlText.replace(/<[^>]+>/g, ' ');

  const crossRefHits = [];
  const seen = new Set();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(plainText)) !== null) {
      const matchedText = match[0].trim();
      const key = matchedText.toLowerCase();

      if (linkedTexts.includes(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);

      crossRefHits.push({ matchedText, pattern: pattern.source });
    }
  }

  return crossRefHits;
}

function parseFigureBlocks(xhtmlText) {
  const figureBlocks = [];
  const divRegex = /<div[^>]+class\s*=\s*["'][^"']*pageavoid[^"']*["'][^>]+id\s*=\s*["']([^"']*\.fig[^"']*)["'][^>]*>([\s\S]*?)<\/div>/gi;
  const pRegex = /<p[^>]*class\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let match;

  while ((match = divRegex.exec(xhtmlText)) !== null) {
    const id = match[1];
    const innerContent = match[2];

    const pTags = [];
    let pMatch;
    while ((pMatch = pRegex.exec(innerContent)) !== null) {
      pTags.push({ tagName: 'p', className: pMatch[1] });
    }

    figureBlocks.push({
      id,
      imageTag: pTags[0] || null,
      captionTag: pTags[1] || null
    });
  }

  return figureBlocks;
}

function parseCssClassUsage(xhtmlText) {
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?>/g;
  const usedClasses = [];
  const seen = new Set();
  let match;

  while ((match = tagRegex.exec(xhtmlText)) !== null) {
    const tagName = match[1].toLowerCase();
    const attributes = match[2] || '';
    const classMatch = attributes.match(
      /class\s*=\s*["']([^"']*)["']/i
    );
    if (!classMatch) continue;

    const classes = classMatch[1].trim().split(/\s+/).filter(Boolean);
    for (const cls of classes) {
      const key = `${tagName}.${cls}`;
      if (seen.has(key)) continue;
      seen.add(key);
      usedClasses.push({ tagName, className: cls });
    }
  }

  return usedClasses;
}

function parseReferences(xhtmlText) {
  const refRegex = /<p[^>]+class\s*=\s*["'][^"']*ref[^"']*["'][^>]+id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const refIds = [];
  let match;
  while ((match = refRegex.exec(xhtmlText)) !== null) {
    refIds.push(match[1]);
  }

  const hrefRegex = /<a[^>]+href\s*=\s*["']#([^"']+)["'][^>]*>/gi;
  const hrefTargets = [];
  while ((match = hrefRegex.exec(xhtmlText)) !== null) {
    hrefTargets.push(match[1]);
  }

  const uncalledRefs = refIds.filter(id => !hrefTargets.includes(id));

  const refHrefs = hrefTargets.filter(id => /\.b\d+$/.test(id));
  const brokenLinks = refHrefs.filter(id => !refIds.includes(id));

  return { refIds, refHrefs, uncalledRefs, brokenLinks };
}

function parseTableImages(xhtmlText) {
  const tableImageBlocks = [];
  const divRegex = /<div[^>]+class\s*=\s*["'][^"']*pageavoid[^"']*["'][^>]+id\s*=\s*["']([^"']*\.tab[^"']*)["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = divRegex.exec(xhtmlText)) !== null) {
    const id = match[1];
    const innerContent = match[2];

    const hasCaption = /<p[^>]+class\s*=\s*["'][^"']*\btabcaption\b[^"']*["']/i.test(innerContent);
    const hasImage = /<p[^>]+class\s*=\s*["'][^"']*\btabimage\b[^"']*["']/i.test(innerContent);

    tableImageBlocks.push({
      id,
      hasCaption,
      hasImage,
      captionClass: 'tabcaption',
      imageClass: 'tabimage'
    });
  }

  return tableImageBlocks;
}

function romanToInt(s) {
  const map = {i:1,v:5,x:10,l:50,c:100,d:500,m:1000};
  s = s.toLowerCase();
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = map[s[i]], next = map[s[i+1]];
    result += (next && cur < next) ? -cur : cur;
  }
  return result;
}

function parsePagebreaks(xhtmlText) {
  const pagebreakRegex = /<a[^>]+id\s*=\s*["']pagebreak_([ivxlcdmIVXLCDM\d]+)["'][^>]*\/?>/gi;
  const rawValues = [];
  let match;
  while ((match = pagebreakRegex.exec(xhtmlText)) !== null) {
    rawValues.push(match[1]);
  }

  const isRoman = v => /^[ivxlcdm]+$/i.test(v);
  const isNumeric = v => /^\d+$/.test(v);

  let mode;
  if (rawValues.length === 0) {
    mode = 'numeric';
  } else if (rawValues.every(isRoman)) {
    mode = 'roman';
  } else if (rawValues.every(isNumeric)) {
    mode = 'numeric';
  } else {
    mode = 'mixed';
  }

  const originalOrder = mode === 'numeric'
    ? rawValues.map(v => parseInt(v, 10))
    : rawValues.slice();

  const sorted = originalOrder
    .map(v => mode === 'roman' ? romanToInt(v) : (typeof v === 'number' ? v : parseInt(v, 10)))
    .sort((a, b) => a - b);

  return { originalOrder, sorted, mode };
}

function parseSuperscripts(xhtmlText) {
  const superscriptHits = [];

  const allIds = [];
  const idRegex = /id\s*=\s*["']([^"']+)["']/gi;
  let idMatch;
  while ((idMatch = idRegex.exec(xhtmlText)) !== null) {
    allIds.push(idMatch[1]);
  }

  const supRegex = /<sup>([\s\S]*?)<\/sup>/gi;
  let match;
  while ((match = supRegex.exec(xhtmlText)) !== null) {
    const supIndex = match.index;
    const supContent = match[1];

    // Pattern 2: <sup><a href="...">...</a></sup>
    const innerLinks = supContent.match(/<a\s+href\s*=\s*["']([^"']+)["']/gi);
    if (innerLinks) {
      const hrefRegex = /<a\s+href\s*=\s*["']([^"']+)["']/i;
      const missing = [];
      for (const linkTag of innerLinks) {
        const hrefMatch = linkTag.match(hrefRegex);
        const href = hrefMatch[1];
        const targetId = href.startsWith('#') ? href.slice(1) : href;
        if (!allIds.includes(targetId)) {
          missing.push(href);
        }
      }

      if (missing.length > 0) {
        superscriptHits.push({
          text: match[0],
          issue: `Link target not found: ${missing.join(', ')}`,
          href: missing.join(', '),
          targetExists: false
        });
      }
      continue;
    }

    // Pattern 1: <a href="..."><sup>...</sup></a>
    const before = xhtmlText.slice(Math.max(0, supIndex - 100), supIndex);
    const aHrefMatch = before.match(/<a\s+href\s*=\s*["']([^"']+)["'][^>]*>\s*$/i);

    if (!aHrefMatch) {
      superscriptHits.push({
        text: match[0],
        issue: 'Superscript not linked',
        href: null,
        targetExists: false
      });
      continue;
    }

    const href = aHrefMatch[1];
    const targetId = href.startsWith('#') ? href.slice(1) : href;
    const targetExists = allIds.includes(targetId);

    if (!targetExists) {
      superscriptHits.push({
        text: match[0],
        issue: `Link target not found: ${href}`,
        href: href,
        targetExists: false
      });
    }
  }

  return superscriptHits;
}

function parseDotAfterClose(xhtmlText) {
  const dotAfterCloseHits = [];
  const dotAfterCloseRegex = /<\/(p|h1|h2|h3|h4|h5|li|dt|dd|title)>\./gi;
  let match;

  while ((match = dotAfterCloseRegex.exec(xhtmlText)) !== null) {
    const tagName = match[1].toLowerCase();
    const start = Math.max(0, match.index - 25);
    const end = Math.min(xhtmlText.length, dotAfterCloseRegex.lastIndex + 25);
    const snippet = xhtmlText.slice(start, end);
    dotAfterCloseHits.push({ tagName, snippet });
  }

  return dotAfterCloseHits;
}

function parseTrailingSpace(xhtmlText) {
  const htmlCloseMatch = xhtmlText.match(/<\/html\s*>/i);
  if (!htmlCloseMatch) return false;

  const afterHtml = xhtmlText.slice(
    htmlCloseMatch.index + htmlCloseMatch[0].length
  );

  // If anything remains after </html> (spaces, newlines, tabs) → fail
  return afterHtml.length > 0 && /\S/.test(afterHtml) === false
    ? afterHtml.length > 0
    : /[\s\S]/.test(afterHtml);
}

function parseImageSrcs(xhtmlText) {
  const srcs = [];
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(xhtmlText)) !== null) {
    const src = match[1];
    const filename = src.split('/').pop();
    srcs.push(filename);
  }
  return srcs;
}

function parseXhtmlTitle(xhtmlText) {
  const match = xhtmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : '';
}

function parseStylesheetLink(xhtmlText) {
  // Extract all <link .../> tags from <head>
  const headMatch = xhtmlText.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return { found: false, actual: null };

  const headContent = headMatch[1];
  const linkRegex = /<link\s([^>]*?)\/>/gi;
  let m;
  const links = [];

  while ((m = linkRegex.exec(headContent)) !== null) {
    const attrs = m[1];
    const rel   = (attrs.match(/rel\s*=\s*["']([^"']*)["']/i)  || [])[1] || '';
    const type  = (attrs.match(/type\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const href  = (attrs.match(/href\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    if (rel === 'stylesheet') {
      links.push({ rel, type, href, raw: m[0].trim() });
    }
  }

  if (links.length === 0) return { found: false, actual: null };

  const expected = '../styles/stylesheet.css';
  const match = links.find(l =>
    l.rel  === 'stylesheet' &&
    l.type === 'text/css'  &&
    l.href === expected
  );

  return {
    found: !!match,
    actual: links[0].raw
  };
}

function parseAnchorTexts(xhtmlText) {
  const hits = [];
  const cleaned = xhtmlText.replace(/<a\s[^>]*\/>/gi, '');
  const re = /<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const attrs = m[1];
    const idM = attrs.match(/id\s*=\s*["']([^"']*)["']/i);
    if (idM && idM[1].toLowerCase().startsWith('pagebreak')) continue;
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    const hrefM = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
    const href = hrefM ? hrefM[1].trim() : '';
    if (text) hits.push({ text, href });
  }
  return hits;
}
