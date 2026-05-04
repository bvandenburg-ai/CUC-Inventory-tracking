/* Event Inventory Tracker
   - Reads events from Google Calendar (confirmed only)
   - Reads/writes Inventory + Assignments in Google Sheets
   - Prevents overbooking on overlapping events
*/

const state = { events: [], inventory: [], assignments: [] };
const $ = (id) => document.getElementById(id);

$('loadBtn').addEventListener('click', loadAll);
$('assignmentForm').addEventListener('submit', saveAssignment);
$('eventSelect').addEventListener('change', refreshAvailableBadge);
$('itemSelect').addEventListener('change', refreshAvailableBadge);
$('qtyInput').addEventListener('input', refreshAvailableBadge);

document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  $('setupByEvent').classList.toggle('hidden', btn.dataset.tab !== 'byEvent');
  $('setupByItem').classList.toggle('hidden', btn.dataset.tab !== 'byItem');
}));

async function loadAll() {
  try {
    setStatus('loadStatus', 'Loading events and inventory...', 'ok');
    state.events = await fetchEvents();
    state.inventory = await readSheet('Inventory!A2:F');
    state.assignments = await readSheet('Assignments!A2:L');
    renderAll();
    setStatus('loadStatus', 'Loaded successfully.', 'ok');
  } catch (e) {
    setStatus('loadStatus', `Load failed: ${e.message}`, 'err');
  }
}

async function fetchEvents() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(APP_CONFIG.calendarId)}/events?key=${APP_CONFIG.googleApiKey}&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.items || []).filter(e => e.status === 'confirmed').map(normalizeEvent);
}

function normalizeEvent(e) {
  const start = e.start.dateTime || `${e.start.date}T00:00:00`;
  const end = e.end.dateTime || `${e.end.date}T00:00:00`;
  return { id: e.id, name: e.summary || '(No title)', start: new Date(start), end: new Date(end), allDay: !!e.start.date };
}

async function readSheet(range) {
  const u = `https://sheets.googleapis.com/v4/spreadsheets/${APP_CONFIG.spreadsheetId}/values/${encodeURIComponent(range)}?key=${APP_CONFIG.googleApiKey}`;
  const r = await fetch(u);
  const d = await r.json();
  return d.values || [];
}

function overlap(aS, aE, bS, bE) { return aS < bE && aE > bS; }

function availabilityFor(eventId, itemId) {
  const ev = state.events.find(e => e.id === eventId); if (!ev) return { available: 0, total: 0, used: 0 };
  const inv = state.inventory.find(r => r[0] === itemId && (r[5] || 'TRUE') === 'TRUE'); if (!inv) return { available: 0, total: 0, used: 0 };
  const total = Number(inv[3] || 0);
  let used = 0;
  state.assignments.forEach(a => {
    if (a[6] !== itemId) return;
    const as = new Date(`${a[3]}T${a[4] || '00:00:00'}`), ae = new Date(`${a[3]}T${a[5] || '23:59:59'}`);
    if (overlap(as, ae, ev.start, ev.end)) used += Number(a[8] || 0);
  });
  return { available: Math.max(0, total - used), total, used };
}

function refreshAvailableBadge() {
  const e = $('eventSelect').value, i = $('itemSelect').value;
  if (!e || !i) return;
  const a = availabilityFor(e, i);
  $('availableText').textContent = `Available: ${a.available} / ${a.total}`;
}

async function saveAssignment(ev) {
  ev.preventDefault();
  const eventId = $('eventSelect').value, itemId = $('itemSelect').value, qty = Number($('qtyInput').value || 0);
  const eventObj = state.events.find(e => e.id === eventId);
  const itemObj = state.inventory.find(i => i[0] === itemId);
  const a = availabilityFor(eventId, itemId);
  if (qty > a.available) {
    return setStatus('formMessage', `Cannot assign ${qty} ${itemObj?.[1] || 'items'}. Only ${a.available} are available during this event time.`, 'err');
  }
  const row = [crypto.randomUUID(), eventObj.id, eventObj.name, fmtDate(eventObj.start), fmtTime(eventObj.start), fmtTime(eventObj.end), itemObj[0], itemObj[1], String(qty), $('notesInput').value || '', new Date().toISOString(), new Date().toISOString()];
  await appendRow('Assignments!A:L', row);
  state.assignments.push(row);
  setStatus('formMessage', `Saved — ${qty} ${itemObj[1]} assigned to this event.`, 'ok');
  renderAll();
}

async function appendRow(range, values) {
  // Requires OAuth access token; API key alone cannot write Sheets.
  const token = localStorage.getItem('google_oauth_token');
  if (!token) throw new Error('Missing OAuth token for writing Sheets. See README setup for token flow.');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${APP_CONFIG.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [values] })});
  if (!r.ok) throw new Error('Failed to write assignment to Sheets.');
}

function renderAll(){ renderEvents(); renderInventory(); populateSelectors(); renderSetup(); renderWarnings(); }
function renderEvents(){ $('eventsList').innerHTML = ''; const today = new Date(); const todayRows=[]; const upcoming=[]; state.events.forEach(e=>{const card=`<div class="item"><strong>${e.name}</strong><div>${e.start.toLocaleString()} - ${e.end.toLocaleString()}</div><button onclick="prefillEvent('${e.id}')">Manage Items</button></div>`; if(e.start.toDateString()===today.toDateString())todayRows.push(card); else if(e.start>today)upcoming.push(card); $('eventsList').insertAdjacentHTML('beforeend',card);}); $('todayEvents').innerHTML=todayRows.join('')||'<p class="muted">No events found today.</p>'; $('upcomingEvents').innerHTML=upcoming.join('')||'<p class="muted">No upcoming events.</p>'; }
window.prefillEvent=(id)=>{$('eventSelect').value=id;refreshAvailableBadge();window.scrollTo({top:$('assignmentForm').offsetTop-120,behavior:'smooth'});};
function renderInventory(){ $('inventoryList').innerHTML = state.inventory.filter(r=>(r[5]||'TRUE')==='TRUE').map(r=>`<div class="item"><strong>${r[1]}</strong> <span class="muted">(${r[2]})</span><div>Total: ${r[3]}</div></div>`).join('')||'<p class="muted">No active inventory yet.</p>'; }
function populateSelectors(){ $('eventSelect').innerHTML='<option value="">Select event</option>'+state.events.map(e=>`<option value="${e.id}">${e.name} (${fmtDate(e.start)})</option>`).join(''); $('itemSelect').innerHTML='<option value="">Select item</option>'+state.inventory.filter(r=>(r[5]||'TRUE')==='TRUE').map(i=>`<option value="${i[0]}">${i[1]}</option>`).join(''); }
function renderWarnings(){ const low=[]; state.inventory.forEach(i=>{if((i[5]||'TRUE')!=='TRUE')return; const t=Number(i[3]||0); if(t<=5) low.push(`<div class="item warn">Low stock: ${i[1]} (${t})</div>`);}); $('inventoryWarnings').innerHTML=low.join('')||'<p class="muted">No inventory warnings.</p>'; $('overbookings').innerHTML=findOverbookings().map(x=>`<div class="item err">${x}</div>`).join('')||'<p class="muted">No overbooking issues.</p>'; }
function findOverbookings(){ const issues=[]; state.events.forEach(e=>state.inventory.forEach(i=>{if((i[5]||'TRUE')!=='TRUE')return; const a=availabilityFor(e.id,i[0]); if(a.available<0)issues.push(`${i[1]} overbooked for ${e.name}`);})); return issues; }
function renderSetup(){ const byE = state.events.map(e=>{const rows=state.assignments.filter(a=>a[1]===e.id).map(a=>`<li>${a[8]} x ${a[7]}</li>`).join('')||'<li>No inventory assigned yet.</li>'; return `<div class="item"><strong>${e.name}</strong><ul>${rows}</ul></div>`;}).join(''); $('setupByEvent').innerHTML=byE||'<p class="muted">No events.</p>'; const itemMap={}; state.assignments.forEach(a=>{itemMap[a[7]]??=[]; itemMap[a[7]].push(`${a[8]} for ${a[2]} (${a[3]})`);}); $('setupByItem').innerHTML=Object.entries(itemMap).map(([k,v])=>`<div class="item"><strong>${k}</strong><ul>${v.map(x=>`<li>${x}</li>`).join('')}</ul></div>`).join('')||'<p class="muted">No inventory assigned yet.</p>'; }
function fmtDate(d){ return d.toISOString().slice(0,10);} function fmtTime(d){ return d.toTimeString().slice(0,8);} function setStatus(id,msg,cls){ const el=$(id); el.className=`status ${cls}`; el.textContent=msg; }
