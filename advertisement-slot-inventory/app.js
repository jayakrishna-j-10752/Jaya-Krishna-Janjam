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
  const existing = document.getElementById('slotDrawerOverlay');
  if (existing) existing.remove();

  /* Dominant slot type (highest count) drives the header info */
  const dominant = entry.slots.reduce((a, b) => b.count > a.count ? b : a, entry.slots[0]);
  const meta     = SLOT_META[dominant.name] || { name: dominant.name, id: 'DH-000' };

  /* Pull live values from campaign form */
  const campaignType = document.getElementById('campaignType')?.value || 'Programmatic Guaranteed (PG)';
  const billing      = document.getElementById('billingType')?.value  || 'CPM';
  const creative     = document.getElementById('creativeType')?.value || 'Display';

  const langMap   = { all: 'All Languages', en: 'English', ta: 'Tamil', hi: 'Hindi' };
  const regionMap = { all: 'All Regions', south: 'South India', north: 'North India', west: 'West India' };
  const lang      = langMap[document.getElementById('filterLanguage')?.value] || 'Tamil';
  const region    = regionMap[document.getElementById('filterRegion')?.value]  || 'Tamil Nadu';

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
  const overlay = document.createElement('div');
  overlay.id = 'slotDrawerOverlay';
  overlay.innerHTML = `
    <div class="slot-drawer" id="slotDrawer" role="dialog" aria-modal="true" aria-label="Slot Detail Drawer">
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
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeDrawer(); });
  document.body.appendChild(overlay);

  /* Animate in on next frame */
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    document.getElementById('slotDrawer').classList.add('open');
  });
}

function closeDrawer() {
  const overlay = document.getElementById('slotDrawerOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  const drawer = document.getElementById('slotDrawer');
  if (drawer) drawer.classList.remove('open');
  setTimeout(() => overlay.remove(), 320);
}

function updateDrawerTotal() {
  let total = 0;
  document.querySelectorAll('.drawer-slot-input').forEach(inp => {
    const max = parseInt(inp.dataset.max, 10) || 0;
    let val   = parseInt(inp.value, 10)       || 0;
    if (val < 0)   { val = 0;   inp.value = 0;   }
    if (val > max) { val = max; inp.value = max;  }
    total += val;
  });
  const el = document.getElementById('drawerTotalCount');
  if (el) el.textContent = total;
}

function confirmBooking(day) {
  const total = parseInt(document.getElementById('drawerTotalCount')?.textContent, 10) || 0;
  if (total === 0) {
    const btn = document.querySelector('.drawer-confirm-btn');
    if (btn) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 450); }
    return;
  }
  closeDrawer();

  /* Success toast */
  const toast = document.createElement('div');
  toast.className = 'booking-toast';
  toast.innerHTML = `&#10003; &nbsp;Booking confirmed — ${total} slot${total > 1 ? 's' : ''} for June ${day}, 2026`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3200);
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
   INIT  (jQuery ready)
   ───────────────────────────────────────────── */
$(function () {
  renderSlotCards(INVENTORY);
});

/* ─────────────────────────────────────────────
   ZOHO CRM INTEGRATION  (jQuery + async/await)
   ───────────────────────────────────────────── */

/** Maps Deals module API field names to widget element IDs */
const DEAL_FIELD_MAP = {
  'Deal_Name':             'campaignId',
  'Campaign_Name':         'campaignName',
  'Agency':                'agency',
  'Category':              'category',
  'Subcategory':           'subcategory',
  'Campaign_Type':         'campaignType',
  'Billing_Type':          'billingType',
  'Optimization_Type':     'optimizationType',
  'Start_Date':            'startDate',
  'End_Date':              'endDate',
  'Campaign_Deliverables': 'deliverables',
};

/**
 * Populate select option lists from Deals field metadata.
 * For every picklist field that maps to a <select>, replace
 * the hard-coded options with the live CRM picklist values.
 */
function populateFieldsFromMeta(fields) {
  $.each(fields, function (_, field) {
    const elementId = DEAL_FIELD_MAP[field.api_name];
    if (!elementId) return;
    const $el = $('#' + elementId);
    if (!$el.length || $el.prop('tagName') !== 'SELECT') return;
    const pickList = field.pick_list_values || [];
    if (!pickList.length) return;
    $el.empty();
    $.each(pickList, function (_, opt) {
      /* Zoho API v2 uses display_value; v8 may use actual_value or value */
      const displayVal = opt.display_value || opt.actual_value || opt.value || '';
      $el.append($('<option>', { value: displayVal, text: displayVal }));
    });
  });
}

/**
 * Set each widget field value from the fetched Deal record.
 * Handles <input>, <textarea>, and <select> elements.
 * For selects, adds an option dynamically if the CRM value
 * does not already exist in the list.
 */
function populateDealRecord(record) {
  $.each(DEAL_FIELD_MAP, function (crmField, elementId) {
    const $el   = $('#' + elementId);
    if (!$el.length) return;
    const value = record[crmField];
    if (value === null || value === undefined || value === '') return;

    if ($el.prop('tagName') === 'SELECT') {
      const strVal = String(value);
      const $match = $el.find('option').filter(function () {
        return $(this).val() === strVal || $(this).text() === strVal;
      });
      if ($match.length) {
        $el.val($match.val());
      } else {
        $el.append($('<option>', { value: strVal, text: strVal, selected: true }));
      }
    } else {
      $el.val(value);
    }
  });

  /* Update left-panel subtitle with deal name + date range */
  const name      = record['Deal_Name'] || record['Campaign_Name'] || '';
  const startRaw  = record['Start_Date'];
  const monthYear = startRaw
    ? new Date(startRaw).toLocaleString('default', { month: 'long', year: 'numeric' })
    : 'June 2026';
  if (name) $('.panel-subtitle').text(`${monthYear} · ${name}`);
}

/**
 * PageLoad handler – receives the current record context from Zoho CRM,
 * then fetches field metadata and the Deal record using async/await.
 * Entity and RecordID are read dynamically from the event data.
 */
async function onPageLoad(data) {
  console.log('[Slot Widget] PageLoad data:', data);

  const entity   = data.Entity;
  const recordId = data.EntityId;

  try {
    const [metaResponse, recordResponse] = await Promise.all([
      ZOHO.CRM.META.getFields({ Entity: 'Deals' }),
      ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: recordId }),
    ]);

    const fields = metaResponse && metaResponse.fields ? metaResponse.fields : [];
    const record = recordResponse && recordResponse.data && recordResponse.data[0]
      ? recordResponse.data[0]
      : null;

    if (fields.length) populateFieldsFromMeta(fields);
    if (record)        populateDealRecord(record);

    /* Re-render both views so they reflect the populated campaign data */
    renderSlotCards(INVENTORY);
    renderCalendar(INVENTORY);
  } catch (err) {
    console.error('[Slot Widget] Error loading Deal data:', err);
  }
}

/** "Book Selected Slot" button handler – opens the slot-detail drawer for the campaign start date */
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

/* Bootstrap Zoho Embedded App SDK when running inside Zoho CRM.
   The PageLoad handler must be registered before calling init(). */
if (typeof ZOHO !== 'undefined' && ZOHO.embeddedApp) {
  try {
    ZOHO.embeddedApp.on('PageLoad', onPageLoad);
    ZOHO.embeddedApp.init();
  } catch (e) {
    console.error('[Slot Widget] SDK initialisation failed:', e);
  }
}
