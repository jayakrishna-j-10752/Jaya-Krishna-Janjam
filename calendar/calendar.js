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
    view:            'month',        // 'month' | 'week' | 'day'
    cursor:          new Date(),     // currently displayed date/period
    events:          loadEvents(),
    clipboard:       null,           // array of copied events (or null)
    clipboardSource: null,           // 'cell' (day-level copy) | 'chip' (single-event copy)
    theme:           'light',
    editId:          null,           // id of event being edited (null = create)
    activePopup:     null,           // event id shown in popup (or null)
    selectedColor:   '#1565C0'
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
      var wdhActs = '<div class="cell-acts">' +
                    '<button class="cell-copy-btn" data-date="' + ds + '" title="Copy all events">' + SVG.copy + '</button>';
      if (shouldShowPasteButton(ds)) {
        wdhActs += '<button class="cell-paste-btn" data-date="' + ds + '" title="Paste events">' + SVG.paste + '</button>';
      }
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

      /* Hour slots – paste button inside slots only for chip/te copy */
      for (var h = 0; h < 24; h++) {
        var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
        html += '<div class="' + slotCls + '" data-date="' + ds + '" data-hour="' + h + '">';
        if (valid) {
          html += '<button class="slot-add-btn" data-date="' + ds + '" data-hour="' + h + '" title="Add event">' + SVG.add + '</button>';
          if (shouldShowPasteInSlot(ds)) {
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
    dom.canvas.html(html);
    fixWeekHeadAlignment();
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

    /* Day header – paste icon shown here only when clipboard has content */
    var dhActs = '<div class="cell-acts">' +
                 '<button class="cell-copy-btn" data-date="' + ds + '" title="Copy all events">' + SVG.copy + '</button>';
    if (shouldShowPasteButton(ds)) {
      dhActs += '<button class="cell-paste-btn" data-date="' + ds + '" title="Paste events">' + SVG.paste + '</button>';
    }
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
      html += '<div class="time-lbl">' + (h === 0 ? '' : pad2(h) + ':00') + '</div>';
    }
    html += '</div>';

    /* Single day column – paste button inside hour slots only for chip/te copy */
    html += '<div class="day-col" data-date="' + ds + '">';
    for (var h = 0; h < 24; h++) {
      var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
      html += '<div class="' + slotCls + '" data-date="' + ds + '" data-hour="' + h + '">';
      if (valid) {
        html += '<button class="slot-add-btn" data-date="' + ds + '" data-hour="' + h + '" title="Add event">' + SVG.add + '</button>';
        if (shouldShowPasteInSlot(ds)) {
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
    dom.canvas.html(html);
    attachDayHandlers();
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
    /* Clicking a month cell (not on a button or chip) opens the day events popup */
    dom.canvas.on('click.calview', '.m-cell', function (e) {
      if ($(e.target).closest('button, .evt-chip, .more-chip').length) return;
      showDayEventsPopup($(this).data('date'), e);
    });
  }

  /** Attach all handlers for the week view */
  function attachWeekHandlers() {
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
      showToast('An event already exists in the selected time slot on ' + ds + '.', 3500);
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
    var pw = 310, ph = 140;
    if (x + pw > window.innerWidth  - 8) x = mouseEvt.clientX - pw - 8;
    if (y + ph > window.innerHeight - 8) y = mouseEvt.clientY - ph - 8;
    dom.popup.css({ left: Math.max(4, x) + 'px', top: Math.max(4, y) + 'px' })
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

  function init() {
    /* Restore theme */
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem('zcrm_cal_theme') || 'light'; } catch (e) { /* ignore */ }
    setTheme(savedTheme);

    /* Seed sample events for first-time visitors */
    seedSampleEvents();

    /* Navigation */
    dom.btnPrev.on('click',  function () { navigate(-1); });
    dom.btnNext.on('click',  function () { navigate(1); });
    dom.btnToday.on('click', goToday);

    /* View tabs */
    dom.viewTabs.on('click', function () {
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

    /* Initial render */
    render();
  }

  init();

});
