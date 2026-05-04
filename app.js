/* Event Inventory Tracker
   Uses Google Apps Script backend
*/

const state = { events: [], inventory: [], assignments: [] };

const API_URL = "https://script.google.com/macros/s/AKfycbznXk-uGrT89QYSqQPKuRRSRGx1F18_ThlhH70fYBdcAKBEJ0EeB4mmBY5Hi0x-5xZmyQ/exec";

const $ = (id) => document.getElementById(id);

/* ---------------- INIT ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  $("loadBtn")?.addEventListener("click", loadAll);
  $("assignmentForm")?.addEventListener("submit", saveAssignment);

  $("eventSelect")?.addEventListener("change", refreshAvailableBadge);
  $("itemSelect")?.addEventListener("change", refreshAvailableBadge);
  $("qtyInput")?.addEventListener("input", refreshAvailableBadge);

  loadAll();
});

/* ---------------- API ---------------- */

async function apiGet(action) {
  const res = await fetch(`${API_URL}?action=${action}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "API error");
  return data;
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Save failed");
  return data;
}

/* ---------------- LOAD ---------------- */

async function loadAll() {
  try {
    setStatus("loadStatus", "Loading...", "ok");

    const e = await apiGet("getEvents");
    const i = await apiGet("getInventory");
    const a = await apiGet("getAssignments");

    state.events = (e.events || []).map(normalizeEvent);
    state.inventory = (i.inventory || []).map(normalizeInventory);
    state.assignments = (a.assignments || []).map(normalizeAssignment);

    renderAll();
    setStatus("loadStatus", "Loaded", "ok");
  } catch (err) {
    setStatus("loadStatus", err.message, "err");
  }
}

/* ---------------- NORMALIZE ---------------- */

function normalizeEvent(e) {
  return {
    id: String(e.id || ""),
    name: e.name || e.title || "(No title)",
    start: new Date(e.start),
    end: new Date(e.end)
  };
}

function normalizeInventory(i) {
  return [
    String(i.ItemID || ""),
    i.ItemName || "(Unnamed)",
    i.Category || "",
    Number(i.TotalQuantity || 0),
    "",
    "TRUE"
  ];
}

function normalizeAssignment(a) {
  return [
    "",
    String(a.EventID || ""),
    a.EventName || "",
    a.EventDate || "",
    a.StartTime || "",
    a.EndTime || "",
    String(a.ItemID || ""),
    a.ItemName || "",
    Number(a.QuantityAssigned || 0)
  ];
}

/* ---------------- RENDER ---------------- */

function renderAll() {
  renderEvents();
  renderInventory();
  populateSelectors();
  refreshAvailableBadge();
}

/* EVENTS LIST */

function renderEvents() {
  const list = $("eventsList");
  if (!list) return;

  list.innerHTML = "";

  state.events.forEach((e) => {
    const card = `
      <div class="item">
        <strong>${e.name}</strong>
        <div>${e.start.toLocaleString()} - ${e.end.toLocaleString()}</div>
        <button class="manage-btn" data-id="${e.id}">Manage Items</button>
      </div>
    `;

    list.insertAdjacentHTML("beforeend", card);
  });

  document.querySelectorAll(".manage-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      prefillEvent(btn.dataset.id);
    });
  });
}

/* INVENTORY */

function renderInventory() {
  const list = $("inventoryList");
  if (!list) return;

  list.innerHTML =
    state.inventory
      .map(i => `
        <div class="item">
          <strong>${i[1]}</strong>
          <div>Total: ${i[3]}</div>
        </div>
      `)
      .join("");
}

/* SELECTORS */

function populateSelectors() {
  const eventSelect = $("eventSelect");
  const itemSelect = $("itemSelect");

  if (eventSelect) {
    eventSelect.innerHTML =
      '<option value="">Select event</option>' +
      state.events.map(e =>
        `<option value="${e.id}">
          ${e.name} (${fmtDate(e.start)}) - ${formatTime(e.start)} - ${formatTime(e.end)}
        </option>`
      ).join("");
  }

  if (itemSelect) {
    itemSelect.innerHTML =
      '<option value="">Select item</option>' +
      state.inventory.map(i =>
        `<option value="${i[0]}">${i[1]}</option>`
      ).join("");
  }
}

/* PREFILL */

function prefillEvent(id) {
  $("eventSelect").value = id;
  refreshAvailableBadge();
}

/* ---------------- AVAILABILITY ---------------- */

function availabilityFor(eventId, itemId) {
  const total = state.inventory.find(i => i[0] === itemId)?.[3] || 0;

  let used = 0;

  state.assignments.forEach(a => {
    if (a[6] === itemId) {
      used += a[8];
    }
  });

  return {
    available: total - used,
    total
  };
}

function refreshAvailableBadge() {
  const e = $("eventSelect")?.value;
  const i = $("itemSelect")?.value;

  if (!e || !i) return;

  const a = availabilityFor(e, i);

  $("availableText").textContent = `Available: ${a.available} / ${a.total}`;
}

/* ---------------- SAVE ---------------- */

async function saveAssignment(ev) {
  ev.preventDefault();

  const eventId = $("eventSelect").value;
  const itemId = $("itemSelect").value;
  const qty = Number($("qtyInput").value);

  try {
    await apiPost({
      action: "addAssignment",
      eventId,
      itemId,
      quantity: qty
    });

    await loadAll();
    setStatus("formMessage", "Saved!", "ok");
  } catch (e) {
    setStatus("formMessage", e.message, "err");
  }
}

/* ---------------- HELPERS ---------------- */

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function formatTime(d) {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).replace(" ", "");
}

function setStatus(id, msg, cls) {
  const el = $(id);
  if (!el) return;
  el.className = cls;
  el.textContent = msg;
}
