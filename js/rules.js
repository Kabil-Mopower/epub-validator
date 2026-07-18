/* ============================================================
   rules.js
   ------------------------------------------------------------
   Stores all validation rules used by validator.js.

   To add a new rule in the future:
     1. Write a function that takes the parsed file data
        (see parser.js for the shape of this object) and the
        parsed CSS rules map, and returns a result object like:
          { name: "ruleName", pass: true/false, details: {...} }
     2. Add it to the RULES array at the bottom of this file.

   validator.js will automatically run every rule in RULES
   against every parsed XHTML file.
   ============================================================ */

/**
 * Rule: "First tag after <body> must have margin-top: 1em"
 *
 * Steps:
 *  - Look at the first tag found directly inside <body>.
 *  - Get its class attribute.
 *  - Look up that class in the parsed stylesheet.
 *  - Check that the CSS declares margin-top: 1em for that class.
 */
function ruleFirstTagMarginTop(fileData, cssRules) {
  const REQUIRED_VALUE = "1em";

  const firstTag = fileData.firstTag;
  const className = fileData.firstTagClass;

  // No first tag found at all (empty body, parse failure, etc.)
  if (!firstTag) {
    return {
      name: "firstTagMarginTop",
      label: "First Tag Margin Top",
      pass: false,
      firstTag: "",
      className: "",
      marginTopValue: "",
      reason: "No tag found directly after <body>."
    };
  }

  // Tag has no class attribute, so there is nothing to look up in CSS.
  if (!className) {
    return {
      name: "firstTagMarginTop",
      label: "First Tag Margin Top",
      pass: false,
      firstTag: firstTag,
      className: "",
      marginTopValue: "",
      reason: "First tag has no class attribute."
    };
  }

  const marginTopValue = lookupMarginTop(cssRules, className, firstTag);

  const pass = marginTopValue === REQUIRED_VALUE;

  return {
    name: "firstTagMarginTop",
    label: "First Tag Margin Top",
    pass: pass,
    firstTag: firstTag,
    className: className,
    marginTopValue: marginTopValue || "(not set)",
    reason: pass ? "" : (marginTopValue ? `margin-top expected ${REQUIRED_VALUE}, found: ${marginTopValue}` : 'margin-top not defined in stylesheet')
  };
}

/**
 * Helper: look up the margin-top value declared for a given
 * tag name + CSS class name inside the parsed stylesheet rules map.
 *
 * cssRules is expected to be an object like:
 *   { "h1.fmtitle": { "margin-top": "1em", "color": "red" }, ... }
 *
 * Tries the exact "tag.class" key first so "h1.fmtitle" never picks up
 * a "h4.fmtitle" rule, then falls back to the bare class key for
 * tag-agnostic selectors like ".fmtitle".
 */
function lookupMarginTop(cssRules, className, tagName) {
  if (!cssRules || !className) return "";

  // A tag can have multiple classes, e.g. class="fmtitle center".
  // Check each one and return the first margin-top value found.
  const classNames = className.split(/\s+/).filter(Boolean);

  for (const cls of classNames) {
    const declarations = tagName && cssRules[`${tagName}.${cls}`];
    if (declarations && declarations["margin-top"]) {
      return declarations["margin-top"];
    }
  }

  for (const cls of classNames) {
    const declarations = cssRules[cls];
    if (declarations && declarations["margin-top"]) {
      return declarations["margin-top"];
    }
  }
  return "";
}

function lookupMarginBottom(cssRules, className, tagName) {
  if (!cssRules || !className) return '';
  const classNames = className.split(/\s+/).filter(Boolean);
  for (const cls of classNames) {
    const d = tagName && cssRules[`${tagName}.${cls}`];
    if (d && d['margin-bottom']) return d['margin-bottom'];
  }
  for (const cls of classNames) {
    const d = cssRules[cls];
    if (d && d['margin-bottom']) return d['margin-bottom'];
  }
  return '';
}

function ruleFmtitleMargins(fileData, cssRules) {

  // Only runs for Front Matter files
  if (fileData.matterType !== 'front') {
    return {
      name: 'fmtitleMargins',
      label: 'FM Title Margins',
      pass: true,
      notApplicable: true,
      firstTag: fileData.firstTag || '',
      className: fileData.firstTagClass || '',
      marginTopValue: '',
      marginBottomValue: '',
      reason: ''
    };
  }

  const firstTag = fileData.firstTag;
  const className = fileData.firstTagClass || '';
  const classes = className.split(/\s+/).filter(Boolean);

  // Find a class that is exactly "fmtitle" or starts with "fmtitle"
  const fmClass = classes.find(c => c === 'fmtitle' || c.startsWith('fmtitle'));

  // Class is not fmtitle* → not applicable, skip silently
  if (!fmClass) {
    return {
      name: 'fmtitleMargins',
      label: 'FM Title Margins',
      pass: true,
      notApplicable: true,
      firstTag: firstTag || '',
      className: className,
      marginTopValue: '',
      marginBottomValue: '',
      reason: ''
    };
  }

  // Class IS fmtitle* → check both margins
  const marginTop = lookupMarginTop(cssRules, fmClass, firstTag);
  const marginBottom = lookupMarginBottom(cssRules, fmClass, firstTag);

  const topPass = marginTop === '1em';
  const bottomPass = marginBottom === '2em';
  const pass = topPass && bottomPass;

  const reasons = [];
  if (!topPass) reasons.push(marginTop ? `margin-top expected 1em, found: ${marginTop}` : 'margin-top not defined in stylesheet');
  if (!bottomPass) reasons.push(marginBottom ? `margin-bottom expected 2em, found: ${marginBottom}` : 'margin-bottom not defined in stylesheet');

  return {
    name: 'fmtitleMargins',
    label: 'FM Title Margins',
    pass,
    firstTag: firstTag || '',
    className: className,
    marginTopValue: marginTop || '(not set)',
    marginBottomValue: marginBottom || '(not set)',
    reason: reasons.join('; ')
  };
}

/* ------------------------------------------------------------
   Master list of active rules.
   Add new rule functions here to include them in validation.
   ------------------------------------------------------------ */
function lookupCssProp(cssRules, className, tagName, prop) {
  if (!cssRules || !className) return '';
  const classes = className.split(/\s+/).filter(Boolean);
  for (const cls of classes) {
    const d = tagName && cssRules[`${tagName}.${cls}`];
    if (d && d[prop]) return d[prop];
  }
  for (const cls of classes) {
    const d = cssRules[cls];
    if (d && d[prop]) return d[prop];
  }
  return '';
}

const HEADING_RULES = {
  h2: { marginTop: '1em', marginBottom: '0.5em', fontSize: '130%' },
  h3: { marginTop: '1em', marginBottom: '0.5em', fontSize: '120%' },
  h4: { marginTop: '1em', marginBottom: '0.5em', fontSize: '110%' },
  h5: { marginTop: '1em', marginBottom: '0.5em', fontSize: '100%' },
};

function ruleHeadingStyles(fileData, cssRules) {
  const headings = fileData.headings || [];

  // Filter only h2/h3/h4/h5 headings
  const seen = new Set();
  const targets = headings
    .filter(h => HEADING_RULES[h.tagName])
    .filter(h => {
      const key = `${h.tagName}.${h.className}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (targets.length === 0) {
    return {
      name: 'headingStyles',
      label: 'Heading Styles',
      pass: true,
      notApplicable: true,
      firstTag: '',
      className: '',
      marginTopValue: '',
      marginBottomValue: '',
      fontSizeValue: '',
      headingRows: [],
      reason: ''
    };
  }

  const failures = [];
  const headingRows = [];

  for (const h of targets) {
    const expected = HEADING_RULES[h.tagName];
    const rowFailures = [];

    if (!h.className) {
      const msg = `<${h.tagName}> has no class attribute`;
      failures.push(msg);
      headingRows.push({
        tagName: h.tagName,
        className: '',
        cssSelector: 'Not Found',
        marginTop: '(not set)',
        marginBottom: '(not set)',
        fontSize: '(not set)',
        marginTopPass: false,
        marginBottomPass: false,
        fontSizePass: false,
        pass: false,
        reason: msg
      });
      continue;
    }

    // Only check if class exactly matches tag name
    const classes = (h.className || '').split(/\s+/).filter(Boolean);
    const hasMatchingClass = classes.includes(h.tagName);

    if (!hasMatchingClass) {
      headingRows.push({
        tagName: h.tagName,
        className: h.className || '(none)',
        cssSelector: '—',
        marginTop: '—',
        marginBottom: '—',
        fontSize: '—',
        marginTopPass: true,
        marginBottomPass: true,
        fontSizePass: true,
        pass: true,
        notApplicable: true,
        reason: `Class "${h.className}" does not match tag name — skipped`
      });
      continue;
    }

    const marginTop    = lookupCssProp(cssRules, h.className, h.tagName, 'margin-top');
    const marginBottom = lookupCssProp(cssRules, h.className, h.tagName, 'margin-bottom');
    const fontSize     = lookupCssProp(cssRules, h.className, h.tagName, 'font-size');
    const cssBlockMatch = lookupCssBlock(fileData.cssBlocks, h.className, h.tagName);

    const marginTopPass    = marginTop === expected.marginTop;
    const marginBottomPass = marginBottom === expected.marginBottom;
    const fontSizePass     = fontSize === expected.fontSize;

    if (!marginTopPass)
      rowFailures.push(marginTop    ? `<${h.tagName}.${h.className}> margin-top expected ${expected.marginTop}, found: ${marginTop}` : `<${h.tagName}.${h.className}> margin-top not defined in stylesheet`);
    if (!marginBottomPass)
      rowFailures.push(marginBottom ? `<${h.tagName}.${h.className}> margin-bottom expected ${expected.marginBottom}, found: ${marginBottom}` : `<${h.tagName}.${h.className}> margin-bottom not defined in stylesheet`);
    if (!fontSizePass)
      rowFailures.push(fontSize     ? `<${h.tagName}.${h.className}> font-size expected ${expected.fontSize}, found: ${fontSize}` : `<${h.tagName}.${h.className}> font-size not defined in stylesheet`);

    failures.push(...rowFailures);

    headingRows.push({
      tagName: h.tagName,
      className: h.className,
      cssSelector: cssBlockMatch ? cssBlockMatch.selector : 'Not Found',
      marginTop: marginTop || '(not set)',
      marginBottom: marginBottom || '(not set)',
      fontSize: fontSize || '(not set)',
      marginTopPass,
      marginBottomPass,
      fontSizePass,
      pass: rowFailures.length === 0,
      reason: rowFailures.join('; ')
    });
  }

  const pass = failures.length === 0;

  return {
    name: 'headingStyles',
    label: 'Heading Styles',
    pass,
    notApplicable: false,
    firstTag: '',
    className: '',
    marginTopValue: '',
    marginBottomValue: '',
    fontSizeValue: '',
    headingRows,
    reason: failures.join(' | ')
  };
}

const FOOTNOTE_CLASSES = new Set([
  'footnote', 'footnote1', 'footnoteh', 'footnote2',
  'ref', 'tsource', 'tsource1', 'tsource2'
]);

function ruleFootnoteClasses(fileData, cssRules) {
  // Scan ALL tags in the file for footnote classes
  const allTags = fileData.allTags || [];

  const targets = allTags.filter(t =>
    t.className.split(/\s+/).some(c => FOOTNOTE_CLASSES.has(c))
  );

  if (targets.length === 0) {
    return {
      name: 'footnoteClasses',
      label: 'Footnote Font Size',
      pass: true,
      notApplicable: true,
      firstTag: '',
      className: '',
      marginTopValue: '',
      marginBottomValue: '',
      fontSizeValue: '',
      footnoteRows: [],
      reason: ''
    };
  }

  // Deduplicate by tagName.className
  const seen = new Set();
  const unique = targets.filter(t => {
    const key = `${t.tagName}.${t.className}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rows = [];
  let overallPass = true;

  for (const t of unique) {
    const matchedClass = t.className.split(/\s+/).find(c => FOOTNOTE_CLASSES.has(c));
    const isP = t.tagName.toLowerCase() === 'p';

    if (!isP) {
      // Warning — wrong tag
      rows.push({
        tagName: t.tagName,
        className: t.className,
        cssSelector: '',
        fontSize: '',
        fontSizePass: false,
        pass: false,
        warning: true,
        reason: `Warning: class "${matchedClass}" should be on a <p> tag, found on <${t.tagName}>`
      });
      overallPass = false;
      continue;
    }

    const fontSize = lookupCssProp(cssRules, t.className, t.tagName, 'font-size');

    // Check if class exists in CSS
    const classes = t.className.split(/\s+/).filter(Boolean);
    const classFoundInCss = classes.some(cls =>
      cssRules[`${t.tagName}.${cls}`] || cssRules[cls]
    );

    if (!classFoundInCss) {
      rows.push({
        tagName: t.tagName,
        className: t.className,
        cssSelector: 'Not Found',
        fontSize: '(not set)',
        fontSizePass: false,
        pass: false,
        warning: false,
        reason: `Style not found in stylesheet for class "${t.className}"`
      });
      overallPass = false;
      continue;
    }

    const cssBlock = lookupCssBlock(fileData.cssBlocks, t.className, t.tagName);
    const fontSizePass = fontSize === '90%';

    if (!fontSizePass) overallPass = false;

    rows.push({
      tagName: t.tagName,
      className: t.className,
      cssSelector: cssBlock ? cssBlock.selector : 'Not Found',
      fontSize: fontSize || '(not set)',
      fontSizePass,
      pass: fontSizePass,
      warning: false,
      reason: fontSizePass ? '' : (fontSize ? `font-size expected 90%, found: ${fontSize}` : 'font-size not defined in stylesheet')
    });
  }

  return {
    name: 'footnoteClasses',
    label: 'Footnote Font Size',
    pass: overallPass,
    notApplicable: false,
    firstTag: '',
    className: '',
    marginTopValue: '',
    marginBottomValue: '',
    fontSizeValue: '',
    footnoteRows: rows,
    reason: ''
  };
}

const INLINE_TAGS = new Set([
  'a', 'span', 'em', 'strong', 'b', 'i', 'u', 's',
  'sup', 'sub', 'abbr', 'cite', 'code', 'mark',
  'small', 'big', 'br', 'img', 'q', 'time'
]);

function isAuthorClass(className) {
  if (!className) return false;
  return /author/i.test(className);
}

function ruleH1AuthorH2(fileData, cssRules) {
  const tags = fileData.tagSequence || [];

  // Find h1 followed by author p followed by h2
  const scenarios = [];
  for (let i = 0; i < tags.length - 2; i++) {
    const t0 = tags[i];
    const t1 = tags[i + 1];
    const t2 = tags[i + 2];

    if (
      t0.tagName === 'h1' &&
      t1.tagName === 'p' && isAuthorClass(t1.className) &&
      t2.tagName === 'h2'
    ) {
      scenarios.push({ h1: t0, author: t1, h2: t2 });
    }
  }

  if (scenarios.length === 0) {
    return {
      name: 'h1AuthorH2',
      label: 'H1 → Author → H2',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      h1Rows: [],
      reason: ''
    };
  }

  const rows = [];
  let overallPass = true;

  for (const s of scenarios) {
    const h1Top    = lookupCssProp(cssRules, s.h1.className, 'h1', 'margin-top');
    const h1Bottom = lookupCssProp(cssRules, s.h1.className, 'h1', 'margin-bottom');
    const pTop     = lookupCssProp(cssRules, s.author.className, 'p', 'margin-top');
    const pBottom  = lookupCssProp(cssRules, s.author.className, 'p', 'margin-bottom');
    const h2Top    = lookupCssProp(cssRules, s.h2.className, 'h2', 'margin-top');
    const h2Bottom = lookupCssProp(cssRules, s.h2.className, 'h2', 'margin-bottom');

    const h1TopPass    = h1Top    === '1em';
    const h1BottomPass = h1Bottom === '0' || h1Bottom === '0em' || h1Bottom === '0px';
    const pTopPass     = pTop     === '0' || pTop     === '0em' || pTop     === '0px';
    const pBottomPass  = pBottom  === '2.5em';
    const h2TopPass    = h2Top    === '0' || h2Top    === '0em' || h2Top    === '0px';
    const h2BottomPass = h2Bottom === '0.5em';

    const pass = h1TopPass && h1BottomPass && pTopPass &&
                 pBottomPass && h2TopPass && h2BottomPass;
    if (!pass) overallPass = false;

    const failures = [];
    if (!h1TopPass)    failures.push(`h1 margin-top expected 1em, found: ${h1Top || 'not set'}`);
    if (!h1BottomPass) failures.push(`h1 margin-bottom expected 0, found: ${h1Bottom || 'not set'}`);
    if (!pTopPass)     failures.push(`author p margin-top expected 0, found: ${pTop || 'not set'}`);
    if (!pBottomPass)  failures.push(`author p margin-bottom expected 2.5em, found: ${pBottom || 'not set'}`);
    if (!h2TopPass)    failures.push(`h2 margin-top expected 0, found: ${h2Top || 'not set'}`);
    if (!h2BottomPass) failures.push(`h2 margin-bottom expected 0.5em, found: ${h2Bottom || 'not set'}`);

    rows.push({
      scenario: 'h1 → author → h2',
      h1Class: s.h1.className,
      authorClass: s.author.className,
      h2Class: s.h2.className,
      h1Top, h1Bottom, pTop, pBottom, h2Top, h2Bottom,
      pass,
      reason: failures.join('; ')
    });
  }

  return {
    name: 'h1AuthorH2',
    label: 'H1 → Author → H2',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    h1Rows: rows,
    reason: overallPass ? '' : `${rows.filter(r => !r.pass).length} issue(s) found`
  };
}
ruleH1AuthorH2.ruleName = 'h1AuthorH2';

function ruleH1AuthorP(fileData, cssRules) {
  const tags = fileData.tagSequence || [];

  const scenarios = [];
  for (let i = 0; i < tags.length - 2; i++) {
    const t0 = tags[i];
    const t1 = tags[i + 1];
    const t2 = tags[i + 2];

    if (
      t0.tagName === 'h1' &&
      t1.tagName === 'p' && isAuthorClass(t1.className) &&
      t2.tagName === 'p' && !isAuthorClass(t2.className)
    ) {
      scenarios.push({ h1: t0, author: t1, para: t2 });
    }
  }

  if (scenarios.length === 0) {
    return {
      name: 'h1AuthorP',
      label: 'H1 → Author → P',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      h1Rows: [],
      reason: ''
    };
  }

  const rows = [];
  let overallPass = true;

  for (const s of scenarios) {
    const h1Top    = lookupCssProp(cssRules, s.h1.className, 'h1', 'margin-top');
    const h1Bottom = lookupCssProp(cssRules, s.h1.className, 'h1', 'margin-bottom');
    const pTop     = lookupCssProp(cssRules, s.author.className, 'p', 'margin-top');
    const pBottom  = lookupCssProp(cssRules, s.author.className, 'p', 'margin-bottom');
    const p2Top    = lookupCssProp(cssRules, s.para.className, 'p', 'margin-top');

    const h1TopPass    = h1Top    === '1em';
    const h1BottomPass = h1Bottom === '0' || h1Bottom === '0em' || h1Bottom === '0px';
    const pTopPass     = pTop     === '0' || pTop     === '0em' || pTop     === '0px';
    const pBottomPass  = pBottom  === '2.5em';
    const p2TopPass    = p2Top    === '0' || p2Top    === '0em' || p2Top    === '0px';

    const pass = h1TopPass && h1BottomPass && pTopPass && pBottomPass && p2TopPass;
    if (!pass) overallPass = false;

    const failures = [];
    if (!h1TopPass)    failures.push(`h1 margin-top expected 1em, found: ${h1Top || 'not set'}`);
    if (!h1BottomPass) failures.push(`h1 margin-bottom expected 0, found: ${h1Bottom || 'not set'}`);
    if (!pTopPass)     failures.push(`author p margin-top expected 0, found: ${pTop || 'not set'}`);
    if (!pBottomPass)  failures.push(`author p margin-bottom expected 2.5em, found: ${pBottom || 'not set'}`);
    if (!p2TopPass)    failures.push(`content p margin-top expected 0, found: ${p2Top || 'not set'}`);

    rows.push({
      scenario: 'h1 → author → p',
      h1Class: s.h1.className,
      authorClass: s.author.className,
      paraClass: s.para.className,
      h1Top, h1Bottom, pTop, pBottom, p2Top,
      pass,
      reason: failures.join('; ')
    });
  }

  return {
    name: 'h1AuthorP',
    label: 'H1 → Author → P',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    h1Rows: rows,
    reason: overallPass ? '' : `${rows.filter(r => !r.pass).length} issue(s) found`
  };
}
ruleH1AuthorP.ruleName = 'h1AuthorP';

function ruleH1H2(fileData, cssRules) {
  const tags = fileData.tagSequence || [];

  const scenarios = [];
  for (let i = 0; i < tags.length - 1; i++) {
    const t0 = tags[i];
    const t1 = tags[i + 1];

    if (t0.tagName === 'h1' && t1.tagName === 'h2') {
      scenarios.push({ h1: t0, h2: t1 });
    }
  }

  if (scenarios.length === 0) {
    return {
      name: 'h1H2',
      label: 'H1 → H2',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      h1Rows: [],
      reason: ''
    };
  }

  const rows = [];
  let overallPass = true;

  for (const s of scenarios) {
    const h1Top    = lookupCssProp(cssRules, s.h1.className, 'h1', 'margin-top');
    const h1Bottom = lookupCssProp(cssRules, s.h1.className, 'h1', 'margin-bottom');
    const h2Top    = lookupCssProp(cssRules, s.h2.className, 'h2', 'margin-top');
    const h2Bottom = lookupCssProp(cssRules, s.h2.className, 'h2', 'margin-bottom');

    const h1TopPass    = h1Top    === '1em';
    const h1BottomPass = h1Bottom === '2.5em';
    const h2TopPass    = h2Top    === '0' || h2Top === '0em' || h2Top === '0px';
    const h2BottomPass = h2Bottom === '0.5em';

    const pass = h1TopPass && h1BottomPass && h2TopPass && h2BottomPass;
    if (!pass) overallPass = false;

    const failures = [];
    if (!h1TopPass)    failures.push(`h1 margin-top expected 1em, found: ${h1Top || 'not set'}`);
    if (!h1BottomPass) failures.push(`h1 margin-bottom expected 2.5em, found: ${h1Bottom || 'not set'}`);
    if (!h2TopPass)    failures.push(`h2 margin-top expected 0, found: ${h2Top || 'not set'}`);
    if (!h2BottomPass) failures.push(`h2 margin-bottom expected 0.5em, found: ${h2Bottom || 'not set'}`);

    rows.push({
      scenario: 'h1 → h2',
      h1Class: s.h1.className,
      h2Class: s.h2.className,
      h1Top, h1Bottom, h2Top, h2Bottom,
      pass,
      reason: failures.join('; ')
    });
  }

  return {
    name: 'h1H2',
    label: 'H1 → H2',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    h1Rows: rows,
    reason: overallPass ? '' : `${rows.filter(r => !r.pass).length} issue(s) found`
  };
}
ruleH1H2.ruleName = 'h1H2';

function ruleH1P(fileData, cssRules) {
  const tags = fileData.tagSequence || [];

  const scenarios = [];
  for (let i = 0; i < tags.length - 1; i++) {
    const t0 = tags[i];
    const t1 = tags[i + 1];

    if (
      t0.tagName === 'h1' &&
      t1.tagName === 'p' &&
      !isAuthorClass(t1.className)
    ) {
      scenarios.push({ h1: t0, para: t1 });
    }
  }

  if (scenarios.length === 0) {
    return {
      name: 'h1P',
      label: 'H1 → P',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      h1Rows: [],
      reason: ''
    };
  }

  const rows = [];
  let overallPass = true;

  for (const s of scenarios) {
    const h1Top    = lookupCssProp(cssRules, s.h1.className, 'h1', 'margin-top');
    const h1Bottom = lookupCssProp(cssRules, s.h1.className, 'h1', 'margin-bottom');
    const pTop     = lookupCssProp(cssRules, s.para.className, 'p', 'margin-top');

    const h1TopPass    = h1Top    === '1em';
    const h1BottomPass = h1Bottom === '2.5em';
    const pTopPass     = pTop     === '0' || pTop === '0em' || pTop === '0px';

    const pass = h1TopPass && h1BottomPass && pTopPass;
    if (!pass) overallPass = false;

    const failures = [];
    if (!h1TopPass)    failures.push(`h1 margin-top expected 1em, found: ${h1Top || 'not set'}`);
    if (!h1BottomPass) failures.push(`h1 margin-bottom expected 2.5em, found: ${h1Bottom || 'not set'}`);
    if (!pTopPass)     failures.push(`p margin-top expected 0, found: ${pTop || 'not set'}`);

    rows.push({
      scenario: 'h1 → p',
      h1Class: s.h1.className,
      paraClass: s.para.className,
      h1Top, h1Bottom, pTop,
      pass,
      reason: failures.join('; ')
    });
  }

  return {
    name: 'h1P',
    label: 'H1 → P',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    h1Rows: rows,
    reason: overallPass ? '' : `${rows.filter(r => !r.pass).length} issue(s) found`
  };
}
ruleH1P.ruleName = 'h1P';

function ruleCopyrightFontSize(fileData, cssRules) {
  // Only Front Matter
  if (fileData.matterType !== 'front') {
    return {
      name: 'copyrightFontSize',
      label: 'Copyright Font Size',
      pass: true,
      notApplicable: true,
      firstTag: '',
      className: '',
      marginTopValue: '',
      marginBottomValue: '',
      fontSizeValue: '',
      copyrightRows: [],
      reason: ''
    };
  }

  // Only applies to Copyright.xhtml
  const fileName = fileData.fileName.split('/').pop();
  if (fileName !== 'Copyright.xhtml') {
    return {
      name: 'copyrightFontSize',
      label: 'Copyright Font Size',
      pass: true,
      notApplicable: true,
      firstTag: '',
      className: '',
      marginTopValue: '',
      marginBottomValue: '',
      fontSizeValue: '',
      copyrightRows: [],
      reason: ''
    };
  }

  const allTags = fileData.allTags || [];

  // Deduplicate by tagName.className, skip body tag
  const seen = new Set();
  const targets = allTags.filter(t => {
    if (t.tagName === 'body') return false;
    if (!t.className) return false;
    const key = `${t.tagName}.${t.className}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (targets.length === 0) {
    return {
      name: 'copyrightFontSize',
      label: 'Copyright Font Size',
      pass: false,
      notApplicable: false,
      firstTag: '',
      className: '',
      marginTopValue: '',
      marginBottomValue: '',
      fontSizeValue: '',
      copyrightRows: [],
      reason: 'No tags with class found in Copyright.xhtml'
    };
  }

  const rows = [];
  let overallPass = true;

  for (const t of targets) {
    const classes = t.className.split(/\s+/).filter(Boolean);
    const classFoundInCss = classes.some(cls =>
      cssRules[`${t.tagName}.${cls}`] || cssRules[cls]
    );

    if (!classFoundInCss) {
      rows.push({
        tagName: t.tagName,
        className: t.className,
        cssSelector: 'Not Found',
        fontSize: '(not set)',
        fontSizePass: false,
        pass: false,
        reason: `Style not found in stylesheet for class "${t.className}"`
      });
      overallPass = false;
      continue;
    }

    const fontSize = lookupCssProp(cssRules, t.className, t.tagName, 'font-size');
    const cssBlock = lookupCssBlock(fileData.cssBlocks, t.className, t.tagName);
    const fontSizePass = fontSize === '100%';
    if (!fontSizePass) overallPass = false;

    rows.push({
      tagName: t.tagName,
      className: t.className,
      cssSelector: cssBlock ? cssBlock.selector : 'Not Found',
      fontSize: fontSize || '(not set)',
      fontSizePass,
      pass: fontSizePass,
      reason: fontSizePass ? '' : (fontSize ? `font-size expected 100%, found: ${fontSize}` : 'font-size not defined in stylesheet')
    });
  }

  return {
    name: 'copyrightFontSize',
    label: 'Copyright Font Size',
    pass: overallPass,
    notApplicable: false,
    firstTag: '',
    className: '',
    marginTopValue: '',
    marginBottomValue: '',
    fontSizeValue: '',
    copyrightRows: rows,
    reason: ''
  };
}

function ruleDoubleSpace(fileData, cssRules) {
  const hits = fileData.doubleSpaceHits || [];

  if (hits.length === 0) {
    return {
      name: 'doubleSpace',
      label: 'Double Space Check',
      pass: true,
      notApplicable: false,
      firstTag: '',
      className: '',
      marginTopValue: '',
      marginBottomValue: '',
      fontSizeValue: '',
      doubleSpaceRows: [],
      reason: ''
    };
  }

  const rows = hits.map(h => ({
    tagName: h.tagName,
    className: h.className || '(none)',
    text: h.text
  }));

  return {
    name: 'doubleSpace',
    label: 'Double Space Check',
    pass: false,
    notApplicable: false,
    firstTag: '',
    className: '',
    marginTopValue: '',
    marginBottomValue: '',
    fontSizeValue: '',
    doubleSpaceRows: rows,
    reason: `${rows.length} double space(s) found`
  };
}

ruleDoubleSpace.ruleName = 'doubleSpace';

function ruleTabSpace(fileData, cssRules) {
  const hits = fileData.tabSpaceHits || [];
  if (hits.length === 0) {
    return {
      name: 'tabSpace',
      label: 'Tab Space Check',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      tabSpaceRows: [],
      reason: ''
    };
  }
  return {
    name: 'tabSpace',
    label: 'Tab Space Check',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    tabSpaceRows: hits.map(h => ({
      tagName: h.tagName,
      className: h.className || '(none)',
      text: h.text
    })),
    reason: `${hits.length} tab space(s) found`
  };
}
ruleTabSpace.ruleName = 'tabSpace';

function ruleCapitalAfterP(fileData, cssRules) {
  const hits = fileData.capitalHits || [];
  if (hits.length === 0) {
    return {
      name: 'capitalAfterP',
      label: 'Capital Letter Check',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      capitalRows: [],
      reason: ''
    };
  }
  return {
    name: 'capitalAfterP',
    label: 'Capital Letter Check',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    capitalRows: hits.map(h => ({
      tagName: h.tagName,
      className: h.className || '(none)',
      text: h.text
    })),
    reason: `${hits.length} <p> tag(s) start with lowercase`
  };
}
ruleCapitalAfterP.ruleName = 'capitalAfterP';

function ruleEndPunctuation(fileData, cssRules) {
  if (fileData.matterType !== 'body') {
    return {
      name: 'endPunctuation',
      label: 'End Punctuation Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      endPuncRows: [],
      reason: ''
    };
  }

  const hits = fileData.endPuncHits || [];
  if (hits.length === 0) {
    return {
      name: 'endPunctuation',
      label: 'End Punctuation Check',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      endPuncRows: [],
      reason: ''
    };
  }
  return {
    name: 'endPunctuation',
    label: 'End Punctuation Check',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    endPuncRows: hits.map(h => ({
      tagName: h.tagName,
      className: h.className || '(none)',
      text: h.text
    })),
    reason: `${hits.length} <p> tag(s) missing end punctuation before next <p>`
  };
}
ruleEndPunctuation.ruleName = 'endPunctuation';

function ruleAmpersand(fileData, cssRules) {
  const hits = fileData.ampersandHits || [];
  if (hits.length === 0) {
    return {
      name: 'ampersand',
      label: 'Entity Ampersand Check',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      ampersandRows: [],
      reason: ''
    };
  }
  return {
    name: 'ampersand',
    label: 'Entity Ampersand Check',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    ampersandRows: hits.map(h => ({
      tagName: h.tagName,
      className: h.className || '(none)',
      text: h.text
    })),
    reason: `${hits.length} tag(s) contain &&`
  };
}
ruleAmpersand.ruleName = 'ampersand';

function ruleHyphenSpace(fileData, cssRules) {
  const hits = fileData.hyphenSpaceHits || [];
  if (hits.length === 0) {
    return {
      name: 'hyphenSpace',
      label: 'Hyphen Space Check',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      hyphenSpaceRows: [],
      reason: ''
    };
  }
  return {
    name: 'hyphenSpace',
    label: 'Hyphen Space Check',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    hyphenSpaceRows: hits.map(h => ({
      tagName: h.tagName,
      className: h.className || '(none)',
      text: h.text
    })),
    reason: `${hits.length} tag(s) contain hyphen followed by space`
  };
}
ruleHyphenSpace.ruleName = 'hyphenSpace';

function ruleNumberHyphen(fileData, cssRules) {
  const hits = fileData.numberHyphenHits || [];

  if (hits.length === 0) {
    return {
      name: 'numberHyphen',
      label: 'Number Hyphen Check',
      pass: true,
      warning: false,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      numberHyphenRows: [],
      reason: ''
    };
  }

  return {
    name: 'numberHyphen',
    label: 'Number Hyphen Check',
    pass: true,
    warning: true,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    numberHyphenRows: hits.map(h => ({
      tagName: h.tagName,
      className: h.className || '(none)',
      text: h.text,
      matches: h.matches || []
    })),
    reason: `${hits.length} tag(s) contain number-hyphen-number (use en dash instead)`
  };
}
ruleNumberHyphen.ruleName = 'numberHyphen';

function ruleTrailingSpace(fileData, cssRules) {
  const hasTrailing = fileData.hasTrailingSpace || false;
  const charCount = fileData.trailingSpaceContent || 0;

  if (!hasTrailing) {
    return {
      name: 'trailingSpace',
      label: 'Trailing Space After HTML',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      trailingSpaceRows: [],
      reason: ''
    };
  }

  return {
    name: 'trailingSpace',
    label: 'Trailing Space After HTML',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    trailingSpaceRows: [{ charCount }],
    reason: `${charCount} character(s) found after </html>`
  };
}
ruleTrailingSpace.ruleName = 'trailingSpace';

function ruleSpaceAfterOpen(fileData, cssRules) {
  const hits = fileData.spaceAfterOpenHits || [];
  if (hits.length === 0) {
    return {
      name: 'spaceAfterOpen',
      label: 'Space After Opening Tag',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      spaceAfterOpenRows: [],
      reason: ''
    };
  }
  return {
    name: 'spaceAfterOpen',
    label: 'Space After Opening Tag',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    spaceAfterOpenRows: hits.map(h => ({
      tagName: h.tagName,
      className: h.className || '(none)',
      text: h.text
    })),
    reason: `${hits.length} tag(s) have space after opening tag`
  };
}
ruleSpaceAfterOpen.ruleName = 'spaceAfterOpen';

function ruleSpaceBeforeClose(fileData, cssRules) {
  const hits = fileData.spaceBeforeCloseHits || [];
  if (hits.length === 0) {
    return {
      name: 'spaceBeforeClose',
      label: 'Space Before Closing Tag',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      spaceBeforeCloseRows: [],
      reason: ''
    };
  }
  return {
    name: 'spaceBeforeClose',
    label: 'Space Before Closing Tag',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    spaceBeforeCloseRows: hits.map(h => ({
      tagName: h.tagName,
      className: h.className || '(none)',
      text: h.text
    })),
    reason: `${hits.length} tag(s) have space before closing tag`
  };
}
ruleSpaceBeforeClose.ruleName = 'spaceBeforeClose';

function ruleDotAfterClose(fileData, cssRules) {
  const hits = fileData.dotAfterCloseHits || [];
  if (hits.length === 0) {
    return {
      name: 'dotAfterClose',
      label: 'Dot After Closing Tag',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      dotAfterCloseRows: [],
      reason: ''
    };
  }
  return {
    name: 'dotAfterClose',
    label: 'Dot After Closing Tag',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    dotAfterCloseRows: hits.map(h => ({
      tagName: h.tagName,
      snippet: h.snippet
    })),
    reason: `${hits.length} closing tag(s) followed by a dot`
  };
}
ruleDotAfterClose.ruleName = 'dotAfterClose';

function ruleSuperscriptLink(fileData, cssRules) {

  // Only body matter
  if (fileData.matterType !== 'body') {
    return {
      name: 'superscriptLink',
      label: 'Superscript Link Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      superscriptRows: [],
      reason: ''
    };
  }

  const hits = fileData.superscriptHits || [];

  if (hits.length === 0) {
    return {
      name: 'superscriptLink',
      label: 'Superscript Link Check',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      superscriptRows: [],
      reason: ''
    };
  }

  return {
    name: 'superscriptLink',
    label: 'Superscript Link Check',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    superscriptRows: hits.map(h => ({
      text: h.text,
      issue: h.issue,
      href: h.href || '(none)',
      targetExists: h.targetExists
    })),
    reason: `${hits.length} superscript(s) have link issues`
  };
}
ruleSuperscriptLink.ruleName = 'superscriptLink';

function rulePagebreakCheck(fileData, cssRules) {
  const expected = window.expectedPageCount || null;

  // If no page count provided skip
  if (!expected) {
    return {
      name: 'pagebreakCheck',
      label: 'Pagebreak Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      pagebreakRows: [],
      pagebreakSummary: '',
      reason: ''
    };
  }

  const fullEpub = !!window.fullEpubPagebreak;
  const bucketFiles = (window.bucketOrder && window.bucketOrder[fileData.matterType]) || [fileData.fileName];
  const shortName = fn => fn.split('/').pop();

  if (fullEpub) {
    return rulePagebreakCheckFullEpub(fileData, expected, bucketFiles, shortName);
  }

  const originalOrder = fileData.pagebreakOriginalOrder || [];
  const mode = fileData.pagebreakMode || 'numeric';

  if (mode === 'mixed') {
    return {
      name: 'pagebreakCheck',
      label: 'Pagebreak Check',
      pass: false,
      warning: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      pagebreakRows: [],
      pagebreakSummary: `Mixed roman and numeric pagebreak ids found: ${originalOrder.join(', ')}`,
      reason: 'Pagebreak ids mix roman numerals and numbers — cannot verify series'
    };
  }

  // Integer form of every entry, used for the actual math; the
  // original strings (roman or numeric) are what gets displayed.
  const orderInts = originalOrder.map(v =>
    mode === 'roman' ? romanToInt(v) : (typeof v === 'number' ? v : parseInt(v, 10))
  );

  const start = orderInts[0];
  const rows = [];
  let overallPass = true;

  // Check 1: total count
  const countPass = originalOrder.length === expected;
  if (!countPass) overallPass = false;

  rows.push({
    check: 'Total Pagebreaks',
    expected: expected,
    found: originalOrder.length,
    pass: countPass,
    reason: countPass ? '' :
      `Expected ${expected} pagebreaks, found ${originalOrder.length}`
  });

  // Check 2: consecutive series (no gaps, no missing, no extra)
  let seriesPass = true;
  let missing = [];
  let extra = [];
  if (orderInts.length > 0) {
    const expectedSeries = [];
    for (let i = 0; i < expected; i++) {
      expectedSeries.push(start + i);
    }

    missing = expectedSeries.filter(n => !orderInts.includes(n));
    extra = orderInts.filter(n => !expectedSeries.includes(n));

    seriesPass = missing.length === 0 && extra.length === 0;
    if (!seriesPass) overallPass = false;

    rows.push({
      check: 'Consecutive Series',
      expected: `${start} to ${start + expected - 1}`,
      found: originalOrder.join(', '),
      pass: seriesPass,
      missing: missing,
      extra: extra,
      reason: seriesPass ? '' : [
        missing.length ? `Missing: ${missing.join(', ')}` : '',
        extra.length ? `Extra: ${extra.join(', ')}` : ''
      ].filter(Boolean).join(' | ')
    });
  }

  // Check 3: order (each number must be exactly previous + 1)
  const orderIssues = [];
  for (let i = 1; i < orderInts.length; i++) {
    if (orderInts[i] !== orderInts[i - 1] + 1) {
      orderIssues.push({
        position: i + 1,
        expected: orderInts[i - 1] + 1,
        found: originalOrder[i]
      });
    }
  }
  const orderPass = orderIssues.length === 0;
  if (!orderPass) overallPass = false;

  rows.push({
    check: 'Order Check',
    expected: 'Ascending consecutive order',
    found: originalOrder.join(', '),
    pass: orderPass,
    reason: orderPass ? '' : orderIssues.map(o =>
      `Position ${o.position}: expected ${o.expected}, found ${o.found}`
    ).join(' | ')
  });

  if (bucketFiles.length > 1) {
    rows.push({
      check: 'Bucket Files',
      expected: '',
      found: bucketFiles.length,
      pass: true,
      reason: 'Multiple files in bucket — enable Full EPUB for complete check'
    });
  }

  const modeLabel = mode === 'roman' ? 'Roman numeral pagebreaks' : 'Numeric pagebreaks';

  return {
    name: 'pagebreakCheck',
    label: 'Pagebreak Check',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    pagebreakRows: rows,
    pagebreakSummary: `${modeLabel} — Found: ${originalOrder.join(', ') || 'none'}`,
    reason: overallPass ? '' : 'Pagebreak series is incorrect'
  };
}

/**
 * Full EPUB pagebreak check: concatenates every file's pagebreaks in
 * bucket sequence order (window.bucketOrder) and runs the same 3
 * checks against the combined series, using window.allPagebreakData
 * (populated in app.js from every parsed file) to look up entries
 * for files other than the one currently being validated.
 */
function rulePagebreakCheckFullEpub(fileData, expected, bucketFiles, shortName) {
  const allData = window.allPagebreakData || {};

  const entries = []; // { fileName, value (raw string/int), mode }
  for (const fn of bucketFiles) {
    const data = fn === fileData.fileName
      ? { originalOrder: fileData.pagebreakOriginalOrder || [], mode: fileData.pagebreakMode || 'numeric' }
      : (allData[fn] || { originalOrder: [], mode: 'numeric' });

    for (const value of data.originalOrder) {
      entries.push({ fileName: fn, value, mode: data.mode });
    }
  }

  const originalOrder = entries.map(e => e.value);
  const orderInts = entries.map(e =>
    e.mode === 'roman' ? romanToInt(e.value) : (typeof e.value === 'number' ? e.value : parseInt(e.value, 10))
  );

  const start = orderInts[0];
  const rows = [];
  let overallPass = true;

  const countPass = originalOrder.length === expected;
  if (!countPass) overallPass = false;
  rows.push({
    check: 'Total Pagebreaks (Full EPUB)',
    expected: expected,
    found: originalOrder.length,
    pass: countPass,
    reason: countPass ? '' :
      `Expected ${expected} pagebreaks across bucket, found ${originalOrder.length}`
  });

  let seriesPass = true;
  let missing = [];
  let extra = [];
  if (orderInts.length > 0) {
    const expectedSeries = [];
    for (let i = 0; i < expected; i++) expectedSeries.push(start + i);

    missing = expectedSeries.filter(n => !orderInts.includes(n));
    extra = orderInts.filter(n => !expectedSeries.includes(n));

    seriesPass = missing.length === 0 && extra.length === 0;
    if (!seriesPass) overallPass = false;

    rows.push({
      check: 'Consecutive Series (Full EPUB)',
      expected: `${start} to ${start + expected - 1}`,
      found: originalOrder.join(', '),
      pass: seriesPass,
      missing: missing,
      extra: extra,
      reason: seriesPass ? '' : [
        missing.length ? `Missing: ${missing.join(', ')}` : '',
        extra.length ? `Extra: ${extra.join(', ')}` : ''
      ].filter(Boolean).join(' | ')
    });
  }

  const orderIssues = [];
  for (let i = 1; i < orderInts.length; i++) {
    if (orderInts[i] !== orderInts[i - 1] + 1) {
      orderIssues.push({
        position: i + 1,
        expected: orderInts[i - 1] + 1,
        found: originalOrder[i]
      });
    }
  }
  const orderPass = orderIssues.length === 0;
  if (!orderPass) overallPass = false;

  rows.push({
    check: 'Order Check (Full EPUB)',
    expected: 'Ascending consecutive order',
    found: originalOrder.join(', '),
    pass: orderPass,
    reason: orderPass ? '' : orderIssues.map(o =>
      `Position ${o.position}: expected ${o.expected}, found ${o.found}`
    ).join(' | ')
  });

  // Per-file breakdown so it's clear which file contributed which
  // pagebreaks to the combined series.
  for (const fn of bucketFiles) {
    const data = fn === fileData.fileName
      ? { originalOrder: fileData.pagebreakOriginalOrder || [] }
      : (allData[fn] || { originalOrder: [] });
    rows.push({
      check: `File: ${shortName(fn)}`,
      expected: '',
      found: data.originalOrder.join(', ') || 'none',
      pass: true,
      reason: ''
    });
  }

  return {
    name: 'pagebreakCheck',
    label: 'Pagebreak Check',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    pagebreakRows: rows,
    pagebreakSummary: `Full EPUB — Found: ${originalOrder.join(', ') || 'none'} across ${bucketFiles.length} file(s)`,
    reason: overallPass ? '' : 'Pagebreak series is incorrect across the bucket'
  };
}
rulePagebreakCheck.ruleName = 'pagebreakCheck';

function ruleTableImage(fileData, cssRules) {

  // Body matter only
  if (fileData.matterType !== 'body') {
    return {
      name: 'tableImage',
      label: 'Table Image Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      tableImageRows: [],
      reason: ''
    };
  }

  const blocks = fileData.tableImageBlocks || [];

  if (blocks.length === 0) {
    return {
      name: 'tableImage',
      label: 'Table Image Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      tableImageRows: [],
      reason: ''
    };
  }

  const rows = [];
  let overallPass = true;

  for (const block of blocks) {
    const rowFailures = [];

    // Check tabcaption exists
    if (!block.hasCaption) {
      rowFailures.push('tabcaption class missing');
      overallPass = false;
    } else {
      // Check tabcaption CSS
      const captionMarginTop = lookupCssProp(cssRules, 'tabcaption', 'p', 'margin-top');
      const captionMarginBottom = lookupCssProp(cssRules, 'tabcaption', 'p', 'margin-bottom');

      const captionTopPass = captionMarginTop === '1em';
      const captionBottomPass = captionMarginBottom === '0.5em';

      if (!captionTopPass) {
        rowFailures.push(captionMarginTop
          ? `tabcaption margin-top expected 1em, found: ${captionMarginTop}`
          : 'tabcaption margin-top not defined');
        overallPass = false;
      }
      if (!captionBottomPass) {
        rowFailures.push(captionMarginBottom
          ? `tabcaption margin-bottom expected 0.5em, found: ${captionMarginBottom}`
          : 'tabcaption margin-bottom not defined');
        overallPass = false;
      }
    }

    // Check tabimage exists
    if (!block.hasImage) {
      rowFailures.push('tabimage class missing');
      overallPass = false;
    } else {
      // Check tabimage CSS
      const imageMarginTop = lookupCssProp(cssRules, 'tabimage', 'p', 'margin-top');
      const imageMarginBottom = lookupCssProp(cssRules, 'tabimage', 'p', 'margin-bottom');

      const imageTopPass = imageMarginTop === '0' ||
                           imageMarginTop === '0em' ||
                           imageMarginTop === '0px';
      const imageBottomPass = imageMarginBottom === '1em';

      if (!imageTopPass) {
        rowFailures.push(imageMarginTop
          ? `tabimage margin-top expected 0, found: ${imageMarginTop}`
          : 'tabimage margin-top not defined');
        overallPass = false;
      }
      if (!imageBottomPass) {
        rowFailures.push(imageMarginBottom
          ? `tabimage margin-bottom expected 1em, found: ${imageMarginBottom}`
          : 'tabimage margin-bottom not defined');
        overallPass = false;
      }
    }

    rows.push({
      id: block.id,
      hasCaption: block.hasCaption,
      hasImage: block.hasImage,
      pass: rowFailures.length === 0,
      reason: rowFailures.join('; ')
    });
  }

  return {
    name: 'tableImage',
    label: 'Table Image Check',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    tableImageRows: rows,
    reason: overallPass ? '' :
      `${rows.filter(r => !r.pass).length} table image block(s) have issues`
  };
}
ruleTableImage.ruleName = 'tableImage';

function ruleReferenceCheck(fileData, cssRules) {

  const refIds = fileData.refIds || [];

  // No ref tags in file → not applicable
  if (refIds.length === 0) {
    return {
      name: 'referenceCheck',
      label: 'Reference Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      referenceRows: [],
      reason: ''
    };
  }

  const uncalledRefs = fileData.uncalledRefs || [];
  const brokenLinks = fileData.brokenRefLinks || [];

  const overallPass = uncalledRefs.length === 0 && brokenLinks.length === 0;

  const rows = [];

  // Check 1 rows — uncalled refs
  for (const id of uncalledRefs) {
    rows.push({
      type: 'Uncalled Reference',
      id: id,
      issue: `<p class="ref" id="${id}"> is never linked in this file`,
      pass: false
    });
  }

  // Check 2 rows — broken links
  for (const id of brokenLinks) {
    rows.push({
      type: 'Broken Link',
      id: id,
      issue: `<a href="#${id}"> points to a ref that does not exist`,
      pass: false
    });
  }

  return {
    name: 'referenceCheck',
    label: 'Reference Check',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    referenceRows: rows,
    reason: overallPass ? '' : [
      uncalledRefs.length ? `${uncalledRefs.length} uncalled reference(s)` : '',
      brokenLinks.length ? `${brokenLinks.length} broken link(s)` : ''
    ].filter(Boolean).join(', ')
  };
}
ruleReferenceCheck.ruleName = 'referenceCheck';

function ruleCssClassCheck(fileData, cssRules) {

  const usedClasses = fileData.usedCssClasses || [];

  if (usedClasses.length === 0) {
    return {
      name: 'cssClassCheck',
      label: 'CSS Class Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      cssClassRows: [],
      reason: ''
    };
  }

  const rows = [];
  let overallPass = true;

  for (const { tagName, className } of usedClasses) {

    // Check both .className and tag.className in cssRules
    const bareKey = className;
    const tagKey = `${tagName}.${className}`;

    const foundBare = !!cssRules[bareKey];
    const foundTag  = !!cssRules[tagKey];
    const found     = foundBare || foundTag;

    if (!found) {
      overallPass = false;
      rows.push({
        tagName,
        className,
        lookedFor: [`.${className}`, `${tagName}.${className}`],
        found: false,
        reason: `Class "${className}" not found in stylesheet`
      });
    }
  }

  return {
    name: 'cssClassCheck',
    label: 'CSS Class Check',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    cssClassRows: rows,
    reason: overallPass ? '' :
      `${rows.length} class(es) not found in stylesheet`
  };
}
ruleCssClassCheck.ruleName = 'cssClassCheck';

function ruleFigureImage(fileData, cssRules) {

  // Body matter only
  if (fileData.matterType !== 'body') {
    return {
      name: 'figureImage',
      label: 'Figure Image Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      figureImageRows: [],
      reason: ''
    };
  }

  const blocks = fileData.figureBlocks || [];

  if (blocks.length === 0) {
    return {
      name: 'figureImage',
      label: 'Figure Image Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      figureImageRows: [],
      reason: ''
    };
  }

  const rows = [];
  let overallPass = true;

  for (const block of blocks) {
    const rowFailures = [];

    if (!block.imageTag) {
      rowFailures.push('Image paragraph missing');
      overallPass = false;
    }
    if (!block.captionTag) {
      rowFailures.push('Caption paragraph missing');
      overallPass = false;
    }

    if (block.imageTag && block.captionTag) {
      const imgTop    = lookupCssProp(cssRules, block.imageTag.className, 'p', 'margin-top');
      const imgBottom = lookupCssProp(cssRules, block.imageTag.className, 'p', 'margin-bottom');
      const capTop    = lookupCssProp(cssRules, block.captionTag.className, 'p', 'margin-top');
      const capBottom = lookupCssProp(cssRules, block.captionTag.className, 'p', 'margin-bottom');

      const imgTopPass = imgTop === '1em';
      const capBottomPass = capBottom === '1em';

      const combo1 = (
        (imgBottom === '0.5em') &&
        (capTop === '0' || capTop === '0em' || capTop === '0px')
      );

      const combo2 = (
        (imgBottom === '0' || imgBottom === '0em' || imgBottom === '0px') &&
        (capTop === '0.5em')
      );

      const combinationPass = combo1 || combo2;

      if (!imgTopPass) {
        rowFailures.push(imgTop
          ? `image(${block.imageTag.className}) margin-top expected 1em, found: ${imgTop}`
          : `image(${block.imageTag.className}) margin-top not defined`);
        overallPass = false;
      }

      if (!capBottomPass) {
        rowFailures.push(capBottom
          ? `caption(${block.captionTag.className}) margin-bottom expected 1em, found: ${capBottom}`
          : `caption(${block.captionTag.className}) margin-bottom not defined`);
        overallPass = false;
      }

      if (!combinationPass) {
        rowFailures.push(
          `Invalid margin combination: ` +
          `image-bottom=${imgBottom || 'not set'}, ` +
          `caption-top=${capTop || 'not set'}. ` +
          `Expected: (image-bottom=0.5em + caption-top=0) ` +
          `OR (image-bottom=0 + caption-top=0.5em)`
        );
        overallPass = false;
      }
    }

    rows.push({
      id: block.id,
      imageClass: block.imageTag ? block.imageTag.className : '(missing)',
      captionClass: block.captionTag ? block.captionTag.className : '(missing)',
      pass: rowFailures.length === 0,
      reason: rowFailures.join('; ')
    });
  }

  return {
    name: 'figureImage',
    label: 'Figure Image Check',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    figureImageRows: rows,
    reason: overallPass ? '' :
      `${rows.filter(r => !r.pass).length} figure block(s) have issues`
  };
}
ruleFigureImage.ruleName = 'figureImage';

function ruleCrossRefLink(fileData, cssRules) {

  const hits = fileData.crossRefHits || [];

  if (hits.length === 0) {
    return {
      name: 'crossRefLink',
      label: 'Cross Reference Link Check',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      crossRefRows: [],
      reason: ''
    };
  }

  return {
    name: 'crossRefLink',
    label: 'Cross Reference Link Check',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    crossRefRows: hits.map(h => ({
      matchedText: h.matchedText,
      pattern: h.pattern,
      issue: `"${h.matchedText}" is not wrapped in <a href>`
    })),
    reason: `${hits.length} cross reference(s) not linked`
  };
}
ruleCrossRefLink.ruleName = 'crossRefLink';

function ruleUnwantedTag(fileData, cssRules) {

  const emptyTags    = fileData.emptyTags    || [];
  const orphanClose  = fileData.orphanClose  || [];
  const unclosedTags = fileData.unclosedTags || [];

  const totalIssues = emptyTags.length +
                      orphanClose.length +
                      unclosedTags.length;

  if (totalIssues === 0) {
    return {
      name: 'unwantedTag',
      label: 'Unwanted Tag Check',
      pass: true,
      notApplicable: false,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      unwantedTagRows: [],
      reason: ''
    };
  }

  const rows = [];

  for (const t of emptyTags) {
    rows.push({
      type: 'Empty Tag',
      tagName: t.tagName,
      className: t.className || '(none)',
      snippet: t.snippet,
      issue: `<${t.tagName}> is empty (no content)`
    });
  }

  for (const t of orphanClose) {
    rows.push({
      type: 'Orphan Closing Tag',
      tagName: t.tagName,
      className: '—',
      snippet: t.snippet,
      issue: `</${t.tagName}> found without matching opening tag`
    });
  }

  for (const t of unclosedTags) {
    rows.push({
      type: 'Unclosed Tag',
      tagName: t.tagName,
      className: '—',
      snippet: t.snippet,
      issue: `<${t.tagName}> opened but never closed`
    });
  }

  return {
    name: 'unwantedTag',
    label: 'Unwanted Tag Check',
    pass: false,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    unwantedTagRows: rows,
    reason: [
      emptyTags.length    ? `${emptyTags.length} empty tag(s)` : '',
      orphanClose.length  ? `${orphanClose.length} orphan closing tag(s)` : '',
      unclosedTags.length ? `${unclosedTags.length} unclosed tag(s)` : ''
    ].filter(Boolean).join(', ')
  };
}
ruleUnwantedTag.ruleName = 'unwantedTag';

function ruleImageNameCheck(fileData, cssRules) {

  // Body matter only
  if (fileData.matterType !== 'body') {
    return {
      name: 'imageNameCheck',
      label: 'Image Name Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      imageNameRows: [],
      reason: ''
    };
  }

  const shortName = fileData.fileName.split('/').pop();
  const base = shortName.replace(/\.[^.]+$/, '');

  const images = fileData.imageSrcs || [];

  if (images.length === 0) {
    return {
      name: 'imageNameCheck',
      label: 'Image Name Check',
      pass: true,
      notApplicable: true,
      firstTag: '', className: '',
      marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
      imageNameRows: [],
      reason: ''
    };
  }

  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`^${escapedBase}-(\\d{3})\\.png$`);
  const genericPattern = /^(.+)-(\d{3})\.png$/;

  const rows = [];
  let wrongNameCount = 0;

  for (const filename of images) {
    const m = filename.match(namePattern);
    const patternPass = !!m;

    if (!patternPass) {
      const generic = filename.match(genericPattern);
      const reason = (generic && generic[1] !== base)
        ? `Image does not belong to this file: ${filename}`
        : `Wrong image name: ${filename}`;
      wrongNameCount++;
      rows.push({
        src: filename,
        filename,
        expectedBase: base,
        patternPass: false,
        sequenceIssue: false,
        pass: false,
        reason
      });
      continue;
    }

    rows.push({
      src: filename,
      filename,
      expectedBase: base,
      number: parseInt(m[1], 10),
      patternPass: true,
      sequenceIssue: false,
      pass: true,
      reason: ''
    });
  }

  // Sequence check runs only over rows whose name pattern is valid.
  const validRows = rows.filter(r => r.patternPass);
  const numbers = validRows.map(r => r.number);
  const sortedNumbers = [...numbers].sort((a, b) => a - b);

  const maxNumber = sortedNumbers.length ? sortedNumbers[sortedNumbers.length - 1] : 0;
  const numberSet = new Set(numbers);
  const missingNumbers = [];
  for (let n = 1; n <= maxNumber; n++) {
    if (!numberSet.has(n)) missingNumbers.push(n);
  }

  let outOfOrderCount = 0;
  const extraReasons = [];

  if (missingNumbers.length > 0) {
    for (const n of missingNumbers) {
      extraReasons.push(`Missing image: ${base}-${String(n).padStart(3, '0')}.png`);
    }
  } else {
    // No gaps — check that images appear in ascending order.
    for (let i = 0; i < validRows.length; i++) {
      if (numbers[i] !== sortedNumbers[i]) {
        validRows[i].sequenceIssue = true;
        validRows[i].pass = false;
        validRows[i].reason = `Wrong order: ${validRows[i].filename} should come later`;
        outOfOrderCount++;
      }
    }
  }

  const overallPass = wrongNameCount === 0 && missingNumbers.length === 0 && outOfOrderCount === 0;

  const reasonParts = [];
  if (wrongNameCount > 0) reasonParts.push(`${wrongNameCount} image(s) have wrong name`);
  if (outOfOrderCount > 0) reasonParts.push(`${outOfOrderCount} image(s) are out of order`);
  let reason = reasonParts.join(', ');
  if (extraReasons.length) reason = reason ? `${reason}; ${extraReasons.join('; ')}` : extraReasons.join('; ');

  return {
    name: 'imageNameCheck',
    label: 'Image Name Check',
    pass: overallPass,
    notApplicable: false,
    firstTag: '', className: '',
    marginTopValue: '', marginBottomValue: '', fontSizeValue: '',
    imageNameRows: rows,
    reason
  };
}
ruleImageNameCheck.ruleName = 'imageNameCheck';

function ruleAnchorTextDisplay(fileData) {
  const anchors = fileData.anchorTexts || [];
  return {
    name: 'anchorTextDisplay',
    label: 'Anchor Text Display',
    pass: true,
    notApplicable: anchors.length === 0,
    reason: anchors.length === 0
      ? 'No anchor tags found in this file.'
      : `${anchors.length} anchor(s) found.`,
    anchorTexts: anchors
  };
}
ruleAnchorTextDisplay.ruleName = 'anchorTextDisplay';

function ruleStylesheetLinkCheck(fileData) {
  const result = fileData.stylesheetLink || { found: false, actual: null };
  return {
    name: 'stylesheetLinkCheck',
    label: 'Stylesheet Link Check',
    pass: result.found,
    reason: result.found
      ? 'Stylesheet link is correct.'
      : result.actual
        ? `Incorrect stylesheet link found: ${result.actual}`
        : 'Stylesheet <link> tag is missing from <head>.',
    actual: result.actual
  };
}
ruleStylesheetLinkCheck.ruleName = 'stylesheetLinkCheck';

ruleFirstTagMarginTop.ruleName = 'firstTagMarginTop';
ruleFmtitleMargins.ruleName    = 'fmtitleMargins';
ruleHeadingStyles.ruleName     = 'headingStyles';
ruleFootnoteClasses.ruleName   = 'footnoteClasses';
ruleCopyrightFontSize.ruleName = 'copyrightFontSize';

const RULES = [
  ruleFirstTagMarginTop,
  ruleFmtitleMargins,
  ruleHeadingStyles,
  ruleFootnoteClasses,
  ruleH1AuthorH2,
  ruleH1AuthorP,
  ruleH1H2,
  ruleH1P,
  ruleCopyrightFontSize,
  ruleDoubleSpace,
  ruleTabSpace,
  ruleCapitalAfterP,
  ruleEndPunctuation,
  ruleAmpersand,
  ruleHyphenSpace,
  ruleNumberHyphen,
  ruleTrailingSpace,
  ruleSpaceAfterOpen,
  ruleSpaceBeforeClose,
  ruleDotAfterClose,
  ruleSuperscriptLink,
  rulePagebreakCheck,
  ruleTableImage,
  ruleReferenceCheck,
  ruleCssClassCheck,
  ruleFigureImage,
  ruleCrossRefLink,
  ruleUnwantedTag,
  ruleImageNameCheck
];
RULES.push(ruleAnchorTextDisplay);
RULES.unshift(ruleStylesheetLinkCheck);
