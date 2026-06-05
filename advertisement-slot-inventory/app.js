/* =============================================================
   Zoho CRM – Advertisement Slot Inventory Widget  |  app.js
   ============================================================= */

/* ─────────────────────────────────────────────
   DATA
   ───────────────────────────────────────────── */
const SLOT_TYPES = [
  { key: 'Home Feed',                   color: '#E53935' },
  { key: 'Article Page',                color: '#1E88E5' },
  { key: 'Storypage / Impact Placement',color: '#8E24AA' },
  { key: 'Native Content Stream',       color: '#FB8C00' },
  { key: 'Banner Slots',                color: '#43A047' },
  { key: 'Video Slots',                 color: '#00ACC1' },
  { key: 'Roadblock / Takeover Slots',  color: '#212121' },
];

/** Fixed slot inventory for June 2026 (30 days) */
const RAW_DAYS = [
  /* day  HF  AP  SP  NCS  BS  VS  RT */
  [  1,   8, 12,  3,   7, 10,  5,  1 ],
  [  2,   7, 10,  2,   6,  8,  4,  1 ],
  [  3,   3,  5,  1,   3,  4,  2,  0 ],
  [  4,   0,  0,  0,   0,  0,  0,  0 ],
  [  5,   5,  8,  3,   5,  6,  3,  1 ],
  [  6,   7,  9,  3,   6,  9,  4,  1 ],
  [  7,   7,  9,  3,   6,  9,  4,  1 ],
  [  8,   8, 11,  3,   7, 10,  4,  1 ],
  [  9,   6,  9,  2,   5,  8,  3,  1 ],
  [ 10,   8, 12,  2,   5, 10,  4,  1 ],
  [ 11,   0,  0,  0,   0,  0,  0,  0 ],
  [ 12,   5,  8,  2,   5,  7,  3,  1 ],
  [ 13,   4,  7,  1,   4,  6,  3,  0 ],
  [ 14,   5,  7,  2,   4,  7,  3,  0 ],
  [ 15,   8, 12,  2,   5, 10,  4,  1 ],
  [ 16,   9, 13,  3,   7, 12,  5,  1 ],
  [ 17,   3,  5,  1,   2,  4,  2,  1 ],
  [ 18,   1,  2,  1,   1,  1,  1,  0 ],
  [ 19,   0,  0,  0,   0,  0,  0,  0 ],
  [ 20,   6,  8,  2,   5,  7,  3,  1 ],
  [ 21,   5,  7,  2,   4,  7,  3,  0 ],
  [ 22,   6,  9,  2,   5,  9,  3,  1 ],
  [ 23,   7, 11,  3,   6,  9,  4,  1 ],
  [ 24,   2,  4,  1,   3,  3,  2,  0 ],
  [ 25,   0,  0,  0,   0,  0,  0,  0 ],
  [ 26,   7,  9,  2,   6,  8,  4,  1 ],
  [ 27,   8, 11,  3,   7, 10,  4,  1 ],
  [ 28,   5,  7,  2,   4,  8,  3,  0 ],
  [ 29,   2,  3,  1,   2,  3,  1,  0 ],
  [ 30,   8, 12,  3,   7, 10,  4,  1 ],
];

const INVENTORY = RAW_DAYS.map(([day, hf, ap, sp, ncs, bs, vs, rt]) => {
  const counts = [hf, ap, sp, ncs, bs, vs, rt];
  const slots  = SLOT_TYPES.map((t, i) => ({ name: t.key, count: counts[i] }));
  return { day, slots, total: counts.reduce((a, b) => a + b, 0) };
});

/* ─────────────────────────────────────────────
   AVAILABILITY HELPERS
   ───────────────────────────────────────────── */
function availClass(total) {
  if (total === 0)   return 'soldout';
  if (total <= 10)   return 'limited';
  if (total <= 25)   return 'medium';
  return 'high';
}

function availLabel(total) {
  const c = availClass(total);
  const map = { high: 'High', medium: 'Medium', limited: 'Limited', soldout: '0 open' };
  return c === 'soldout' ? '0 open' : `${total} open`;
}

/* ─────────────────────────────────────────────
   STATE
   ───────────────────────────────────────────── */
let currentView     = 'slot';
let activeCategory  = 'all';

/* ─────────────────────────────────────────────
   SLOT CARDS RENDERER
   ───────────────────────────────────────────── */
function renderSlotCards(data) {
  const grid = document.getElementById('slotCardsView');
  grid.innerHTML = '';

  if (!data.length) {
    grid.innerHTML = '<p style="color:#9E9E9E;padding:20px 0;grid-column:1/-1;">No slots match the current filters.</p>';
    return;
  }

  data.forEach(({ day, slots, total }) => {
    const ac  = availClass(total);
    const lbl = availLabel(total);

    /* filter rows by active category */
    const visibleSlots = activeCategory === 'all'
      ? slots
      : slots.filter(s => s.name.toLowerCase().startsWith(activeCategory.toLowerCase()));

    const rowsHTML = visibleSlots.map(s => `
      <div class="card-row">
        <span class="slot-name" title="${s.name}">${s.name}</span>
        <span class="slot-count">${s.count}</span>
      </div>`).join('');

    const card = document.createElement('div');
    card.className = `slot-card avail-${ac}`;
    card.setAttribute('data-day', day);
    card.innerHTML = `
      <div class="card-header">
        <span class="card-day">${day}</span>
        <span class="card-open ${ac}">${lbl}</span>
      </div>
      <div class="card-rows">${rowsHTML}</div>`;

    card.addEventListener('click', () => openDayDetail(day));
    grid.appendChild(card);
  });
}

/* ─────────────────────────────────────────────
   CALENDAR RENDERER
   ───────────────────────────────────────────── */
function renderCalendar(data) {
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  // Day-of-week header
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const h = document.createElement('div');
    h.style.cssText = 'text-align:center;font-size:.7rem;font-weight:700;color:#9E9E9E;padding:4px 0;';
    h.textContent = d;
    grid.appendChild(h);
  });

  // June 2026 starts on Monday (index 1)
  const startOffset = 1;
  for (let i = 0; i < startOffset; i++) {
    grid.appendChild(document.createElement('div'));
  }

  data.forEach(({ day, slots, total }) => {
    const ac = availClass(total);
    const card = document.createElement('div');
    card.className = 'cal-day-card';
    card.setAttribute('title', `Day ${day} – ${total} open`);

    const dotColors = slots
      .filter(s => s.count > 0)
      .slice(0, 5)
      .map(s => SLOT_TYPES.find(t => t.key === s.name)?.color || '#BDBDBD');

    const dotsHTML = dotColors.map(c => `<span class="cal-dot" style="background:${c}"></span>`).join('');

    // availability accent band at top
    const bandColor = { high: '#2E7D32', medium: '#F57F17', limited: '#C62828', soldout: '#212121' }[ac];

    card.innerHTML = `
      <div style="height:3px;background:${bandColor};border-radius:3px 3px 0 0;margin:-8px -10px 6px;"></div>
      <div class="cal-day-num">${day}</div>
      <div class="cal-dot-row">${dotsHTML || '<span style="font-size:.65rem;color:#BDBDBD;">–</span>'}</div>
      <div style="font-size:.68rem;color:#9E9E9E;margin-top:4px;">${total > 0 ? total + ' open' : 'Sold Out'}</div>`;

    card.addEventListener('click', () => openDayDetail(day));
    grid.appendChild(card);
  });
}

/* ─────────────────────────────────────────────
   DAY DETAIL MODAL
   ───────────────────────────────────────────── */
function openDayDetail(day) {
  const entry = INVENTORY.find(d => d.day === day);
  if (!entry) return;

  const existing = document.getElementById('dayDetailModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dayDetailModal';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.45);
    display:flex;align-items:center;justify-content:center;
    z-index:9999;padding:20px;`;

  const rowsHTML = entry.slots.map(s => {
    const color = SLOT_TYPES.find(t => t.key === s.name)?.color || '#9E9E9E';
    const bar   = Math.min(100, (s.count / 14) * 100);
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
        <span style="flex:1;font-size:.82rem;color:#333;">${s.name}</span>
        <div style="flex:2;background:#F1F3F4;border-radius:4px;height:7px;overflow:hidden;">
          <div style="width:${bar}%;height:100%;background:${color};border-radius:4px;transition:width .4s;"></div>
        </div>
        <span style="min-width:22px;text-align:right;font-weight:700;font-size:.82rem;">${s.count}</span>
      </div>`;
  }).join('');

  const ac = availClass(entry.total);
  const badge = { high: '#2E7D32', medium: '#F57F17', limited: '#C62828', soldout: '#757575' }[ac];

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:28px 28px 24px;max-width:440px;width:100%;
                box-shadow:0 8px 32px rgba(0,0,0,.18);position:relative;">
      <button onclick="document.getElementById('dayDetailModal').remove()"
        style="position:absolute;top:14px;right:16px;border:none;background:none;font-size:1.3rem;
               cursor:pointer;color:#9E9E9E;line-height:1;">&times;</button>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
        <div style="font-size:2rem;font-weight:800;color:#1A1A2E;">June ${day}</div>
        <span style="background:${badge}22;color:${badge};border-radius:10px;padding:3px 12px;
                     font-size:.75rem;font-weight:700;">${entry.total} slots open</span>
      </div>
      <div>${rowsHTML}</div>
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid #DADCE0;
                  text-align:right;">
        <button onclick="document.getElementById('dayDetailModal').remove()"
          style="background:#1565C0;color:#fff;border:none;border-radius:20px;
                 padding:8px 22px;font-size:.82rem;font-weight:600;cursor:pointer;">Close</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* ─────────────────────────────────────────────
   VIEW SWITCH
   ───────────────────────────────────────────── */
function switchView(view) {
  currentView = view;

  const slotView = document.getElementById('slotCardsView');
  const calView  = document.getElementById('calendarView');
  const btnSlot  = document.getElementById('btnSlotCards');
  const btnCal   = document.getElementById('btnCalendar');

  if (view === 'slot') {
    slotView.classList.remove('hidden');
    calView.classList.add('hidden');
    btnSlot.classList.add('active');
    btnCal.classList.remove('active');
    renderSlotCards(INVENTORY);
  } else {
    slotView.classList.add('hidden');
    calView.classList.remove('hidden');
    btnCal.classList.add('active');
    btnSlot.classList.remove('active');
    renderCalendar(INVENTORY);
  }
}

/* ─────────────────────────────────────────────
   CATEGORY FILTER
   ───────────────────────────────────────────── */
function filterCategory(btn, cat) {
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeCategory = cat;
  if (currentView === 'slot') renderSlotCards(INVENTORY);
}

/* ─────────────────────────────────────────────
   FILTER BAR  (dropdowns – cosmetic refresh)
   ───────────────────────────────────────────── */
function applyFilters() {
  /* In a real Zoho widget these would call ZOHO.CRM APIs.
     Here we do a lightweight shuffle to show filter feedback. */
  const freshData = INVENTORY.map(entry => {
    const multiplier = Math.random() > 0.3 ? 1 : 0;
    return {
      ...entry,
      slots: entry.slots.map(s => ({ ...s, count: Math.round(s.count * multiplier) })),
      total: multiplier ? entry.total : 0,
    };
  });
  if (currentView === 'slot') renderSlotCards(freshData);
  else renderCalendar(freshData);
}

/* ─────────────────────────────────────────────
   INIT
   ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  renderSlotCards(INVENTORY);
});
