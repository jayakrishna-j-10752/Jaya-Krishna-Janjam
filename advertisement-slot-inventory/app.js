/* =============================================================
   Advertisement Slot Inventory Widget  |  app.js
   ============================================================= */

/* ─────────────────────────────────────────────
   DATA
   ───────────────────────────────────────────── */
const SLOT_TYPES = [
  { key: 'Home Feed',                    color: '#E53935' },
  { key: 'Article Page',                 color: '#1E88E5' },
  { key: 'Storypage / Impact Placement', color: '#8E24AA' },
  { key: 'Native Content Stream',        color: '#FB8C00' },
  { key: 'Banner Slots',                 color: '#43A047' },
  { key: 'Video Slots',                  color: '#00ACC1' },
  { key: 'Roadblock / Takeover Slots',   color: '#212121' },
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
  if (total === 0)  return 'soldout';
  if (total <= 10)  return 'limited';
  if (total <= 25)  return 'medium';
  return 'high';
}

function availLabel(total) {
  return total === 0 ? '0 open' : `${total} open`;
}

/* ─────────────────────────────────────────────
   STATE
   ───────────────────────────────────────────── */
let currentView    = 'slot';
let activeCategory = 'all';

/* ─────────────────────────────────────────────
   SLOT CARDS RENDERER
   ───────────────────────────────────────────── */
function renderSlotCards(data) {
  const $grid = $('#slotCardsView');
  $grid.empty();

  if (!data.length) {
    $grid.html('<p style="color:#9E9E9E;padding:20px 0;grid-column:1/-1;">No slots match the current filters.</p>');
    return;
  }

  data.forEach(function ({ day, slots, total }) {
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

    const $card = $('<div>')
      .addClass(`slot-card avail-${ac}`)
      .attr('data-day', day)
      .html(`
        <div class="card-header">
          <span class="card-day">${day}</span>
          <span class="card-open ${ac}">${lbl}</span>
        </div>
        <div class="card-rows">${rowsHTML}</div>`);

    $card.on('click', function () { openDayDetail(day); });
    $grid.append($card);
  });
}

/* ─────────────────────────────────────────────
   CALENDAR RENDERER
   ───────────────────────────────────────────── */
function renderCalendar(data) {
  const $grid = $('#calendarGrid');
  $grid.empty();

  // Day-of-week header
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (d) {
    $grid.append(
      $('<div>').css({ textAlign: 'center', fontSize: '.7rem', fontWeight: 700, color: '#9E9E9E', padding: '4px 0' }).text(d)
    );
  });

  // June 2026 starts on Monday (index 1)
  const startOffset = 1;
  for (let i = 0; i < startOffset; i++) {
    $grid.append($('<div>'));
  }

  data.forEach(function ({ day, slots, total }) {
    const ac = availClass(total);
    const $card = $('<div>').addClass('cal-day-card').attr('title', `Day ${day} – ${total} open`);

    const dotColors = slots
      .filter(s => s.count > 0)
      .slice(0, 5)
      .map(s => (SLOT_TYPES.find(t => t.key === s.name) || {}).color || '#BDBDBD');

    const dotsHTML = dotColors.map(c => `<span class="cal-dot" style="background:${c}"></span>`).join('');

    const bandColor = { high: '#2E7D32', medium: '#F57F17', limited: '#C62828', soldout: '#212121' }[ac];

    $card.html(`
      <div style="height:3px;background:${bandColor};border-radius:3px 3px 0 0;margin:-8px -10px 6px;"></div>
      <div class="cal-day-num">${day}</div>
      <div class="cal-dot-row">${dotsHTML || '<span style="font-size:.65rem;color:#BDBDBD;">–</span>'}</div>
      <div style="font-size:.68rem;color:#9E9E9E;margin-top:4px;">${total > 0 ? total + ' open' : 'Sold Out'}</div>`);

    $card.on('click', function () { openDayDetail(day); });
    $grid.append($card);
  });
}

/* ─────────────────────────────────────────────
   SLOT META  (display name + ID prefix per type)
   ───────────────────────────────────────────── */
const SLOT_META = {
  'Home Feed':                    { name: 'Sponsored Story in Home Feed',    id: 'DH-HF'  },
  'Article Page':                 { name: 'Outstream Video in Article Feed', id: 'DH-ART' },
  'Storypage / Impact Placement': { name: 'Impact Takeover – Storypage',     id: 'DH-IMP' },
  'Native Content Stream':        { name: 'Native Branded Content',          id: 'DH-NAT' },
  'Banner Slots':                 { name: 'Banner Display – Leaderboard',    id: 'DH-BAN' },
  'Video Slots':                  { name: 'Pre-roll Video Slot',             id: 'DH-VID' },
  'Roadblock / Takeover Slots':   { name: 'Full-page Roadblock Takeover',    id: 'DH-RBK' },
};

/* ─────────────────────────────────────────────
   SLOT DETAIL DRAWER
   ───────────────────────────────────────────── */
function openDayDetail(day) {
  const entry = INVENTORY.find(d => d.day === day);
  if (!entry) return;

  /* Remove any existing drawer */
  $('#slotDrawerOverlay').remove();

  /* Dominant slot type (highest count) drives the header info */
  const dominant = entry.slots.reduce((a, b) => b.count > a.count ? b : a, entry.slots[0]);
  const meta     = SLOT_META[dominant.name] || { name: dominant.name, id: 'DH-000' };

  /* Pull live values from campaign form */
  const campaignType = $('#campaignType').val() || '';
  const billing      = $('#billingType').val()  || '';
  const creative     = $('#creativeType').val() || '';

  const langMap   = { all: 'All Languages', en: 'English', ta: 'Tamil', hi: 'Hindi', kn: 'Kannada', te: 'Telugu' };
  const regionMap = { all: 'All Regions', south: 'South India', north: 'North India', west: 'West India', karnataka: 'Karnataka' };
  const lang      = langMap[$('#filterLanguage').val()] || 'Kannada';
  const region    = regionMap[$('#filterRegion').val()] || 'Karnataka';

  /* Info rows */
  const INFO_ROWS = [
    { label: 'Selected Slot',             value: meta.name                                    },
    { label: 'Slot ID',                   value: `${meta.id}-${String(day).padStart(3, '0')}` },
    { label: 'Selected Date',             value: `June ${day}, 2026`                          },
    { label: 'Platform',                  value: 'Dailyhunt App'                              },
    { label: 'Creative',                  value: creative                                     },
    { label: 'Language / Region',         value: `${lang} / ${region}`                       },
    { label: 'Campaign Type',             value: campaignType                                 },
    { label: 'Billing',                   value: billing                                      },
    { label: 'Total Category Slots Open', value: entry.total                                  },
  ];

  const infoHTML = INFO_ROWS.map(r => `
    <div class="drawer-info-row">
      <span class="drawer-info-label">${r.label}</span>
      <span class="drawer-info-value">${r.value}</span>
    </div>`).join('');

  /* Slot selector rows */
  const selectorHTML = entry.slots.map(s => `
    <div class="drawer-slot-row">
      <span class="drawer-slot-label">${s.name}</span>
      <input class="drawer-slot-input" type="number"
             min="0" max="${s.count}" value="0" data-max="${s.count}"
             ${s.count === 0 ? 'disabled' : ''}
             oninput="updateDrawerTotal()" onchange="updateDrawerTotal()" />
      <span class="drawer-slot-avail">Avail ${s.count}</span>
    </div>`).join('');

  /* Build overlay + drawer */
  const $overlay = $('<div>').attr('id', 'slotDrawerOverlay').html(`
    <div class="slot-drawer" id="slotDrawer" role="dialog" aria-modal="true" aria-label="Slot Details for June ${day}, 2026">
      <div class="drawer-header">
        <h2 class="drawer-title">Slot Detail Drawer</h2>
        <button class="drawer-close" onclick="closeDrawer()" aria-label="Close">&#x2715;</button>
      </div>

      <div class="drawer-body">
        <div class="drawer-info-section">
          ${infoHTML}
          <div class="drawer-info-row">
            <span class="drawer-info-label">Approval</span>
            <span class="approval-badge pending">Pending</span>
          </div>
        </div>

        <div class="drawer-selector-section">
          <p class="drawer-section-title">Select slots by category</p>
          ${selectorHTML}
          <div class="drawer-total-bar">
            <span class="drawer-total-label">Total slots selected</span>
            <span class="drawer-total-count" id="drawerTotalCount">0</span>
          </div>
        </div>
      </div>

      <div class="drawer-footer">
        <button class="drawer-confirm-btn" onclick="confirmBooking(${day})">Confirm Booking</button>
      </div>
    </div>`);

  $overlay.on('click', function (e) { if (e.target === this) closeDrawer(); });
  $('body').append($overlay);

  /* Animate in on next frame */
  requestAnimationFrame(function () {
    $overlay.addClass('active');
    $('#slotDrawer').addClass('open');
  });
}

function closeDrawer() {
  const $overlay = $('#slotDrawerOverlay');
  if (!$overlay.length) return;
  $overlay.removeClass('active');
  $('#slotDrawer').removeClass('open');
  setTimeout(function () { $overlay.remove(); }, 320);
}

function updateDrawerTotal() {
  let total = 0;
  $('.drawer-slot-input').each(function () {
    const max = parseInt($(this).data('max'), 10) || 0;
    let val   = parseInt($(this).val(), 10)       || 0;
    if (val < 0)   { val = 0;   $(this).val(0);   }
    if (val > max) { val = max; $(this).val(max);  }
    total += val;
  });
  $('#drawerTotalCount').text(total);
}

function confirmBooking(day) {
  const total = parseInt($('#drawerTotalCount').text(), 10) || 0;
  if (total === 0) {
    const $btn = $('.drawer-confirm-btn');
    $btn.addClass('shake');
    setTimeout(function () { $btn.removeClass('shake'); }, 450);
    return;
  }
  closeDrawer();

  /* Success toast */
  const $toast = $('<div>')
    .addClass('booking-toast')
    .attr({ role: 'status', 'aria-live': 'polite' })
    .html(`&#10003; &nbsp;Booking confirmed — ${total} slot${total > 1 ? 's' : ''} for June ${day}, 2026`);
  $('body').append($toast);
  requestAnimationFrame(function () { $toast.addClass('show'); });
  setTimeout(function () {
    $toast.removeClass('show');
    setTimeout(function () { $toast.remove(); }, 400);
  }, 3200);
}

/* ─────────────────────────────────────────────
   VIEW SWITCH
   ───────────────────────────────────────────── */
function switchView(view) {
  currentView = view;

  if (view === 'slot') {
    $('#slotCardsView').removeClass('hidden');
    $('#calendarView').addClass('hidden');
    $('#btnSlotCards').addClass('active');
    $('#btnCalendar').removeClass('active');
    renderSlotCards(INVENTORY);
  } else {
    $('#slotCardsView').addClass('hidden');
    $('#calendarView').removeClass('hidden');
    $('#btnCalendar').addClass('active');
    $('#btnSlotCards').removeClass('active');
    renderCalendar(INVENTORY);
  }
}

/* ─────────────────────────────────────────────
   CATEGORY FILTER
   ───────────────────────────────────────────── */
function filterCategory(btn, cat) {
  $('.cat-tab').removeClass('active');
  $(btn).addClass('active');
  activeCategory = cat;
  if (currentView === 'slot') renderSlotCards(INVENTORY);
}

/* ─────────────────────────────────────────────
   FILTER BAR  (dropdowns – cosmetic refresh)
   ───────────────────────────────────────────── */
function applyFilters() {
  const freshData = INVENTORY.map(function (entry) {
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
   BOOK SLOT BUTTON
   ───────────────────────────────────────────── */
function bookSelectedSlot() {
  const startVal = $('#startDate').val();
  if (startVal) {
    const parts = startVal.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      if (day >= 1 && day <= 30) { openDayDetail(day); return; }
    }
  }
  /* Fallback: open first available day */
  const firstAvail = INVENTORY.find(d => d.total > 0);
  if (firstAvail) openDayDetail(firstAvail.day);
}

/* ─────────────────────────────────────────────
   INIT
   ───────────────────────────────────────────── */
$(document).ready(function () {
  renderSlotCards(INVENTORY);
});
