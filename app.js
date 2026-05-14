/* Event Inventory Tracker
   Uses Google Apps Script backend:
   - Gets events from Google Calendar
   - Gets inventory + assignments from Google Sheets
   - Saves, updates, and deletes assignments through Apps Script
   - Apps Script blocks overbooking
*/

const state = { events: [], inventory: [], assignments: [] };
const $ = (id) => document.getElementById(id);

const API_URL = window.APP_CONFIG.API_URL;
let calendarStart = getSunday(new Date());
const DAYS_TO_SHOW = 14;
calendarStartDate.setHours(0, 0, 0, 0);

$('loadBtn').addEventListener('click', loadAll);
$('assignmentForm').addEventListener('submit', saveAssignment);
$('eventSelect').addEventListener('change', refreshAvailableBadge);
$('itemSelect').addEventListener('change', refreshAvailableBadge);
$('qtyInput').addEventListener('input', refreshAvailableBadge);
$('cancelEditBtn').addEventListener('click', resetAssignmentForm);

$('prevCalendarBtn').addEventListener('click', () => {
  calendarStartDate.setDate(calendarStartDate.getDate() - 14);
  calendarStartDate = getSunday(calendarStartDate);
  renderCalendarView();
});

$('nextCalendarBtn').addEventListener('click', () => {
  calendarStartDate.setDate(calendarStartDate.getDate() + 14);
  calendarStartDate = getSunday(calendarStartDate);
  renderCalendarView();
});

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

async function loadAll(resetCalendar = true) {
  try {
    const start = new Date(calendarStart);
    const end = new Date(calendarStart);
    end.setDate(start.getDate() + DAYS_TO_SHOW - 1);

    const eventsData = await apiGet(
      `getEvents&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
    );

    const inventoryData = await apiGet("getInventory");
    const assignmentsData = await apiGet("getAssignments");

    state.events = (eventsData.events || []).map(normalizeEvent);
    state.inventory = (inventoryData.inventory || []).map(normalizeInventory);
    state.assignments = (assignmentsData.assignments || []).map(normalizeAssignment);

    if (resetCalendar && state.events.length) {
      calendarStart = getSunday(new Date(state.events[0].start));
    }

    renderAll();
  } catch (err) {
    alert("Could not load data: " + err.message);
  }

function normalizeInventoryFromBackend(i) {
  const itemId = i.ItemID || i['Item ID'] || i.itemId || '';
  const itemName = i.ItemName || i['Item Name'] || i.Name || i.name || '(Unnamed item)';
  const category = i.Category || i.category || '';
  const totalQuantity = Number(i.TotalQuantity || i['Total Quantity'] || i.Quantity || i.quantity || 0);
  const notes = i.Notes || i.notes || '';
  const active = String(i.Active ?? i.active ?? 'TRUE').toUpperCase();

  return [itemId, itemName, category, totalQuantity, notes, active];
}

function normalizeAssignmentFromBackend(a) {
  return [
    a.AssignmentID || '',
    a.CalendarEventID || a.EventID || '',
    a.EventName || '',
    a.EventDate || '',
    a.StartTime || '',
    a.EndTime || '',
    a.ItemID || '',
    a.ItemName || '(Unnamed item)',
    Number(a.QuantityAssigned || 0),
    a.Notes || '',
    a.CreatedAt || '',
    a.UpdatedAt || ''
  ];
}

function renderAll() {
  renderCalendarView();
  renderInventory();
  populateSelectors();
  renderSetup();
}

function populateSelectors() {
  $('eventSelect').innerHTML =
    '<option value="">Select event</option>' +
    state.events
      .sort((a, b) => a.start - b.start)
      .map(
        (e) =>
          `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)} (${fmtDateDisplay(e.start)}) - ${fmtDisplayTime(
            e.start
          )} - ${fmtDisplayTime(e.end)}</option>`
      )
      .join('');

  $('itemSelect').innerHTML =
    '<option value="">Select item</option>' +
    state.inventory
      .filter((r) => (r[5] || 'TRUE') === 'TRUE')
      .filter((i) => i[0] && i[1])
      .map((i) => `<option value="${escapeHtml(i[0])}">${escapeHtml(i[1])}</option>`)
      .join('');
}
function renderCalendarView() {
  const calendar = $('calendarView');
  calendar.innerHTML = '';

  calendarStartDate = getSunday(calendarStartDate);

  const start = new Date(calendarStartDate);
  const end = new Date(calendarStartDate);
  end.setDate(start.getDate() + 13);

  $('calendarMonthLabel').textContent = `${start.toLocaleDateString([], {
    month: 'long',
    year: 'numeric'
  })} - ${end.toLocaleDateString([], {
    month: 'long',
    year: 'numeric'
  })}`;

  const eventsInRange = state.events
    .filter((e) => e.end >= start && e.start <= end)
    .sort((a, b) => a.start - b.start);

  const cells = [];

  for (let i = 0; i < 14; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);

    const eventsForDay = eventsInRange.filter((e) => fmtDate(e.start) === fmtDate(day));

    const eventHtml = eventsForDay
      .map((e) => {
        const inventoryOptions = state.inventory
          .filter((r) => (r[5] || 'TRUE') === 'TRUE')
          .filter((inv) => inv[0] && inv[1])
          .map((inv) => `<option value="${escapeAttr(inv[0])}">${escapeHtml(inv[1])}</option>`)
          .join('');

        const assignedItems =
          state.assignments
            .filter((a) => a[1] === e.id)
            .map((a) => `<li>${escapeHtml(a[8])} × ${escapeHtml(a[7])}</li>`)
            .join('') || '<li>No items assigned</li>';

        return `
          <div class="calendar-event">
            <strong>${escapeHtml(e.name)}</strong>
            <div class="calendar-time">${fmtDisplayTime(e.start)} - ${fmtDisplayTime(e.end)}</div>

            <div class="inline-assign">
              <select id="inlineItem-${escapeAttr(e.id)}">
                <option value="">Select item</option>
                ${inventoryOptions}
              </select>
              <input id="inlineQty-${escapeAttr(e.id)}" type="number" min="1" placeholder="Qty" />
              <input id="inlineNotes-${escapeAttr(e.id)}" type="text" placeholder="Notes" />
              <button onclick="saveInlineAssignment('${escapeAttr(e.id)}')">Assign</button>
            </div>

            <div class="assigned-in-calendar">
              <strong>Assigned:</strong>
              <ul>${assignedItems}</ul>
            </div>
          </div>
        `;
      })
      .join('');

    cells.push(`
      <div class="calendar-day">
        <div class="day-number">${day.getDate()}</div>
        <div class="muted">${day.toLocaleDateString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        })}</div>
        ${eventHtml}
      </div>
    `);
  }

  calendar.innerHTML = cells.join('');
}

function renderInventory() {
  const rows = state.inventory
    .filter((r) => (r[5] || 'TRUE') === 'TRUE')
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r[1])}</td>
        <td>${escapeHtml(r[2])}</td>
        <td>${escapeHtml(String(r[3]))}</td>
      </tr>
    `
    )
    .join('');

  $('inventoryTableBody').innerHTML =
    rows || `
    <tr>
      <td colspan="3" class="muted">No active inventory yet.</td>
    </tr>
  `;
}

function renderSetup() {
  renderSetupByEvent();
  renderSetupByItem();
}

function renderSetupByEvent() {
  const html = state.events
    .map((event) => {
      const rows = state.assignments.filter((a) => a[1] === event.id);
      if (!rows.length) return '';

      const itemRows = rows
        .map(
          (a) => `
        <div class="setup-item">
          <div class="setup-item-header">
            <div>
              <strong>${escapeHtml(a[8])} x ${escapeHtml(a[7])}</strong>
              ${a[9] ? `<div class="muted">${escapeHtml(a[9])}</div>` : ''}
            </div>
            <div class="setup-actions">
              <button class="edit-btn" onclick="editAssignment('${escapeAttr(a[0])}')">Edit</button>
              <button class="delete-btn" onclick="deleteAssignment('${escapeAttr(a[0])}')">Un-assign</button>
            </div>
          </div>
        </div>
      `
        )
        .join('');

      return `
        <div class="setup-item">
          <strong>${escapeHtml(event.name)}</strong>
          <div class="muted">${event.start.toLocaleString()} - ${event.end.toLocaleString()}</div>
          ${itemRows}
        </div>
      `;
    })
    .filter(Boolean)
    .join('');

  $('setupByEvent').innerHTML = html || '<p class="muted">No inventory has been assigned yet.</p>';
}

function renderSetupByItem() {
  const itemMap = {};

  state.assignments.forEach((a) => {
    if (!a[7]) return;
    itemMap[a[7]] ??= [];
    itemMap[a[7]].push(a);
  });

  const html = Object.entries(itemMap)
    .map(
      ([itemName, assignments]) => `
    <div class="setup-item">
      <strong>${escapeHtml(itemName)}</strong>
      ${assignments
        .map(
          (a) => `
        <div class="setup-item">
          <div class="setup-item-header">
            <div>
              <strong>${escapeHtml(a[8])} for ${escapeHtml(a[2])}</strong>
              <div class="muted">${escapeHtml(a[3])}</div>
            </div>
            <div class="setup-actions">
              <button class="edit-btn" onclick="editAssignment('${escapeAttr(a[0])}')">Edit</button>
              <button class="delete-btn" onclick="deleteAssignment('${escapeAttr(a[0])}')">Un-assign</button>
            </div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `
    )
    .join('');

  $('setupByItem').innerHTML = html || '<p class="muted">No inventory has been assigned yet.</p>';
}

function refreshAvailableBadge() {
  const eventId = $('eventSelect').value;
  const itemId = $('itemSelect').value;

  if (!eventId || !itemId) {
    $('availableText').textContent = 'Available: -';
    return;
  }

  const a = availabilityFor(eventId, itemId);
  $('availableText').textContent = `Available: ${Math.max(0, a.available)} / ${a.total}`;
}

function availabilityFor(eventId, itemId, ignoreAssignmentId = '') {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return { available: 0, total: 0, used: 0 };

  const inv = state.inventory.find((r) => r[0] === itemId && (r[5] || 'TRUE') === 'TRUE');
  if (!inv) return { available: 0, total: 0, used: 0 };

  const total = Number(inv[3] || 0);
  let used = 0;

  state.assignments.forEach((a) => {
    if (a[0] === ignoreAssignmentId) return;
    if (a[6] !== itemId) return;

    const existingStart = new Date(a[4]);
    const existingEnd = new Date(a[5]);

    if (overlap(existingStart, existingEnd, ev.start, ev.end)) {
      used += Number(a[8] || 0);
    }
  });

  return { available: total - used, total, used };
}

function overlap(aS, aE, bS, bE) {
  return aS < bE && aE > bS;
}

async function saveAssignment(ev) {
  ev.preventDefault();

  try {
    const editingId = $('editingAssignmentId').value;
    const eventId = $('eventSelect').value;
    const itemId = $('itemSelect').value;
    const qty = Number($('qtyInput').value || 0);

    if (!eventId || !itemId || qty <= 0) {
      return setStatus('formMessage', 'Please select an event, item, and quantity.', 'err');
    }

    const eventObj = state.events.find((e) => e.id === eventId);
    const itemObj = state.inventory.find((i) => i[0] === itemId);

    const action = editingId ? 'updateAssignment' : 'addAssignment';

    const result = await apiPost({
      action,
      assignmentId: editingId,
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
    resetAssignmentForm();
    await loadAll();
  } catch (e) {
    setStatus('formMessage', e.message, 'err');
  }
}

window.saveInlineAssignment = async (eventId) => {
  try {
    const itemId = $(`inlineItem-${eventId}`).value;
    const qty = Number($(`inlineQty-${eventId}`).value || 0);
    const notes = $(`inlineNotes-${eventId}`).value || '';

    if (!itemId || qty <= 0) {
      alert('Please select an item and enter a quantity.');
      return;
    }

    const eventObj = state.events.find((e) => e.id === eventId);
    const itemObj = state.inventory.find((i) => i[0] === itemId);

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
      notes
    });

    alert(result.message);
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
};

window.prefillEvent = (id) => {
  $('eventSelect').value = id;
  refreshAvailableBadge();
  window.scrollTo({ top: $('assignmentForm').offsetTop - 120, behavior: 'smooth' });
};

window.editAssignment = (assignmentId) => {
  const assignment = state.assignments.find((a) => a[0] === assignmentId);
  if (!assignment) return;

  $('editingAssignmentId').value = assignment[0];
  $('eventSelect').value = assignment[1];
  $('itemSelect').value = assignment[6];
  $('qtyInput').value = assignment[8];
  $('notesInput').value = assignment[9] || '';
  $('saveAssignmentBtn').textContent = 'Update Assignment';
  $('cancelEditBtn').classList.remove('hidden');

  refreshAvailableBadge();
  window.scrollTo({ top: $('assignmentForm').offsetTop - 120, behavior: 'smooth' });
};

window.deleteAssignment = async (assignmentId) => {
  const assignment = state.assignments.find((a) => a[0] === assignmentId);
  if (!assignment) return;

  const confirmed = confirm(`Un-assign ${assignment[8]} x ${assignment[7]} from ${assignment[2]}?`);
  if (!confirmed) return;

  try {
    const result = await apiPost({
      action: 'deleteAssignment',
      assignmentId
    });

    setStatus('formMessage', result.message || 'Inventory un-assigned.', 'ok');
    await loadAll();
  } catch (e) {
    setStatus('formMessage', e.message, 'err');
  }
};

function resetAssignmentForm() {
  $('editingAssignmentId').value = '';
  $('assignmentForm').reset();
  $('availableText').textContent = 'Available: -';
  $('saveAssignmentBtn').textContent = 'Save Assignment';
  $('cancelEditBtn').classList.add('hidden');
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDateDisplay(d) {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}-${day}-${year}`;
}

function fmtDisplayTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function setStatus(id, msg, cls) {
  const el = $(id);
  el.className = `status ${cls}`;
  el.textContent = msg;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
function getSunday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
async function saveInlineAssignment(eventId) {
  const itemId = $(`inlineItem-${eventId}`).value;
  const quantity = Number($(`inlineQty-${eventId}`).value);
  const notes = $(`inlineNotes-${eventId}`).value || '';

  if (!itemId || quantity <= 0) {
    alert('Please select an item and quantity.');
    return;
  }

  const eventObj = state.events.find((e) => e.id === eventId);

  if (!eventObj) {
    alert('Event not found.');
    return;
  }

  const itemObj = state.inventory.find((i) => i[0] === itemId);

  if (!itemObj) {
    alert('Inventory item not found.');
    return;
  }

  try {
    await apiPost({
      action: 'addAssignment',
      eventId: eventObj.id,
      eventName: eventObj.name,
      eventDate: fmtDate(eventObj.start),
      startTime: eventObj.start.toISOString(),
      endTime: eventObj.end.toISOString(),
      itemId: itemObj[0],
      itemName: itemObj[1],
      quantity,
      notes
    });

    await loadAll(false);
  } catch (err) {
    alert(err.message);
  }
}
