/* ============================================================
   calendar.js – Calendar Component (jQuery)
   Zoho CRM Design Language · Month / Week / Day views
   Features: event CRUD, copy/paste, Light/Dark/Night themes
   ============================================================ */

$(function () {
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

  /** True when the viewport is in the mobile range (≤ 768 px) */
  function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }

  /** Enforce week view on mobile; call before any view-dependent work */
  function enforceMobileView() {
    if (isMobile() && state.view !== 'week') {
      state.view = 'week';
      updateViewTab('week');
    }
  }

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

  /** Format an hour integer (0-23) to a 12-hour AM/PM time label, e.g. 13 → "1:00 PM" */
  function fmtHourLabel(h) {
    if (h === 0) return '';
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12  = h % 12 || 12;
    return h12 + ':00 ' + ampm;
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
    view:              'month',        // 'month' | 'week' | 'day'
    cursor:            new Date(),     // currently displayed date/period
    events:            loadEvents(),
    clipboard:         null,           // array of copied events (or null)
    clipboardSource:   null,           // 'cell' (day-level copy) | 'chip' (single-event copy)
    theme:             'light',
    editId:            null,           // id of event being edited (null = create)
    activePopup:       null,           // event id shown in popup (or null)
    selectedColor:     '#1565C0',
    mobileDaySelected: null            // selected day string (YYYY-MM-DD) in mobile week view
  };

  /* ──────────────────────────────────────────────────────────
     DOM REFERENCES  (jQuery objects)
  ────────────────────────────────────────────────────────── */
  var dom = {
    canvas:       $('#calCanvas'),
    periodLabel:  $('#periodLabel'),
    btnPrev:      $('#btnPrev'),
    btnNext:      $('#btnNext'),
    btnToday:     $('#btnToday'),
    viewTabs:     $('.view-tab'),
    themeToggle:  $('#themeToggle'),

    modal:        $('#eventModal'),
    modalHeading: $('#modalHeading'),
    modalClose:   $('#modalClose'),
    modalCancel:  $('#modalCancel'),
    modalSave:    $('#modalSave'),
    fTitle:       $('#fTitle'),
    fTitleErr:    $('#fTitleErr'),
    fDate:        $('#fDate'),
    fStart:       $('#fStart'),
    fEnd:         $('#fEnd'),
    fDesc:        $('#fDesc'),
    colorRow:     $('#colorRow'),

    popup:        $('#evtPopup'),
    popupDot:     $('#popupDot'),
    popupTitle:   $('#popupTitle'),
    popupWhen:    $('#popupWhen'),
    popupDesc:    $('#popupDesc'),
    paCopy:       $('#paCopy'),
    paEdit:       $('#paEdit'),
    paDelete:     $('#paDelete'),
    paClose:      $('#paClose'),

    toast:        $('#toast'),

    dayEventsPopup: $('#dayEventsPopup'),
    depDate:        $('#depDate'),
    depList:        $('#depList'),
    depClose:       $('#depClose')
  };

  /* ──────────────────────────────────────────────────────────
     TOAST
  ────────────────────────────────────────────────────────── */
  var toastTimer = null;
  function showToast(msg, ms) {
    ms = ms || 2800;
    dom.toast.text(msg).addClass('toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      dom.toast.removeClass('toast-show');
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

    dom.btnToday.text(label).css('display', isCurrent ? 'none' : '');
  }

  function updatePeriodLabel() {
    var c = state.cursor;
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
    dom.periodLabel.text(lbl);
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

  /** Returns true when the paste button should be visible for a given date (heads only) */
  function shouldShowPasteButton(ds) {
    return !!(state.clipboard && isValid(ds));
  }

  /** Returns true when the paste button should appear inside hour slots (chip/te copy only) */
  function shouldShowPasteInSlot(ds) {
    return !!(state.clipboard && state.clipboardSource !== 'cell' && isValid(ds));
  }

  /**
   * Returns the first event that covers the given hour slot on a date, or null.
   * An event covers slot h when its start < (h+1)*60 and its end > h*60 minutes.
   */
  function eventAtHour(ds, h) {
    var slotStart = h * 60;
    var slotEnd   = (h + 1) * 60;
    var found = null;
    eventsOn(ds).forEach(function (ev) {
      if (!found && timeToMins(ev.startTime) < slotEnd && timeToMins(ev.endTime) > slotStart) {
        found = ev;
      }
    });
    return found;
  }

  /* ──────────────────────────────────────────────────────────
     SVG ICON TEMPLATES
  ────────────────────────────────────────────────────────── */
  var SVG = {
    add:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    copy:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="7" height="8" rx="1.25"/><path d="M10 6V4.5A1.5 1.5 0 0 0 8.5 3h-5A1.5 1.5 0 0 0 2 4.5v6A1.5 1.5 0 0 0 3.5 12H5"/></svg>',
    paste: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2" width="10" height="13" rx="1.5"/><path d="M6 2v2h4V2"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9" y2="11"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3h4v1.5"/><rect x="3.5" y="4.5" width="9" height="9" rx="1.25"/><line x1="6.5" y1="7" x2="6.5" y2="11"/><line x1="9.5" y1="7" x2="9.5" y2="11"/></svg>',
    edit:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12l-9 9L2 14l.38-2.62 9.12-9z"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>'
  };

  /* ──────────────────────────────────────────────────────────
     RENDERING
  ────────────────────────────────────────────────────────── */

  function render() {
    /* On mobile always enforce the week view */
    enforceMobileView();
    updatePeriodLabel();
    updateTodayBtn();
    closePopup();
    closeDayEventsPopup();

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
    dom.canvas.html(html);
    attachMonthHandlers();
  }

  function renderMonthCell(day, ds, otherMonth, tdStr) {
    var past  = isPast(ds);
    var today = ds === tdStr;

    var cls = 'm-cell';
    if (otherMonth) cls += ' cell-other';
    if (past)       cls += ' cell-past';
    if (today)      cls += ' cell-today';

    var numCls = 'day-num' + (today ? ' day-num-today' : '');

    /* Action buttons */
    var acts = '<div class="cell-acts">';
    acts += '<button class="cell-add-btn" data-date="' + ds + '" title="Add event">' + SVG.add + '</button>';
    acts += '<button class="cell-copy-btn" data-date="' + ds + '" title="Copy events">' + SVG.copy + '</button>';
    if (shouldShowPasteButton(ds)) {
      acts += '<button class="cell-paste-btn" data-date="' + ds + '" title="Paste events">' + SVG.paste + '</button>';
    }
    acts += '<button class="cell-del-day-btn" data-date="' + ds + '" title="Delete all events">' + SVG.trash + '</button>';
    acts += '</div>';

    /* Events */
    var evts    = eventsOn(ds);
    var maxShow = 3;
    var chips   = '';
    evts.slice(0, maxShow).forEach(function (ev) {
      chips += renderChip(ev, past);
    });
    var moreChip = '';
    if (evts.length > maxShow) {
      moreChip = '<div class="more-chip" data-date="' + ds + '">+' + (evts.length - maxShow) + ' more</div>';
    }

    return '<div class="' + cls + '" data-date="' + ds + '">' +
           '  <div class="cell-head">' +
           '    <span class="' + numCls + '">' + day + '</span>' +
           acts +
           '  </div>' +
           '  <div class="cell-events">' + chips + '</div>' +
           moreChip +
           '</div>';
  }

  function renderChip(ev, past) {
    var bg     = ev.color + '22';
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
    if (isMobile()) { renderMobileWeek(); return; }
    var ws    = weekStart(state.cursor);
    var days  = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws);
      d.setDate(ws.getDate() + i);
      days.push(d);
    }
    var tdStr = todayStr();

    var html = '<div class="week-view"><div class="week-grid">';

    /* Header row */
    html += '<div class="week-head-row"><div class="week-head-spacer"></div>';
    days.forEach(function (d) {
      var ds      = dateToStr(d);
      var isT     = ds === tdStr;
      var valid   = isValid(ds);
      var numCls  = 'wdh-num' + (isT ? ' wdh-num-today' : '');
      var headCls = 'week-day-head' + (isT ? ' wdh-today' : '');
      /* Paste icon shown in header only when clipboard has content */
      var wdhActs = '<div class="cell-acts">';
      if (valid) {
        wdhActs += '<button class="cell-add-btn" data-date="' + ds + '" title="Add event">' + SVG.add + '</button>';
      }
      wdhActs += '<button class="cell-copy-btn" data-date="' + ds + '" title="Copy all events">' + SVG.copy + '</button>';
      if (shouldShowPasteButton(ds)) {
        wdhActs += '<button class="cell-paste-btn" data-date="' + ds + '" title="Paste events">' + SVG.paste + '</button>';
      }
      wdhActs += '<button class="cell-del-day-btn" data-date="' + ds + '" title="Delete all events">' + SVG.trash + '</button>';
      wdhActs += '</div>';
      html += '<div class="' + headCls + '" data-date="' + ds + '">' +
              '  <span class="wdh-name">' + WDAYS_SHORT[d.getDay()] + '</span>' +
              '  <span class="' + numCls + '">' + d.getDate() + '</span>' +
              wdhActs +
              '</div>';
    });
    html += '</div>';

    /* Time body */
    html += '<div class="week-time-body">';

    /* Time labels */
    html += '<div class="time-col">';
    for (var h = 0; h < 24; h++) {
      html += '<div class="time-lbl">' + fmtHourLabel(h) + '</div>';
    }
    html += '</div>';

    /* Day columns */
    days.forEach(function (d) {
      var ds    = dateToStr(d);
      var isT   = ds === tdStr;
      var valid = isValid(ds);
      var colCls = 'week-day-col' + (isT ? ' wdc-today' : '');

      html += '<div class="' + colCls + '" data-date="' + ds + '">';

      /* Hour slots – paste button inside slots only for chip/te copy */
      for (var h = 0; h < 24; h++) {
        var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
        html += '<div class="' + slotCls + '" data-date="' + ds + '" data-hour="' + h + '">';
        if (valid) {
          var evAtSlot = eventAtHour(ds, h);
          /* When a time-event occupies this slot, show a copy button instead of
             the add button to prevent the + icon from overlapping the event block. */
          if (evAtSlot) {
            html += '<button class="slot-copy-btn" data-evid="' + evAtSlot.id + '" title="Copy event">' + SVG.copy + '</button>';
          } else {
            html += '<button class="slot-add-btn" data-date="' + ds + '" data-hour="' + h + '" title="Add event">' + SVG.add + '</button>';
            if (shouldShowPasteInSlot(ds)) {
              html += '<button class="slot-paste-btn" data-date="' + ds + '" data-hour="' + h + '" title="Paste event">' + SVG.paste + '</button>';
            }
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
    dom.canvas.html(html);
    fixWeekHeadAlignment();
    attachWeekHandlers();
    renderCurrentTimeLine();
  }

  /* ════════════ MOBILE WEEK VIEW ════════════
     Horizontal scrollable day strip + single-day time grid below.
  ══════════════════════════════════════════ */
  function renderMobileWeek() {
    var ws   = weekStart(state.cursor);
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws);
      d.setDate(ws.getDate() + i);
      days.push(d);
    }
    var tdStr = todayStr();

    /* Ensure mobileDaySelected falls in the current week */
    var selectedInWeek = days.some(function (d) { return dateToStr(d) === state.mobileDaySelected; });
    if (!selectedInWeek) {
      var todayDay = days.find(function (d) { return dateToStr(d) === tdStr; });
      state.mobileDaySelected = todayDay ? tdStr : dateToStr(days[0]);
    }

    /* ── Week strip ── */
    var html = '<div class="mobile-week-view">';
    html += '<div class="mobile-week-strip">';
    days.forEach(function (d) {
      var ds    = dateToStr(d);
      var isT   = ds === tdStr;
      var isSel = ds === state.mobileDaySelected;
      var cls   = 'mobile-week-day' +
                  (isT   ? ' mwd-today'    : '') +
                  (isSel ? ' mwd-selected' : '');
      html += '<div class="' + cls + '" data-date="' + ds + '">' +
              '  <span class="mwd-name">' + WDAYS_SHORT[d.getDay()] + '</span>' +
              '  <span class="mwd-num">' + d.getDate() + '</span>' +
              '</div>';
    });
    html += '</div>'; /* /.mobile-week-strip */

    /* ── Day detail for the selected day ── */
    var selDs = state.mobileDaySelected;
    var valid = isValid(selDs);

    html += '<div class="mobile-day-detail">';

    html += '<div class="mobile-day-toolbar">';
    if (valid) {
      html += '<button class="dh-add-btn" data-date="' + selDs + '">+ Add Event</button>';
    }
    html += '<button class="mdt-copy-btn" data-date="' + selDs + '" title="Copy events">' + SVG.copy + '</button>';
    if (shouldShowPasteButton(selDs)) {
      html += '<button class="mdt-paste-btn" data-date="' + selDs + '" title="Paste events">' + SVG.paste + '</button>';
    }
    html += '<button class="mdt-delete-btn" data-date="' + selDs + '" title="Delete events">' + SVG.trash + '</button>';
    html += '</div>';

    html += '<div class="mobile-day-body">';

    /* Time labels */
    html += '<div class="time-col">';
    for (var h = 0; h < 24; h++) {
      html += '<div class="time-lbl">' + fmtHourLabel(h) + '</div>';
    }
    html += '</div>';

    /* Day column with hour slots and events */
    html += '<div class="day-col" data-date="' + selDs + '">';
    for (var h = 0; h < 24; h++) {
      var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
      html += '<div class="' + slotCls + '" data-date="' + selDs + '" data-hour="' + h + '">';
      if (valid) {
        var evAtSlot = eventAtHour(selDs, h);
        if (evAtSlot) {
          html += '<button class="slot-copy-btn" data-evid="' + evAtSlot.id + '" title="Copy event">' + SVG.copy + '</button>';
        } else {
          html += '<button class="slot-add-btn" data-date="' + selDs + '" data-hour="' + h + '" title="Add event">' + SVG.add + '</button>';
          if (shouldShowPasteInSlot(selDs)) {
            html += '<button class="slot-paste-btn" data-date="' + selDs + '" data-hour="' + h + '" title="Paste event">' + SVG.paste + '</button>';
          }
        }
      }
      html += '</div>';
    }
    eventsOn(selDs).forEach(function (ev) {
      html += renderTimeEvent(ev, selDs);
    });
    html += '</div>'; /* /.day-col */

    html += '</div>'; /* /.mobile-day-body */
    html += '</div>'; /* /.mobile-day-detail */
    html += '</div>'; /* /.mobile-week-view */

    dom.canvas.html(html);
    attachMobileWeekHandlers();
    renderCurrentTimeLine();
  }

  /* ════════════ DAY VIEW ════════════ */
  function renderDay() {
    var ds    = dateToStr(state.cursor);
    var tdStr = todayStr();
    var isT   = ds === tdStr;
    var valid = isValid(ds);

    var headCls = 'day-head' + (isT ? ' dh-today' : '');
    var html = '<div class="day-view"><div class="day-grid">';

    /* Day header – paste icon shown here only when clipboard has content */
    var dhActs = '<div class="cell-acts">' +
                 '<button class="cell-copy-btn" data-date="' + ds + '" title="Copy all events">' + SVG.copy + '</button>';
    if (shouldShowPasteButton(ds)) {
      dhActs += '<button class="cell-paste-btn" data-date="' + ds + '" title="Paste events">' + SVG.paste + '</button>';
    }
    dhActs += '<button class="cell-del-day-btn" data-date="' + ds + '" title="Delete all events">' + SVG.trash + '</button>';
    dhActs += '</div>';

    html += '<div class="' + headCls + '">' +
            '  <span class="dh-wday">' + WDAYS_LONG[state.cursor.getDay()] + '</span>' +
            '  <span class="dh-date">' +
                  MONTHS[state.cursor.getMonth()] + ' ' +
                  state.cursor.getDate() + ', ' + state.cursor.getFullYear() +
            '  </span>' +
            dhActs +
            '  <div class="dh-actions">';

    if (valid) {
      html += '<button class="dh-add-btn" data-date="' + ds + '">+ Add Event</button>';
    } else {
      html += '<span class="dh-past-note">Past date – event creation not allowed</span>';
    }
    html += '  </div></div>'; /* /.dh-actions / .day-head */

    /* Time body */
    html += '<div class="day-body">';

    /* Time labels */
    html += '<div class="time-col">';
    for (var h = 0; h < 24; h++) {
      html += '<div class="time-lbl">' + fmtHourLabel(h) + '</div>';
    }
    html += '</div>';

    /* Single day column – paste button inside hour slots only for chip/te copy */
    html += '<div class="day-col" data-date="' + ds + '">';
    for (var h = 0; h < 24; h++) {
      var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
      html += '<div class="' + slotCls + '" data-date="' + ds + '" data-hour="' + h + '">';
      if (valid) {
        var evAtSlot = eventAtHour(ds, h);
        if (evAtSlot) {
          html += '<button class="slot-copy-btn" data-evid="' + evAtSlot.id + '" title="Copy event">' + SVG.copy + '</button>';
        } else {
          html += '<button class="slot-add-btn" data-date="' + ds + '" data-hour="' + h + '" title="Add event">' + SVG.add + '</button>';
          if (shouldShowPasteInSlot(ds)) {
            html += '<button class="slot-paste-btn" data-date="' + ds + '" data-hour="' + h + '" title="Paste event">' + SVG.paste + '</button>';
          }
        }
      }
      html += '</div>';
    }

    /* Events */
    eventsOn(ds).forEach(function (ev) {
      html += renderTimeEvent(ev, ds);
    });

    html += '</div></div></div></div>'; /* day-col / day-body / day-grid / day-view */
    dom.canvas.html(html);
    attachDayHandlers();
    renderCurrentTimeLine();
  }

  /* ────── Time-event block (week + day views) ────── */
  function renderTimeEvent(ev, ds) {
    var past      = isPast(ds);
    var startMins = timeToMins(ev.startTime);
    var endMins   = timeToMins(ev.endTime);
    var dur       = Math.max(endMins - startMins, 30);
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

  /**
   * Compensate for the vertical scrollbar in .week-time-body so that
   * .week-head-row columns stay perfectly aligned with .week-day-col borders.
   */
  function fixWeekHeadAlignment() {
    var headRow  = dom.canvas.find('.week-head-row');
    var timeBody = dom.canvas.find('.week-time-body');
    if (headRow.length && timeBody.length) {
      var gutter = timeBody[0].offsetWidth - timeBody[0].clientWidth;
      headRow.css('padding-right', gutter + 'px');
    }
  }

  /* ────────────────────────────────────────────────────────────
     CURRENT TIME INDICATOR
     Renders a red horizontal line + time badge at the current
     time position in the Week / Day time grid.  Auto-updates
     every minute via a global interval started in init().
  ─────────────────────────────────────────────────────────── */

  /** Inject (or refresh) the current-time indicator elements */
  function renderCurrentTimeLine() {
    /* Remove any stale indicator from a previous render */
    dom.canvas.find('.current-time-line, .current-time-badge').remove();

    if (state.view !== 'week' && state.view !== 'day') return;

    var now    = new Date();
    var tdStr  = todayStr();

    /* Week view: only render when today is inside the displayed week */
    if (state.view === 'week') {
      var ws = weekStart(state.cursor);
      var we = new Date(ws); we.setDate(ws.getDate() + 6);
      if (tdStr < dateToStr(ws) || tdStr > dateToStr(we)) return;
    }

    /* Day view: only render when the displayed day is today */
    if (state.view === 'day' && dateToStr(state.cursor) !== tdStr) return;

    var mins     = now.getHours() * 60 + now.getMinutes();
    var SLOT_PX  = 60;
    var top      = (mins / 60) * SLOT_PX;
    var timeLabel = fmtTime(pad2(now.getHours()) + ':' + pad2(now.getMinutes()));

    /* Badge inside the time-col */
    var $timeCol = dom.canvas.find('.time-col');
    $timeCol.append(
      '<div class="current-time-badge" style="top:' + top + 'px">' +
        escHtml(timeLabel) +
      '</div>'
    );

    /* Line spanning the day-column area */
    var $timeBody = dom.canvas.find('.week-time-body, .day-body, .mobile-day-body');
    $timeBody.append(
      '<div class="current-time-line" style="top:' + top + 'px"></div>'
    );

    /* Scroll so the indicator is roughly centred in the viewport */
    if ($timeBody.length) {
      var viewH   = $timeBody[0].clientHeight;
      var scroll  = Math.max(0, top - viewH / 3);
      $timeBody[0].scrollTop = scroll;
    }
  }

  /* ──────────────────────────────────────────────────────────
     EVENT DELEGATION HANDLERS
     Use namespace '.calview' so handlers can be cleanly
     replaced on each render without accumulation.
  ────────────────────────────────────────────────────────── */

  /** Attach all handlers for the month view */
  function attachMonthHandlers() {
    dom.canvas.off('.calview');
    dom.canvas.on('click.calview', '.cell-add-btn', function (e) {
      e.stopPropagation();
      var date = $(this).data('date');
      if (isPast(date)) return;
      openModal(date);
    });
    dom.canvas.on('click.calview', '.cell-paste-btn', function (e) {
      e.stopPropagation();
      var date = $(this).data('date');
      if (!isValid(date)) { showToast('Cannot paste on a past date.'); return; }
      if (!state.clipboard) { showToast('Nothing in clipboard.'); return; }
      doPaste(date);
    });
    dom.canvas.on('click.calview', '.cell-copy-btn', function (e) {
      e.stopPropagation();
      var evts = eventsOn($(this).data('date'));
      if (evts.length === 0) { showToast('No events to copy on this day.'); return; }
      doCopyAll(evts);
    });
    dom.canvas.on('click.calview', '.cell-del-day-btn', function (e) {
      e.stopPropagation();
      var ds   = $(this).data('date');
      var evts = eventsOn(ds);
      if (evts.length === 0) { showToast('No events to delete on this day.'); return; }
      if (window.confirm('Delete all ' + evts.length + ' event(s) on ' + ds + '?')) {
        var ids = evts.map(function (ev) { return ev.id; });
        state.events = state.events.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
        if (state.clipboard) {
          state.clipboard = state.clipboard.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
          if (state.clipboard.length === 0) {
            state.clipboard       = null;
            state.clipboardSource = null;
          }
        }
        saveEvents();
        render();
        showToast('All events deleted for ' + ds + '.');
      }
    });
    dom.canvas.on('click.calview', '.chip-copy-btn', function (e) {
      e.stopPropagation();
      doCopy($(this).data('evid'));
    });
    dom.canvas.on('click.calview', '.evt-chip', function (e) {
      if (!$(e.target).closest('.chip-copy-btn').length) {
        showPopup($(this).data('evid'), e);
      }
    });
    /* Clicking the "+N more" chip opens the day events popup */
    dom.canvas.on('click.calview', '.more-chip', function (e) {
      e.stopPropagation();
      showDayEventsPopup($(this).data('date'), e);
    });
  }

  /** Attach all handlers for the week view */
  function attachWeekHandlers() {
    dom.canvas.off('.calview');
    attachTimeGridHandlers();
    dom.canvas.on('click.calview', '.cell-add-btn', function (e) {
      e.stopPropagation();
      var date = $(this).data('date');
      if (isPast(date)) return;
      openModal(date);
    });
    dom.canvas.on('click.calview', '.cell-copy-btn', function (e) {
      e.stopPropagation();
      var evts = eventsOn($(this).data('date'));
      if (evts.length === 0) { showToast('No events to copy on this day.'); return; }
      doCopyAll(evts);
    });
    dom.canvas.on('click.calview', '.cell-paste-btn', function (e) {
      e.stopPropagation();
      var date = $(this).data('date');
      if (!isValid(date)) { showToast('Cannot paste on a past date.'); return; }
      if (!state.clipboard) { showToast('Nothing in clipboard.'); return; }
      doPaste(date);
    });
    dom.canvas.on('click.calview', '.cell-del-day-btn', function (e) {
      e.stopPropagation();
      var ds   = $(this).data('date');
      var evts = eventsOn(ds);
      if (evts.length === 0) { showToast('No events to delete on this day.'); return; }
      if (window.confirm('Delete all ' + evts.length + ' event(s) on ' + ds + '?')) {
        var ids = evts.map(function (ev) { return ev.id; });
        state.events = state.events.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
        if (state.clipboard) {
          state.clipboard = state.clipboard.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
          if (state.clipboard.length === 0) {
            state.clipboard       = null;
            state.clipboardSource = null;
          }
        }
        saveEvents();
        render();
        showToast('All events deleted for ' + ds + '.');
      }
    });
    /* Clicking a day header in week view switches to day view;
       ignore clicks that land on a button inside the header */
    dom.canvas.on('click.calview', '.week-day-head', function (e) {
      if ($(e.target).closest('button').length) return;
      var ds = $(this).data('date');
      if (ds) {
        state.cursor = new Date(ds + 'T12:00:00');
        state.view   = 'day';
        updateViewTab('day');
        render();
      }
    });
  }

  /** Attach handlers for the mobile week view */
  function attachMobileWeekHandlers() {
    dom.canvas.off('.calview');

    /* Tap a day in the strip to select it and show its events */
    dom.canvas.on('click.calview', '.mobile-week-day', function (e) {
      e.stopPropagation();
      var ds = $(this).data('date');
      if (ds && ds !== state.mobileDaySelected) {
        state.mobileDaySelected = ds;
        renderMobileWeek();
      }
    });

    /* "+ Add Event" toolbar button */
    dom.canvas.on('click.calview', '.dh-add-btn', function (e) {
      e.stopPropagation();
      openModal($(this).data('date'));
    });

    /* Mobile toolbar – Copy all events */
    dom.canvas.on('click.calview', '.mdt-copy-btn', function (e) {
      e.stopPropagation();
      var evts = eventsOn($(this).data('date'));
      if (evts.length === 0) { showToast('No events to copy on this day.'); return; }
      doCopyAll(evts);
    });

    /* Mobile toolbar – Paste events */
    dom.canvas.on('click.calview', '.mdt-paste-btn', function (e) {
      e.stopPropagation();
      var date = $(this).data('date');
      if (!isValid(date)) { showToast('Cannot paste on a past date.'); return; }
      if (!state.clipboard) { showToast('Nothing in clipboard.'); return; }
      doPaste(date);
    });

    /* Mobile toolbar – Delete all events */
    dom.canvas.on('click.calview', '.mdt-delete-btn', function (e) {
      e.stopPropagation();
      var ds   = $(this).data('date');
      var evts = eventsOn(ds);
      if (evts.length === 0) { showToast('No events to delete on this day.'); return; }
      if (window.confirm('Delete all ' + evts.length + ' event(s) on ' + ds + '?')) {
        var ids = evts.map(function (ev) { return ev.id; });
        state.events = state.events.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
        if (state.clipboard) {
          state.clipboard = state.clipboard.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
          if (state.clipboard.length === 0) {
            state.clipboard       = null;
            state.clipboardSource = null;
          }
        }
        saveEvents();
        render();
        showToast('All events deleted for ' + ds + '.');
      }
    });

    /* Shared time-grid handlers (slot add / paste, time-event popup, copy) */
    attachTimeGridHandlers();
  }

  /** Attach all handlers for the day view */
  function attachDayHandlers() {
    dom.canvas.off('.calview');
    attachTimeGridHandlers();
    dom.canvas.on('click.calview', '.cell-copy-btn', function (e) {
      e.stopPropagation();
      var evts = eventsOn($(this).data('date'));
      if (evts.length === 0) { showToast('No events to copy on this day.'); return; }
      doCopyAll(evts);
    });
    dom.canvas.on('click.calview', '.cell-paste-btn', function (e) {
      e.stopPropagation();
      var date = $(this).data('date');
      if (!isValid(date)) { showToast('Cannot paste on a past date.'); return; }
      if (!state.clipboard) { showToast('Nothing in clipboard.'); return; }
      doPaste(date);
    });
    dom.canvas.on('click.calview', '.cell-del-day-btn', function (e) {
      e.stopPropagation();
      var ds   = $(this).data('date');
      var evts = eventsOn(ds);
      if (evts.length === 0) { showToast('No events to delete on this day.'); return; }
      if (window.confirm('Delete all ' + evts.length + ' event(s) on ' + ds + '?')) {
        var ids = evts.map(function (ev) { return ev.id; });
        state.events = state.events.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
        if (state.clipboard) {
          state.clipboard = state.clipboard.filter(function (ev) { return ids.indexOf(ev.id) === -1; });
          if (state.clipboard.length === 0) {
            state.clipboard       = null;
            state.clipboardSource = null;
          }
        }
        saveEvents();
        render();
        showToast('All events deleted for ' + ds + '.');
      }
    });
    dom.canvas.on('click.calview', '.dh-add-btn', function () {
      openModal($(this).data('date'));
    });
  }

  /** Shared handler setup for week/day time grids */
  function attachTimeGridHandlers() {
    dom.canvas.on('click.calview', '.slot-add-btn', function (e) {
      e.stopPropagation();
      var h = parseInt($(this).data('hour'), 10);
      openModal($(this).data('date'), hourToTime(h), hourToTime(h + 1));
    });
    dom.canvas.on('click.calview', '.slot-paste-btn', function (e) {
      e.stopPropagation();
      var ds   = $(this).data('date');
      var hour = parseInt($(this).data('hour'), 10);
      if (!isValid(ds))        { showToast('Cannot paste on a past date.'); return; }
      if (!state.clipboard)    { showToast('Nothing in clipboard.'); return; }
      doPaste(ds, hour);
    });
    dom.canvas.on('click.calview', '.te-copy-btn', function (e) {
      e.stopPropagation();
      doCopy($(this).data('evid'));
    });
    dom.canvas.on('click.calview', '.slot-copy-btn', function (e) {
      e.stopPropagation();
      doCopy($(this).data('evid'));
    });
    dom.canvas.on('click.calview', '.time-event', function (e) {
      if (!$(e.target).closest('.te-copy-btn').length) {
        showPopup($(this).data('evid'), e);
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
    state.clipboard       = [Object.assign({}, ev)];
    state.clipboardSource = 'chip';
    render();
    showToast('"' + ev.title + '" copied – paste on any future date.');
  }

  function doCopyAll(evts) {
    state.clipboard       = evts.map(function (ev) { return Object.assign({}, ev); });
    state.clipboardSource = 'cell';
    render();
    showToast(evts.length === 1
      ? '"' + evts[0].title + '" copied – paste on any future date.'
      : evts.length + ' events copied – paste on any future date.');
  }

  /**
   * Returns true when a clipboard event would conflict with an existing event
   * on the target date (same startTime and endTime after applying optional hour offset).
   */
  function hasConflict(ds, clipEv, hour) {
    var targetStart = (hour !== undefined) ? hourToTime(hour)                        : clipEv.startTime;
    var targetEnd   = (hour !== undefined) ? hourToTime(Math.min(hour + 1, 23))      : clipEv.endTime;
    return state.events.some(function (ev) {
      return ev.date === ds && ev.startTime === targetStart && ev.endTime === targetEnd;
    });
  }

  /**
   * Paste all clipboard events onto a date (and optionally a specific hour).
   * @param {string}  ds    – target date string YYYY-MM-DD
   * @param {number?} hour  – optional hour (0-23); if omitted keeps original times
   */
  function doPaste(ds, hour) {
    if (!state.clipboard) { showToast('Nothing in clipboard.'); return; }
    if (!isValid(ds))     { showToast('Cannot paste on a past date.'); return; }

    /* Conflict check – prevent paste if any event already occupies the same slot */
    var conflicting = state.clipboard.some(function (clipEv) {
      return hasConflict(ds, clipEv, hour);
    });
    if (conflicting) {
      var parts = ds.split('-');
      var dObj  = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      var label = MONTHS[dObj.getMonth()] + ' ' + dObj.getDate() + ', ' + dObj.getFullYear();
      showToast('An event already exists in the selected time slot on ' + label + '.', 3500);
      return;
    }

    var count = state.clipboard.length;
    state.clipboard.forEach(function (clipEv) {
      var ev = Object.assign({}, clipEv, { id: uid(), date: ds });
      if (hour !== undefined) {
        ev.startTime = hourToTime(hour);
        ev.endTime   = hourToTime(Math.min(hour + 1, 23));
      }
      state.events.push(ev);
    });
    saveEvents();
    render();
    showToast(count === 1
      ? 'Event pasted on ' + ds + '.'
      : count + ' events pasted on ' + ds + '.');
  }

  /* ──────────────────────────────────────────────────────────
     EVENT POPUP
  ────────────────────────────────────────────────────────── */

  function showPopup(evid, mouseEvt) {
    var ev = findEvent(evid);
    if (!ev) return;

    state.activePopup = evid;
    dom.popupDot.css('background', ev.color);
    dom.popupTitle.text(ev.title);
    dom.popupWhen.text(ev.date + '  ·  ' + fmtTime(ev.startTime) + ' – ' + fmtTime(ev.endTime));
    dom.popupDesc.text(ev.description || '');

    /* Position near mouse, keeping inside viewport */
    var x = mouseEvt.clientX + 12;
    var y = mouseEvt.clientY + 8;
    var pw = dom.popup[0].offsetWidth || 300;
    var ph = dom.popup[0].offsetHeight || 140;
    if (x + pw > window.innerWidth  - 8) x = mouseEvt.clientX - pw - 8;
    if (y + ph > window.innerHeight - 8) y = mouseEvt.clientY - ph - 8;
    x = Math.max(4, Math.min(x, window.innerWidth  - pw - 4));
    y = Math.max(4, Math.min(y, window.innerHeight - ph - 4));
    dom.popup.css({ left: x + 'px', top: y + 'px' })
             .addClass('popup-open');
  }

  function closePopup() {
    state.activePopup = null;
    dom.popup.removeClass('popup-open');
  }

  /* ──────────────────────────────────────────────────────────
     DAY EVENTS POPUP (all events for a month cell)
  ────────────────────────────────────────────────────────── */

  function showDayEventsPopup(ds, mouseEvt) {
    var evts = eventsOn(ds);

    /* Build date label */
    var parts = ds.split('-');
    var d     = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    dom.depDate.text(WDAYS_LONG[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear());

    /* Build event list */
    var listHtml = '';
    if (evts.length === 0) {
      listHtml = '';
    } else {
      evts.forEach(function (ev) {
        listHtml +=
          '<div class="dep-item" data-evid="' + ev.id + '"' +
          '     style="border-left-color:' + ev.color + ';background:' + ev.color + '18">' +
          '  <span class="dep-item-dot" style="background:' + ev.color + '"></span>' +
          '  <div class="dep-item-info">' +
          '    <div class="dep-item-title">' + escHtml(ev.title) + '</div>' +
          '    <div class="dep-item-time">' + fmtTime(ev.startTime) + ' – ' + fmtTime(ev.endTime) + '</div>' +
          '  </div>' +
          '</div>';
      });
    }
    dom.depList.html(listHtml);

    /* Position near mouse, keeping inside viewport */
    var pw = 280, ph = Math.min(evts.length * 56 + 48, 340);
    var x  = mouseEvt.clientX + 12;
    var y  = mouseEvt.clientY + 8;
    if (x + pw > window.innerWidth  - 8) x = mouseEvt.clientX - pw - 8;
    if (y + ph > window.innerHeight - 8) y = mouseEvt.clientY - ph - 8;
    dom.dayEventsPopup
      .css({ left: Math.max(4, x) + 'px', top: Math.max(4, y) + 'px' })
      .addClass('dep-open');
  }

  function closeDayEventsPopup() {
    dom.dayEventsPopup.removeClass('dep-open');
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
    state.editId        = existing ? existing.id : null;
    state.selectedColor = existing ? existing.color : '#1565C0';

    dom.modalHeading.text(existing ? 'Edit Event' : 'Create Event');
    dom.fTitle.val(existing ? existing.title       : '');
    dom.fDate.val(existing  ? existing.date        : (date || todayStr()));
    dom.fStart.val(existing ? existing.startTime   : (startTime || '09:00'));
    dom.fEnd.val(existing   ? existing.endTime     : (endTime   || '10:00'));
    dom.fDesc.val(existing  ? (existing.description || '') : '');

    dom.fTitle.removeClass('input-err');
    dom.fTitleErr.removeClass('show');

    /* Update color picker */
    dom.colorRow.find('.color-dot').each(function () {
      var $dot = $(this);
      $dot.toggleClass('active', $dot.data('color') === state.selectedColor);
    });

    dom.modal.addClass('modal-open');
    setTimeout(function () { dom.fTitle.focus(); }, 60);
  }

  function closeModal() {
    dom.modal.removeClass('modal-open');
    state.editId = null;
  }

  function saveModal() {
    var title = dom.fTitle.val().trim();
    if (!title) {
      dom.fTitle.addClass('input-err');
      dom.fTitleErr.addClass('show');
      dom.fTitle.focus();
      return;
    }
    dom.fTitle.removeClass('input-err');
    dom.fTitleErr.removeClass('show');

    var date = dom.fDate.val();
    if (!isValid(date)) {
      showToast('Cannot create or edit events on past dates.');
      return;
    }

    /* Validate times */
    var start = dom.fStart.val() || '09:00';
    var end   = dom.fEnd.val()   || '10:00';
    if (timeToMins(end) <= timeToMins(start)) {
      end = hourToTime(Math.min(timeToMins(start) / 60 + 1, 23));
    }

    var ev = {
      id:          state.editId || uid(),
      title:       title,
      date:        date,
      startTime:   start,
      endTime:     end,
      description: dom.fDesc.val().trim(),
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
    /* Also remove from clipboard if that event was the source */
    if (state.clipboard) {
      state.clipboard = state.clipboard.filter(function (ev) { return ev.id !== evid; });
      if (state.clipboard.length === 0) {
        state.clipboard       = null;
        state.clipboardSource = null;
      }
    }
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
    $('body').attr('class', 'theme-' + theme);
    try { localStorage.setItem('zcrm_cal_theme', theme); } catch (e) { /* ignore */ }
  }

  /* ──────────────────────────────────────────────────────────
     COLOR PICKER (inside modal)
  ────────────────────────────────────────────────────────── */

  function attachColorPicker() {
    dom.colorRow.on('click', '.color-dot', function () {
      var clickedDot = this;
      state.selectedColor = $(this).data('color');
      dom.colorRow.find('.color-dot').each(function () {
        $(this).toggleClass('active', this === clickedDot);
      });
    });
  }

  /* ──────────────────────────────────────────────────────────
     SEED SAMPLE EVENTS (first visit only)
  ────────────────────────────────────────────────────────── */

  function seedSampleEvents() {
    if (state.events.length > 0) return;
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

  function updateViewTab(view) {
    dom.viewTabs.each(function () {
      var isView = $(this).data('view') === view;
      $(this).toggleClass('active', isView).attr('aria-selected', isView ? 'true' : 'false');
    });
  }

  /* ──────────────────────────────────────────────────────────
     CALENDAR MONTH/YEAR PICKER
  ────────────────────────────────────────────────────────── */
  var MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                      'Jul','Aug','Sep','Oct','Nov','Dec'];

  var picker = {
    open:       false,
    mode:       'month',   // 'day' | 'month' | 'decade'
    viewYear:   new Date().getFullYear(),
    viewMonth:  new Date().getMonth()
  };

  function decadeStart(year) { return Math.floor(year / 10) * 10; }

  /* ── Determine footer button text (null = hide footer) ── */
  function getPickerFooterText() {
    var today = new Date();
    var c = state.cursor;
    if (state.view === 'month') {
      var same = c.getFullYear() === today.getFullYear() && c.getMonth() === today.getMonth();
      return same ? null : 'This Month';
    } else if (state.view === 'week') {
      var ws  = weekStart(c);
      var we  = new Date(ws); we.setDate(ws.getDate() + 6);
      var td  = todayStr();
      var cur = dateToStr(ws) <= td && td <= dateToStr(we);
      return cur ? null : 'This Week';
    }
    return null;
  }

  /* ── Render the day grid (used in 'day' picker mode) ── */
  function renderPickerDayGrid($grid) {
    var y       = picker.viewYear;
    var m       = picker.viewMonth;
    var dim     = daysInMonth(y, m);
    var fdow    = firstDOW(y, m);
    var prevDim = daysInMonth(y, m - 1);
    var tdStr   = todayStr();

    /* Week boundaries (for week-view highlight) */
    var wsStr = null, weStr = null;
    if (state.view === 'week') {
      var ws = weekStart(state.cursor);
      var we = new Date(ws); we.setDate(ws.getDate() + 6);
      wsStr  = dateToStr(ws);
      weStr  = dateToStr(we);
    }

    /* Always render 6 rows (42 cells) for a stable picker height */
    var ROWS = 6, COLS = 7;
    for (var row = 0; row < ROWS; row++) {
      /* Determine if this row is the highlighted week */
      var rowHl = false;
      if (wsStr && weStr) {
        for (var ci = 0; ci < COLS; ci++) {
          var idx = row * COLS + ci;
          var d0  = cellDate(y, m, fdow, dim, prevDim, idx);
          var ds0 = dateToStr(d0);
          if (ds0 >= wsStr && ds0 <= weStr) { rowHl = true; break; }
        }
      }

      var rowHtml = '<div class="cp-week-row' + (rowHl ? ' cp-row-hl' : '') + '">';
      for (var col = 0; col < COLS; col++) {
        var idx = row * COLS + col;
        var d   = cellDate(y, m, fdow, dim, prevDim, idx);
        var ds  = dateToStr(d);
        var dn  = d.getDate();
        var isOther = (d.getFullYear() !== y || d.getMonth() !== m);
        var isToday = (ds === tdStr);
        var isStart = (wsStr && ds === wsStr);
        var isEnd   = (weStr && ds === weStr);
        var isCircle = isStart || isEnd;

        var cls = 'cp-day';
        if (isOther)  cls += ' cp-day-other';
        if (isToday)  cls += ' cp-day-today';
        else if (isCircle) cls += ' cp-day-circle';

        rowHtml += '<button class="' + cls + '" data-date="' + ds + '">' + dn + '</button>';
      }
      rowHtml += '</div>';
      $grid.append($(rowHtml));
    }
  }

  /** Return the Date object for a given cell index in the picker day grid */
  function cellDate(y, m, fdow, dim, prevDim, idx) {
    if (idx < fdow) {
      return new Date(y, m - 1, prevDim - fdow + 1 + idx);
    }
    var dayNum = idx - fdow + 1;
    if (dayNum <= dim) {
      return new Date(y, m, dayNum);
    }
    return new Date(y, m + 1, dayNum - dim);
  }

  /* ── Render the complete picker based on picker.mode ── */
  function renderPicker() {
    var $grid      = $('#cpGrid');
    var $rangeBtn  = $('#cpRangeBtn');
    var $monthBtn  = $('#cpMonthBtn');
    var $dayNames  = $('#cpDayNames');
    var $footer    = $('#cpFooter');
    var $footerBtn = $('#cpFooterBtn');
    $grid.empty();

    /* Toggle week-mode class so CSS can apply seamless row hover */
    $('#calPicker').toggleClass('cp-week-mode', state.view === 'week');

    if (picker.mode === 'day') {
      /* ── Day mode: show month+year buttons, day-names, date grid ── */
      $monthBtn.text(MONTHS[picker.viewMonth]).show();
      $rangeBtn.text(picker.viewYear).attr('aria-label', 'Switch to decade view');

      /* Day-of-week names */
      $dayNames.html(
        WDAYS_SHORT.map(function (d) {
          return '<div class="cp-dname">' + d[0] + '</div>';
        }).join('')
      ).addClass('cp-visible');

      $grid.addClass('cp-day-mode');
      renderPickerDayGrid($grid);

    } else if (picker.mode === 'month') {
      /* ── Month mode: show year button, 12-month grid ── */
      $monthBtn.hide();
      $dayNames.removeClass('cp-visible');
      $grid.removeClass('cp-day-mode');
      $rangeBtn.text(picker.viewYear).attr('aria-label', 'Switch to decade view');

      var today     = new Date();
      var selYear   = state.cursor.getFullYear();
      var selMonth  = state.cursor.getMonth();
      for (var m = 0; m < 12; m++) {
        var isSelected = (picker.viewYear === selYear && m === selMonth);
        var isCurMo    = (picker.viewYear === today.getFullYear() && m === today.getMonth());
        var cell = $('<button class="cp-cell"></button>')
          .text(MONTHS_SHORT[m])
          .attr('data-m', m)
          .toggleClass('cp-selected', isSelected)
          .toggleClass('cp-current-period', !isSelected && isCurMo);
        $grid.append(cell);
      }

    } else {
      /* ── Decade mode: show decade range, year grid ── */
      $monthBtn.hide();
      $dayNames.removeClass('cp-visible');
      $grid.removeClass('cp-day-mode');
      var ds       = decadeStart(picker.viewYear);
      $rangeBtn.text(ds + ' \u2013 ' + (ds + 9)).attr('aria-label', 'Switch to month view');
      var selYear2 = state.cursor.getFullYear();
      for (var offset = -1; offset <= 10; offset++) {
        var y       = ds + offset;
        var outside = (offset === -1 || offset === 10);
        var cell = $('<button class="cp-cell"></button>')
          .text(y)
          .attr('data-y', y)
          .toggleClass('cp-selected', y === selYear2)
          .toggleClass('cp-outside', outside);
        $grid.append(cell);
      }
    }

    /* ── Footer: This Week / This Month ── */
    var footerText = getPickerFooterText();
    if (footerText) {
      $footerBtn.text(footerText);
      $footer.addClass('cp-visible');
    } else {
      $footer.removeClass('cp-visible');
    }
  }

  function openPicker() {
    picker.viewYear  = state.cursor.getFullYear();
    picker.viewMonth = state.cursor.getMonth();
    /* Day mode for week / day calendar views; month mode for month view */
    picker.mode = (state.view === 'month') ? 'month' : 'day';
    renderPicker();
    positionPicker();
    $('#calPicker').addClass('cp-open');
    picker.open = true;
  }

  function closePicker() {
    $('#calPicker').removeClass('cp-open');
    picker.open = false;
  }

  function positionPicker() {
    var icon    = $('.cal-icon');
    var off     = icon.offset();
    var iconH   = icon.outerHeight();
    var pickerW = 296;
    var winW    = $(window).width();
    var left    = off.left;
    if (left + pickerW > winW - 8) {
      left = winW - pickerW - 8;
    }
    $('#calPicker').css({ top: off.top + iconH + 6, left: left });
  }

  function initPicker() {
    /* Open/close on cal-icon click */
    $('.cal-icon').on('click', function (e) {
      e.stopPropagation();
      if (picker.open) { closePicker(); } else { openPicker(); }
    });

    /* Month button (day mode) → switch to month mode */
    $('#cpMonthBtn').on('click', function (e) {
      e.stopPropagation();
      picker.mode = 'month';
      renderPicker();
    });

    /* Range button (year/decade) → toggle decade ↔ month; in day mode year → decade */
    $('#cpRangeBtn').on('click', function (e) {
      e.stopPropagation();
      if (picker.mode === 'day') {
        picker.mode = 'decade';
        picker.viewYear = decadeStart(picker.viewYear);
      } else if (picker.mode === 'month') {
        picker.mode = 'decade';
        picker.viewYear = decadeStart(picker.viewYear);
      } else {
        /* decade → back to month (or day if calendar view is week/day) */
        picker.mode = (state.view === 'month') ? 'month' : 'day';
      }
      renderPicker();
    });

    /* Prev / Next navigation */
    $('#cpPrev').on('click', function (e) {
      e.stopPropagation();
      if (picker.mode === 'day') {
        picker.viewMonth -= 1;
        if (picker.viewMonth < 0) { picker.viewMonth = 11; picker.viewYear -= 1; }
      } else if (picker.mode === 'month') {
        picker.viewYear -= 1;
      } else {
        picker.viewYear = decadeStart(picker.viewYear) - 10;
      }
      renderPicker();
    });

    $('#cpNext').on('click', function (e) {
      e.stopPropagation();
      if (picker.mode === 'day') {
        picker.viewMonth += 1;
        if (picker.viewMonth > 11) { picker.viewMonth = 0; picker.viewYear += 1; }
      } else if (picker.mode === 'month') {
        picker.viewYear += 1;
      } else {
        picker.viewYear = decadeStart(picker.viewYear) + 10;
      }
      renderPicker();
    });

    /* Cell selection */
    $('#cpGrid').on('click', '.cp-cell', function (e) {
      e.stopPropagation();
      if (picker.mode === 'decade') {
        /* Picked a year → go to month mode */
        picker.viewYear = parseInt($(this).data('y'), 10);
        picker.mode = 'month';
        renderPicker();
      } else if (picker.mode === 'month') {
        var m = parseInt($(this).data('m'), 10);
        var y = picker.viewYear;
        if (state.view === 'month') {
          /* Navigate the calendar to the chosen month */
          state.cursor = new Date(y, m, 1);
          closePicker();
          render();
        } else {
          /* In week/day view: switch picker to day grid for chosen month */
          picker.viewYear  = y;
          picker.viewMonth = m;
          picker.mode = 'day';
          renderPicker();
        }
      }
    });

    /* Day cell selection (day mode) */
    $('#cpGrid').on('click', '.cp-day', function (e) {
      e.stopPropagation();
      var ds = $(this).data('date');
      if (!ds) return;
      var parts = ds.split('-');
      var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (state.view === 'week') {
        /* Navigate to the week that contains the clicked date */
        state.cursor = d;
      } else {
        /* Day view: navigate to exact day */
        state.cursor = d;
      }
      closePicker();
      render();
    });

    /* Footer button – jump to current period */
    $('#cpFooterBtn').on('click', function (e) {
      e.stopPropagation();
      state.cursor = new Date();
      closePicker();
      render();
    });

    /* Close picker when clicking outside */
    $(document).on('click.picker', function (e) {
      if (!$(e.target).closest('#calPicker').length &&
          !$(e.target).closest('.cal-icon').length) {
        if (picker.open) { closePicker(); }
      }
    });

    /* Reposition picker on window resize */
    $(window).on('resize.picker', function () {
      if (picker.open) { positionPicker(); }
    });
  }

  /* ──────────────────────────────────────────────────────────
     USER PROFILE DROPDOWN  (hierarchy-based)
  ────────────────────────────────────────────────────────── */

  var allUsers       = [];   /* fetched from /crm/v8/users?type=ActiveConfirmedUsers */
  var userMap        = {};   /* id → user object */
  var childrenMap    = {};   /* id → [childId, …] */
  var loggedInUserId = null; /* id of the logged-in user (root of hierarchy) */
  var expandedNodes  = {};   /* id → boolean (true = expanded) */
  var activeUserId   = null; /* currently selected user id */

  /** Populate userMap and childrenMap from allUsers */
  function buildUserMaps() {
    userMap     = {};
    childrenMap = {};
    allUsers.forEach(function (u) {
      userMap[u.id] = u;
    });
    allUsers.forEach(function (u) {
      var pid = u.reporting_to && u.reporting_to.id;
      if (pid) {
        if (!childrenMap[pid]) childrenMap[pid] = [];
        childrenMap[pid].push(u.id);
      }
    });
  }

  /** Return a set (plain object) of all descendant ids under rootId */
  function getSubtreeIds(rootId) {
    var ids   = {};
    var queue = (childrenMap[rootId] || []).slice();
    while (queue.length) {
      var cur = queue.shift();
      ids[cur] = true;
      (childrenMap[cur] || []).forEach(function (c) { queue.push(c); });
    }
    return ids;
  }

  /** Build the HTML string for a single user row */
  function buildUserRowHtml(user, depth) {
    var isActive    = user.id === activeUserId;
    var hasChildren = !!(childrenMap[user.id] && childrenMap[user.id].length);
    var isExpanded  = !!expandedNodes[user.id];
    var indent      = 16 + depth * 20;
    var roleName    = (user.role && user.role.name) ? user.role.name : '';

    var html =
      '<div class="ud-item' + (isActive ? ' ud-item-active' : '') +
      '" data-uid="' + escHtml(user.id) + '" style="padding-left:' + indent + 'px">' +
      '<div class="ud-item-avatar">' + escHtml(user.full_name.charAt(0).toUpperCase()) + '</div>' +
      '<div class="ud-item-info">' +
      '<div class="ud-item-name">'  + escHtml(user.full_name) + '</div>' +
      '<div class="ud-item-email">' + escHtml(user.email)     + '</div>' +
      (roleName ? '<div class="ud-item-role">' + escHtml(roleName) + '</div>' : '') +
      '</div>';

    if (hasChildren) {
      html +=
        '<button class="ud-expand-btn' + (isExpanded ? ' ud-expanded' : '') +
        '" data-expand-uid="' + escHtml(user.id) +
        '" title="' + (isExpanded ? 'Collapse' : 'Expand') + '">' +
        '<svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>' +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  /** Recursively build HTML for a node and its visible descendants */
  function buildNodeHtml(nodeId, depth) {
    var user = userMap[nodeId];
    if (!user) return '';
    var html     = buildUserRowHtml(user, depth);
    var children = childrenMap[nodeId] || [];
    /* Depth 0 = root: always show direct children.
       Depth ≥ 1: show children only when the parent node is expanded. */
    if (children.length && (depth === 0 || expandedNodes[nodeId])) {
      children.forEach(function (childId) {
        html += buildNodeHtml(childId, depth + 1);
      });
    }
    return html;
  }

  /** Render the user dropdown list, optionally filtered by a search query */
  function renderUserTree(filter) {
    var $list = $('#udList');

    if (!loggedInUserId || allUsers.length === 0) {
      $list.html('<div class="ud-empty">Loading users\u2026</div>');
      return;
    }

    var q = (filter || '').toLowerCase().trim();

    if (q) {
      /* Flat filtered view – only users within the logged-in user's subtree */
      var subtree = getSubtreeIds(loggedInUserId);
      subtree[loggedInUserId] = true;

      var matches = allUsers.filter(function (u) {
        if (!subtree[u.id]) return false;
        return u.full_name.toLowerCase().indexOf(q) !== -1 ||
               u.email.toLowerCase().indexOf(q)     !== -1;
      });

      if (matches.length === 0) {
        $list.html('<div class="ud-empty">No users found.</div>');
        return;
      }

      var flatHtml = '';
      matches.forEach(function (u) { flatHtml += buildUserRowHtml(u, 0); });
      $list.html(flatHtml);
      return;
    }

    /* Tree view rooted at the logged-in user */
    if (!userMap[loggedInUserId]) {
      $list.html('<div class="ud-empty">User not found.</div>');
      return;
    }
    $list.html(buildNodeHtml(loggedInUserId, 0));
  }

  function openUserDropdown() {
    var $btn = $('#userProfile');
    var $dd  = $('#userDropdown');
    renderUserTree('');
    $('#udSearch').val('');

    /* Position below the button */
    var off  = $btn.offset();
    var btnH = $btn.outerHeight();
    $dd.css({ top: off.top + btnH + 6, left: off.left });

    $dd.addClass('ud-open');
    $btn.attr('aria-expanded', 'true');
    setTimeout(function () { $('#udSearch').focus(); }, 60);
  }

  function closeUserDropdown() {
    $('#userDropdown').removeClass('ud-open');
    $('#userProfile').attr('aria-expanded', 'false');
  }

  function initUserDropdown() {
    /* Toggle on button click */
    $('#userProfile').on('click', function (e) {
      e.stopPropagation();
      if ($('#userDropdown').hasClass('ud-open')) {
        closeUserDropdown();
      } else {
        openUserDropdown();
      }
    });

    /* Live search */
    $(document).on('input', '#udSearch', function () {
      renderUserTree($(this).val());
    });

    /* Select a user */
    $(document).on('click', '.ud-item', function (e) {
      if ($(e.target).closest('.ud-expand-btn').length) return;
      var userId = $(this).data('uid');
      var user   = userMap[userId];
      if (!user) return;
      activeUserId = userId;
      $('.user-name').text(user.full_name);
      closeUserDropdown();
    });

    /* Toggle node expand / collapse */
    $(document).on('click', '.ud-expand-btn', function (e) {
      e.stopPropagation();
      var nodeId = $(this).data('expand-uid');
      expandedNodes[nodeId] = !expandedNodes[nodeId];
      renderUserTree($('#udSearch').val());
    });

    /* Close when clicking outside */
    $(document).on('click.udropdown', function (e) {
      if (!$(e.target).closest('#userDropdown').length &&
          !$(e.target).closest('#userProfile').length) {
        closeUserDropdown();
      }
    });

    /* Reposition on resize */
    $(window).on('resize.udropdown', function () {
      if ($('#userDropdown').hasClass('ud-open')) {
        var off  = $('#userProfile').offset();
        var btnH = $('#userProfile').outerHeight();
        $('#userDropdown').css({ top: off.top + btnH + 6, left: off.left });
      }
    });
  }

  /* ──────────────────────────────────────────────────────────
     MEETINGS-FOR MULTI-SELECT DROPDOWN
  ────────────────────────────────────────────────────────── */

  /**
   * MF_MODULES holds the CRM module list fetched via GET /crm/v8/settings/modules.
   * Each entry: { id: <api_name>, name: <display_label> }
   */
  var MF_MODULES  = [];
  var mfSelected  = []; /* api_names of currently confirmed selections */
  var mfSnapshot  = []; /* snapshot of mfSelected taken when dropdown opens (used by Cancel) */

  /* ── Chip colors: { [apiName]: '#rrggbb' } – persisted in localStorage ── */
  var mfColors = (function () {
    try { return JSON.parse(localStorage.getItem('zcrm_mf_colors') || '{}'); }
    catch (e) { return {}; }
  }());

  function saveMfColors() {
    try { localStorage.setItem('zcrm_mf_colors', JSON.stringify(mfColors)); }
    catch (e) { /* ignore */ }
  }

  /* Default palette – cycles when a new module is first assigned a color */
  var MCP_DEFAULT_PALETTE = [
    '#1565C0', '#2E7D32', '#E65100', '#C62828',
    '#6A1B9A', '#00838F', '#F57F17', '#AD1457',
    '#558B2F', '#4527A0', '#00695C', '#37474F'
  ];

  function chipColorFor(apiName) {
    if (!mfColors[apiName]) {
      var idx = Object.keys(mfColors).length % MCP_DEFAULT_PALETTE.length;
      mfColors[apiName] = MCP_DEFAULT_PALETTE[idx];
      saveMfColors();
    }
    return mfColors[apiName];
  }

  /**
   * Populate MF_MODULES from the GET /crm/v8/settings/modules response and
   * re-render the chip strip to reflect any now-resolved names.
   * Rules:
   *  - Only include modules whose generated_type is "custom" or "default".
   *  - Exclude modules with status "user_hidden" (integrated / hidden modules).
   *  - For "default" modules, exclude a fixed set of non-CRM / utility modules.
   *  - Deduplicate by plural_label (removes duplicate integrated-module entries).
   */
  function populateMfModules(response) {
    var modules = (response && response.data && response.data.modules) ? response.data.modules : [];

    /* Module names (lower-cased) to exclude from generated_type === "default" */
    var EXCLUDED_DEFAULT = [
      'home', 'workqueue', 'salesinbox', 'feeds', 'social', 'visits',
      'forecasts', 'documents', 'analytics', 'reports', 'calls', 'meetings',
      'tasks', 'activities', 'expense items', 'estimates',
      'notes', 'attachments', 'emails'
    ];

    /* api_name values that must be excluded (duplicate / integrated versions) */
    var EXCLUDED_API_NAMES = ['CustomModule5001', 'CustomModule5004', 'CustomModule5003'];

    /* For Invoices / Sales Orders / Purchase Orders, only the native api_name is allowed.
       Keys are the plural_label in lower-case; values are the expected native api_name. */
    var ALLOWED_API_NAMES = {
      'invoices':       'Invoices',
      'sales orders':   'Sales_Orders',
      'purchase orders':'Purchase_Orders'
    };

    var seenLabels = {};
    var filtered   = [];

    modules.forEach(function (m) {
      var genType     = m.generated_type || '';
      var status      = m.status         || '';
      var pluralLabel = (m.plural_label  || m.display_label || m.module_name || m.api_name || '').trim();
      var apiName     = (m.api_name      || '').trim();

      /* Only custom or default modules */
      if (genType !== 'custom' && genType !== 'default') { return; }

      /* Skip hidden / integrated modules */
      if (status === 'user_hidden') { return; }

      /* Skip explicitly excluded api_names (integrated / duplicate versions) */
      if (EXCLUDED_API_NAMES.indexOf(apiName) !== -1) { return; }

      /* For default modules, apply the exclusion list */
      if (genType === 'default') {
        var labelLow = pluralLabel.toLowerCase();
        var apiLow   = apiName.toLowerCase();
        if (EXCLUDED_DEFAULT.indexOf(labelLow) !== -1 ||
            EXCLUDED_DEFAULT.indexOf(apiLow)   !== -1) { return; }
      }

      /* For Invoices, Sales Orders, Purchase Orders: only allow the native api_name */
      var labelKey = pluralLabel.toLowerCase();
      if (ALLOWED_API_NAMES.hasOwnProperty(labelKey)) {
        if (apiName !== ALLOWED_API_NAMES[labelKey]) { return; }
      }

      /* Deduplicate by plural_label */
      if (!pluralLabel || seenLabels[pluralLabel]) { return; }
      seenLabels[pluralLabel] = true;

      filtered.push({
        id:   apiName || m.module_name || String(m.id),
        name: pluralLabel
      });
    });

    MF_MODULES = filtered;
    renderMfChips();
    if ($('#mfSelect').hasClass('mf-open')) { renderMfList(); }
  }

  function renderMfChips() {
    var $wrap = $('#mfChipsWrap');
    var $sel  = $('#mfSelect');
    var html  = '';
    mfSelected.forEach(function (id) {
      var m     = MF_MODULES.find(function (x) { return x.id === id; });
      var label = m ? m.name : id;
      var color = chipColorFor(id);
      html += '<span class="mf-chip" data-uid="' + escHtml(id) + '" data-color="' + escHtml(color) + '">' +
              '<span class="mf-chip-dot" data-uid="' + escHtml(id) + '" ' +
                'style="background:' + escHtml(color) + '" ' +
                'title="Change color" role="button" aria-label="Change color for ' + escHtml(label) + '"></span>' +
              '<span class="mf-chip-text">' + escHtml(label) + '</span>' +
              '<span class="mf-chip-remove" data-uid="' + escHtml(id) + '" role="button" ' +
                'aria-label="Remove ' + escHtml(label) + '" title="Remove">&#215;</span>' +
              '</span>';
    });
    $wrap.html(html);
    if (mfSelected.length > 0 || $sel.hasClass('mf-open')) {
      $sel.addClass('mf-active');
    } else {
      $sel.removeClass('mf-active');
    }
  }

  function renderMfList() {
    var html  = '';
    var query = (($('#mfSearch').val() || '')).toLowerCase().trim();

    var visible = query
      ? MF_MODULES.filter(function (m) { return m.name.toLowerCase().indexOf(query) !== -1; })
      : MF_MODULES;

    if (MF_MODULES.length === 0) {
      html = '<div style="padding:12px 14px;font-size:12px;color:var(--text-muted)">Loading modules…</div>';
    } else if (visible.length === 0) {
      html = '<div style="padding:12px 14px;font-size:12px;color:var(--text-muted)">No modules found.</div>';
    } else {
      visible.forEach(function (m) {
        var checked = mfSelected.indexOf(m.id) !== -1;
        html += '<div class="mf-item' + (checked ? ' mf-item-checked' : '') + '" ' +
                'data-uid="' + escHtml(m.id) + '" role="option" aria-selected="' + checked + '">' +
                '<span class="mf-checkbox">' +
                '<svg class="mf-checkbox-tick" viewBox="0 0 10 8" fill="none" stroke="#fff" ' +
                     'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<polyline points="1,4 4,7 9,1"/>' +
                '</svg></span>' +
                '<span class="mf-item-text">' +
                '<span class="mf-item-name">' + escHtml(m.name) + '</span>' +
                '</span></div>';
      });
    }
    $('#mfList').html(html);
  }

  function positionMfDropdown() {
    var $sel  = $('#mfSelect');
    var $dd   = $('#mfDropdown');
    var off   = $sel.offset();
    var selH  = $sel.outerHeight();
    var ddW   = Math.max($sel.outerWidth(), 280);
    var vpW   = $(window).width();
    var left  = off.left;
    if (left + ddW > vpW - 8) { left = vpW - ddW - 8; }
    if (left < 8) { left = 8; }
    $dd.css({ top: off.top + selH + 4, left: left, width: ddW });
  }

  function openMf() {
    var $sel = $('#mfSelect');
    mfSnapshot = mfSelected.slice(); /* save state for Cancel */
    renderMfList();
    positionMfDropdown();
    $('#mfDropdown').addClass('mf-dd-open');
    $sel.addClass('mf-open mf-active');
    $sel.attr('aria-expanded', 'true');
    setTimeout(function () { $('#mfSearch').focus(); }, 50);
  }

  function closeMf() {
    var $sel = $('#mfSelect');
    $sel.removeClass('mf-open');
    if (mfSelected.length === 0) { $sel.removeClass('mf-active'); }
    $sel.attr('aria-expanded', 'false');
    $('#mfDropdown').removeClass('mf-dd-open');
    $('#mfSearch').val('');
  }

  function initMf() {
    /* Toggle on click of the trigger box (ignore clicks on chip × and chip dot) */
    $(document).on('click', '#mfSelect', function (e) {
      if ($(e.target).closest('.mf-chip-remove').length) return;
      if ($(e.target).closest('.mf-chip-dot').length) return;
      e.stopPropagation();
      if ($(this).hasClass('mf-open')) { closeMf(); } else {
        $('#styleBar').hide();
        $('#legendBar').hide();
        openMf();
      }
    });

    /* Keyboard: Enter / Space open|close; Escape closes */
    $(document).on('keydown', '#mfSelect', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if ($(this).hasClass('mf-open')) { closeMf(); } else { openMf(); }
      } else if (e.key === 'Escape') {
        closeMf();
      }
    });

    /* Remove individual chip via × button */
    $(document).on('click', '.mf-chip-remove', function (e) {
      e.stopPropagation();
      var id = $(this).data('uid');
      mfSelected = mfSelected.filter(function (x) { return x !== id; });
      renderMfChips();
      if ($('#mfSelect').hasClass('mf-open')) { renderMfList(); }
    });

    /* Toggle item in dropdown */
    $(document).on('click', '.mf-item', function (e) {
      e.stopPropagation();
      var id  = $(this).data('uid');
      var idx = mfSelected.indexOf(id);
      if (idx === -1) { mfSelected.push(id); } else { mfSelected.splice(idx, 1); }
      renderMfChips();
      renderMfList();
    });

    /* Select All – selects all modules currently visible in the filtered list */
    $(document).on('click', '#mfSelectAll', function (e) {
      e.stopPropagation();
      var query = ($('#mfSearch').val() || '').toLowerCase().trim();
      var visibleIds = query
        ? MF_MODULES.filter(function (m) { return m.name.toLowerCase().indexOf(query) !== -1; }).map(function (m) { return m.id; })
        : MF_MODULES.map(function (m) { return m.id; });
      visibleIds.forEach(function (id) {
        if (mfSelected.indexOf(id) === -1) { mfSelected.push(id); }
      });
      renderMfChips();
      renderMfList();
    });

    /* Clear All */
    $(document).on('click', '#mfClearAll', function (e) {
      e.stopPropagation();
      mfSelected = [];
      renderMfChips();
      renderMfList();
    });

    /* Done – confirm current selections, sync CRM picklist field, then close */
    $('#mfDone').on('click', async function () {

      closeMf();

      const selectedValues = $('#mfChipsWrap .mf-chip')
        .map(function () {
          return {
            label:   $(this).find('.mf-chip-text').text().trim(),
            apiName: $(this).data('uid') || '',
            color:   $(this).data('color') || chipColorFor($(this).data('uid') || '')
          };
        })
        .get()
        .filter(function (v) { return v.label && v.apiName; });

      try {
        await syncMeetingsFor(selectedValues);
      } catch (err) {
        console.error('Failed to sync Meetings For field:', err);
      }

      $styleBar.show();

    });

    /* Cancel – restore selections to the state captured when the dropdown was opened */
    $(document).on('click', '#mfCancel', function (e) {
      e.stopPropagation();
      mfSelected = mfSnapshot.slice();
      renderMfChips();
      renderMfList();
      closeMf();
    });

    /* Search input – filter the list in real time; prevent dropdown from closing */
    $(document).on('input', '#mfSearch', function (e) {
      e.stopPropagation();
      renderMfList();
    });
    $(document).on('click keydown', '#mfSearch', function (e) {
      e.stopPropagation();
    });

    /* Close when clicking outside */
    $(document).on('click.mf', function (e) {
      if (!$(e.target).closest('#mfDropdown').length &&
          !$(e.target).closest('#mfSelect').length &&
          !$(e.target).closest('#mfChipColorPicker').length) {
        closeMf();
      }
    });

    /* Reposition on resize */
    $(window).on('resize.mf', function () {
      if ($('#mfSelect').hasClass('mf-open')) { positionMfDropdown(); }
    });

    /* Initialise the chip color picker */
    initChipColorPicker();
  }

  /* ──────────────────────────────────────────────────────────
     CHIP COLOR PICKER
  ────────────────────────────────────────────────────────── */

  /**
   * Full HSV color picker for individual .mf-chip dots.
   * Opens anchored to the dot that was clicked and writes back
   * to mfColors[apiName], then re-renders the chip.
   */
  function initChipColorPicker() {

    var MCP_PRESETS = [
      '#1565C0', '#2E7D32', '#E65100', '#C62828',
      '#6A1B9A', '#00838F', '#F57F17', '#AD1457',
      '#558B2F', '#4527A0', '#00695C', '#37474F'
    ];

    /* ── Internal state ── */
    var mcp = {
      open:    false,
      apiName: null,
      h: 220, s: 80, v: 78,   /* current HSV */
      dragging: false
    };

    /* ── Colour math helpers ── */
    function hsvToRgb(h, s, v) {
      s /= 100; v /= 100;
      var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
      var r, g, b;
      if (h < 60)       { r = c; g = x; b = 0; }
      else if (h < 120) { r = x; g = c; b = 0; }
      else if (h < 180) { r = 0; g = c; b = x; }
      else if (h < 240) { r = 0; g = x; b = c; }
      else if (h < 300) { r = x; g = 0; b = c; }
      else              { r = c; g = 0; b = x; }
      return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    function rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      var h = 0, s = max === 0 ? 0 : d / max, v = max;
      if (d !== 0) {
        if (max === r)      h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else                h = (r - g) / d + 4;
        h *= 60;
      }
      return [h, s * 100, v * 100];
    }

    function hexToRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
      if (hex.length !== 6) return null;
      var n = parseInt(hex, 16);
      if (isNaN(n)) return null;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function rgbToHex(r, g, b) {
      return '#' + [r, g, b].map(function (val) {
        return Math.max(0, Math.min(255, Math.round(val))).toString(16).padStart(2, '0');
      }).join('');
    }

    /* ── Canvas ── */
    function drawCanvas() {
      var canvas = document.getElementById('mcpCanvas');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      var rgb = hsvToRgb(mcp.h, 100, 100);
      var hGrad = ctx.createLinearGradient(0, 0, w, 0);
      hGrad.addColorStop(0, 'rgba(255,255,255,1)');
      hGrad.addColorStop(1, 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')');
      ctx.fillStyle = hGrad;
      ctx.fillRect(0, 0, w, h);
      var vGrad = ctx.createLinearGradient(0, 0, 0, h);
      vGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vGrad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, w, h);
    }

    function updatePointer() {
      var $canvas = $('#mcpCanvas');
      var $ptr    = $('#mcpPointer');
      if (!$canvas.length) return;
      var w = $canvas.outerWidth();
      var h = $canvas.outerHeight();
      $ptr.css({ left: (mcp.s / 100) * w, top: (1 - mcp.v / 100) * h });
    }

    function updatePreview() {
      var rgb = hsvToRgb(mcp.h, mcp.s, mcp.v);
      var hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
      $('#mcpPreview').css('background', hex);
      $('#mcpHueSlider').val(mcp.h);

      if ($('#mcpHexRow').is(':hidden')) {
        $('#mcpR').val(rgb[0]);
        $('#mcpG').val(rgb[1]);
        $('#mcpB').val(rgb[2]);
      } else {
        $('#mcpHex').val(hex);
      }

      $('#mcpPresets .mcp-preset-dot').each(function () {
        $(this).toggleClass('mcp-preset-active', $(this).data('color') === hex);
      });
    }

    function commitColor() {
      var rgb = hsvToRgb(mcp.h, mcp.s, mcp.v);
      var hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
      if (mcp.apiName) {
        mfColors[mcp.apiName] = hex;
        saveMfColors();
        var $chip = $('.mf-chip[data-uid="' + mcp.apiName + '"]');
        $chip.attr('data-color', hex).data('color', hex);
        /* Use native DOM to guarantee the inline background is refreshed —
           jQuery's .css('background', …) may normalise the shorthand in ways
           that browsers don't consistently reflect as a visual repaint. */
        $chip.find('.mf-chip-dot').each(function () {
          this.style.background = hex;
        });
      }
    }

    /* ── Canvas interaction ── */
    function canvasPickAt(offsetX, offsetY) {
      var $canvas = $('#mcpCanvas');
      var w = $canvas.outerWidth(), h = $canvas.outerHeight();
      mcp.s = Math.max(0, Math.min(100, (offsetX / w) * 100));
      mcp.v = Math.max(0, Math.min(100, (1 - offsetY / h) * 100));
      updatePointer();
      updatePreview();
      commitColor();
    }

    $(document).on('mousedown.mcp', '#mcpCanvas', function (e) {
      mcp.dragging = true;
      var rect = this.getBoundingClientRect();
      canvasPickAt(e.clientX - rect.left, e.clientY - rect.top);
      e.preventDefault();
    });

    $(document).on('mousemove.mcp', function (e) {
      if (!mcp.dragging) return;
      var canvas = document.getElementById('mcpCanvas');
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      canvasPickAt(
        Math.max(0, Math.min(rect.width,  e.clientX - rect.left)),
        Math.max(0, Math.min(rect.height, e.clientY - rect.top))
      );
    });

    $(document).on('mouseup.mcp', function () { mcp.dragging = false; });

    /* Touch support */
    $(document).on('touchstart.mcp', '#mcpCanvas', function (e) {
      mcp.dragging = true;
      var rect = this.getBoundingClientRect();
      var t = e.originalEvent.touches[0];
      canvasPickAt(t.clientX - rect.left, t.clientY - rect.top);
      e.preventDefault();
    });
    $(document).on('touchmove.mcp', function (e) {
      if (!mcp.dragging) return;
      var canvas = document.getElementById('mcpCanvas');
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var t = e.originalEvent.touches[0];
      canvasPickAt(
        Math.max(0, Math.min(rect.width,  t.clientX - rect.left)),
        Math.max(0, Math.min(rect.height, t.clientY - rect.top))
      );
    });
    $(document).on('touchend.mcp', function () { mcp.dragging = false; });

    /* ── Hue slider ── */
    $(document).on('input.mcp', '#mcpHueSlider', function () {
      mcp.h = parseFloat($(this).val()) || 0;
      drawCanvas();
      updatePointer();
      updatePreview();
      commitColor();
    });

    /* ── RGB inputs ── */
    $(document).on('change.mcp input.mcp', '#mcpR, #mcpG, #mcpB', function () {
      var r = parseInt($('#mcpR').val(), 10) || 0;
      var g = parseInt($('#mcpG').val(), 10) || 0;
      var b = parseInt($('#mcpB').val(), 10) || 0;
      var hsv = rgbToHsv(r, g, b);
      mcp.h = hsv[0]; mcp.s = hsv[1]; mcp.v = hsv[2];
      $('#mcpHueSlider').val(mcp.h);
      drawCanvas();
      updatePointer();
      $('#mcpPreview').css('background', rgbToHex(r, g, b));
      commitColor();
    });

    /* ── HEX input ── */
    $(document).on('change.mcp', '#mcpHex', function () {
      var rgb = hexToRgb($(this).val().trim());
      if (!rgb) return;
      var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      mcp.h = hsv[0]; mcp.s = hsv[1]; mcp.v = hsv[2];
      $('#mcpHueSlider').val(mcp.h);
      drawCanvas();
      updatePointer();
      updatePreview();
      commitColor();
    });

    /* ── Mode toggle (RGB ↔ HEX) ── */
    $(document).on('click.mcp', '#mcpModeBtn, #mcpModeBtnHex', function (e) {
      e.stopPropagation();
      var $rgb = $('#mcpR').closest('.mcp-rgb-row');
      var $hex = $('#mcpHexRow');
      $rgb.toggle(); $hex.toggle();
      updatePreview();
    });

    /* ── Preset dots ── */
    function buildPresets() {
      var html = '';
      MCP_PRESETS.forEach(function (c) {
        html += '<span class="mcp-preset-dot" data-color="' + escHtml(c) + '" ' +
                'style="background:' + escHtml(c) + '" title="' + escHtml(c) + '"></span>';
      });
      $('#mcpPresets').html(html);
    }

    $(document).on('click.mcp', '.mcp-preset-dot', function (e) {
      e.stopPropagation();
      var hex = $(this).data('color');
      var rgb = hexToRgb(hex);
      if (!rgb) return;
      var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      mcp.h = hsv[0]; mcp.s = hsv[1]; mcp.v = hsv[2];
      $('#mcpHueSlider').val(mcp.h);
      drawCanvas();
      updatePointer();
      updatePreview();
      commitColor();
    });

    /* ── Eyedropper (EyeDropper API where supported) ── */
    $(document).on('click.mcp', '#mcpEyedrop', function (e) {
      e.stopPropagation();
      if (!window.EyeDropper) { return; }
      var eyedropper = new window.EyeDropper();
      eyedropper.open().then(function (result) {
        var rgb = hexToRgb(result.sRGBHex);
        if (!rgb) return;
        var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        mcp.h = hsv[0]; mcp.s = hsv[1]; mcp.v = hsv[2];
        $('#mcpHueSlider').val(mcp.h);
        drawCanvas();
        updatePointer();
        updatePreview();
        commitColor();
      }).catch(function () { /* user cancelled */ });
    });

    /* ── Open / close ── */
    function openChipColorPicker(dotEl, apiName) {
      mcp.apiName = apiName;

      var hex = chipColorFor(apiName);
      var rgb = hexToRgb(hex) || [21, 101, 192];
      var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      mcp.h = hsv[0]; mcp.s = hsv[1]; mcp.v = hsv[2];

      buildPresets();

      var $panel = $('#mfChipColorPicker');
      $panel.addClass('mcp-open');
      mcp.open = true;

      /* Reset to RGB mode */
      $('#mcpR').closest('.mcp-rgb-row').show();
      $('#mcpHexRow').hide();

      setTimeout(function () {
        drawCanvas();
        updatePointer();
        updatePreview();
        positionMcpPanel(dotEl);
      }, 10);
    }

    function closeChipColorPicker() {
      $('#mfChipColorPicker').removeClass('mcp-open');
      mcp.open = false;
      mcp.apiName = null;
    }

    function positionMcpPanel(dotEl) {
      var $panel = $('#mfChipColorPicker');
      var $dot   = $(dotEl);
      var off    = $dot.offset();
      var dH     = $dot.outerHeight(true);
      var pW     = $panel.outerWidth();
      var pH     = $panel.outerHeight();
      var vpW    = $(window).width();
      var vpH    = $(window).height();
      var left   = off.left;
      var top    = off.top + dH + 4;
      if (left + pW > vpW - 8) left = vpW - pW - 8;
      if (left < 8) left = 8;
      if (top + pH > vpH - 8) top = off.top - pH - 4;
      $panel.css({ top: top, left: left });
    }

    /* ── Chip dot click → open picker ── */
    $(document).on('click.mcp', '.mf-chip-dot', function (e) {
      e.stopPropagation();
      var id = $(this).data('uid');
      if (mcp.open && mcp.apiName === id) {
        closeChipColorPicker();
      } else {
        openChipColorPicker(this, id);
      }
    });

    /* ── Close on outside click ── */
    $(document).on('click.mcpOutside', function (e) {
      if (mcp.open &&
          !$(e.target).closest('#mfChipColorPicker').length &&
          !$(e.target).hasClass('mf-chip-dot')) {
        closeChipColorPicker();
      }
    });

    /* ── Close on Escape ── */
    $(document).on('keydown.mcpEsc', function (e) {
      if (e.key === 'Escape' && mcp.open) { closeChipColorPicker(); }
    });

  } /* end initChipColorPicker */

  /* ──────────────────────────────────────────────────────────
     MEETINGS-FOR CRM FIELD SYNC
  ────────────────────────────────────────────────────────── */

  /**
   * Syncs the "Meetings For" picklist (single-select) and lookup field in the
   * beatplanner__Daily_Beat_Plans module to reflect the given selectedValues.
   * Reuses an existing unused lookup field if available; otherwise creates one.
   */
  async function syncMeetingsFor(selectedValues) {

    const moduleAPI  = 'beatplanner__Daily_Beat_Plans';
    const SECTION_NAME = 'Daily Beat Plans Information';

    try {

      // ======================================================
      // 1. GET LAYOUTS
      // ======================================================

      const layoutsResp = await zrc.get(
        `/crm/v8/settings/layouts?module=${moduleAPI}`
      );

      const layouts = layoutsResp?.data?.layouts || [];

      const layout = layouts.find(l =>
        (l.sections || []).some(sec =>
          sec.display_label === SECTION_NAME ||
          sec.name === SECTION_NAME
        )
      );

      if (!layout) {
        throw new Error('Layout not found');
      }

      const section = layout.sections.find(sec =>
        sec.display_label === SECTION_NAME ||
        sec.name === SECTION_NAME
      );

      const layoutId  = layout.id;
      const sectionId = section.id;

      // ======================================================
      // 2. GET ALL FIELDS (including unused)
      // ======================================================

      const fieldsResp = await zrc.get(
        `/crm/v8/settings/fields?module=${moduleAPI}&type=all`
      );

      let fields = fieldsResp?.data?.fields || [];

      // ======================================================
      // 3. FIND OR CREATE PICKLIST FIELD
      // ======================================================

      const findPicklistField = (fieldList) => {
        // Strict match: label + picklist data_type
        const strict = fieldList.find(f => {
          const labelMatch = (f.field_label || '').toLowerCase() === 'meetings for' ||
            (f.api_name  || '').toLowerCase().includes('meetings_for');
          const typeMatch  = f.data_type === 'picklist' || f.data_type === 'pick_list';
          return labelMatch && typeMatch;
        });
        if (strict) return strict;
        // Fallback: label only (handles unexpected data_type values returned by the CRM)
        return fieldList.find(f =>
          (f.field_label || '').toLowerCase() === 'meetings for' ||
          (f.api_name  || '').toLowerCase().includes('meetings_for')
        );
      };

      let picklistField = findPicklistField(fields);

      if (!picklistField) {
        // Field doesn't exist yet – create it with the current chip values as seed options
        try {
          await zrc.post(
            `/crm/v8/settings/fields?module=${moduleAPI}`,
            {
              fields: [
                {
                  field_label: 'Meetings For',
                  data_type:   'picklist',
                  pick_list_values: selectedValues.map((chip, idx) => ({
                    display_value:   chip.label,
                    actual_value:    chip.label,
                    sequence_number: idx + 1
                  }))
                }
              ]
            }
          );
        } catch (createErr) {
          // If the field already exists on the server but wasn't found above (e.g. the
          // CRM returned an unexpected data_type), treat DUPLICATE_DATA as a soft error
          // and fall through to the refresh + locate step below.
          const isDuplicate =
            createErr?.response?.data?.fields?.[0]?.code === 'DUPLICATE_DATA' ||
            String(createErr?.message || '').includes('DUPLICATE_DATA');
          if (!isDuplicate) throw createErr;
        }

        const refreshResp = await zrc.get(
          `/crm/v8/settings/fields?module=${moduleAPI}&type=all`
        );
        fields = refreshResp?.data?.fields || [];

        picklistField = findPicklistField(fields);

        if (!picklistField) {
          throw new Error('"Meetings For" picklist field could not be created');
        }
      }

      // ======================================================
      // 4. ENABLE COLOUR CODING ON THE FIELD (if not already on)
      //    then BUILD PICKLIST VALUES (preserve existing IDs)
      // ======================================================

      // If colour coding is not yet enabled on the field, enable it now so
      // that colour_code values sent in the layout PATCH are accepted by the API.
      if (!picklistField.enable_colour_code) {
        try {
          await zrc.patch(
            `/crm/v8/settings/fields?module=${moduleAPI}`,
            {
              fields: [{
                id:                   picklistField.id,
                enable_colour_code:   true
              }]
            }
          );
          picklistField = { ...picklistField, enable_colour_code: true };
        } catch (e) {
          console.warn('Could not enable colour coding on Meetings For field:', e);
        }
      }

      const existingOptions = picklistField.pick_list_values || [];

      const pickListValues = selectedValues.map((chip, idx) => {

        const existing = existingOptions.find(o =>
          o.display_value === chip.label || o.actual_value === chip.label
        );

        const colourCode = chip.color || null;

        const base = existing
          ? { id: existing.id, display_value: existing.display_value, actual_value: existing.actual_value, sequence_number: existing.sequence_number ?? idx + 1 }
          : { display_value: chip.label, actual_value: chip.label, sequence_number: idx + 1 };

        // Always include colour_code when available – the field now has
        // enable_colour_code: true (either it already did, or we just enabled it above).
        return colourCode ? { ...base, colour_code: colourCode } : base;

      });

      // ======================================================
      // 5. PROCESS ONE LOOKUP FIELD PER CHIP VALUE
      //    Priority: existing active match → reuse unused → create new
      // ======================================================

      // Pool of available unused lookup fields, keyed by their existing lookup module api_name
      const unusedLookupPool = fields.filter(f =>
        f.data_type === 'lookup' &&
        f.type      === 'unused'
      );

      const lookupFields = []; // { id, label }

      for (const chip of selectedValues) {

        // 1) Is there already an active lookup field with this exact label?
        let lookupField = fields.find(f =>
          f.data_type   === 'lookup' &&
          f.field_label === chip.label
        );

        if (!lookupField) {

          // 2) Reuse an unused field only if its lookup module already matches this chip
          const unusedMatchIdx = unusedLookupPool.findIndex(f =>
            (f.lookup?.module?.api_name || f.lookup?.module?.module || '') === chip.apiName
          );

          if (unusedMatchIdx !== -1) {

            lookupField = unusedLookupPool.splice(unusedMatchIdx, 1)[0];

          } else {

            // 3) No matching reusable field – create a new one
            const existingIds = new Set(fields.map(f => f.id));

            await zrc.post(
              `/crm/v8/settings/fields?module=${moduleAPI}`,
              {
                fields: [
                  {
                    field_label: chip.label,
                    data_type:   'lookup',
                    lookup: {
                      display_label:      chip.label,
                      related_list_label: 'Daily Beat Plans',
                      module: {
                        api_name: chip.apiName
                      }
                    }
                  }
                ]
              }
            );

            const refresh = await zrc.get(
              `/crm/v8/settings/fields?module=${moduleAPI}&type=all`
            );

            fields = refresh?.data?.fields || [];

            // Find the newly created field by ID (most reliable – avoids label mismatch)
            lookupField = fields.find(f =>
              f.data_type === 'lookup' &&
              !existingIds.has(f.id)
            );

            // Fallback: match by label if ID diff yields nothing
            if (!lookupField) {
              lookupField = fields.find(f =>
                f.field_label === chip.label &&
                f.data_type   === 'lookup'
              );
            }

          }

        }

        if (!lookupField) {
          throw new Error(`Could not obtain lookup field for chip: ${chip.label}`);
        }

        lookupFields.push({ id: lookupField.id, label: chip.label });

      }

      // ======================================================
      // 6. DETERMINE WHICH SECTION LOOKUP FIELDS TO MOVE TO UNUSED
      //    Keep: Owner, beatplanner__Month, Meetings For picklist,
      //          and all newly assigned chip lookup fields
      // ======================================================

      const keepLabels = new Set([
        'Owner',
        'beatplanner__Month',
        'Month',
        'Meetings For',
        ...selectedValues.map(chip => chip.label)
      ]);

      // Guard by api_name as well (field_label may differ from api_name)
      const keepApiNames = new Set([
        'beatplanner__Month'
      ]);

      const keepIds = new Set([
        picklistField.id,
        ...lookupFields.map(lf => lf.id)
      ]);

      const unusedPayload = (section.fields || [])
        .filter(f =>
          f.data_type === 'lookup' &&
          !keepLabels.has(f.field_label) &&
          !keepApiNames.has(f.api_name) &&
          !keepIds.has(f.id)
        )
        .map(f => ({
          id: f.id,
          api_name: f.api_name,
          _delete: { permanent: false }
        }));

      // ======================================================
      // 7. BUILD SINGLE PATCH PAYLOAD
      // ======================================================

      const payload = {
        layouts: [
          {
            id: layoutId,
            sections: [
              {
                id: sectionId,
                fields: [
                  {
                    id: picklistField.id,
                    pick_list_values: pickListValues
                  },
                  ...lookupFields.map(lf => ({ id: lf.id })),
                  ...unusedPayload
                ]
              }
            ]
          }
        ]
      };

      console.log('FINAL PAYLOAD:', JSON.stringify(payload, null, 2));

      // ======================================================
      // 8. APPLY LAYOUT UPDATE
      // ======================================================

      const updateResp = await zrc.patch(
        `/crm/v8/settings/layouts/${layoutId}?module=${moduleAPI}`,
        payload
      );

      return {
        success:  true,
        response: updateResp
      };

    } catch (error) {

      console.error('Sync failed:', error);

      return {
        success: false,
        error
      };

    }

  }

  function init() {
    /* Restore theme */
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem('zcrm_cal_theme') || 'light'; } catch (e) { /* ignore */ }
    setTheme(savedTheme);

    /* Seed sample events for first-time visitors */
    seedSampleEvents();

    /* On mobile, start in week view */
    enforceMobileView();

    /* Calendar month/year picker */
    initPicker();

    /* User profile dropdown */
    initUserDropdown();

    /* Meetings-for multi-select */
    initMf();

    /* Navigation */
    dom.btnPrev.on('click',  function () { navigate(-1); });
    dom.btnNext.on('click',  function () { navigate(1); });
    dom.btnToday.on('click', goToday);

    /* View tabs – on mobile week view is always enforced */
    dom.viewTabs.on('click', function () {
      if (isMobile()) return;
      state.view = $(this).data('view');
      updateViewTab(state.view);
      render();
    });

    /* Theme toggle – cycles light → dark → night → light */
    dom.themeToggle.on('click', function () {
      var themes = ['light', 'dark', 'night'];
      var idx = themes.indexOf(state.theme);
      setTheme(themes[(idx + 1) % themes.length]);
    });

    /* Modal controls */
    dom.modalClose.on('click',  closeModal);
    dom.modalCancel.on('click', closeModal);
    dom.modalSave.on('click',   saveModal);
    dom.modal.on('click', function (e) {
      if (e.target === this) closeModal();
    });

    /* Enter key in title field → save */
    dom.fTitle.on('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); saveModal(); }
    });

    /* Color picker */
    attachColorPicker();

    /* Popup controls */
    dom.paClose.on('click',  closePopup);

    /* Day events popup controls */
    dom.depClose.on('click', closeDayEventsPopup);
    dom.dayEventsPopup.on('click', '.dep-item', function (e) {
      var evid = $(this).data('evid');
      closeDayEventsPopup();
      showPopup(evid, e);
    });

    dom.paCopy.on('click',   function () {
      if (state.activePopup) { doCopy(state.activePopup); closePopup(); }
    });
    dom.paEdit.on('click',   function () {
      var ev = findEvent(state.activePopup);
      if (ev) { closePopup(); openModal(ev.date, ev.startTime, ev.endTime, ev); }
    });
    dom.paDelete.on('click', function () {
      var evid = state.activePopup;
      if (evid && window.confirm('Delete this event?')) { deleteEvent(evid); }
    });

    /* Close popup when clicking outside */
    $(document).on('click', function (e) {
      if (!$(e.target).closest('#evtPopup').length &&
          !$(e.target).closest('.evt-chip').length &&
          !$(e.target).closest('.time-event').length) {
        closePopup();
      }
      if (!$(e.target).closest('#dayEventsPopup').length &&
          !$(e.target).closest('.m-cell').length &&
          !$(e.target).closest('.more-chip').length) {
        closeDayEventsPopup();
      }
    });

    /* Keyboard shortcuts */
    $(document).on('keydown', function (e) {
      if (dom.modal.hasClass('modal-open')) return; /* modal captures input */
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

    /* Auto-refresh current time indicator every minute */
    setInterval(function () {
      if (state.view === 'week' || state.view === 'day') {
        renderCurrentTimeLine();
      }
    }, 60000);

    /* Initial render */
    render();
  }

  init();

  /* ──────────────────────────────────────────────────────────
     BEAT PLAN / SETTINGS VIEW HELPERS
  ────────────────────────────────────────────────────────── */
  var $meetingsBar    = $('.meetings-bar');
  var $styleBar       = $('#styleBar');
  var $legendBar      = $('#legendBar');
  var $otherContent   = $('.header-toolbar, .header-main, .cal-body');
  var $settingsBackBtn = $('#settingsBackBtn');

  function showMeetingsBarOnly() {
    $meetingsBar.show();
    $otherContent.hide();
  }

  function showMainContent() {
    $meetingsBar.hide();
    $styleBar.hide();
    $legendBar.hide();
    $settingsBackBtn.hide();
    $otherContent.show();
  }

  /* Settings icon → show meetings-bar + styleBar + back button, hide rest */
  $('#settingsIconBtn').on('click', function () {
    showMeetingsBarOnly();
    $settingsBackBtn.show();
  });

  /* Back button → hide meetings-bar + styleBar + back button, show rest */
  $settingsBackBtn.on('click', function () {
    showMainContent();
  });

  /* ──────────────────────────────────────────────────────────
     STYLE-BAR SLOT ↔ PREVIEW HIGHLIGHT
     When a user hovers a .sye-slot, the corresponding style
     property in .sye-prev-evt blinks indefinitely while the
     cursor remains on that slot.
     Reverse: hovering a .sye-prev-evt highlights the related
     .sye-slot buttons and pulses the event's border sides.
  ────────────────────────────────────────────────────────── */

  /* Map each slot name to the blink class it applies to .sye-prev-evt */
  var SYE_SLOT_BLINK = {
    'bg-colour':    'sye-prev-evt--bg-active',
    'top-border':   'sye-prev-evt--top-active',
    'bottom-border':'sye-prev-evt--bottom-active',
    'right-border': 'sye-prev-evt--right-active',
    'left-border':  'sye-prev-evt--left-active'
  };
  var SYE_ALL_BLINK = Object.values(SYE_SLOT_BLINK).join(' ');

  $(document).on('mouseenter', '.sye-slot', function () {
    var idx  = $(this).data('preview');
    var slot = $(this).data('slot');
    if (idx === undefined) { return; }
    $('.sye-prev-evt').removeClass(SYE_ALL_BLINK + ' sye-prev-evt--active');
    $('.sye-prev-dot').removeClass('sye-prev-dot--blink');
    if (slot === 'marker') {
      /* Blink only the dot indicator inside the matching preview event */
      $('.sye-prev-evt[data-evt-index="' + idx + '"] .sye-prev-dot').addClass('sye-prev-dot--blink');
    } else {
      var blinkClass = SYE_SLOT_BLINK[slot];
      if (blinkClass) {
        $('.sye-prev-evt[data-evt-index="' + idx + '"]').addClass(blinkClass);
      } else {
        $('.sye-prev-evt[data-evt-index="' + idx + '"]').addClass('sye-prev-evt--active');
      }
    }
  });
  $(document).on('mouseleave', '.sye-slot', function () {
    $('.sye-prev-evt').removeClass(SYE_ALL_BLINK + ' sye-prev-evt--active');
    $('.sye-prev-dot').removeClass('sye-prev-dot--blink');
  });


  /* ──────────────────────────────────────────────────────────
     SYE FIELD PICKER POPUP
     Clicking an unlocked .sye-slot opens a popup that lists all
     picklist fields from beatplanner__Daily_Beat_Plans.
     Each field can only be assigned to one slot at a time.
  ────────────────────────────────────────────────────────── */

  /* { slotName: { api_name, field_label } } – persists for the session.
     'left-border' is fixed and always pre-populated. */
  var syeSlotAssignments = {
    'left-border': { api_name: 'beatplanner__Managers_Approval', field_label: 'Managers Approval' }
  };
  /* Cached picklist fields from the CRM (fetched once) */
  var syePicklistFields  = null;
  var syeActiveSlot      = null;   /* slot name currently open in the picker */

  /* Human-readable slot labels for the popup header */
  var SYE_SLOT_LABELS = {
    'bg-colour':     'Background colour',
    'top-border':    'Top border',
    'bottom-border': 'Bottom border',
    'right-border':  'Right border',
    'marker':        'Marker'
  };

  /* Picklist field icon SVG */
  var SFP_FIELD_SVG =
    '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="1" y="1" width="12" height="12" rx="2"/>' +
    '<path d="M4 5h6M4 7h4M4 9h5"/>' +
    '</svg>';

  function openSyeFieldPicker(slotName) {
    syeActiveSlot = slotName;
    var label = SYE_SLOT_LABELS[slotName] || slotName;
    $('#sfpSlotName').text(label);
    $('#sfpBody').html('<p class="sfp-loading" id="sfpLoading">Loading fields\u2026</p>');
    $('#sfpBackdrop').addClass('sfp-open');

    if (syePicklistFields !== null) {
      renderSyeFieldList();
    } else {
      fetchSyePicklistFields();
    }
  }

  function closeSyeFieldPicker() {
    $('#sfpBackdrop').removeClass('sfp-open');
    syeActiveSlot = null;
  }

  async function fetchSyePicklistFields() {
    try {
      var resp = await zrc.get('/crm/v8/settings/fields?module=beatplanner__Daily_Beat_Plans&type=all');
      var allFields = (resp && resp.data && resp.data.fields) ? resp.data.fields : [];
      syePicklistFields = allFields.filter(function (f) {
        return f.data_type === 'picklist' || f.data_type === 'pick_list';
      });
    } catch (e) {
      syePicklistFields = [];
    }
    renderSyeFieldList();
  }

  function renderSyeFieldList() {
    var $body = $('#sfpBody');

    if (!syePicklistFields || syePicklistFields.length === 0) {
      $body.html('<p class="sfp-empty">No picklist fields found in <em>beatplanner__Daily_Beat_Plans</em>.</p>');
      return;
    }

    /* Build a set of used api_names (excluding the slot currently being edited) */
    var usedApiNames = {};
    $.each(syeSlotAssignments, function (slot, assignment) {
      if (slot !== syeActiveSlot) {
        usedApiNames[assignment.api_name] = SYE_SLOT_LABELS[slot] || slot;
      }
    });

    var currentAssignment = syeSlotAssignments[syeActiveSlot];

    var html = '';
    var HIDDEN_FIELD_LABELS = ['record status', 'currency', 'unsubscribed mode'];
    $.each(syePicklistFields, function (_, f) {
      var apiName  = f.api_name    || '';
      var label    = f.field_label || apiName;

      if (HIDDEN_FIELD_LABELS.indexOf(label.toLowerCase()) !== -1) { return; }

      var isUsed   = !!usedApiNames[apiName];
      var isActive = currentAssignment && currentAssignment.api_name === apiName;

      var itemClass = 'sfp-field-item';
      if (isUsed)   { itemClass += ' sfp-field-item--used'; }
      if (isActive) { itemClass += ' sfp-field-item--selected'; }

      var badge = isUsed
        ? '<span class="sfp-field-used-badge">Used: ' + escHtml(usedApiNames[apiName]) + '</span>'
        : '';

      html +=
        '<div class="' + itemClass + '"' +
        (!isUsed ? ' data-api="' + escHtml(apiName) + '" data-label="' + escHtml(label) + '"' : '') +
        ' role="option" aria-selected="' + (isActive ? 'true' : 'false') + '">' +
        '<span class="sfp-field-icon">' + SFP_FIELD_SVG + '</span>' +
        '<span class="sfp-field-label">' + escHtml(label) + '</span>' +
        '<span class="sfp-field-api">' + escHtml(apiName) + '</span>' +
        badge +
        '</div>';
    });

    $body.html('<div role="listbox" aria-label="Picklist fields">' + html + '</div>');
  }

  /* Select a field from the picker */
  $(document).on('click', '.sfp-field-item:not(.sfp-field-item--used)', function () {
    var apiName  = $(this).data('api');
    var label    = $(this).data('label');
    if (!syeActiveSlot || !apiName) { return; }

    /* Persist assignment */
    syeSlotAssignments[syeActiveSlot] = { api_name: apiName, field_label: label };

    /* Update the slot button's field sub-label */
    $('.sye-slot[data-slot="' + syeActiveSlot + '"] .sye-slot-field').text(label);

    /* Show the configured border on the preview event by default */
    var SYE_BORDER_CLASS = {
      'top-border':    'sye-prev-evt--has-top',
      'bottom-border': 'sye-prev-evt--has-bottom',
      'right-border':  'sye-prev-evt--has-right'
    };
    var persistClass = SYE_BORDER_CLASS[syeActiveSlot];
    if (persistClass) {
      var previewIdx = $('.sye-slot[data-slot="' + syeActiveSlot + '"]').data('preview');
      if (previewIdx !== undefined) {
        $('.sye-prev-evt[data-evt-index="' + previewIdx + '"]').addClass(persistClass);
      }
    }

    closeSyeFieldPicker();
  });

  /* Close button */
  $(document).on('click', '#sfpClose', closeSyeFieldPicker);

  /* Click on backdrop (outside the box) closes it */
  $(document).on('click', '#sfpBackdrop', function (e) {
    if ($(e.target).is('#sfpBackdrop')) { closeSyeFieldPicker(); }
  });

  /* Escape key closes picker */
  $(document).on('keydown.sfp', function (e) {
    if (e.key === 'Escape') {
      if ($('#sfpBackdrop').hasClass('sfp-open')) { closeSyeFieldPicker(); }
      if ($('#lockedInfoBackdrop').hasClass('sfp-open')) { $('#lockedInfoBackdrop').removeClass('sfp-open'); }
    }
  });

  /* Open picker on slot click (locked slots are disabled – no click fires) */
  $(document).on('click', '.sye-slot:not(.sye-slot--locked)', function (e) {
    var slot = $(this).data('slot');
    if (!slot) { return; }
    openSyeFieldPicker(slot);
  });

  /* Keyboard activation for div-based sye-slots (Enter / Space) */
  $(document).on('keydown', '.sye-slot:not(.sye-slot--locked)', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $(this).trigger('click');
    }
  });



  /* Show info popup when a locked slot is clicked */
  $(document).on('click', '.sye-slot--locked', function () {
    $('#lockedInfoBackdrop').addClass('sfp-open');
  });

  $(document).on('click', '#lockedInfoClose', function () {
    $('#lockedInfoBackdrop').removeClass('sfp-open');
  });

  $(document).on('click', '#lockedInfoBackdrop', function (e) {
    if ($(e.target).is('#lockedInfoBackdrop')) {
      $('#lockedInfoBackdrop').removeClass('sfp-open');
    }
  });

  /* ──────────────────────────────────────────────────────────
     SELECT LEGENDS (Step 3)
     Shown after the user clicks #syeDone.
     Options are populated from the current syeSlotAssignments.
  ────────────────────────────────────────────────────────── */

  var legSelected = []; /* api_names of currently selected legend items */

  /* Render chips inside #legSelect from legSelected */
  function renderLegChips() {
    var $wrap = $('#legChipsWrap');
    $wrap.empty();
    legSelected.forEach(function (slotKey) {
      var assignment = syeSlotAssignments[slotKey];
      if (!assignment) { return; }
      /* Use the field label shown in .sye-slot-field (e.g. "Leave Type") */
      var fieldText = $('.sye-slot[data-slot="' + slotKey + '"] .sye-slot-field').text().trim();
      var label = (fieldText && fieldText !== 'Choose field\u2026') ? fieldText : (SYE_SLOT_LABELS[slotKey] || slotKey);
      var chip =
        '<span class="mf-chip" data-key="' + escHtml(slotKey) + '" data-api="' + escHtml(assignment.api_name) + '">' +
          '<span class="mf-chip-text">' + escHtml(label) + '</span>' +
          '<span class="mf-chip-remove" aria-label="Remove ' + escHtml(label) + '">&times;</span>' +
        '</span>';
      $wrap.append(chip);
    });
    var $sel = $('#legSelect');
    if (legSelected.length > 0 || $sel.hasClass('mf-open')) {
      $sel.addClass('mf-active');
    } else {
      $sel.removeClass('mf-active');
    }
  }

  /* Render option rows inside #legDropdown from syeSlotAssignments */
  function renderLegList() {
    var $list = $('#legList');
    $list.empty();
    var hasOptions = false;

    /* Build the full set of used api_names from all slot assignments.
       This mirrors the sfp-field-item--used state when no slot is active. */
    var usedApiNames = {};
    $.each(syeSlotAssignments, function (slot, asgn) {
      usedApiNames[asgn.api_name] = true;
    });

    var checkSvg =
      '<svg viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="10" height="10">' +
      '<polyline points="1 5 4.5 8.5 11 1"/></svg>';

    /* Iterate .sye-slot elements: include only those where .sye-slot-field has a
       selected value AND whose assigned field has sfp-field-item--used status */
    $('.sye-slot[data-slot]').each(function () {
      var $slot     = $(this);
      var slotKey   = $slot.data('slot');
      var slotLabel = SYE_SLOT_LABELS[slotKey];
      if (!slotLabel) { return; }

      /* Skip slots where no field has been chosen (placeholder text) */
      var fieldText = $slot.find('.sye-slot-field').text().trim();
      if (!fieldText || fieldText === 'Choose field\u2026') { return; }

      /* Only include if the assigned field is marked sfp-field-item--used */
      var assignment = syeSlotAssignments[slotKey];
      if (!assignment || !usedApiNames[assignment.api_name]) { return; }

      hasOptions = true;
      var isSelected = legSelected.indexOf(slotKey) !== -1;
      var html =
        '<div class="leg-option' + (isSelected ? ' leg-option--selected' : '') + '" ' +
        'data-key="' + escHtml(slotKey) + '" data-api="' + escHtml(assignment.api_name) + '" role="option" aria-selected="' + (isSelected ? 'true' : 'false') + '">' +
          '<span class="leg-option-check">' + (isSelected ? checkSvg : '') + '</span>' +
          '<span class="leg-option-label">' + escHtml(fieldText) + '</span>' +
        '</div>';
      $list.append(html);
    });

    if (!hasOptions) {
      $list.html('<p class="mf-empty">No fields assigned yet.</p>');
    }
  }

  /* Position the legends dropdown below #legSelect */
  function positionLegDropdown() {
    var $sel = $('#legSelect');
    var $dd  = $('#legDropdown');
    var rect = $sel[0].getBoundingClientRect();
    var spaceBelow = window.innerHeight - rect.bottom - 8;
    var spaceAbove = rect.top - 8;
    var ddH = $dd.outerHeight();
    var topPos, openUpward;
    if (spaceBelow >= ddH || spaceBelow >= spaceAbove) {
      topPos = rect.bottom + 4;
      openUpward = false;
    } else {
      topPos = rect.top - ddH - 4;
      openUpward = true;
    }
    $dd.css({
      top:   Math.max(8, topPos) + 'px',
      left:  Math.max(8, rect.left) + 'px',
      width: rect.width + 'px'
    });
    $dd.toggleClass('mf-dd-above', openUpward);
  }

  function openLegDropdown() {
    renderLegList();
    positionLegDropdown();
    $('#legDropdown').addClass('mf-dd-open');
    $('#legSelect').addClass('mf-open mf-active').attr('aria-expanded', 'true');
  }

  function closeLegDropdown() {
    $('#legDropdown').removeClass('mf-dd-open');
    var $sel = $('#legSelect');
    $sel.removeClass('mf-open').attr('aria-expanded', 'false');
    if (legSelected.length === 0) { $sel.removeClass('mf-active'); }
  }

  /* Populate legends dropdown options from current slot assignments and show Step 3 */
  $(document).on('click', '#syeDone', function () {
    legSelected = [];
    renderLegChips();
    $('#legendBar').show();
  });

  /* syeCancel – hide the legend bar and reset */
  $(document).on('click', '#syeCancel', function () {
    $('#legendBar').hide();
    legSelected = [];
  });

  /* setupSave – confirm the current legend selection and persist to CRM */
  $(document).on('click', '#setupSave', async function () {
    closeLegDropdown();
    $('#legendBar').hide();

    /* ── Collect Meetings For chips ── */
    var mfModules = [];
    var mfApis    = [];
    $('#mfChipsWrap .mf-chip').each(function () {
      mfModules.push($(this).find('.mf-chip-text').text().trim());
      mfApis.push($(this).data('uid') || '');
    });

    /* ── Collect Legend chips ── */
    var legApiNames = [];
    var legLabels   = [];
    $('#legChipsWrap .mf-chip').each(function () {
      legApiNames.push($(this).data('api') || '');
      legLabels.push($(this).find('.mf-chip-text').text().trim());
    });

    /* ── Collect slot assignments ── */
    var SLOT_FIELDS = {
      'bg-colour':     { label: 'beatplanner__Background_Colour_Field_Label_Name', api: 'beatplanner__Background_Colour_Field_Api_Name' },
      'marker':        { label: 'beatplanner__Marker_Field_Name',                  api: 'beatplanner__Marker_Field_API_Name' },
      'top-border':    { label: 'beatplanner__Top_Border_Field_Name',              api: 'beatplanner__Top_Border_Field_Api_Name' },
      'bottom-border': { label: 'beatplanner__Bottom_Border_Field_Name',           api: 'beatplanner__BottomBorder_Field_Api_Name' },
      'left-border':   { label: 'beatplanner__Left_Border_Field_Name',             api: 'beatplanner__Left_Border_Field_Api_Name' },
      'right-border':  { label: 'beatplanner__Right_Border_Field_Name',            api: 'beatplanner__Right_Border_Field_Api_Name' }
    };

    var recordData = {
      beatplanner__Meetings_For_Modules:   mfModules.join(','),
      beatplanner__Meetings_For_Apis:      mfApis.join(','),
      beatplanner__Legends_Field_Api_Name: legApiNames.join(','),
      beatplanner__Legends_Field_Label_Name: legLabels.join(',')
    };

    $.each(SLOT_FIELDS, function (slotKey, crmFields) {
      var assignment = syeSlotAssignments[slotKey];
      recordData[crmFields.label] = assignment ? assignment.field_label : '';
      recordData[crmFields.api]   = assignment ? assignment.api_name    : '';
    });

    /* ── Fixed left border (always override regardless of slot assignment) ── */
    recordData['beatplanner__Left_Border_Field_Name']    = 'Managers Approval';
    recordData['beatplanner__Left_Border_Field_Api_Name'] = 'beatplanner__Managers_Approval';

    try {
      /* ── Check for existing records ── */
      var existingResp = await zrc.get('/crm/v8/beatplanner__Beat_Plan_References?fields=id');
      var existingRecords = existingResp &&
                            existingResp.data &&
                            existingResp.data.data &&
                            existingResp.data.data.length > 0
                              ? existingResp.data.data
                              : null;

      if (existingRecords) {
        /* Update the first record */
        var firstId = existingRecords[0].id;
        await zrc.patch(
          '/crm/v8/beatplanner__Beat_Plan_References/' + firstId,
          { data: [recordData] }
        );
      } else {
        /* Create a new record */
        await zrc.post(
          '/crm/v8/beatplanner__Beat_Plan_References',
          { data: [Object.assign({ Name: 'Beat Plan Preferences' }, recordData)] }
        );
      }
    } catch (err) {
      console.error('Failed to save Beat Plan Reference:', err);
    }

    /* ── Transition to main calendar view ── */
    showMainContent();
  });

  /* setupCancel – discard the legend selection and hide the bar */
  $(document).on('click', '#setupCancel', function () {
    legSelected = [];
    renderLegChips();
    closeLegDropdown();
    $('#legendBar').hide();
  });

  /* Toggle dropdown on select click */
  $(document).on('click', '#legSelect', function (e) {
    if ($(e.target).closest('.mf-chip-remove').length) { return; }
    if ($('#legSelect').hasClass('mf-open')) { closeLegDropdown(); } else { openLegDropdown(); }
  });

  /* Keyboard support for legSelect */
  $(document).on('keydown', '#legSelect', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if ($(this).hasClass('mf-open')) { closeLegDropdown(); } else { openLegDropdown(); }
    }
    if (e.key === 'Escape') { closeLegDropdown(); }
  });

  /* Remove chip */
  $(document).on('click', '#legChipsWrap .mf-chip-remove', function (e) {
    e.stopPropagation();
    var key = $(this).closest('.mf-chip').data('key');
    legSelected = legSelected.filter(function (k) { return k !== key; });
    renderLegChips();
    if ($('#legSelect').hasClass('mf-open')) { renderLegList(); }
  });

  /* Toggle option in dropdown */
  $(document).on('click', '.leg-option', function (e) {
    e.stopPropagation();
    var key = $(this).data('key');
    var idx = legSelected.indexOf(key);
    if (idx === -1) { legSelected.push(key); } else { legSelected.splice(idx, 1); }
    renderLegChips();
    renderLegList();
  });

  /* Close when clicking outside */
  $(document).on('click.leg', function (e) {
    if (!$(e.target).closest('#legDropdown').length &&
        !$(e.target).closest('#legSelect').length) {
      closeLegDropdown();
    }
  });

  /* Reposition on resize */
  $(window).on('resize.leg', function () {
    if ($('#legSelect').hasClass('mf-open')) { positionLegDropdown(); }
  });

  /* ──────────────────────────────────────────────────────────
     RESTORE PREFERENCES FROM CRM RECORD
     Populates syeSlotAssignments, slot DOM labels, and
     legSelected from a saved beatplanner__Beat_Plan_References
     record.  Call after MF_MODULES is populated so that
     renderLegChips can resolve slot keys correctly.
  ────────────────────────────────────────────────────────── */
  function restorePreferences(rec) {
    /* ── Slot assignments (left-border is always fixed) ── */
    var SLOT_RESTORE = {
      'bg-colour':     { labelField: 'beatplanner__Background_Colour_Field_Label_Name', apiField: 'beatplanner__Background_Colour_Field_Api_Name' },
      'marker':        { labelField: 'beatplanner__Marker_Field_Name',                  apiField: 'beatplanner__Marker_Field_API_Name' },
      'top-border':    { labelField: 'beatplanner__Top_Border_Field_Name',              apiField: 'beatplanner__Top_Border_Field_Api_Name' },
      'bottom-border': { labelField: 'beatplanner__Bottom_Border_Field_Name',           apiField: 'beatplanner__BottomBorder_Field_Api_Name' },
      'right-border':  { labelField: 'beatplanner__Right_Border_Field_Name',            apiField: 'beatplanner__Right_Border_Field_Api_Name' }
    };

    $.each(SLOT_RESTORE, function (slotKey, fields) {
      var api   = rec[fields.apiField]   || '';
      var label = rec[fields.labelField] || api;
      if (api) {
        syeSlotAssignments[slotKey] = { api_name: api, field_label: label };
        $('.sye-slot[data-slot="' + slotKey + '"] .sye-slot-field').text(label);
      }
    });

    /* ── Legends: recreate chips directly from saved label / api data ── */
    var legApiList   = (rec['beatplanner__Legends_Field_Api_Name']   || '').split(',').filter(Boolean);
    var legLabelList = (rec['beatplanner__Legends_Field_Label_Name'] || '').split(',').filter(Boolean);
    var $legWrap = $('#legChipsWrap');
    $legWrap.empty();
    legApiList.forEach(function (api, i) {
      var label = legLabelList[i] || api;
      $legWrap.append(
        '<span class="mf-chip" data-api="' + escHtml(api) + '">' +
          '<span class="mf-chip-text">' + escHtml(label) + '</span>' +
          '<span class="mf-chip-remove" aria-label="Remove ' + escHtml(label) + '">&times;</span>' +
        '</span>'
      );
    });
    if (legApiList.length > 0) {
      $('#legSelect').addClass('mf-active');
    }
  }

  /* ──────────────────────────────────────────────────────────
     ZOHO EMBEDDED APP INTEGRATION
     Subscribe to PageLoad before calling embeddedApp.init().
     On PageLoad, fetch CRM modules to populate the
     "Meetings For" multi-select dropdown.
  ────────────────────────────────────────────────────────── */
  ZOHO.embeddedApp.on('PageLoad', async function (data) {
    console.log(data);

    /* ── Fetch all active users and build the reporting hierarchy ── */
    var usersResp = await zrc.get('/crm/v8/users?type=ActiveConfirmedUsers');
    if (usersResp && usersResp.data && usersResp.data.users) {
      allUsers = usersResp.data.users;
    }

    /* ── Identify the logged-in user from PageLoad data ── */
    var currentUser = data && data.CurrentUser;
    if (currentUser) {
      loggedInUserId = currentUser.id || null;
      /* Fallback: match by email when the id format differs */
      if (!loggedInUserId && currentUser.Email) {
        var emailMatch = allUsers.find(function (u) { return u.email === currentUser.Email; });
        if (emailMatch) loggedInUserId = emailMatch.id;
      }
    }

    buildUserMaps();

    /* ── Default selection: logged-in user is the root and selected user ── */
    if (loggedInUserId && userMap[loggedInUserId]) {
      activeUserId = loggedInUserId;
      $('.user-name').text(userMap[loggedInUserId].full_name);
    }

    /* ── Fetch Beat Plan References with all preference fields ── */
    var prefFields = [
      'id',
      'beatplanner__Background_Colour_Field_Label_Name', 'beatplanner__Background_Colour_Field_Api_Name',
      'beatplanner__Marker_Field_Name',                  'beatplanner__Marker_Field_API_Name',
      'beatplanner__Top_Border_Field_Name',              'beatplanner__Top_Border_Field_Api_Name',
      'beatplanner__Bottom_Border_Field_Name',           'beatplanner__BottomBorder_Field_Api_Name',
      'beatplanner__Left_Border_Field_Name',             'beatplanner__Left_Border_Field_Api_Name',
      'beatplanner__Right_Border_Field_Name',            'beatplanner__Right_Border_Field_Api_Name',
      'beatplanner__Meetings_For_Modules',               'beatplanner__Meetings_For_Apis',
      'beatplanner__Legends_Field_Api_Name',             'beatplanner__Legends_Field_Label_Name'
    ].join(',');

    var dailyBeatPlanPreferences = await zrc.get('/crm/v8/beatplanner__Beat_Plan_References?fields=' + prefFields);
    console.log('dailyBeatPlanPreferences', dailyBeatPlanPreferences);

    var hasRecords = dailyBeatPlanPreferences &&
                     dailyBeatPlanPreferences.data &&
                     dailyBeatPlanPreferences.data.data &&
                     dailyBeatPlanPreferences.data.data.length > 0;

    var savedRec = hasRecords ? dailyBeatPlanPreferences.data.data[0] : null;

    if (!hasRecords) {
      showMeetingsBarOnly();
    } else {
      showMainContent();
    }

    /* ── Pre-set mfSelected so renderMfChips inside populateMfModules is correct ── */
    if (savedRec) {
      mfSelected = (savedRec['beatplanner__Meetings_For_Apis'] || '').split(',').filter(Boolean);
    }

    var response = await zrc.get('/crm/v8/settings/modules');
    console.log(response);
    populateMfModules(response);

    /* ── Restore remaining preferences (slots + legends) ── */
    if (savedRec) {
      restorePreferences(savedRec);
    }
  });
  ZOHO.embeddedApp.init();

});
