/* ============================================================
   bucketing.js
   ------------------------------------------------------------
   Drag-and-drop UI for grouping XHTML files into Front / Body /
   End Matter buckets before validation runs. Persists the
   assignment in localStorage, keyed by the selected folder name.
   ============================================================ */

const MATTER_ZONES = ["unassigned", "front", "body", "end", "isolate"];
const MATTER_LABELS = { front: "Front", body: "Body", end: "End", unassigned: "Unassigned", isolate: "Isolate" };
const MATTER_ORDER = { front: 0, body: 1, end: 2, isolate: 3 };

let bucketAssignments = {}; // fileName -> "unassigned" | "front" | "body" | "end"
let bucketFolderKey = null;

// fileName order per zone; drives the numbered ↑/↓ reorderable chip list.
let bucketOrder = { front: [], body: [], end: [], unassigned: [], isolate: [] };
window.bucketOrder = bucketOrder;

function bucketingStorageKey(folderName) {
  return `epubValidator.bucketing.${folderName}`;
}

function bucketOrderStorageKey(folderName) {
  return `epubValidator.bucketOrder.${folderName}`;
}

function loadBucketAssignments(folderName) {
  bucketFolderKey = folderName;
  try {
    const raw = localStorage.getItem(bucketingStorageKey(folderName));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadBucketOrder(folderName) {
  try {
    const raw = localStorage.getItem(bucketOrderStorageKey(folderName));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveBucketAssignments() {
  if (!bucketFolderKey) return;
  localStorage.setItem(bucketingStorageKey(bucketFolderKey), JSON.stringify(bucketAssignments));
}

function saveBucketOrder() {
  window.bucketOrder = bucketOrder;
  if (!bucketFolderKey) return;
  localStorage.setItem(bucketOrderStorageKey(bucketFolderKey), JSON.stringify(bucketOrder));
}

/**
 * Extracts the numeric suffix from names like czpam_19041_0004.xhtml
 * (the last _NNNN group before .xhtml) for auto-detect + sorting.
 */
function bodyMatterSequenceNumber(fileName) {
  const match = shortFileName(fileName).match(/_(\d{4})\.xhtml$/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Rebuilds bucketOrder from bucketAssignments, preserving any existing
 * relative order for files already present and appending newly
 * assigned files (sorted numerically for auto-detected body matter,
 * alphabetically otherwise) at the end of their zone.
 */
function rebuildBucketOrder() {
  const next = { front: [], body: [], end: [], unassigned: [], isolate: [] };

  for (const zone of MATTER_ZONES) {
    const existing = (bucketOrder[zone] || []).filter(name => bucketAssignments[name] === zone);
    next[zone] = existing;
  }

  const placed = new Set(Object.values(next).flat());
  const remaining = Object.keys(bucketAssignments)
    .filter(name => !placed.has(name))
    .sort((a, b) => {
      const seqA = bodyMatterSequenceNumber(a);
      const seqB = bodyMatterSequenceNumber(b);
      if (seqA !== null && seqB !== null) return seqA - seqB;
      return shortFileName(a).localeCompare(shortFileName(b));
    });

  for (const name of remaining) {
    next[bucketAssignments[name]].push(name);
  }

  bucketOrder = next;
  window.bucketOrder = bucketOrder;
}

/**
 * Initializes the bucketing UI for a set of xhtml file names.
 * Restores any saved assignment for this folder, defaulting new
 * files to "unassigned" — unless the name matches the numbered
 * body-matter pattern (..._0004.xhtml), in which case it's
 * auto-assigned to "body" and sorted by that numeric suffix.
 */
function initBucketing(folderName, fileNames) {
  const saved = loadBucketAssignments(folderName);
  const savedOrder = loadBucketOrder(folderName);
  bucketAssignments = {};

  for (const name of fileNames) {
    if (MATTER_ZONES.includes(saved[name])) {
      bucketAssignments[name] = saved[name];
    } else if (bodyMatterSequenceNumber(name) !== null) {
      bucketAssignments[name] = "body";
    } else {
      bucketAssignments[name] = "unassigned";
    }
  }

  bucketOrder = savedOrder && typeof savedOrder === 'object'
    ? { front: [], body: [], end: [], unassigned: [], isolate: [], ...savedOrder }
    : { front: [], body: [], end: [], unassigned: [], isolate: [] };
  rebuildBucketOrder();

  document.getElementById("bucketingSection").hidden = false;
  renderBucketZones();
}

function renderBucketZones() {
  const zoneEls = {
    unassigned: document.getElementById("poolUnassigned"),
    front: document.getElementById("zoneFront"),
    body: document.getElementById("zoneBody"),
    end: document.getElementById("zoneEnd"),
    isolate: document.getElementById("zoneIsolate")
  };

  for (const zone of MATTER_ZONES) {
    zoneEls[zone].innerHTML = "";
  }

  for (const zone of MATTER_ZONES) {
    const names = bucketOrder[zone] || [];
    names.forEach((fileName, index) => {
      zoneEls[zone].appendChild(
        createFileChip(fileName, zone, index, names.length)
      );
    });
  }

  for (const zone of MATTER_ZONES) {
    attachZoneDropHandlers(zoneEls[zone]);
  }

  updateRunValidationButton();
  saveBucketAssignments();
  saveBucketOrder();
}

function shortFileName(fileName) {
  const parts = fileName.split("/");
  return parts[parts.length - 1];
}

function moveWithinZone(zone, fromIndex, toIndex) {
  const list = bucketOrder[zone];
  if (!list || toIndex < 0 || toIndex >= list.length) return;
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  renderBucketZones();
}

function createFileChip(fileName, zone, index, total) {
  const showOrder = zone === "front" || zone === "body" || zone === "end";

  const chip = document.createElement("div");
  chip.className = `file-chip chip-${zone}`;
  chip.draggable = true;
  chip.title = fileName;
  chip.dataset.fileName = fileName;

  if (showOrder) {
    const orderNum = document.createElement("span");
    orderNum.className = "chip-order-num";
    orderNum.textContent = `${index + 1}.`;

    const name = document.createElement("span");
    name.className = "chip-name";
    name.textContent = shortFileName(fileName);

    const btns = document.createElement("div");
    btns.className = "chip-order-btns";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "chip-up";
    upBtn.textContent = "↑";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveWithinZone(zone, index, index - 1);
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "chip-down";
    downBtn.textContent = "↓";
    downBtn.disabled = index === total - 1;
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveWithinZone(zone, index, index + 1);
    });

    btns.appendChild(upBtn);
    btns.appendChild(downBtn);

    chip.appendChild(orderNum);
    chip.appendChild(name);
    chip.appendChild(btns);
  } else {
    chip.textContent = shortFileName(fileName);
  }

  chip.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", fileName);
    e.dataTransfer.effectAllowed = "move";
    chip.classList.add("dragging");
  });

  chip.addEventListener("dragend", () => {
    chip.classList.remove("dragging");
  });

  return chip;
}

function attachZoneDropHandlers(zoneEl) {
  if (zoneEl.dataset.dropWired) return;
  zoneEl.dataset.dropWired = 'true';

  zoneEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    zoneEl.classList.add("drag-over");
  });

  zoneEl.addEventListener("dragleave", () => {
    zoneEl.classList.remove("drag-over");
  });

  zoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    zoneEl.classList.remove("drag-over");

    const fileName = e.dataTransfer.getData("text/plain");
    const targetZone = zoneEl.dataset.zone;

    if (fileName && bucketAssignments[fileName] !== undefined) {
      const oldZone = bucketAssignments[fileName];
      if (oldZone === targetZone) return;

      bucketAssignments[fileName] = targetZone;

      const oldList = bucketOrder[oldZone];
      const pos = oldList.indexOf(fileName);
      if (pos !== -1) oldList.splice(pos, 1);

      bucketOrder[targetZone].push(fileName);

      renderBucketZones();
    }
  });
}

function updateRunValidationButton() {
  const runBtn = document.getElementById("runValidationBtn");
  const allAssigned = Object.values(bucketAssignments).every(z => z !== "unassigned");
  runBtn.disabled = !allAssigned;
}

/**
 * Returns the current matter type ("front"/"body"/"end") for a file
 * name, or "unassigned" if it was never bucketed (e.g. Skip was used).
 */
function getMatterType(fileName) {
  return bucketAssignments[fileName] || "unassigned";
}

function hideBucketingSection() {
  document.getElementById("bucketingSection").hidden = true;
}
