/* Event Inventory Tracker */

const API_URL = "https://script.google.com/macros/s/AKfycbznXk-uGrT89QYSqQPKuRRSRGx1F18_ThlhH70fYBdcAKBEJ0EeB4mmBY5Hi0x-5xZmyQ/exec";

const state = {
  events: [],
  inventory: [],
  assignments: []
};

let calendarStart = new Date();
let selectedCalendarEventId = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("refreshBtn").addEventListener("click", loadAll);
  $("assignmentForm").addEventListener("submit", saveAssignmentFromMainForm);

  $("eventSelect").addEventListener("change", refreshAvailableBadge);
  $("itemSelect").addEventListener("change", refreshAvailableBadge);
  $("quantityInput").addEventListener("input", refreshAvailableBadge);

  $("prevBtn").addEventListener("click", () => {
    calendarStart.setDate(calendarStart.getDate() - 30);
    renderCalendar();
  });

  $("nextBtn").addEventListener("click", () => {
    calendarStart.setDate(calendarStart.getDate() + 30);
    renderCalendar();
  });

  $("closeDialogBtn").addEventListener("click", () => {
    $("calendarDialog").close();
  });

  $("calendarAssignForm").addEventListener("submit", saveAssignmentFromCalendar);

  loadAll();
});

async function apiGet(action) {
  const res = await fetch(`${API_URL}?action=${action}`);
  const data = await res.json();

  if (!data.success) {
    throw new Error(data.message || `Failed: ${action}`);
  }

  return data;
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.message || "Save failed");
  }

  return data;
}

async function loadAll() {
  try {
    const eventsData = await apiGet("getEvents");
    const inventoryData = await apiGet("getInventory");
    const assignmentsData = await apiGet("getAssignments");

    state.events = (eventsData.events || []).map(normalizeEvent);
    state.inventory = (inventoryData.inventory || []).map(normalizeInventory);
    state.assignments = (assignmentsData.assignments || []).map(normalizeAssignment);

    if (state.events.length) {
      calendarStart = new Date(state.events[0].start);
      calendarStart.setDate(1);
    }

    renderAll();
  } catch (err) {
    alert("Could not load data: " + err.message);
  }
}

function normalizeEvent(e) {
  return {
    id: String(e.id || e.CalendarEventID || e.EventID || ""),
    name: e.name || e.title || e.EventName || "(No title)",
    start: new Date(e.start || e.StartTime),
    end: new Date(e.end || e.EndTime)
  };
}

function normalizeInventory(i) {
  return {
    id: String(i.ItemID || i["Item ID"] || i.itemId || ""),
    name: i.ItemName || i["Item Name"] || i.Name || i.name || "(Unnamed item)",
    category: i.Category || i.category || "",
    stock: Number(i.TotalQuantity || i["Total Quantity"] || i.Quantity || i.quantity || 0),
    active: String(i.Active ?? i.active ?? "TRUE").toUpperCase()
  };
}

function normalizeAssignment(a) {
  return {
    eventId: String(a.CalendarEventID || a.EventID || a.eventId || ""),
    eventName: a.EventName || a.eventName || "",
    itemId: String(a.ItemID || a.itemId || ""),
    itemName: a.ItemName || a.itemName || "",
    quantity: Number(a.QuantityAssigned || a.quantity || 0),
    startTime: a.StartTime || a.startTime || "",
    endTime: a.EndTime || a.endTime || "",
    notes: a.Notes || a.notes || ""
  };
}

function renderAll() {
  populateSelectors();
  renderInventoryTable();
  renderCalendar();
  refreshAvailableBadge();
}

function populateSelectors() {
  $("eventSelect").innerHTML =
    '<option value="">Select event</option>' +
    state.events
      .map(event => `
        <option value="${event.id}">
          ${event.name} (${formatDate(event.start)}) - ${formatTime(event.start)} - ${formatTime(event.end)}
        </option>
      `)
      .join("");

  $("itemSelect").innerHTML =
    '<option value="">Select item</option>' +
    state.inventory
      .filter(item => item.active === "TRUE")
      .map(item => `<option value="${item.id}">${item.name}</option>`)
      .join("");

  $("calendarItemSelect").innerHTML =
    state.inventory
      .filter(item => item.active === "TRUE")
      .map(item => `<option value="${item.id}">${item.name}</option>`)
      .join("");
}

function renderInventoryTable() {
  $("inventoryBody").innerHTML =
    state.inventory
      .filter(item => item.active === "TRUE")
      .map(item => `
        <tr>
          <td>${item.name}</td>
          <td>${item.category}</td>
          <td>${item.stock}</td>
        </tr>
      `)
      .join("");
}

function renderCalendar() {
  const grid = $("calendarGrid");
  grid.innerHTML = "";

  const endDate = new Date(calendarStart);
  endDate.setDate(calendarStart.getDate() + 29);

  $("calendarTitle").textContent =
    `${formatMonthDay(calendarStart)} - ${formatMonthDay(endDate)}`;

  const blanks = calendarStart.getDay();

  for (let i = 0; i < blanks; i++) {
    const empty = document.createElement("div");
    empty.className = "day-box empty";
    grid.appendChild(empty);
  }

  for (let i = 0; i < 30; i++) {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + i);

    const dateKey = date.toDateString();
    const dayEvents = state.events.filter(event => event.start.toDateString() === dateKey);

    const box = document.createElement("div");
    box.className = "day-box";

    box.innerHTML = `
      <div class="month-label">${date.toLocaleDateString("en-US", { month: "short" })}</div>
      <div class="day-number">${date.getDate()}</div>
      ${dayEvents.map(renderCalendarEvent).join("")}
    `;

    grid.appendChild(box);
  }

  document.querySelectorAll(".calendar-event").forEach(el => {
    el.addEventListener("click", () => openCalendarDialog(el.dataset.eventId));
  });
}

function renderCalendarEvent(event) {
  const assigned = state.assignments.filter(a => a.eventId === event.id);

  const assignedHtml = assigned.length
    ? `<ul class="assigned-items">
        ${assigned.map(a => `<li>${a.quantity} × ${a.itemName}</li>`).join("")}
       </ul>`
    : `<ul class="assigned-items"><li>No items assigned</li></ul>`;

  return `
    <div class="calendar-event event-card" data-event-id="${event.id}">
      <div class="event-name">${event.name}</div>
      <div class="event-time">${formatTime(event.start)} - ${formatTime(event.end)}</div>
      ${assignedHtml}
    </div>
  `;
}

function openCalendarDialog(eventId) {
  selectedCalendarEventId = eventId;

  const event = state.events.find(e => e.id === eventId);
  if (!event) return;

  $("dialogEventTitle").textContent =
    `${event.name} (${formatDate(event.start)}) - ${formatTime(event.start)} - ${formatTime(event.end)}`;

  $("calendarQtyInput").value = 1;
  $("calendarDialog").showModal();
}

async function saveAssignmentFromMainForm(e) {
  e.preventDefault();

  await saveAssignment({
    eventId: $("eventSelect").value,
    itemId: $("itemSelect").value,
    quantity: Number($("quantityInput").value),
    notes: $("notesInput").value || ""
  });

  $("quantityInput").value = "";
  $("notesInput").value = "";
}

async function saveAssignmentFromCalendar(e) {
  e.preventDefault();

  await saveAssignment({
    eventId: selectedCalendarEventId,
    itemId: $("calendarItemSelect").value,
    quantity: Number($("calendarQtyInput").value),
    notes: ""
  });

  $("calendarDialog").close();
}

async function saveAssignment({ eventId, itemId, quantity, notes }) {
  const event = state.events.find(e => e.id === eventId);
  const item = state.inventory.find(i => i.id === itemId);

  if (!event || !item || quantity <= 0) {
    alert("Please choose an event, item, and quantity.");
    return;
  }

  const available = availabilityFor(eventId, itemId);

  if (quantity > available.available) {
    alert(`Only ${available.available} available.`);
    return;
  }

  await apiPost({
    action: "addAssignment",
    eventId: event.id,
    eventName: event.name,
    eventDate: formatDate(event.start),
    startTime: event.start.toISOString(),
    endTime: event.end.toISOString(),
    itemId: item.id,
    itemName: item.name,
    quantity,
    notes
  });

  await loadAll();
}

function availabilityFor(eventId, itemId) {
  const item = state.inventory.find(i => i.id === itemId);
  if (!item) return { available: 0, total: 0 };

  const used = state.assignments
    .filter(a => a.itemId === itemId)
    .reduce((sum, a) => sum + Number(a.quantity || 0), 0);

  return {
    total: item.stock,
    available: item.stock - used
  };
}

function refreshAvailableBadge() {
  const eventId = $("eventSelect").value;
  const itemId = $("itemSelect").value;

  if (!eventId || !itemId) {
    $("availableText").textContent = "Available: -";
    return;
  }

  const available = availabilityFor(eventId, itemId);
  $("availableText").textContent = `Available: ${available.available} / ${available.total}`;
}

function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();

  return `${month}-${day}-${year}`;
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).replace(" ", "");
}

function formatMonthDay(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
