/* ============================================================
   validator.js
   ------------------------------------------------------------
   Applies the rules defined in rules.js against the parsed
   XHTML/CSS data produced by parser.js.
   ============================================================ */

/**
 * Runs all validation rules against a single parsed file.
 *
 * fileData: { fileName, firstTag, firstTagClass, cssRules, cssBlocks }
 *
 * Returns a result object used by reporter.js:
 *   {
 *     fileName, matterType, status ("PASS"/"FAIL"), reason,
 *     ruleResults: [
 *       { name, label, pass, firstTag, className, cssSelector, cssBlock, marginTopValue, reason }
 *     ]
 *   }
 *
 * Each rule's own output (firstTag/className/marginTopValue/reason) is
 * kept in its own column so adding a new rule to RULES automatically
 * adds a new column in the report without touching this function.
 */
function validateFile(fileData) {
  let overallPass = true;
  let hasWarning = false;
  const reasons = [];
  const ruleResults = [];

  const activeRuleNames = getActiveRuleNames();
  const activeRules = RULES.filter(rule => {
    const name = rule.ruleName || rule.name;
    return activeRuleNames.includes(name);
  });

  for (const rule of activeRules) {
    const result = rule(fileData, fileData.cssRules);

    if (!result.pass) overallPass = false;
    if (result.warning) hasWarning = true;
    if (result.reason) reasons.push(result.reason);

    const cssBlockMatch = lookupCssBlock(fileData.cssBlocks, result.className, result.firstTag);

    ruleResults.push({
      name: result.name,
      label: result.label || result.name,
      pass: result.pass,
      notApplicable: result.notApplicable || false,
      firstTag: result.firstTag || "(none)",
      className: result.className || "(none)",
      cssSelector: cssBlockMatch ? cssBlockMatch.selector : "Not Found",
      cssBlock: cssBlockMatch ? cssBlockMatch.block : "Not Found",
      marginTopValue: result.marginTopValue || "(not set)",
      marginBottomValue: result.marginBottomValue || "(not set)",
      fontSizeValue: result.fontSizeValue || "(not set)",
      headingRows: result.headingRows || [],
      footnoteRows: result.footnoteRows || [],
      h1Rows: result.h1Rows || [],
      copyrightRows: result.copyrightRows || [],
      doubleSpaceRows: result.doubleSpaceRows || [],
      tabSpaceRows: result.tabSpaceRows || [],
      capitalRows: result.capitalRows || [],
      endPuncRows: result.endPuncRows || [],
      ampersandRows: result.ampersandRows || [],
      hyphenSpaceRows: result.hyphenSpaceRows || [],
      numberHyphenRows: result.numberHyphenRows || [],
      trailingSpaceRows: result.trailingSpaceRows || [],
      spaceAfterOpenRows: result.spaceAfterOpenRows || [],
      spaceBeforeCloseRows: result.spaceBeforeCloseRows || [],
      dotAfterCloseRows: result.dotAfterCloseRows || [],
      superscriptRows: result.superscriptRows || [],
      pagebreakRows: result.pagebreakRows || [],
      pagebreakSummary: result.pagebreakSummary || '',
      tableImageRows: result.tableImageRows || [],
      referenceRows: result.referenceRows || [],
      cssClassRows: result.cssClassRows || [],
      unwantedTagRows: result.unwantedTagRows || [],
      figureImageRows: result.figureImageRows || [],
      crossRefRows: result.crossRefRows || [],
      imageNameRows: result.imageNameRows || [],
      anchorTexts: result.anchorTexts || [],
      reason: result.reason || ""
    });
  }

  return {
    fileName: fileData.fileName,
    matterType: fileData.matterType || "unassigned",
    title: fileData.title || "",
    status: !overallPass ? "FAIL" : (hasWarning ? "WARNING" : "PASS"),
    reason: reasons.join(" "),
    ruleResults: ruleResults
  };
}

/**
 * Runs validation across every parsed file.
 * parsedFiles: array of { fileName, firstTag, firstTagClass, cssRules }
 * Returns an array of result objects (see validateFile above).
 */
function validateAll(parsedFiles) {
  return parsedFiles.map(validateFile);
}
