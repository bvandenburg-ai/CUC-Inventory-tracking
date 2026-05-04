const events = [
  {
    id: 1,
    name: "Marie's Wedding",
    date: "2026-05-23",
    startTime: "08:00AM",
    endTime: "11:30PM"
  },
  {
    id: 2,
    name: "Youth Banquet",
    date: "2026-05-29",
    startTime: "05:00PM",
    endTime: "09:00PM"
  },
  {
    id: 3,
    name: "Community Brunch",
    date: "2026-06-06",
    startTime: "09:00AM",
    endTime: "01:00PM"
  }
];

const inventory = [
  { id: 1, name: "Round Tables", category: "Furniture", stock: 24 },
  { id: 2, name: "White Chairs", category: "Furniture", stock: 180 },
  { id: 3, name: "Black Linens", category: "Decor", stock: 40 },
  { id: 4, name: "Speaker System", category: "Audio", stock: 2 },
  { id: 5, name: "Projector", category: "AV", stock: 3 }
];

let assignments = [];
let calendarStart = new Date("2026-05-01T00:00:00");
let selectedCalendarEventId = null;

const eventSelect = document.getElementById("eventSelect");
const itemSelect = document.getElementById("itemSelect");
const quantityInput = document.getElementById("quantityInput");
const notesInput = document.getElementById("notesInput");
const availableText = document.getElementById("availableText");
const calendarGrid = document.getElementById("calendarGrid");
const calendarTitle = document.getElementById("calendarTitle");
const inventoryBody = document.getElementById("inventoryBody");

const dialog = document.getElementById("calendarDialog");
const dialogEventTitle = document.getElementById("dialogEventTitle");
const calendarItemSelect = document.getElementById("calendarItemSelect");
const calendarQtyInput = document.getElementById("calendarQtyInput");

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-");
  return `${month}-${day}-${year}`;
}

function eventLabel(event) {
  return `${event.name} (${formatDate(event.date)}) - ${event.startTime} - ${event.endTime}`;
}

function formatMonthDay(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function getUsedQuantity(itemId) {
  return assignments
    .filter((assignment) => assignment.itemId === itemId)
    .reduce((sum, assignment) => sum + assignment.quantity, 0);
}

function getAvailableQuantity(itemId) {
  const item = inventory.find((entry) => entry.id === Number(itemId));
  return item ? item.stock - getUsedQuantity(item.id) : 0;
}

function populateSelects() {
  eventSelect.innerHTML = events
    .map((event) => `<option value="${event.id}">${eventLabel(event)}</option>`)
    .join("");

  const itemOptions = inventory
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");

  itemSelect.innerHTML = itemOptions;
  calendarItemSelect.innerHTML = itemOptions;

  updateAvailableText();
}

function renderInventoryTable() {
  inventoryBody.innerHTML = inventory
    .map(
      (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.category}</td>
          <td>${item.stock}</td>
        </tr>
      `
    )
    .join("");

  for (let i = inventory.length; i < 10; i++) {
    inventoryBody.insertAdjacentHTML("beforeend", "<tr><td></td><td></td><td></td></tr>");
  }
}

function updateAvailableText() {
  const itemId = Number(itemSelect.value);
  const available = getAvailableQuantity(itemId);
  availableText.textContent = `Available: ${Number.isFinite(available) ? available : "-"}`;
}

function saveAssignment(eventId, itemId, quantity, notes = "") {
  const available = getAvailableQuantity(itemId);

  if (quantity > available) {
    alert(`Only ${available} available. This assignment would overbook inventory.`);
    return false;
  }

  assignments.push({
    eventId: Number(eventId),
    itemId: Number(itemId),
    quantity: Number(quantity),
    notes
  });

  return true;
}

function renderCalendar() {
  calendarGrid.innerHTML = "";

  const endDate = new Date(calendarStart);
  endDate.setDate(calendarStart.getDate() + 29);

  calendarTitle.textContent = `${formatMonthDay(calendarStart)} - ${formatMonthDay(endDate)}`;

  const leadingBlanks = calendarStart.getDay();

  for (let i = 0; i < leadingBlanks; i++) {
    const emptyBox = document.createElement("div");
    emptyBox.className = "day-box empty";
    calendarGrid.appendChild(emptyBox);
  }

  for (let i = 0; i < 30; i++) {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + i);

    const dateKey = date.toISOString().slice(0, 10);
    const dayEvents = events.filter((event) => event.date === dateKey);

    const box = document.createElement("div");
    box.className = "day-box";

    box.innerHTML = `
      <div class="month-label">${date.toLocaleDateString("en-US", { month: "short" })}</div>
      <div class="day-number">${date.getDate()}</div>
      ${dayEvents.map(renderEventInsideDay).join("")}
    `;

    calendarGrid.appendChild(box);
  }
}

function renderEventInsideDay(event) {
  const eventAssignments = assignments.filter((assignment) => assignment.eventId === event.id);

  const assignedList = eventAssignments.length
    ? `
      <ul class="assigned-items">
        ${eventAssignments
          .map((assignment) => {
            const item = inventory.find((entry) => entry.id === assignment.itemId);
            return `<li>${assignment.quantity} × ${item.name}</li>`;
          })
          .join("")}
      </ul>
    `
    : `<ul class="assigned-items"><li>No items assigned</li></ul>`;

  return `
    <div class="event-card" onclick="openCalendarAssignment(${event.id})">
      <div class="event-name">${event.name}</div>
      <div class="event-time">${event.startTime} - ${event.endTime}</div>
      ${assignedList}
    </div>
  `;
}

window.openCalendarAssignment = function (eventId) {
  selectedCalendarEventId = eventId;
  const event = events.find((entry) => entry.id === eventId);
  dialogEventTitle.textContent = eventLabel(event);
  calendarQtyInput.value = 1;
  dialog.showModal();
};

document.getElementById("assignmentForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const saved = saveAssignment(
    eventSelect.value,
    itemSelect.value,
    Number(quantityInput.value),
    notesInput.value
  );

  if (saved) {
    quantityInput.value = "";
    notesInput.value = "";
    updateAvailableText();
    renderCalendar();
  }
});

document.getElementById("calendarAssignForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const saved = saveAssignment(
    selectedCalendarEventId,
    calendarItemSelect.value,
    Number(calendarQtyInput.value)
  );

  if (saved) {
    dialog.close();
    updateAvailableText();
    renderCalendar();
  }
});

document.getElementById("closeDialogBtn").addEventListener("click", () => dialog.close());

itemSelect.addEventListener("change", updateAvailableText);

document.getElementById("prevBtn").addEventListener("click", () => {
  calendarStart.setDate(calendarStart.getDate() - 30);
  renderCalendar();
});

document.getElementById("nextBtn").addEventListener("click", () => {
  calendarStart.setDate(calendarStart.getDate() + 30);
  renderCalendar();
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  renderCalendar();
  updateAvailableText();
});

populateSelects();
renderInventoryTable();
renderCalendar();
