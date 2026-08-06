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

function getLineCol(text, index) {
  const lines = text.slice(0, index).split('\n');
  const line = lines.length;
  return { line };
}

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

  const bodyStart = bodyMatch.index + bodyMatch[0].length;
  const absoluteIndex = bodyStart + tagMatch.index;
  const { line } = getLineCol(xhtmlText, absoluteIndex);
  return { firstTag: tagName, firstTagClass: className.trim(), line };
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
    const absoluteIndex = bodyMatch.index + bodyMatch[0].length + match.index;
    const { line } = getLineCol(xhtmlText, absoluteIndex);
    results.push({ tagName, className, line });
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
    const absoluteIndex = bodyMatch.index + bodyMatch[0].length + match.index;
    const { line } = getLineCol(xhtmlText, absoluteIndex);
    results.push({ tagName, className, id, line });
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
    const absoluteIndex = bodyMatch.index + bodyMatch[0].length + match.index;
    const { line } = getLineCol(xhtmlText, absoluteIndex);
    results.push({ tagName, className, line });
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
function scanTagSpacingHits(afterBody, xhtmlText, bodyOffset) {
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

    const { line } = getLineCol(xhtmlText, bodyOffset + m.index);

    const textOnly = rawInner.replace(/<[^>]+>/g, '');
    if (/^[ \t]/.test(textOnly)) {
      spaceAfterOpenHits.push({ tagName, className, text: rawInner.slice(0, 80), line });
    }

    if (/[ \t]$/.test(textOnly)) {
      spaceBeforeCloseHits.push({ tagName, className, text: rawInner.slice(-80), line });
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

    const absoluteIndex = bodyMatch.index + bodyMatch[0].length + match.index;
    const { line } = getLineCol(xhtmlText, absoluteIndex);

    results.push({ tagName, className, text: innerText, rawInner, line });

    if (/(?<! ) {2}(?! )/.test(innerText)) {
      doubleSpaceHits.push({ tagName, className, text: innerText, line });
    }

    if (/   /.test(innerText)) {
      tabSpaceHits.push({ tagName, className, text: innerText, line });
    }

    if (tagName === 'p' && /^[a-z]/.test(innerText)) {
      capitalHits.push({ tagName, className, text: innerText, line });
    }

    if (/&&/.test(innerText)) {
      ampersandHits.push({ tagName, className, text: innerText, line });
    }

    if (/- \S/.test(innerText)) {
      hyphenSpaceHits.push({ tagName, className, text: innerText, line });
    }

    if (/\d+-\d+/.test(innerText)) {
      numberHyphenHits.push({ tagName, className, text: innerText, matches: innerText.match(/\d+-\d+/g), line });
    }
  }

  const { spaceAfterOpenHits, spaceBeforeCloseHits } = scanTagSpacingHits(afterBody, xhtmlText, bodyMatch.index + bodyMatch[0].length);

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
        const { line } = getLineCol(xhtmlText, bodyMatch.index + match.index);
        orphanClose.push({
          tagName,
          snippet: full,
          line
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
    const { line } = getLineCol(xhtmlText, bodyMatch.index + match.index);
    emptyTags.push({
      tagName,
      className: (match[2] || '').match(/class\s*=\s*["']([^"']*)["']/i)?.[1] || '',
      snippet: match[0],
      line
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
      const { line } = getLineCol(xhtmlText, bodyMatch.index + match.index);
      stack2.push({ tag: tagName, full, snippet: full, line });
    }
  }

  for (const t of stack2) {
    if (['html', 'head', 'body'].includes(t.tag)) continue;
    unclosedTags.push({
      tagName: t.tag,
      snippet: t.snippet,
      line: t.line
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

      const { line } = getLineCol(plainText, match.index);
      crossRefHits.push({ matchedText, pattern: pattern.source, line });
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
    const innerOffset = match.index + match[0].indexOf(innerContent);

    const pTags = [];
    let pMatch;
    while ((pMatch = pRegex.exec(innerContent)) !== null) {
      const { line } = getLineCol(xhtmlText, innerOffset + pMatch.index);
      pTags.push({ tagName: 'p', className: pMatch[1], line });
    }

    const { line: blockLine } = getLineCol(xhtmlText, match.index);

    figureBlocks.push({
      id,
      imageTag: pTags[0] || null,
      captionTag: pTags[1] || null,
      line: blockLine
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
    const { line } = getLineCol(xhtmlText, match.index);
    for (const cls of classes) {
      const key = `${tagName}.${cls}`;
      if (seen.has(key)) continue;
      seen.add(key);
      usedClasses.push({ tagName, className: cls, line });
    }
  }

  return usedClasses;
}

function parseReferences(xhtmlText) {
  const refRegex = /<p[^>]+class\s*=\s*["'][^"']*ref[^"']*["'][^>]+id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const refIds = [];
  const refLocations = {};
  let match;
  while ((match = refRegex.exec(xhtmlText)) !== null) {
    refIds.push(match[1]);
    refLocations[match[1]] = getLineCol(xhtmlText, match.index);
  }

  const hrefRegex = /<a[^>]+href\s*=\s*["']#([^"']+)["'][^>]*>/gi;
  const hrefTargets = [];
  const hrefLocations = {};
  while ((match = hrefRegex.exec(xhtmlText)) !== null) {
    hrefTargets.push(match[1]);
    hrefLocations[match[1]] = getLineCol(xhtmlText, match.index);
  }

  const uncalledRefs = refIds.filter(id => !hrefTargets.includes(id));

  const refHrefs = hrefTargets.filter(id => /\.b\d+$/.test(id));
  const brokenLinks = refHrefs.filter(id => !refIds.includes(id));

  return { refIds, refHrefs, uncalledRefs, brokenLinks, refLocations, hrefLocations };
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
    const { line } = getLineCol(xhtmlText, match.index);

    tableImageBlocks.push({
      id,
      hasCaption,
      hasImage,
      captionClass: 'tabcaption',
      imageClass: 'tabimage',
      line
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
        const { line } = getLineCol(xhtmlText, supIndex);
        superscriptHits.push({
          text: match[0],
          issue: `Link target not found: ${missing.join(', ')}`,
          href: missing.join(', '),
          targetExists: false,
          line
        });
      }
      continue;
    }

    // Pattern 1: <a href="..."><sup>...</sup></a>
    const before = xhtmlText.slice(Math.max(0, supIndex - 100), supIndex);
    const aHrefMatch = before.match(/<a\s+href\s*=\s*["']([^"']+)["'][^>]*>\s*$/i);

    if (!aHrefMatch) {
      const { line } = getLineCol(xhtmlText, supIndex);
      superscriptHits.push({
        text: match[0],
        issue: 'Superscript not linked',
        href: null,
        targetExists: false,
        line
      });
      continue;
    }

    const href = aHrefMatch[1];
    const targetId = href.startsWith('#') ? href.slice(1) : href;
    const targetExists = allIds.includes(targetId);

    if (!targetExists) {
      const { line } = getLineCol(xhtmlText, supIndex);
      superscriptHits.push({
        text: match[0],
        issue: `Link target not found: ${href}`,
        href: href,
        targetExists: false,
        line
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
    const { line } = getLineCol(xhtmlText, match.index);
    dotAfterCloseHits.push({ tagName, snippet, line });
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

function parseTrailingSpaceLocation(xhtmlText) {
  const htmlCloseMatch = xhtmlText.match(/<\/html\s*>/i);
  if (!htmlCloseMatch) return { line: '' };
  return getLineCol(xhtmlText, htmlCloseMatch.index + htmlCloseMatch[0].length);
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

function parseImageSrcLocations(xhtmlText) {
  const locations = {};
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(xhtmlText)) !== null) {
    const filename = match[1].split('/').pop();
    if (!locations[filename]) locations[filename] = getLineCol(xhtmlText, match.index);
  }
  return locations;
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
  const headOffset = headMatch.index + headMatch[0].indexOf(headContent);
  const linkRegex = /<link\s([^>]*?)\/>/gi;
  let m;
  const links = [];

  while ((m = linkRegex.exec(headContent)) !== null) {
    const attrs = m[1];
    const rel   = (attrs.match(/rel\s*=\s*["']([^"']*)["']/i)  || [])[1] || '';
    const type  = (attrs.match(/type\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const href  = (attrs.match(/href\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const { line } = getLineCol(xhtmlText, headOffset + m.index);
    if (rel === 'stylesheet') {
      links.push({ rel, type, href, raw: m[0].trim(), line });
    }
  }

  if (links.length === 0) return { found: false, actual: null, line: '' };

  const expected = '../styles/stylesheet.css';
  const match = links.find(l =>
    l.rel  === 'stylesheet' &&
    l.type === 'text/css'  &&
    l.href === expected
  );

  return {
    found: !!match,
    actual: links[0].raw,
    line: links[0].line
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
    if (text) {
      const { line } = getLineCol(xhtmlText, m.index);
      hits.push({ text, href, line });
    }
  }
  return hits;
}

/**
 * Finds every <a href="..."> whose href does NOT contain "#"
 * (i.e. not an in-file anchor link) and returns {href, text} pairs.
 * Pagebreak anchors (self-closing <a id="pagebreak_..."/>) are excluded
 * since they carry no href/text.
 */
function parseCrossFileAnchors(xhtmlText) {
  const hits = [];
  const cleaned = xhtmlText.replace(/<a\s[^>]*\/>/gi, '');
  const re = /<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const attrs = m[1];
    const hrefM = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
    if (!hrefM) continue;
    const href = hrefM[1].trim();
    if (!href || href.includes('#')) continue;
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    const { line } = getLineCol(xhtmlText, m.index);
    hits.push({ href, text, line });
  }
  return hits;
}

/**
 * Scans raw XHTML text for every <table>...</table> block and runs
 * structural checks against <thead>, <tbody>, <tr>, and <td> nesting.
 *
 * Returns { issues: [{type, detail}] }.
 */
function parseTableStructure(text) {
  const issues = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  let tableIndex = 0;

  while ((tableMatch = tableRegex.exec(text)) !== null) {
    tableIndex++;
    const tableContent = tableMatch[1];
    const label = `Table #${tableIndex}`;
    const tableIssuesStart = issues.length;
    const tableLoc = getLineCol(text, tableMatch.index);

    const theadOpenMatch = tableContent.match(/<thead[^>]*>/i);
    const theadCloseMatch = tableContent.match(/<\/thead>/i);
    const tbodyOpenMatches = tableContent.match(/<tbody[^>]*>/gi) || [];
    const tbodyCloseMatch = tableContent.match(/<\/tbody>/i);

    // THEAD CHECKS
    if (!theadOpenMatch) {
      issues.push({ type: 'Missing <thead>', detail: `${label}: no <thead> tag found` });
    } else if (!theadCloseMatch) {
      issues.push({ type: '<thead> not closed', detail: `${label}: <thead> found but no </thead>` });
    }

    let theadContent = '';
    if (theadOpenMatch && theadCloseMatch) {
      const theadFullMatch = tableContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
      theadContent = theadFullMatch ? theadFullMatch[1] : '';

      if (theadContent.trim().length === 0) {
        issues.push({ type: '<thead> is empty', detail: `${label}: <thead></thead> has nothing inside` });
      }

      const beforeFirstTr = theadContent.split(/<tr[^>]*>/i)[0];
      if (/<td[^>]*>/i.test(beforeFirstTr)) {
        issues.push({ type: '<td> without <tr> in <thead>', detail: `${label}: <td> found directly inside <thead> without a <tr>` });
      }
    }

    // <tr> before <thead>
    if (theadOpenMatch) {
      const beforeThead = tableContent.slice(0, theadOpenMatch.index);
      if (/<tr[^>]*>/i.test(beforeThead)) {
        issues.push({ type: '<tr> before <thead>', detail: `${label}: a <tr> appears before <thead> opens` });
      }
    }

    // <thead> after <tbody>
    if (theadOpenMatch && tbodyOpenMatches.length > 0) {
      const firstTbodyIndex = tableContent.search(/<tbody[^>]*>/i);
      if (firstTbodyIndex !== -1 && theadOpenMatch.index > firstTbodyIndex) {
        issues.push({ type: '<thead> after <tbody>', detail: `${label}: <thead> appears after <tbody> in the table` });
      }
    }

    // <tbody> opened inside <thead> (before </thead> closes)
    if (theadOpenMatch && tbodyOpenMatches.length > 0) {
      const firstTbodyIndex = tableContent.search(/<tbody[^>]*>/i);
      const theadCloseIndex = theadCloseMatch ? tableContent.search(/<\/thead>/i) : -1;
      if (firstTbodyIndex !== -1 && firstTbodyIndex > theadOpenMatch.index &&
          (theadCloseIndex === -1 || firstTbodyIndex < theadCloseIndex)) {
        issues.push({ type: '<tbody> opened inside <thead>', detail: `${label}: <tbody> tag appears before </thead> closes` });
      }
    }

    // </thead> after <tbody> started
    if (theadCloseMatch && tbodyOpenMatches.length > 0) {
      const theadCloseIndex = tableContent.search(/<\/thead>/i);
      const firstTbodyIndex = tableContent.search(/<tbody[^>]*>/i);
      if (firstTbodyIndex !== -1 && firstTbodyIndex < theadCloseIndex) {
        issues.push({ type: '</thead> after <tbody> started', detail: `${label}: closing </thead> comes after <tbody> already opened, tags are mixed up` });
      }
    }

    // TBODY CHECKS
    if (tbodyOpenMatches.length === 0) {
      issues.push({ type: 'Missing <tbody>', detail: `${label}: no <tbody> tag found` });
    } else {
      if (!tbodyCloseMatch) {
        issues.push({ type: '<tbody> not closed', detail: `${label}: <tbody> found but no </tbody>` });
      }
      if (tbodyOpenMatches.length > 1) {
        issues.push({ type: 'Multiple <tbody>', detail: `${label}: more than one <tbody> tag found in the same table` });
      }
    }

    if (tbodyOpenMatches.length > 0 && tbodyCloseMatch) {
      const tbodyFullMatch = tableContent.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
      const tbodyContent = tbodyFullMatch ? tbodyFullMatch[1] : '';

      if (tbodyContent.trim().length === 0) {
        issues.push({ type: '<tbody> is empty', detail: `${label}: <tbody></tbody> has nothing inside` });
      }

      const beforeFirstTr = tbodyContent.split(/<tr[^>]*>/i)[0];
      if (/<td[^>]*>/i.test(beforeFirstTr)) {
        issues.push({ type: '<td> without <tr> in <tbody>', detail: `${label}: <td> found directly inside <tbody> without a <tr>` });
      }
    }

    // TR / TD CHECKS — walk tag-by-tag tracking whether we're inside thead/tbody/tr
    const tagWalkRegex = /<(\/?)(\s*)(table|thead|tbody|tr|td)([^>]*)>/gi;
    let walkMatch;
    let inThead = false;
    let inTbody = false;
    let inTr = false;
    let trHasTd = false;
    let trOpenTag = null;
    let tdOpen = false;

    while ((walkMatch = tagWalkRegex.exec(tableContent)) !== null) {
      const isClose = !!walkMatch[1];
      const tag = walkMatch[3].toLowerCase();

      // Mismatched closing tag: a <td> was opened and never closed with
      // </td> before some other closing tag (</tr>, </thead>, </tbody>, </table>) shows up.
      if (isClose && tag !== 'td' && tdOpen) {
        issues.push({ type: 'Mismatched closing tag', detail: `${label}: <td> opened but closed with wrong tag </${tag}> instead of </td>` });
        tdOpen = false;
      }

      if (tag === 'thead') {
        inThead = !isClose;
      } else if (tag === 'tbody') {
        inTbody = !isClose;
      } else if (tag === 'tr') {
        if (!isClose) {
          inTr = true;
          trHasTd = false;
          trOpenTag = walkMatch[0];

          // <tr> directly inside <table>
          if (!inThead && !inTbody) {
            issues.push({ type: '<tr> directly inside <table>', detail: `${label}: <tr> found directly in <table>, not wrapped in <thead> or <tbody>` });
          }
        } else {
          if (inTr && !trHasTd) {
            issues.push({ type: 'Empty <tr>', detail: `${label}: <tr></tr> has no <td> inside` });
          }
          inTr = false;
        }
      } else if (tag === 'td') {
        if (!isClose) {
          tdOpen = true;
          if (inTr) {
            trHasTd = true;
          } else {
            // <td> directly inside <table> (not wrapped in <tr>, and not inside thead/tbody-without-tr,
            // already reported separately above)
            if (!inThead && !inTbody) {
              issues.push({ type: '<td> directly inside <table>', detail: `${label}: <td> found directly in <table>, skipping both <thead>/<tbody> and <tr>` });
            }
          }
        } else {
          tdOpen = false;
        }
      }
    }

    // unclosed <tr> check (open tr with no matching close before table ends)
    if (inTr) {
      issues.push({ type: '<tr> not closed', detail: `${label}: <tr> found but no </tr>` });
    }

    for (let i = tableIssuesStart; i < issues.length; i++) {
      issues[i].line = tableLoc.line;
    }
  }

  return { issues };
}

/**
 * Finds every <b>...</b> tag whose content starts with a space character.
 * Returns [{ context: 'full <b> tag snippet' }].
 */
function parseBoldSpace(text) {
  const hits = [];
  const boldRegex = /<b[^>]*>([\s\S]*?)<\/b>/gi;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    const content = match[1];
    const trimmedNewlines = content.replace(/^[\r\n]+/, '');
    if (/^[\u00A0 ]/.test(trimmedNewlines) || trimmedNewlines.startsWith('&nbsp;')) {
      const { line } = getLineCol(text, match.index);
      hits.push({ context: match[0], line });
    }
  }

  return hits;
}

function parseListParaCheck(text) {
  const hits = [];

  // Loop through every <ol> and <ul> block in the file
  const listRegex = /<(ol|ul)[^>]*>([\s\S]*?)<\/(ol|ul)>/gi;
  let listMatch;
  while ((listMatch = listRegex.exec(text)) !== null) {
    const listContent = listMatch[2];
    const tag = listMatch[1].toLowerCase();
    const listContentOffset = listMatch.index + listMatch[0].indexOf(listContent);

    // CHECK 1: <p> directly inside <ol>/<ul> without a <li>
    // Correct:  <ol><li><p>text</p></li></ol>
    // Wrong:    <ol><p>text</p><li>...</li></ol>
    const firstP = listContent.search(/<p[\s>]/i);
    const firstLi = listContent.search(/<li[\s>]/i);
    if (firstP !== -1 && (firstLi === -1 || firstP < firstLi)) {
      const { line } = getLineCol(text, listMatch.index);
      hits.push({
        type: '<p> directly inside <' + tag + '> without <li>',
        context: listMatch[0].slice(0, 120),
        line
      });
    }

    // CHECK 2: A nested <ol> or <ul> appears directly inside a list without a <li> wrapper
    // Correct:  <ol><li><ul><li><p>text</p></li></ul></li></ol>
    // Wrong:    <ol><ul><li><p>text</p></li></ul></ol>
    const nestedListPos = listContent.search(/<(ol|ul)[\s>]/i);
    if (nestedListPos !== -1 && (firstLi === -1 || nestedListPos < firstLi)) {
      const { line } = getLineCol(text, listMatch.index);
      hits.push({
        type: 'Nested <ol>/<ul> without <li> wrapper',
        context: listMatch[0].slice(0, 120),
        line
      });
    }

    // CHECK 4: <li> tag is completely empty — nothing inside it
    // Correct:  <li><p>text</p></li>
    // Wrong:    <li></li>
    const emptyLiRegex = /<li[^>]*>\s*<\/li>/gi;
    let emptyLiMatch;
    while ((emptyLiMatch = emptyLiRegex.exec(listContent)) !== null) {
      const { line } = getLineCol(text, listContentOffset + emptyLiMatch.index);
      hits.push({
        type: 'Empty <li>',
        context: emptyLiMatch[0],
        line
      });
    }

    // CHECK 5: <p> inside <li> is empty — the paragraph has no text
    // Correct:  <li><p>some text</p></li>
    // Wrong:    <li><p></p></li>
    const emptyPInLiRegex = /<li[^>]*>[\s\S]*?<p[^>]*>\s*<\/p>[\s\S]*?<\/li>/gi;
    let emptyPMatch;
    while ((emptyPMatch = emptyPInLiRegex.exec(listContent)) !== null) {
      const { line } = getLineCol(text, listContentOffset + emptyPMatch.index);
      hits.push({
        type: 'Empty <p> inside <li>',
        context: emptyPMatch[0].slice(0, 120),
        line
      });
    }

    // CHECK 6: <li> is opened but never closed with </li>
    // Correct:  <li><p>text</p></li>
    // Wrong:    <li><p>text</p>   (no closing </li>)
    const liOpenRegex = /<li[^>]*>/gi;
    let liOpen;
    while ((liOpen = liOpenRegex.exec(listContent)) !== null) {
      const afterLi = listContent.slice(liOpen.index + liOpen[0].length);
      if (!/^[\s\S]*?<\/li>/i.test(afterLi)) {
        const { line } = getLineCol(text, listContentOffset + liOpen.index);
        hits.push({
          type: 'Unclosed <li>',
          context: liOpen[0],
          line
        });
      }
    }
  }

  // CHECK 3: <li> tag found outside of any <ol> or <ul> — it is an orphan
  // Correct:  <ol><li><p>text</p></li></ol>
  // Wrong:    <p><li><p>text</p></li></p>  — <li> has no parent list
  const strippedText = text.replace(/<(ol|ul)[^>]*>[\s\S]*?<\/(ol|ul)>/gi, '');
  const orphanLiRegex = /<li[\s>]/gi;
  let orphan;
  while ((orphan = orphanLiRegex.exec(strippedText)) !== null) {
    const { line } = getLineCol(strippedText, orphan.index);
    hits.push({
      type: 'Orphan <li> outside any list',
      context: strippedText.slice(orphan.index, orphan.index + 80),
      line
    });
  }

  return hits;
}

function parseFigureAnchors(xhtmlText) {
  const ids = [];
  const hrefs = [];
  const idLocations = {};
  const hrefLocations = {};

  const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = idRegex.exec(xhtmlText)) !== null) {
    const id = m[1].trim();
    if (!id.toLowerCase().startsWith('pagebreak')) {
      ids.push(id);
      idLocations[id] = getLineCol(xhtmlText, m.index);
    }
  }

  const hrefRegex = /<a\s[^>]*href\s*=\s*["']#([^"']+)["'][^>]*>/gi;
  while ((m = hrefRegex.exec(xhtmlText)) !== null) {
    const href = m[1].trim();
    hrefs.push(href);
    hrefLocations[href] = getLineCol(xhtmlText, m.index);
  }

  return { ids, hrefs, idLocations, hrefLocations };
}
