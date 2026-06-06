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
let coqlRecords    = [];
let currentDealId  = null;   // EntityId from PageLoad – used for Ad_Bookings Deal lookup
let currentSlotRecord = null; // Selected Ad_Slots CRM record – used when confirming a booking

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

  /* Clear any previously selected COQL slot record */
  currentSlotRecord = null;

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
    { label: 'Language',                  value: lang                                         },
    { label: 'Region',                    value: region                                       },
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

function confirmBooking(dateLabel) {
  const total = parseInt($('#drawerTotalCount').text(), 10) || 0;
  if (total === 0) {
    const $btn = $('.drawer-confirm-btn');
    $btn.addClass('shake');
    setTimeout(function () { $btn.removeClass('shake'); }, 450);
    return;
  }

  /* If a COQL slot record is selected, create an Ad_Bookings record */
  if (currentSlotRecord) {
    const record = currentSlotRecord;
    const slotCrmId = record.id || record.ID || null;

    if (!slotCrmId) {
      console.error('Ad_Bookings creation failed: slot record ID is missing.', record);
      showToast('Booking failed — slot record ID is unavailable.', true);
      return;
    }

    const bookingData = {
      Name:                  record.Name                 || '',
      Ad_Slot:               { id: slotCrmId },
      Selected_Date:         record.Slot_Date            || '',
      Platform:              record.Platform             || '',
      Language:              record.Language             || '',
      Campaign_Type:         record.Campaign_Type        || '',
      Billing:               record.Billing              || '',
      Home_Feed:             record.Home_Feed            || 0,
      Article_Page:          record.Article_Page         || 0,
      Storypage_Impact:      record.Storypage_Impact     || 0,
      Native_Content_Stream: record.Native_Content_Stream || 0,
      Banner_Slots:          record.Banner_Slots         || 0,
      Video_Slots:           record.Video_Slots          || 0,
    };

    if (currentDealId) {
      bookingData.Deal = { id: currentDealId };
    }

    closeDrawer();

    console.log('Ad_Bookings payload:', JSON.stringify(bookingData, null, 2));
    ZOHO.CRM.API.insertRecord({ Entity: 'Ad_Bookings', APIData: bookingData })
      .then(function (response) {
        console.log('Ad_Bookings API response:', JSON.stringify(response, null, 2));
        const label = record.Slot_Date || dateLabel;
        showToast(`&#10003; &nbsp;Booking confirmed — ${total} slot${total > 1 ? 's' : ''} for `, false, label);
      })
      .catch(function (err) {
        console.error('Ad_Bookings creation failed:', err);
        showToast('Booking failed — please try again.', true);
      });

    return;
  }

  /* Fallback for static inventory drawer (no CRM record) */
  closeDrawer();
  const label = typeof dateLabel === 'number' ? `June ${dateLabel}, 2026` : dateLabel;
  showToast(`&#10003; &nbsp;Booking confirmed — ${total} slot${total > 1 ? 's' : ''} for `, false, label);
}

function showToast(htmlPrefix, isError, textSuffix) {
  const $toast = $('<div>')
    .addClass('booking-toast' + (isError ? ' error' : ''))
    .attr({ role: 'status', 'aria-live': 'polite' });
  if (textSuffix !== undefined) {
    $toast.html(htmlPrefix).append(document.createTextNode(textSuffix));
  } else {
    $toast.html(htmlPrefix);
  }
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
    if (coqlRecords.length) {
      renderCoqlSlotCards(coqlRecords);
    } else {
      renderSlotCards(INVENTORY);
    }
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
  if (coqlRecords.length) {
    renderCoqlSlotCards(coqlRecords);
  } else if (currentView === 'slot') {
    renderSlotCards(INVENTORY);
  }
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
   COQL SLOT FETCH + RENDER
   ───────────────────────────────────────────── */

/**
 * Build a normalised array of slot-count objects from an API record.
 */
function slotCountsFromRecord(record) {
  return [
    { name: 'Home Feed',                    count: record.Home_Feed             || 0 },
    { name: 'Article Page',                 count: record.Article_Page          || 0 },
    { name: 'Storypage / Impact Placement', count: record.Storypage_Impact      || 0 },
    { name: 'Native Content Stream',        count: record.Native_Content_Stream || 0 },
    { name: 'Banner Slots',                 count: record.Banner_Slots          || 0 },
    { name: 'Video Slots',                  count: record.Video_Slots           || 0 },
    { name: 'Roadblock / Takeover Slots',   count: record.Roadblock_Takeover    || 0 },
  ];
}

/**
 * Build slot cards from COQL API records and replace the grid contents.
 * Respects the activeCategory filter the same way renderSlotCards does.
 */
function renderCoqlSlotCards(records) {
  coqlRecords = records;
  const $grid = $('#slotCardsView');
  $grid.empty();

  if (!records.length) {
    $grid.html('<p style="color:#9E9E9E;padding:20px 0;grid-column:1/-1;">No slots found for the selected date range.</p>');
    return;
  }

  records.forEach(function (record) {
    const slotDate  = record.Slot_Date || '';
    const slotCounts = slotCountsFromRecord(record);
    const total      = slotCounts.reduce((sum, s) => sum + s.count, 0);
    const ac         = availClass(total);
    const lbl        = availLabel(total);

    /* filter rows by active category */
    const visibleSlots = activeCategory === 'all'
      ? slotCounts
      : slotCounts.filter(s => s.name.toLowerCase().startsWith(activeCategory.toLowerCase()));

    const rowsHTML = visibleSlots.map(s => `
      <div class="card-row">
        <span class="slot-name" title="${s.name}">${s.name}</span>
        <span class="slot-count">${s.count}</span>
      </div>`).join('');

    const $card = $('<div>')
      .addClass(`slot-card avail-${ac}`)
      .attr('data-slot-date', slotDate)
      .html(`
        <div class="card-header">
          <span class="card-day">${slotDate}</span>
          <span class="card-open ${ac}">${lbl}</span>
        </div>
        <div class="card-rows">${rowsHTML}</div>`);

    $card.on('click', function () { openCoqlRecordDetail(record); });
    $grid.append($card);
  });
}

/**
 * Open the detail drawer for a COQL record.
 * Uses the Name field as Selected Slot and generates a dummy Slot ID.
 */
function openCoqlRecordDetail(record) {
  $('#slotDrawerOverlay').remove();

  /* Store the selected record so confirmBooking can access it */
  currentSlotRecord = record;

  const slotName  = record.Name            || '';
  const slotDate  = record.Slot_Date       || '';
  const platform  = record.Platform        || '';
  const language  = record.Language        || '';
  const region    = record.Region          || '';
  const campType  = record.Campaign_Type   || '';
  const billing   = record.Billing         || '';
  const approval  = record.Approval_Status || '';

  /* Use Placement_Code from the CRM record as the Slot ID */
  const slotId = record.Placement_Code || '';

  const slotCounts = slotCountsFromRecord(record);
  const total      = slotCounts.reduce((sum, s) => sum + s.count, 0);

  const INFO_ROWS = [
    { label: 'Selected Slot',             value: slotName },
    { label: 'Slot ID',                   value: slotId   },
    { label: 'Selected Date',             value: slotDate },
    { label: 'Platform',                  value: platform },
    { label: 'Language',                  value: language },
    { label: 'Region',                    value: region   },
    { label: 'Campaign Type',             value: campType },
    { label: 'Billing',                   value: billing  },
    { label: 'Total Category Slots Open', value: total    },
  ];

  const infoHTML = INFO_ROWS.map(r => `
    <div class="drawer-info-row">
      <span class="drawer-info-label">${r.label}</span>
      <span class="drawer-info-value">${r.value}</span>
    </div>`).join('');

  const selectorHTML = slotCounts.map(s => `
    <div class="drawer-slot-row">
      <span class="drawer-slot-label">${s.name}</span>
      <input class="drawer-slot-input" type="number"
             min="0" max="${s.count}" value="0" data-max="${s.count}"
             ${s.count === 0 ? 'disabled' : ''}
             oninput="updateDrawerTotal()" onchange="updateDrawerTotal()" />
      <span class="drawer-slot-avail">Avail ${s.count}</span>
    </div>`).join('');

  const approvalClass = approval && approval.toLowerCase() === 'approved' ? 'approved' : 'pending';
  const approvalLabel = approval || 'Pending';

  const $overlay = $('<div>').attr('id', 'slotDrawerOverlay').html(`
    <div class="slot-drawer" id="slotDrawer" role="dialog" aria-modal="true" aria-label="Slot Details for ${slotDate}">
      <div class="drawer-header">
        <h2 class="drawer-title">Slot Detail Drawer</h2>
        <button class="drawer-close" onclick="closeDrawer()" aria-label="Close">&#x2715;</button>
      </div>

      <div class="drawer-body">
        <div class="drawer-info-section">
          ${infoHTML}
          <div class="drawer-info-row">
            <span class="drawer-info-label">Approval Status</span>
            <span class="approval-badge ${approvalClass}">${approvalLabel}</span>
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
        <button class="drawer-confirm-btn">Confirm Booking</button>
      </div>
    </div>`);

  $overlay.on('click', function (e) { if (e.target === this) closeDrawer(); });
  $overlay.find('.drawer-confirm-btn').on('click', function () { confirmBooking(slotDate); });
  $('body').append($overlay);

  requestAnimationFrame(function () {
    $overlay.addClass('active');
    $('#slotDrawer').addClass('open');
  });
}

/**
 * Execute the COQL query for the given date range and re-render slot cards.
 * Date values must match YYYY-MM-DD format (from <input type="date">).
 */
function fetchAndRenderSlotCards(startDate, endDate) {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!startDate || !endDate || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return;
  const config = {
    select_query: `select Name, Placement_Code, Slot_Date, Platform, Language, Region, Campaign_Type, Billing, Approval_Status, Home_Feed, Article_Page, Storypage_Impact, Native_Content_Stream, Banner_Slots, Video_Slots, Roadblock_Takeover
  from Ad_Slots
  where Slot_Date between '${startDate}' and '${endDate}'
  limit 200`,
  };
  ZOHO.CRM.API.coql(config).then(function (data) {
    console.log(data);
    const records = (data && data.data) ? data.data : [];
    renderCoqlSlotCards(records);
  }).catch(function (err) {
    console.error('COQL fetch failed:', err);
    $('#slotCardsView').html('<p style="color:#C62828;padding:20px 0;grid-column:1/-1;">Failed to load slot data. Please try again.</p>');
  });
}

/* ─────────────────────────────────────────────
   BOOK SLOT BUTTON
   ───────────────────────────────────────────── */
function bookSelectedSlot() {
  const startDate = $('#startDate').val();
  const endDate   = $('#endDate').val();
  fetchAndRenderSlotCards(startDate, endDate);
}

/* ─────────────────────────────────────────────
   FIELD MAP  (Deals API name → select element ID)
   Picklist fields whose options come from metadata.
   ───────────────────────────────────────────── */
const PICKLIST_FIELD_MAP = {
  'Category':                  'category',
  'Campaign_Type':             'campaignType',
  'Billing_Type':              'billingType',
  'Optimization_Type':         'optimizationType',
  'Host_Application_Platform': 'brand',
};

/* ─────────────────────────────────────────────
   DEAL FIELD MAP  (Deals API name → widget element ID)
   All fields that are populated from the Deal record.
   ───────────────────────────────────────────── */
const DEAL_FIELD_MAP = {
  'Deal_Name':                 'campaignId',
  'Campaign_Name':             'campaignName',
  'Agency':                    'agency',
  'Category':                  'category',
  'Subcategory':               'subcategory',
  'Campaign_Type':             'campaignType',
  'Billing_Type':              'billingType',
  'Optimization_Type':         'optimizationType',
  'Start_Date':                'startDate',
  'End_Date':                  'endDate',
  'Campaign_Deliverables':     'deliverables',
  'Host_Application_Platform': 'brand',
};

/**
 * Populate <select> elements with picklist values from
 * Zoho CRM Deals field metadata.
 */
function populatePicklistsFromMeta(fields) {
  fields.forEach(function (field) {
    const elementId = PICKLIST_FIELD_MAP[field.api_name];
    if (!elementId) return;
    const $select  = $('#' + elementId);
    if (!$select.length) return;
    const pickList = field.pick_list_values || [];
    if (!pickList.length) return;
    $select.empty();
    pickList.forEach(function (opt) {
      const displayVal = opt.display_value || opt.actual_value || opt.value || '';
      $select.append($('<option>').val(displayVal).text(displayVal));
    });
  });
}

/**
 * Set widget field values from a fetched Deal record.
 * Handles <input>, <textarea>, and <select> elements.
 * For selects, dynamically adds the option if not already present.
 */
function populateDealRecord(record) {
  $.each(DEAL_FIELD_MAP, function (crmField, elementId) {
    const $el  = $('#' + elementId);
    if (!$el.length) return;
    const value = record[crmField];
    if (value === null || value === undefined || value === '') return;

    if ($el.is('select')) {
      const strVal = String(value);
      const $match = $el.find('option').filter(function () {
        return $(this).val() === strVal || $(this).text() === strVal;
      });
      if ($match.length) {
        $el.val($match.first().val());
      } else {
        $el.append($('<option>').val(strVal).text(strVal).prop('selected', true));
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
  if (name) $('.panel-subtitle').text(monthYear + ' · ' + name);
}

/* ─────────────────────────────────────────────
   INIT
   ───────────────────────────────────────────── */
$(document).ready(function () {
  // Subscribe to the EmbeddedApp PageLoad event before initializing
  ZOHO.embeddedApp.on('PageLoad', function (data) {
    console.log(data);
    if (data) {
      const entity = data.Entity; // Deals, Contacts, Accounts, etc.
      const dealId = data.EntityId;

      /* Store the Deal ID globally for Ad_Bookings creation.
         EntityId may arrive as an array in some widget contexts; always
         extract a plain string so the CRM lookup payload is valid. */
      currentDealId = Array.isArray(dealId) ? (dealId[0] || null) : (dealId || null);

      // Fetch field metadata and Deal record in parallel
      $.when(
        ZOHO.CRM.META.getFields({ Entity: 'Deals' }),
        ZOHO.CRM.API.getRecord({ Entity: 'Deals', RecordID: dealId })
      ).then(function (metaData, recordData) {
        console.log(metaData);
        console.log(recordData);

        const fields = metaData && metaData.fields ? metaData.fields : [];
        if (fields.length) {
          populatePicklistsFromMeta(fields);
        }

        const record = recordData && recordData.data && recordData.data[0]
          ? recordData.data[0]
          : null;
        if (record) {
          populateDealRecord(record);
          // Fetch slot data using the dates now populated from the Deal record
          fetchAndRenderSlotCards($('#startDate').val(), $('#endDate').val());
        } else {
          // Re-render with populated campaign data
          renderSlotCards(INVENTORY);
        }
      });
    }
  });

  // Initialize the widget
  ZOHO.embeddedApp.init();

  renderSlotCards(INVENTORY);
});
