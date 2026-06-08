/* ============================================================
   calendar.js – Calendar Component  (vanilla JS, no CDN deps)
   Zoho CRM Design Language · Month / Week / Day views
   Features: event CRUD, copy/paste, Light/Dark/Night themes
   ============================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     UTILITIES
  ────────────────────────────────────────────────────────── */

  /** Return today's date string YYYY-MM-DD (local time) */
  function todayStr() {
    var n = new Date();
    return pad4(n.getFullYear()) + '-' + pad2(n.getMonth() + 1) + '-' + pad2(n.getDate());
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function pad4(n) { var s = '' + n; while (s.length < 4) s = '0' + s; return s; }

  /** Convert a Date object → YYYY-MM-DD string (local time) */
  function dateToStr(d) {
    return pad4(d.getFullYear()) + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** Is the date string in the past (strictly before today)? */
  function isPast(ds) { return ds < todayStr(); }

  /** Is the date string today? */
  function isToday(ds) { return ds === todayStr(); }

  /** Is date valid for creating / pasting events? (today or future) */
  function isValid(ds) { return !isPast(ds); }

  /** Generate a short unique id */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Format "HH:MM" → "h:MM AM/PM" */
  function fmtTime(t) {
    var parts = t.split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
  }

  /** Number of days in a month */
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  /** Day-of-week (0=Sun) for the 1st of the month */
  function firstDOW(y, m) { return new Date(y, m, 1).getDay(); }

  /** Return the Date for the Sunday that starts the week containing `d` */
  function weekStart(d) {
    var copy = new Date(d);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  }

  /** Load events from localStorage */
  function loadEvents() {
    try { return JSON.parse(localStorage.getItem('zcrm_cal_events') || '[]'); }
    catch (e) { return []; }
  }

  /** Persist events to localStorage */
  function saveEvents() {
    try { localStorage.setItem('zcrm_cal_events', JSON.stringify(state.events)); }
    catch (e) { /* quota exceeded – ignore */ }
  }

  /* ──────────────────────────────────────────────────────────
     APPLICATION STATE
  ────────────────────────────────────────────────────────── */
  var state = {
    view:         'month',           // 'month' | 'week' | 'day'
    cursor:       new Date(),        // currently displayed date/period
    events:       loadEvents(),
    clipboard:    null,              // copied event (or null)
    theme:        'light',
    editId:       null,              // id of event being edited (null = create)
    activePopup:  null,              // event id shown in popup (or null)
    selectedColor:'#1565C0'
  };

  /* ──────────────────────────────────────────────────────────
     DOM REFERENCES
  ────────────────────────────────────────────────────────── */
  var dom = {
    canvas:       document.getElementById('calCanvas'),
    periodLabel:  document.getElementById('periodLabel'),
    btnPrev:      document.getElementById('btnPrev'),
    btnNext:      document.getElementById('btnNext'),
    btnToday:     document.getElementById('btnToday'),
    viewTabs:     document.querySelectorAll('.view-tab'),
    themeToggle:  document.getElementById('themeToggle'),

    modal:        document.getElementById('eventModal'),
    modalHeading: document.getElementById('modalHeading'),
    modalClose:   document.getElementById('modalClose'),
    modalCancel:  document.getElementById('modalCancel'),
    modalSave:    document.getElementById('modalSave'),
    fTitle:       document.getElementById('fTitle'),
    fTitleErr:    document.getElementById('fTitleErr'),
    fDate:        document.getElementById('fDate'),
    fStart:       document.getElementById('fStart'),
    fEnd:         document.getElementById('fEnd'),
    fDesc:        document.getElementById('fDesc'),
    colorRow:     document.getElementById('colorRow'),

    popup:        document.getElementById('evtPopup'),
    popupDot:     document.getElementById('popupDot'),
    popupTitle:   document.getElementById('popupTitle'),
    popupWhen:    document.getElementById('popupWhen'),
    popupDesc:    document.getElementById('popupDesc'),
    paCopy:       document.getElementById('paCopy'),
    paEdit:       document.getElementById('paEdit'),
    paDelete:     document.getElementById('paDelete'),
    paClose:      document.getElementById('paClose'),

    toast:        document.getElementById('toast')
  };

  /* ──────────────────────────────────────────────────────────
     TOAST
  ────────────────────────────────────────────────────────── */
  var toastTimer = null;
  function showToast(msg, ms) {
    ms = ms || 2800;
    dom.toast.textContent = msg;
    dom.toast.classList.add('toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      dom.toast.classList.remove('toast-show');
    }, ms);
  }

  /* ──────────────────────────────────────────────────────────
     HEADER PERIOD LABEL
  ────────────────────────────────────────────────────────── */
  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var WDAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var WDAYS_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  /* ──────────────────────────────────────────────────────────
     #btnToday – dynamic label + visibility
  ────────────────────────────────────────────────────────── */
  function updateTodayBtn() {
    var today   = new Date();
    var c       = state.cursor;
    var label, isCurrent;

    if (state.view === 'month') {
      label     = 'This Month';
      isCurrent = c.getFullYear() === today.getFullYear() &&
                  c.getMonth()    === today.getMonth();
    } else if (state.view === 'week') {
      label       = 'This Week';
      var ws      = weekStart(c);
      var we      = new Date(ws); we.setDate(ws.getDate() + 6);
      var td      = todayStr();
      isCurrent   = dateToStr(ws) <= td && td <= dateToStr(we);
    } else {
      label     = 'Today';
      isCurrent = isToday(dateToStr(c));
    }

    dom.btnToday.textContent = label;
    dom.btnToday.style.display = isCurrent ? 'none' : '';
  }

  function updatePeriodLabel() {    var c = state.cursor;
    var lbl = '';
    if (state.view === 'month') {
      lbl = MONTHS[c.getMonth()] + ' ' + c.getFullYear();
    } else if (state.view === 'week') {
      var ws = weekStart(c);
      var we = new Date(ws); we.setDate(ws.getDate() + 6);
      lbl = MONTHS[ws.getMonth()].slice(0,3) + ' ' + ws.getDate() +
            ' – ' +
            MONTHS[we.getMonth()].slice(0,3) + ' ' + we.getDate() +
            ', ' + we.getFullYear();
    } else {
      lbl = WDAYS_LONG[c.getDay()] + ', ' +
            MONTHS[c.getMonth()] + ' ' + c.getDate() + ', ' + c.getFullYear();
    }
    dom.periodLabel.textContent = lbl;
  }

  /* ──────────────────────────────────────────────────────────
     EVENT HELPERS
  ────────────────────────────────────────────────────────── */
  function eventsOn(ds) {
    return state.events.filter(function (e) { return e.date === ds; })
                       .sort(function (a, b) { return a.startTime.localeCompare(b.startTime); });
  }

  function findEvent(id) {
    return state.events.find(function (e) { return e.id === id; }) || null;
  }

  /* ──────────────────────────────────────────────────────────
     SVG ICON TEMPLATES
  ────────────────────────────────────────────────────────── */
  var SVG = {
    add: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="7" height="8" rx="1.25"/><path d="M10 6V4.5A1.5 1.5 0 0 0 8.5 3h-5A1.5 1.5 0 0 0 2 4.5v6A1.5 1.5 0 0 0 3.5 12H5"/></svg>',
    paste: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2" width="10" height="13" rx="1.5"/><path d="M6 2v2h4V2"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9" y2="11"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3h4v1.5"/><rect x="3.5" y="4.5" width="9" height="9" rx="1.25"/><line x1="6.5" y1="7" x2="6.5" y2="11"/><line x1="9.5" y1="7" x2="9.5" y2="11"/></svg>',
    edit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12l-9 9L2 14l.38-2.62 9.12-9z"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>'
  };

  /* ──────────────────────────────────────────────────────────
     RENDERING
  ────────────────────────────────────────────────────────── */

  function render() {
    updatePeriodLabel();
    updateTodayBtn();
    closePopup();

    if (state.view === 'month') {
      renderMonth();
    } else if (state.view === 'week') {
      renderWeek();
    } else {
      renderDay();
    }
  }

  /* ════════════ MONTH VIEW ════════════ */
  function renderMonth() {
    var c     = state.cursor;
    var year  = c.getFullYear();
    var month = c.getMonth();
    var dim   = daysInMonth(year, month);
    var fdow  = firstDOW(year, month);
    var tdStr = todayStr();

    var html = '<div class="month-view">' +
               '<div class="month-grid">';

    /* Day-name header */
    html += '<div class="month-dnames">';
    WDAYS_SHORT.forEach(function (d) {
      html += '<div class="month-dname">' + d + '</div>';
    });
    html += '</div>';

    /* Cell grid */
    html += '<div class="month-cells">';

    /* Leading cells from previous month */
    var prevDim = daysInMonth(year, month - 1);
    for (var i = 0; i < fdow; i++) {
      var prevDay  = prevDim - fdow + 1 + i;
      var prevDate = new Date(year, month - 1, prevDay);
      html += renderMonthCell(prevDay, dateToStr(prevDate), true, tdStr);
    }

    /* Current month */
    for (var d = 1; d <= dim; d++) {
      var ds = dateToStr(new Date(year, month, d));
      html += renderMonthCell(d, ds, false, tdStr);
    }

    /* Trailing cells from next month */
    var total     = fdow + dim;
    var trailing  = (7 - (total % 7)) % 7;
    for (var t = 1; t <= trailing; t++) {
      var nxtDate = new Date(year, month + 1, t);
      html += renderMonthCell(t, dateToStr(nxtDate), true, tdStr);
    }

    html += '</div></div></div>';
    dom.canvas.innerHTML = html;
    attachMonthHandlers();
  }

  function renderMonthCell(day, ds, otherMonth, tdStr) {
    var past  = isPast(ds);
    var today = ds === tdStr;
    var valid = isValid(ds);

    var cls = 'm-cell';
    if (otherMonth) cls += ' cell-other';
    if (past)       cls += ' cell-past';
    if (today)      cls += ' cell-today';

    var numCls = 'day-num' + (today ? ' day-num-today' : '');

    /* Action buttons – rendered for all non-other-month cells */
    var acts = '';
    if (!otherMonth) {
      acts += '<div class="cell-acts">';
      acts += '<button class="cell-add-btn" data-date="' + ds + '" title="Add event">' + SVG.add + '</button>';
      acts += '<button class="cell-copy-btn" data-date="' + ds + '" title="Copy event">' + SVG.copy + '</button>';
      acts += '<button class="cell-paste-btn" data-date="' + ds + '" title="Paste event">' + SVG.paste + '</button>';
      acts += '<button class="cell-del-day-btn" data-date="' + ds + '" title="Delete all events">' + SVG.trash + '</button>';
      acts += '</div>';
    }

    /* Events */
    var evts    = otherMonth ? [] : eventsOn(ds);
    var maxShow = 3;
    var chips   = '';
    evts.slice(0, maxShow).forEach(function (ev) {
      chips += renderChip(ev, past);
    });
    if (evts.length > maxShow) {
      chips += '<div class="more-chip">+' + (evts.length - maxShow) + ' more</div>';
    }

    return '<div class="' + cls + '" data-date="' + ds + '">' +
           '  <div class="cell-head">' +
           '    <span class="' + numCls + '">' + day + '</span>' +
           acts +
           '  </div>' +
           '  <div class="cell-events">' + chips + '</div>' +
           '</div>';
  }

  function renderChip(ev, past) {
    var bg     = ev.color + '22';   /* 13% opacity tint */
    var border = ev.color;
    var fg     = ev.color;
    var pastCls = past ? ' evt-past' : '';
    return '<div class="evt-chip' + pastCls + '" ' +
           '     data-evid="' + ev.id + '" data-date="' + ev.date + '"' +
           '     style="background:' + bg + ';border-left-color:' + border + ';color:' + fg + '">' +
           '  <span class="chip-name">' + escHtml(ev.title) + '</span>' +
           '  <span class="chip-time">' + fmtTime(ev.startTime) + '</span>' +
           '  <button class="chip-copy-btn" data-evid="' + ev.id + '" title="Copy event">' + SVG.copy + '</button>' +
           '</div>';
  }

  /* ════════════ WEEK VIEW ════════════ */
  function renderWeek() {
    var ws    = weekStart(state.cursor);
    var days  = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws);
      d.setDate(ws.getDate() + i);
      days.push(d);
    }
    var tdStr = todayStr();

    var html = '<div class="week-view"><div class="week-grid">';

    /* Clipboard banner */
    if (state.clipboard) {
      html += renderClipboardBanner();
    }

    /* Header row */
    html += '<div class="week-head-row"><div class="week-head-spacer"></div>';
    days.forEach(function (d) {
      var ds      = dateToStr(d);
      var isT     = ds === tdStr;
      var numCls  = 'wdh-num' + (isT ? ' wdh-num-today' : '');
      var headCls = 'week-day-head' + (isT ? ' wdh-today' : '');
      html += '<div class="' + headCls + '" data-date="' + ds + '">' +
              '  <span class="wdh-name">' + WDAYS_SHORT[d.getDay()] + '</span>' +
              '  <span class="' + numCls + '">' + d.getDate() + '</span>' +
              '</div>';
    });
    html += '</div>';

    /* Time body */
    html += '<div class="week-time-body">';

    /* Time labels */
    html += '<div class="time-col">';
    for (var h = 0; h < 24; h++) {
      html += '<div class="time-lbl">' + (h === 0 ? '' : pad2(h) + ':00') + '</div>';
    }
    html += '</div>';

    /* Day columns */
    days.forEach(function (d) {
      var ds    = dateToStr(d);
      var isT   = ds === tdStr;
      var valid = isValid(ds);
      var colCls = 'week-day-col' + (isT ? ' wdc-today' : '');

      html += '<div class="' + colCls + '" data-date="' + ds + '">';

      /* Hour slots */
      for (var h = 0; h < 24; h++) {
        var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
        html += '<div class="' + slotCls + '" data-date="' + ds + '" data-hour="' + h + '">';
        if (valid) {
          html += '<button class="slot-add-btn" data-date="' + ds + '" data-hour="' + h + '" title="Add event">' + SVG.add + '</button>';
          if (state.clipboard) {
            html += '<button class="slot-paste-btn" data-date="' + ds + '" data-hour="' + h + '" title="Paste event">' + SVG.paste + '</button>';
          }
        }
        html += '</div>';
      }

      /* Events for this day (absolutely positioned) */
      eventsOn(ds).forEach(function (ev) {
        html += renderTimeEvent(ev, ds);
      });

      html += '</div>'; /* /.week-day-col */
    });

    html += '</div></div></div>'; /* week-time-body / week-grid / week-view */
    dom.canvas.innerHTML = html;
    attachWeekHandlers();
  }

  /* ════════════ DAY VIEW ════════════ */
  function renderDay() {
    var ds    = dateToStr(state.cursor);
    var tdStr = todayStr();
    var isT   = ds === tdStr;
    var valid = isValid(ds);

    var headCls = 'day-head' + (isT ? ' dh-today' : '');
    var html = '<div class="day-view"><div class="day-grid">';

    /* Clipboard banner */
    if (state.clipboard) {
      html += renderClipboardBanner();
    }

    /* Day header */
    html += '<div class="' + headCls + '">' +
            '  <span class="dh-wday">' + WDAYS_LONG[state.cursor.getDay()] + '</span>' +
            '  <span class="dh-date">' +
                  MONTHS[state.cursor.getMonth()] + ' ' +
                  state.cursor.getDate() + ', ' + state.cursor.getFullYear() +
            '  </span>' +
            '  <div class="dh-actions">';

    if (valid) {
      html += '<button class="dh-add-btn" data-date="' + ds + '">+ Add Event</button>';
      if (state.clipboard) {
        html += '<button class="dh-paste-btn" data-date="' + ds + '">' + SVG.paste + ' Paste Event</button>';
      }
    } else {
      html += '<span class="dh-past-note">Past date – event creation not allowed</span>';
    }
    html += '  </div></div>'; /* /.dh-actions / .day-head */

    /* Time body */
    html += '<div class="day-body">';

    /* Time labels */
    html += '<div class="time-col">';
    for (var h = 0; h < 24; h++) {
      html += '<div class="time-lbl">' + (h === 0 ? '' : pad2(h) + ':00') + '</div>';
    }
    html += '</div>';

    /* Single day column */
    html += '<div class="day-col" data-date="' + ds + '">';
    for (var h = 0; h < 24; h++) {
      var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
      html += '<div class="' + slotCls + '" data-date="' + ds + '" data-hour="' + h + '">';
      if (valid) {
        html += '<button class="slot-add-btn" data-date="' + ds + '" data-hour="' + h + '" title="Add event">' + SVG.add + '</button>';
        if (state.clipboard) {
          html += '<button class="slot-paste-btn" data-date="' + ds + '" data-hour="' + h + '" title="Paste event">' + SVG.paste + '</button>';
        }
      }
      html += '</div>';
    }

    /* Events */
    eventsOn(ds).forEach(function (ev) {
      html += renderTimeEvent(ev, ds);
    });

    html += '</div></div></div></div>'; /* day-col / day-body / day-grid / day-view */
    dom.canvas.innerHTML = html;
    attachDayHandlers();
  }

  /* ────── Time-event block (week + day views) ────── */
  function renderTimeEvent(ev, ds) {
    var past      = isPast(ds);
    var startMins = timeToMins(ev.startTime);
    var endMins   = timeToMins(ev.endTime);
    var dur       = Math.max(endMins - startMins, 30); /* min 30-min visual height */
    var SLOT_PX   = 60;
    var top       = (startMins / 60) * SLOT_PX;
    var height    = (dur / 60) * SLOT_PX;
    var pastCls   = past ? ' evt-past' : '';

    return '<div class="time-event' + pastCls + '"' +
           '     data-evid="' + ev.id + '" data-date="' + ds + '"' +
           '     style="top:' + top + 'px;height:' + height + 'px;background:' + ev.color + '">' +
           '  <div class="te-title">' + escHtml(ev.title) + '</div>' +
           '  <div class="te-time">' + fmtTime(ev.startTime) + ' – ' + fmtTime(ev.endTime) + '</div>' +
           '  <button class="te-copy-btn" data-evid="' + ev.id + '" title="Copy event">' + SVG.copy + '</button>' +
           '</div>';
  }

  /** Convert "HH:MM" → minutes since midnight */
  function timeToMins(t) {
    var p = t.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
  }

  /* Clipboard banner HTML */
  function renderClipboardBanner() {
    return '<div class="clipboard-banner">' +
           '  ' + SVG.paste + ' Clipboard: <strong>' + escHtml(state.clipboard.title) + '</strong>' +
           '  &nbsp; Click a <strong>paste icon</strong> or time slot to paste.' +
           '  <button id="clearClipboard">&#10005; Clear</button>' +
           '</div>';
  }

  /* ──────────────────────────────────────────────────────────
     EVENT DELEGATION HELPERS
  ────────────────────────────────────────────────────────── */

  /** Attach all handlers for the month view */
  function attachMonthHandlers() {
    delegate(dom.canvas, '.cell-add-btn',   'click', function (el, e) {
      e.stopPropagation();
      if (isPast(el.dataset.date)) return;
      openModal(el.dataset.date);
    });
    delegate(dom.canvas, '.cell-paste-btn', 'click', function (el, e) {
      e.stopPropagation();
      if (!isValid(el.dataset.date)) { showToast('Cannot paste on a past date.'); return; }
      if (!state.clipboard) { showToast('Nothing in clipboard.'); return; }
      doPaste(el.dataset.date);
    });
    delegate(dom.canvas, '.cell-copy-btn', 'click', function (el, e) {
      e.stopPropagation();
      var evts = eventsOn(el.dataset.date);
      if (evts.length === 0) { showToast('No events to copy on this day.'); return; }
      if (evts.length === 1) { doCopy(evts[0].id); return; }
      showToast('Multiple events – use the per-event copy button on each chip.');
    });
    delegate(dom.canvas, '.cell-del-day-btn', 'click', function (el, e) {
      e.stopPropagation();
      var ds = el.dataset.date;
      var evts = eventsOn(ds);
      if (evts.length === 0) { showToast('No events to delete on this day.'); return; }
      if (window.confirm('Delete all ' + evts.length + ' event(s) on ' + ds + '?')) {
        var ids = evts.map(function (ev) { return ev.id; });
        state.events = state.events.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
        if (state.clipboard && ids.indexOf(state.clipboard.id) !== -1) state.clipboard = null;
        saveEvents();
        render();
        showToast('All events deleted for ' + ds + '.');
      }
    });
    delegate(dom.canvas, '.chip-copy-btn',  'click', function (el, e) {
      e.stopPropagation();
      doCopy(el.dataset.evid);
    });
    delegate(dom.canvas, '.evt-chip',       'click', function (el, e) {
      if (!e.target.classList.contains('chip-copy-btn')) {
        showPopup(el.dataset.evid, e);
      }
    });
  }

  /** Attach all handlers for the week view */
  function attachWeekHandlers() {
    attachTimeGridHandlers();
    /* Clicking a day header in week view switches to day view */
    delegate(dom.canvas, '.week-day-head', 'click', function (el) {
      var ds = el.dataset.date;
      if (ds) {
        state.cursor = new Date(ds + 'T12:00:00');
        state.view   = 'day';
        dom.viewTabs.forEach(function (t) {
          t.classList.toggle('active', t.dataset.view === 'day');
          t.setAttribute('aria-selected', t.dataset.view === 'day' ? 'true' : 'false');
        });
        render();
      }
    });
  }

  /** Attach all handlers for the day view */
  function attachDayHandlers() {
    attachTimeGridHandlers();
    delegate(dom.canvas, '.dh-add-btn',   'click', function (el) { openModal(el.dataset.date); });
    delegate(dom.canvas, '.dh-paste-btn', 'click', function (el) { doPaste(el.dataset.date); });
  }

  /** Shared handler setup for week/day time grids */
  function attachTimeGridHandlers() {
    delegate(dom.canvas, '.slot-add-btn',   'click', function (el, e) {
      e.stopPropagation();
      var h = parseInt(el.dataset.hour, 10);
      openModal(el.dataset.date, hourToTime(h), hourToTime(h + 1));
    });
    delegate(dom.canvas, '.slot-paste-btn', 'click', function (el, e) {
      e.stopPropagation();
      doPaste(el.dataset.date, parseInt(el.dataset.hour, 10));
    });
    delegate(dom.canvas, '.te-copy-btn',    'click', function (el, e) {
      e.stopPropagation();
      doCopy(el.dataset.evid);
    });
    delegate(dom.canvas, '.time-event',     'click', function (el, e) {
      if (!e.target.classList.contains('te-copy-btn')) {
        showPopup(el.dataset.evid, e);
      }
    });

    /* Clear clipboard banner */
    var cb = document.getElementById('clearClipboard');
    if (cb) {
      cb.addEventListener('click', function () {
        state.clipboard = null;
        render();
        showToast('Clipboard cleared.');
      });
    }
  }

  /** Simple event delegation utility */
  function delegate(root, selector, event, handler) {
    root.addEventListener(event, function (e) {
      var target = e.target.closest(selector);
      if (target && root.contains(target)) {
        handler(target, e);
      }
    });
  }

  /** "HH:MM" from hour integer (clamps at 23:00) */
  function hourToTime(h) {
    return pad2(Math.min(h, 23)) + ':00';
  }

  /* ──────────────────────────────────────────────────────────
     COPY / PASTE
  ────────────────────────────────────────────────────────── */

  function doCopy(evid) {
    var ev = findEvent(evid);
    if (!ev) return;
    state.clipboard = Object.assign({}, ev);
    render();
    showToast('"' + ev.title + '" copied – paste on any future date.');
  }

  /**
   * Paste clipboard event onto a date (and optionally a specific hour).
   * @param {string}  ds    – target date string YYYY-MM-DD
   * @param {number?} hour  – optional hour (0-23); if omitted keeps original time
   */
  function doPaste(ds, hour) {
    if (!state.clipboard) { showToast('Nothing in clipboard.'); return; }
    if (!isValid(ds))     { showToast('Cannot paste on a past date.'); return; }

    var ev = Object.assign({}, state.clipboard, { id: uid(), date: ds });

    if (hour !== undefined) {
      ev.startTime = hourToTime(hour);
      ev.endTime   = hourToTime(Math.min(hour + 1, 23));
    }

    state.events.push(ev);
    saveEvents();
    render();
    showToast('Event pasted on ' + ds + '.');
  }

  /* ──────────────────────────────────────────────────────────
     EVENT POPUP
  ────────────────────────────────────────────────────────── */

  function showPopup(evid, mouseEvt) {
    var ev = findEvent(evid);
    if (!ev) return;

    state.activePopup = evid;
    dom.popupDot.style.background   = ev.color;
    dom.popupTitle.textContent       = ev.title;
    dom.popupWhen.textContent        = ev.date + '  ·  ' +
                                       fmtTime(ev.startTime) + ' – ' + fmtTime(ev.endTime);
    dom.popupDesc.textContent        = ev.description || '';

    /* Position near mouse, keeping inside viewport */
    var x = mouseEvt.clientX + 12;
    var y = mouseEvt.clientY + 8;
    var pw = 310, ph = 140;
    if (x + pw > window.innerWidth  - 8) x = mouseEvt.clientX - pw - 8;
    if (y + ph > window.innerHeight - 8) y = mouseEvt.clientY - ph - 8;
    dom.popup.style.left = Math.max(4, x) + 'px';
    dom.popup.style.top  = Math.max(4, y) + 'px';

    dom.popup.classList.add('popup-open');
  }

  function closePopup() {
    state.activePopup = null;
    dom.popup.classList.remove('popup-open');
  }

  /* ──────────────────────────────────────────────────────────
     MODAL (CREATE / EDIT)
  ────────────────────────────────────────────────────────── */

  /**
   * Open the event creation/edit modal.
   * @param {string}  date       – YYYY-MM-DD
   * @param {string?} startTime  – "HH:MM"
   * @param {string?} endTime    – "HH:MM"
   * @param {object?} existing   – event object to edit (null = create)
   */
  function openModal(date, startTime, endTime, existing) {
    state.editId       = existing ? existing.id : null;
    state.selectedColor = existing ? existing.color : '#1565C0';

    dom.modalHeading.textContent = existing ? 'Edit Event' : 'Create Event';
    dom.fTitle.value             = existing ? existing.title       : '';
    dom.fDate.value              = existing ? existing.date        : (date || todayStr());
    dom.fStart.value             = existing ? existing.startTime   : (startTime || '09:00');
    dom.fEnd.value               = existing ? existing.endTime     : (endTime   || '10:00');
    dom.fDesc.value              = existing ? (existing.description || '') : '';

    dom.fTitle.classList.remove('input-err');
    dom.fTitleErr.classList.remove('show');

    /* Update color picker */
    dom.colorRow.querySelectorAll('.color-dot').forEach(function (dot) {
      dot.classList.toggle('active', dot.dataset.color === state.selectedColor);
    });

    dom.modal.classList.add('modal-open');
    setTimeout(function () { dom.fTitle.focus(); }, 60);
  }

  function closeModal() {
    dom.modal.classList.remove('modal-open');
    state.editId = null;
  }

  function saveModal() {
    var title = dom.fTitle.value.trim();
    if (!title) {
      dom.fTitle.classList.add('input-err');
      dom.fTitleErr.classList.add('show');
      dom.fTitle.focus();
      return;
    }
    dom.fTitle.classList.remove('input-err');
    dom.fTitleErr.classList.remove('show');

    var date = dom.fDate.value;
    if (!isValid(date)) {
      showToast('Cannot create or edit events on past dates.');
      return;
    }

    /* Validate times */
    var start = dom.fStart.value || '09:00';
    var end   = dom.fEnd.value   || '10:00';
    if (timeToMins(end) <= timeToMins(start)) {
      end = hourToTime(Math.min(timeToMins(start) / 60 + 1, 23));
    }

    var ev = {
      id:          state.editId || uid(),
      title:       title,
      date:        date,
      startTime:   start,
      endTime:     end,
      description: dom.fDesc.value.trim(),
      color:       state.selectedColor
    };

    if (state.editId) {
      var idx = state.events.findIndex(function (e) { return e.id === state.editId; });
      if (idx !== -1) state.events[idx] = ev;
    } else {
      state.events.push(ev);
    }

    saveEvents();
    closeModal();
    render();
    showToast(state.editId ? 'Event updated.' : 'Event created.');
  }

  function deleteEvent(evid) {
    state.events = state.events.filter(function (e) { return e.id !== evid; });
    /* Also clear clipboard if that event was the source */
    if (state.clipboard && state.clipboard.id === evid) state.clipboard = null;
    saveEvents();
    closePopup();
    render();
    showToast('Event deleted.');
  }

  /* ──────────────────────────────────────────────────────────
     NAVIGATION
  ────────────────────────────────────────────────────────── */

  function navigate(dir) {
    var c = state.cursor;
    if (state.view === 'month') {
      state.cursor = new Date(c.getFullYear(), c.getMonth() + dir, 1);
    } else if (state.view === 'week') {
      var d = new Date(c); d.setDate(d.getDate() + dir * 7);
      state.cursor = d;
    } else {
      var d = new Date(c); d.setDate(d.getDate() + dir);
      state.cursor = d;
    }
    render();
  }

  function goToday() {
    state.cursor = new Date();
    render();
  }

  /* ──────────────────────────────────────────────────────────
     THEME
  ────────────────────────────────────────────────────────── */

  function setTheme(theme) {
    state.theme = theme;
    document.body.className = 'theme-' + theme;
    try { localStorage.setItem('zcrm_cal_theme', theme); } catch (e) { /* ignore */ }
  }

  /* ──────────────────────────────────────────────────────────
     COLOR PICKER (inside modal)
  ────────────────────────────────────────────────────────── */

  function attachColorPicker() {
    dom.colorRow.addEventListener('click', function (e) {
      var dot = e.target.closest('.color-dot');
      if (!dot) return;
      state.selectedColor = dot.dataset.color;
      dom.colorRow.querySelectorAll('.color-dot').forEach(function (d) {
        d.classList.toggle('active', d === dot);
      });
    });
  }

  /* ──────────────────────────────────────────────────────────
     SEED SAMPLE EVENTS (first visit only)
  ────────────────────────────────────────────────────────── */

  function seedSampleEvents() {
    if (state.events.length > 0) return;          /* already has events */
    var td = todayStr();
    var dateWithOffset = function (offsetDays) {
      var d = new Date();
      d.setDate(d.getDate() + offsetDays);
      return dateToStr(d);
    };
    var samples = [
      { id: uid(), title: 'Team Stand-up',   date: dateWithOffset(0),  startTime: '09:00', endTime: '09:30', description: 'Daily sync with the team', color: '#1565C0' },
      { id: uid(), title: 'Product Review',  date: dateWithOffset(0),  startTime: '11:00', endTime: '12:00', description: 'Q3 product roadmap review', color: '#2E7D32' },
      { id: uid(), title: 'Client Call',     date: dateWithOffset(1),  startTime: '14:00', endTime: '15:00', description: 'Zoho CRM demo for Acme Corp', color: '#E65100' },
      { id: uid(), title: 'Sprint Planning', date: dateWithOffset(2),  startTime: '10:00', endTime: '11:30', description: 'Sprint 22 planning session',  color: '#6A1B9A' },
      { id: uid(), title: 'Design Review',   date: dateWithOffset(3),  startTime: '15:00', endTime: '16:00', description: 'UI/UX feedback round',        color: '#00838F' }
    ];
    state.events = samples;
    saveEvents();
  }

  /* ──────────────────────────────────────────────────────────
     BOOTSTRAP
  ────────────────────────────────────────────────────────── */

  function init() {
    /* Restore theme */
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem('zcrm_cal_theme') || 'light'; } catch (e) { /* ignore */ }
    setTheme(savedTheme);

    /* Seed sample events for first-time visitors */
    seedSampleEvents();

    /* Navigation */
    dom.btnPrev.addEventListener('click',  function () { navigate(-1); });
    dom.btnNext.addEventListener('click',  function () { navigate(1); });
    dom.btnToday.addEventListener('click', goToday);

    /* View tabs */
    dom.viewTabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.view = btn.dataset.view;
        dom.viewTabs.forEach(function (t) {
          t.classList.toggle('active', t === btn);
          t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
        });
        render();
      });
    });

    /* Theme toggle – cycles light → dark → night → light */
    dom.themeToggle.addEventListener('click', function () {
      var themes = ['light', 'dark', 'night'];
      var idx = themes.indexOf(state.theme);
      setTheme(themes[(idx + 1) % themes.length]);
    });

    /* Modal controls */
    dom.modalClose.addEventListener('click',  closeModal);
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalSave.addEventListener('click',   saveModal);
    dom.modal.addEventListener('click', function (e) {
      if (e.target === dom.modal) closeModal();
    });

    /* Enter key in title field → save */
    dom.fTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); saveModal(); }
    });

    /* Color picker */
    attachColorPicker();

    /* Popup controls */
    dom.paClose.addEventListener('click',  closePopup);
    dom.paCopy.addEventListener('click',   function () {
      if (state.activePopup) { doCopy(state.activePopup); closePopup(); }
    });
    dom.paEdit.addEventListener('click',   function () {
      var ev = findEvent(state.activePopup);
      if (ev) { closePopup(); openModal(ev.date, ev.startTime, ev.endTime, ev); }
    });
    dom.paDelete.addEventListener('click', function () {
      var evid = state.activePopup;
      if (evid && window.confirm('Delete this event?')) { deleteEvent(evid); }
    });

    /* Close popup when clicking outside */
    document.addEventListener('click', function (e) {
      if (!dom.popup.contains(e.target) && !e.target.closest('.evt-chip') && !e.target.closest('.time-event')) {
        closePopup();
      }
    });

    /* Keyboard shortcuts */
    document.addEventListener('keydown', function (e) {
      if (dom.modal.classList.contains('modal-open')) return; /* modal captures input */
      switch (e.key) {
        case 'Escape':     closePopup(); break;
        case 'ArrowLeft':  navigate(-1); break;
        case 'ArrowRight': navigate(1);  break;
        case 't':          goToday();    break;
        case 'm': case 'M':
          state.view = 'month'; updateViewTab('month'); render(); break;
        case 'w': case 'W':
          state.view = 'week';  updateViewTab('week');  render(); break;
        case 'd': case 'D':
          state.view = 'day';   updateViewTab('day');   render(); break;
      }
    });

    /* Initial render */
    render();
  }

  function updateViewTab(view) {
    dom.viewTabs.forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === view);
      t.setAttribute('aria-selected', t.dataset.view === view ? 'true' : 'false');
    });
  }

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
