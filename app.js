/* Event Inventory Tracker
   Uses Google Apps Script backend:
   - Gets events from Google Calendar
   - Gets inventory + assignments from Google Sheets
   - Saves assignments through Apps Script
   - Apps Script blocks overbooking
*/

const state = { events: [], inventory: [], assignments: [] };
const $ = (id) => document.getElementById(id);

const API_URL = "https://script.google.com/macros/s/AKfycbznXk-uGrT89QYSqQPKuRRSRGx1F18_ThlhH70fYBdcAKBEJ0EeB4mmBY5Hi0x-5xZmyQ/exec";

$('loadBtn').addEventListener('click', loadAll);
$('assignmentForm').addEventListener('submit', saveAssignment);
$('eventSelect').addEventListener('change', refreshAvailableBadge);
$('itemSelect').addEventListener('change', refreshAvailableBadge);
$('qtyInput').addEventListener('input', refreshAvailableBadge);

document.querySelectorAll('.tab-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $('setupByEvent').classList.toggle('hidden', btn.dataset.tab !== 'byEvent');
    $('setupByItem').classList.toggle('hidden', btn.dataset.tab !== 'byItem');
  })
);

async function apiGet(action) {
  const res = await fetch(`${API_URL}?action=${action}`);
  const data = await res.json();

  if (!data.success) {
    throw new Error(data.message || `Failed to load ${action}`);
  }

  return data;
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

async function loadAll() {
  try {
    setStatus('loadStatus', 'Loading events and inventory...', 'ok');

    const eventsData = await apiGet('getEvents');
    const inventoryData = await apiGet('getInventory');
    const assignmentsData = await apiGet('getAssignments');

    state.events = (eventsData.events || []).map(normalizeEventFromBackend);
    state.inventory = (inventoryData.inventory || []).map(normalizeInventoryFromBackend);
    state.assignments = (assignmentsData.assignments || []).map(normalizeAssignmentFromBackend);

    console.log("Loaded inventory:", state.inventory);

    renderAll();
    setStatus('loadStatus', 'Loaded successfully.', 'ok');
  } catch (e) {
    setStatus('loadStatus', `Load failed: ${e.message}`, 'err');
  }
}

function normalizeEventFromBackend(e) {
  return {
    id: e.id,
    name: e.name || e.title || '(No title)',
    start: new Date(e.start),
    end: new Date(e.end)
  };
}

function normalizeInventoryFromBackend(i) {
  const itemId = i.ItemID || i["Item ID"] || i.itemId || "";
  const itemName = i.ItemName || i["Item Name"] || i.Name || i.name || "(Unnamed item)";
  const category = i.Category || i.category || "";
  const totalQuantity = Number(i.TotalQuantity || i["Total Quantity"] || i.Quantity || i.quantity || 0);
  const notes = i.Notes || i.notes || "";
  const active = String(i.Active ?? i.active ?? "TRUE").toUpperCase();

  return [
    itemId,
    itemName,
    category,
    totalQuantity,
    notes,
    active
  ];
}

function normalizeAssignmentFromBackend(a) {
  return [
    a.AssignmentID || "",
    a.CalendarEventID || a.EventID || "",
    a.EventName || "",
    a.EventDate || "",
    a.StartTime || "",
    a.EndTime || "",
    a.ItemID || "",
    a.ItemName || "(Unnamed item)",
    a.QuantityAssigned || 0,
    a.Notes || "",
    a.CreatedAt || "",
    a.UpdatedAt || ""
  ];
}

function overlap(aS, aE, bS, bE) {
  return aS < bE && aE > bS;
}

function availabilityFor(eventId, itemId) {
  const ev = state.events.find(e => e.id === eventId);
  if (!ev) return { available: 0, total: 0, used: 0 };

  const inv = state.inventory.find(r => r[0] === itemId && (r[5] || 'TRUE') === 'TRUE');
  if (!inv) return { available: 0, total: 0, used: 0 };

  const total = Number(inv[3] || 0);
  let used = 0;

  state.assignments.forEach(a => {
    if (a[6] !== itemId) return;

    const existingStart = new Date(a[4]);
    const existingEnd = new Date(a[5]);

    if (overlap(existingStart, existingEnd, ev.start, ev.end)) {
      used += Number(a[8] || 0);
    }
  });

  return {
    available: total - used,
    total,
    used
  };
}

function refreshAvailableBadge() {
  const eventId = $('eventSelect').value;
  const itemId = $('itemSelect').value;

  if (!eventId || !itemId) {
    $('availableText').textContent = '';
    return;
  }

  const a = availabilityFor(eventId, itemId);
  $('availableText').textContent = `Available: ${Math.max(0, a.available)} / ${a.total}`;
}

async function saveAssignment(ev) {
  ev.preventDefault();

  try {
    const eventId = $('eventSelect').value;
    const itemId = $('itemSelect').value;
    const qty = Number($('qtyInput').value || 0);

    if (!eventId || !itemId || qty <= 0) {
      return setStatus('formMessage', 'Please select an event, item, and quantity.', 'err');
    }

    const eventObj = state.events.find(e => e.id === eventId);
    const itemObj = state.inventory.find(i => i[0] === itemId);

    const result = await apiPost({
      action: 'addAssignment',
      eventId: eventObj.id,
      eventName: eventObj.name,
      eventDate: fmtDate(eventObj.start),
      startTime: eventObj.start.toISOString(),
      endTime: eventObj.end.toISOString(),
      itemId: itemObj[0],
      itemName: itemObj[1],
      quantity: qty,
      notes: $('notesInput').value || ''
    });

    setStatus('formMessage', result.message, 'ok');

    $('qtyInput').value = '';
    $('notesInput').value = '';

    await loadAll();
  } catch (e) {
    setStatus('formMessage', e.message, 'err');
  }
}

function renderAll() {
  renderEvents();
  renderInventory();
  populateSelectors();
  renderSetup();
  renderWarnings();
}

function renderEvents() {
  $('eventsList').innerHTML = '';

  const today = new Date();
  const todayRows = [];
  const upcoming = [];

  state.events.forEach(e => {
    const card = `
      <div class="item">
        <strong>${e.name}</strong>
        <div>${e.start.toLocaleString()} - ${e.end.toLocaleString()}</div>
        <button onclick="prefillEvent('${e.id}')">Manage Items</button>
      </div>
    `;

    if (e.start.toDateString() === today.toDateString()) {
      todayRows.push(card);
    } else if (e.start > today) {
      upcoming.push(card);
    }

    $('eventsList').insertAdjacentHTML('beforeend', card);
  });

  $('todayEvents').innerHTML = todayRows.join('') || '<p class="muted">No events found today.</p>';
  $('upcomingEvents').innerHTML = upcoming.join('') || '<p class="muted">No upcoming events.</p>';
}

window.prefillEvent = (id) => {
  $('eventSelect').value = id;
  refreshAvailableBadge();
  window.scrollTo({ top: $('assignmentForm').offsetTop - 120, behavior: 'smooth' });
};

function renderInventory() {
  $('inventoryList').innerHTML =
    state.inventory
      .filter(r => (r[5] || 'TRUE') === 'TRUE')
      .map(r => `
        <div class="item">
          <strong>${r[1]}</strong>
          <span class="muted">(${r[2]})</span>
          <div>Total: ${r[3]}</div>
        </div>
      `)
      .join('') || '<p class="muted">No active inventory yet.</p>';
}

function populateSelectors() {
  $('eventSelect').innerHTML =
    '<option value="">Select event</option>' +
    state.events
      .map(e => `<option value="${e.id}">${e.name} (${fmtDate(e.start)})</option>`)
      .join('');

  $('itemSelect').innerHTML =
    '<option value="">Select item</option>' +
    state.inventory
      .filter(r => (r[5] || 'TRUE') === 'TRUE')
      .filter(i => i[0] && i[1])
      .map(i => `<option value="${i[0]}">${i[1]}</option>`)
      .join('');
}

function renderWarnings() {
  const low = [];

  state.inventory.forEach(i => {
    if ((i[5] || 'TRUE') !== 'TRUE') return;

    const total = Number(i[3] || 0);

    if (total <= 5) {
      low.push(`<div class="item warn">Low stock: ${i[1]} (${total})</div>`);
    }
  });

  $('inventoryWarnings').innerHTML = low.join('') || '<p class="muted">No inventory warnings.</p>';

  $('overbookings').innerHTML =
    findOverbookings().map(x => `<div class="item err">${x}</div>`).join('') ||
    '<p class="muted">No overbooking issues.</p>';
}

function findOverbookings() {
  const issues = [];

  state.events.forEach(e => {
    state.inventory.forEach(i => {
      if ((i[5] || 'TRUE') !== 'TRUE') return;

      const a = availabilityFor(e.id, i[0]);

      if (a.available < 0) {
        issues.push(`${i[1]} overbooked for ${e.name}`);
      }
    });
  });

  return issues;
}

function renderSetup() {
  const byEvent = state.events.map(e => {
    const rows =
      state.assignments
        .filter(a => a[1] === e.id)
        .map(a => `<li>${a[8]} x ${a[7]}</li>`)
        .join('') || '<li>No inventory assigned yet.</li>';

    return `
      <div class="item">
        <strong>${e.name}</strong>
        <ul>${rows}</ul>
      </div>
    `;
  }).join('');

  $('setupByEvent').innerHTML = byEvent || '<p class="muted">No events.</p>';

  const itemMap = {};

  state.assignments.forEach(a => {
    itemMap[a[7]] ??= [];
    itemMap[a[7]].push(`${a[8]} for ${a[2]} (${a[3]})`);
  });

  $('setupByItem').innerHTML =
    Object.entries(itemMap)
      .map(([itemName, rows]) => `
        <div class="item">
          <strong>${itemName}</strong>
          <ul>${rows.map(x => `<li>${x}</li>`).join('')}</ul>
        </div>
      `)
      .join('') || '<p class="muted">No inventory assigned yet.</p>';
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function setStatus(id, msg, cls) {
  const el = $(id);
  el.className = `status ${cls}`;
  el.textContent = msg;
}
