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

  /**
   * Returns true when the given event can still be edited.
   * An event is NOT editable when it belongs to a past date, or when it falls on
   * today but its start time has already elapsed.
   * @param {Object} ev – calendar event object (needs ev.date and ev.startTime)
   */
  function isEventEditable(ev) {
    if (!ev || !ev.date) { return true; }
    var todStr = todayStr();
    if (ev.date < todStr) { return false; }
    if (ev.date === todStr && ev.startTime) {
      var parts = ev.startTime.split(':');
      var evH   = parseInt(parts[0], 10) || 0;
      var evM   = parseInt(parts[1], 10) || 0;
      var now   = new Date();
      if (evH < now.getHours() || (evH === now.getHours() && evM < now.getMinutes())) {
        return false;
      }
    }
    return true;
  }

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

  /** Format "YYYY-MM-DD" → "DD-MM-YYYY" */
  function fmtDateDMY(ds) {
    var p = ds ? ds.split('-') : [];
    return (p.length === 3) ? p[2] + '-' + p[1] + '-' + p[0] : (ds || '');
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
    eventFormFoot:     $('#eventFormFoot'),
    slotPickerSection: $('#slotPickerSection'),
    slotPickerGrid:    $('#slotPickerGrid'),
    slotPickerFoot:    $('#slotPickerFoot'),
    slotPickerCancel:  $('#slotPickerCancel'),
    eventFormSection:  $('#eventFormSection'),
    fTitle:       $('#fTitle'),
    fTitleErr:    $('#fTitleErr'),
    fDate:        $('#fDate'),
    fStart:       $('#fStart'),
    fEnd:         $('#fEnd'),
    fDesc:        $('#fDesc'),
    colorRow:     $('#colorRow'),

    slotMenu:     $('#slotMenu'),

    toast:        $('#toast'),

    dayEventsModal: $('#dayEventsModal'),
    demDate:        $('#demDate'),
    demList:        $('#demList'),
    demClose:       $('#demClose'),

    hoverCard:      $('#evtHoverCard'),
    hoverArrow:     $('#hcArrow')
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
    return state.events.filter(function (e) {
      if (e.date !== ds) { return false; }
      /* Apply active calendar event filters (each value is an array for multi-select) */
      var keys = Object.keys(calEventFilters);
      for (var i = 0; i < keys.length; i++) {
        var api = keys[i];
        var sel = calEventFilters[api]; /* array of selected values */
        if (!sel || sel.length === 0) { continue; } /* empty = "All" */
        var evVal = (e.bprFieldValues && e.bprFieldValues[api]) ? e.bprFieldValues[api] : '';
        if (sel.indexOf(evVal) === -1) { return false; }
      }
      return true;
    }).sort(function (a, b) { return a.startTime.localeCompare(b.startTime); });
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
    add:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    copy:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="7" height="8" rx="1.25"/><path d="M10 6V4.5A1.5 1.5 0 0 0 8.5 3h-5A1.5 1.5 0 0 0 2 4.5v6A1.5 1.5 0 0 0 3.5 12H5"/></svg>',
    paste:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2" width="10" height="13" rx="1.5"/><path d="M6 2v2h4V2"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9" y2="11"/></svg>',
    trash:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3h4v1.5"/><rect x="3.5" y="4.5" width="9" height="9" rx="1.25"/><line x1="6.5" y1="7" x2="6.5" y2="11"/><line x1="9.5" y1="7" x2="9.5" y2="11"/></svg>',
    edit:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12l-9 9L2 14l.38-2.62 9.12-9z"/></svg>',
    close:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>',
    save:    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 13.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5h7.5l3 3V13a.5.5 0 0 1-.5.5z"/><rect x="5" y="9" width="6" height="4.5" rx=".5"/><rect x="5.5" y="2.5" width="4" height="3" rx=".5"/></svg>',
    approve: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7-7"/></svg>',
    reject:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><line x1="5.5" y1="5.5" x2="10.5" y2="10.5"/><line x1="10.5" y1="5.5" x2="5.5" y2="10.5"/></svg>'
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
    closeSlotPicker();
    closeDayEventsModal();

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

  /**
   * Compute metadata-driven style strings shared by both .evt-chip (renderChip)
   * and .time-event (renderTimeEvent).
   *
   * @param  {Object} ev  Event object with ev.color and optionally ev.bprFieldValues.
   * @return {Object}  { styleStr, markerHtml }
   *                   styleStr   – CSS property declarations (without positioning).
   *                   markerHtml – HTML string for the .chip-marker span, or ''.
   */
  function buildBprEventStyles(ev) {
    var styleStr        = '';
    var bgStr           = '';
    var borderLeftStr   = '';
    var borderTopStr    = '';
    var borderBottomStr = '';
    var borderRightStr  = '';
    var markerHtml      = '';

    if (beatPlanHasRefs && bprPicklistFields && bprPicklistFields.length &&
        ev.bprFieldValues && Object.keys(ev.bprFieldValues).length) {
      /* When Attendance = Leave, use the Leave Type picklist color as the background,
         and the Managers Approval color as the left border (fully metadata-driven). */
      var leaveColor = getLeaveTypeColor(ev.bprFieldValues);
      if (leaveColor) {
        var leaveStyle      = buildBprChipStyle(ev.bprFieldValues);
        var leaveBorderLeft = leaveStyle.borderLeft || leaveColor;
        bgStr         = 'background:' + leaveColor + ';';
        borderLeftStr = 'border-left-color:' + leaveBorderLeft + ';border-left-style:solid;border-left-width:3px;';
        styleStr      = bgStr + borderLeftStr + 'color:#fff;';
        if (leaveStyle.markerColor) {
          markerHtml = '<span class="chip-marker" style="background:' + escHtml(leaveStyle.markerColor) + ';" aria-hidden="true"></span>';
        }
      } else {
        /* Dynamic BPR styling: derive colours from picklist metadata */
        var s = buildBprChipStyle(ev.bprFieldValues);
        if (s.bg)           { bgStr         += 'background:'          + s.bg         + ';';                                                                    styleStr += bgStr; }
        if (s.borderTop)    { borderTopStr    = 'border-top-color:'    + s.borderTop    + ';border-top-style:solid;border-top-width:2px;';                      styleStr += borderTopStr; }
        if (s.borderBottom) { borderBottomStr = 'border-bottom-color:' + s.borderBottom + ';border-bottom-style:solid;border-bottom-width:2px;';                styleStr += borderBottomStr; }
        if (s.borderLeft)   {
          borderLeftStr = 'border-left-color:' + s.borderLeft + ';border-left-style:solid;border-left-width:3px;';
          styleStr     += borderLeftStr;
        }
        if (s.borderRight)  { borderRightStr  = 'border-right-color:'  + s.borderRight  + ';border-right-style:solid;border-right-width:2px;';                  styleStr += borderRightStr; }
        if (s.markerColor)  { markerHtml = '<span class="chip-marker" style="background:' + escHtml(s.markerColor) + ';" aria-hidden="true"></span>'; }
        /* When no bg-colour is resolved but a left-border color exists, derive a tinted
           background from the border colour to keep the event visually distinct. */
        if (!s.bg && s.borderLeft) { bgStr = 'background:' + s.borderLeft + '22;'; styleStr += bgStr; }
        /* Apply white text only when a solid background colour is configured */
        if (s.bg) { styleStr += 'color:#fff;'; }
      }
    } else {
      /* Fallback: use the event's manually chosen colour (background + border only) */
      var bg     = ev.color + '22';
      var border = ev.color;
      bgStr         = 'background:' + bg + ';';
      borderLeftStr = 'border-left-color:' + border + ';border-left-style:solid;border-left-width:3px;';
      styleStr      = bgStr + borderLeftStr;
    }

    return {
      styleStr:        styleStr,
      markerHtml:      markerHtml,
      bgStr:           bgStr,
      borderLeftStr:   borderLeftStr,
      borderTopStr:    borderTopStr,
      borderBottomStr: borderBottomStr,
      borderRightStr:  borderRightStr
    };
  }

  /**
   * Return the display title for an event chip, time-event, or hover card.
   * When Attendance = "Leave" (and bprPicklistFields are loaded), returns the
   * Leave Type value as the title instead of the Meeting With name.
   * Falls back to ev.title for all other cases.
   */
  function getEventDisplayTitle(ev) {
    if (ev.bprFieldValues && bprPicklistFields && bprPicklistFields.length) {
      var attendApi = '';
      var leaveApi  = '';
      for (var k = 0; k < bprPicklistFields.length; k++) {
        var lbl = (bprPicklistFields[k].field_label || '').toLowerCase().trim();
        if (lbl === 'attendance') { attendApi = bprPicklistFields[k].api_name; }
        if (lbl === 'leave type') { leaveApi  = bprPicklistFields[k].api_name; }
        if (attendApi && leaveApi) { break; }
      }
      if (attendApi && leaveApi) {
        var attendVal = (ev.bprFieldValues[attendApi] || '').toLowerCase();
        if (attendVal === 'leave') {
          var leaveTypeVal = ev.bprFieldValues[leaveApi] || '';
          if (leaveTypeVal) { return leaveTypeVal; }
        }
      }
    }
    return ev.title || '';
  }

  function renderChip(ev, past) {
    var pastCls   = past ? ' evt-past' : '';
    var evtStyles = buildBprEventStyles(ev);

    var bprAttr = (ev.bprFieldValues && Object.keys(ev.bprFieldValues).length)
      ? ' data-bpr-fields="' + escHtml(JSON.stringify(ev.bprFieldValues)) + '"'
      : '';

    return '<div class="evt-chip' + pastCls + '" ' +
           '     data-evid="' + ev.id + '" data-date="' + ev.date + '"' +
           bprAttr +
           '     style="' + evtStyles.styleStr + '">' +
           evtStyles.markerHtml +
           '  <span class="chip-name">' + escHtml(getEventDisplayTitle(ev)) + '</span>' +
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
        /* On today, only show add/paste for current hour onwards */
        var slotAddAllowed = valid && !(isT && h < new Date().getHours());
        var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
        html += '<div class="' + slotCls + '" data-date="' + ds + '" data-hour="' + h + '">';
        if (slotAddAllowed) {
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
    var isTodayMW = selDs === tdStr;
    html += '<div class="day-col" data-date="' + selDs + '">';
    for (var h = 0; h < 24; h++) {
      /* On today, only show add/paste for current hour onwards */
      var slotAddAllowed = valid && !(isTodayMW && h < new Date().getHours());
      var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
      html += '<div class="' + slotCls + '" data-date="' + selDs + '" data-hour="' + h + '">';
      if (slotAddAllowed) {
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
      /* On today, only show add/paste for current hour onwards */
      var slotAddAllowed = valid && !(isT && h < new Date().getHours());
      var slotCls = 'hour-slot' + (valid ? ' slot-valid' : '');
      html += '<div class="' + slotCls + '" data-date="' + ds + '" data-hour="' + h + '">';
      if (slotAddAllowed) {
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

    /* Reuse the shared metadata-driven styling pipeline (same as .evt-chip) */
    var evtStyles = buildBprEventStyles(ev);
    var posStyle  = 'top:' + top + 'px;height:' + height + 'px;';

    var bprAttr = (ev.bprFieldValues && Object.keys(ev.bprFieldValues).length)
      ? ' data-bpr-fields="' + escHtml(JSON.stringify(ev.bprFieldValues)) + '"'
      : '';

    return '<div class="time-event' + pastCls + '"' +
           '     data-evid="' + ev.id + '" data-date="' + ds + '"' +
           bprAttr +
           '     data-te-pos="' + posStyle + '"' +
           '     style="' + posStyle + evtStyles.styleStr + '">' +
           evtStyles.markerHtml +
           '  <div class="te-title">' + escHtml(getEventDisplayTitle(ev)) + '</div>' +
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
      if (beatPlanHasRefs) {
        var existAttend = getDateAttendance(date);
        if (existAttend === 'leave') {
          showToast('This day already has a Leave record. Working events cannot be added.');
          return;
        }
        openSlotPicker(date, existAttend === 'working' ? 'Working' : null);
      } else {
        openSlotPicker(date);
      }
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
    /* Clicking the "+N more" chip opens the day events modal */
    dom.canvas.on('click.calview', '.more-chip', function (e) {
      e.stopPropagation();
      showDayEventsModal($(this).data('date'));
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
      if (beatPlanHasRefs) {
        var existAttend = getDateAttendance(date);
        if (existAttend === 'leave') {
          showToast('This day already has a Leave record. Working events cannot be added.');
          return;
        }
        openSlotPicker(date, existAttend === 'working' ? 'Working' : null);
      } else {
        openSlotPicker(date);
      }
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
      var date = $(this).data('date');
      if (isPast(date)) return;
      if (beatPlanHasRefs) {
        var existAttend = getDateAttendance(date);
        if (existAttend === 'leave') {
          showToast('This day already has a Leave record. Working events cannot be added.');
          return;
        }
        openSlotPicker(date, existAttend === 'working' ? 'Working' : null);
      } else {
        openSlotPicker(date);
      }
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
    dom.canvas.on('click.calview', '.dh-add-btn', function (e) {
      e.stopPropagation();
      var date = $(this).data('date');
      if (isPast(date)) return;
      if (beatPlanHasRefs) {
        var existAttend = getDateAttendance(date);
        if (existAttend === 'leave') {
          showToast('This day already has a Leave record. Working events cannot be added.');
          return;
        }
        openSlotPicker(date, existAttend === 'working' ? 'Working' : null);
      } else {
        openSlotPicker(date);
      }
    });
  }

  /** Shared handler setup for week/day time grids */
  function attachTimeGridHandlers() {
    dom.canvas.on('click.calview', '.slot-add-btn', function (e) {
      e.stopPropagation();
      var $btn  = $(this);
      var date  = $btn.data('date');
      var h     = parseInt($btn.data('hour'), 10);

      /* Scroll the clicked hour-slot into view so the form opens in context */
      var slotEl = $btn.closest('.hour-slot')[0];
      if (slotEl) {
        slotEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      if (beatPlanHasRefs) {
        /* In beat plan mode: open the full slot picker (pre-set to Working) rather than
           the simple event form, so the user gets the complete row-based UI. */
        if (isPast(date)) return;
        var existAttend = getDateAttendance(date);
        if (existAttend === 'leave') {
          showToast('This day already has a Leave record. Working events cannot be added.');
          return;
        }
        openSlotPicker(date, existAttend === 'working' ? 'Working' : 'Working', h);
      } else {
        openModal(date, hourToTime(h), hourToTime(h + 1));
      }
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
  }

  /** "HH:MM" from hour integer (clamps at 23:00) */
  function hourToTime(h) {
    return pad2(Math.min(h, 23)) + ':00';
  }

  /**
   * Combine a date string ("YYYY-MM-DD") and a time string ("HH:MM")
   * into a valid ISO-8601 datetime with the current user's timezone offset.
   * Example: toIsoDt("2026-07-01", "15:00") → "2026-07-01T15:00:00+05:30"
   */
  function toIsoDt(dateStr, timeStr) {
    var tzOffset = -new Date().getTimezoneOffset(); /* minutes ahead of UTC */
    var sign     = tzOffset >= 0 ? '+' : '-';
    var absOff   = Math.abs(tzOffset);
    var tzStr    = sign + pad2(Math.floor(absOff / 60)) + ':' + pad2(absOff % 60);
    return dateStr + 'T' + timeStr + ':00' + tzStr;
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
  async function doPaste(ds, hour) {
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

    var count       = state.clipboard.length;
    var clipCopy    = state.clipboard.slice(); /* snapshot before any async mutation */
    var newEvs      = [];

    clipCopy.forEach(function (clipEv) {
      var ev = Object.assign({}, clipEv, { id: uid(), date: ds });
      if (hour !== undefined) {
        ev.startTime = hourToTime(hour);
        ev.endTime   = hourToTime(Math.min(hour + 1, 23));
      }
      /* Always reset approval status for the pasted copy */
      if (ev.bprFieldValues) {
        ev.bprFieldValues = Object.assign({}, ev.bprFieldValues);
        ev.bprFieldValues['beatplanner__Managers_Approval'] = 'Pending';
      }
      newEvs.push(ev);
      state.events.push(ev);
    });
    saveEvents();
    render();
    showToast(count === 1
      ? 'Event pasted on ' + ds + '.'
      : count + ' events pasted on ' + ds + '.');

    /* Persist each pasted Beat Plan event to beatplanner__Daily_Beat_Plans */

    /* ── Resolve the Monthly Beat Plan for the target month (once for all pasted events) ── */
    var pasteMonthlyBeatPlanId = null;
    var pasteHasBprEvents = newEvs.some(function (e) {
      return e.bprFieldValues && Object.keys(e.bprFieldValues).length;
    });
    if (pasteHasBprEvents) {
      var pasteParts     = ds.split('-');
      var pasteDate      = new Date(parseInt(pasteParts[0], 10), parseInt(pasteParts[1], 10) - 1, parseInt(pasteParts[2], 10));
      var pasteMonthYear = MONTHS[pasteDate.getMonth()] + ' ' + pasteDate.getFullYear();
      try {
        var mCoqlResp = await ZOHO.CRM.API.coql({
          select_query: "SELECT id FROM beatplanner__Monthly_Beat_Plans WHERE Name = '" + pasteMonthYear + "' LIMIT 1"
        });
        var mExisting = mCoqlResp && mCoqlResp.data && Array.isArray(mCoqlResp.data) && mCoqlResp.data.length > 0
                          ? mCoqlResp.data : null;
        if (mExisting) {
          pasteMonthlyBeatPlanId = mExisting[0].id;
          console.log('Paste: reusing Monthly Beat Plan ID:', pasteMonthlyBeatPlanId);
        } else {
          var mInsertResp = await ZOHO.CRM.API.insertRecord({
            Entity:  'beatplanner__Monthly_Beat_Plans',
            APIData: { Name: pasteMonthYear },
            Trigger: ['workflow']
          });
          console.log('Paste: created Monthly Beat Plan', mInsertResp);
          if (mInsertResp && mInsertResp.data && mInsertResp.data[0] && mInsertResp.data[0].details) {
            pasteMonthlyBeatPlanId = mInsertResp.data[0].details.id;
          }
          console.log('Paste: new Monthly Beat Plan ID:', pasteMonthlyBeatPlanId);
        }
      } catch (mErr) {
        console.error('Failed to resolve Monthly Beat Plan for paste', mErr);
      }
    }

    /* ── Build all record payloads first; send them in a single batch request ── */
    var pastePayloads = []; /* [{ ev, recordData }] */

    for (var i = 0; i < newEvs.length; i++) {
      var ev = newEvs[i];
      if (!ev.bprFieldValues || !Object.keys(ev.bprFieldValues).length) { continue; }

      var recordData = {};

      /* Copy all picklist field values, excluding Managers Approval (reset below) */
      Object.keys(ev.bprFieldValues).forEach(function (key) {
        if (key !== 'beatplanner__Managers_Approval') {
          recordData[key] = ev.bprFieldValues[key];
        }
      });

      /* ── Resolve the Meeting With lookup API using the same logic as .bp-row-save ──
         ev.mwLookupApi is set when the event was created or last saved through the form.
         For older events (loaded from localStorage before this field was added) or events
         whose Meetings For value changed after creation, derive it dynamically from the
         Meetings For value stored in bprFieldValues, mirroring the resolution in
         the Meetings For dropdown handler and buildBpEditForm. */
      var pasteMwLookupApi = ev.mwLookupApi || '';
      if (!pasteMwLookupApi) {
        var pasteMfApi = 'beatplanner__Meetings_For';
        bpDailyAllFields.forEach(function (f) {
          if ((f.field_label || '').toLowerCase() === 'meetings for') { pasteMfApi = f.api_name; }
        });
        var pasteMfLabel = ev.bprFieldValues ? (ev.bprFieldValues[pasteMfApi] || '') : '';
        var pasteMfModApi = '';
        beatPlanModulesList.forEach(function (mod) {
          if (mod.label === pasteMfLabel) { pasteMfModApi = mod.api; }
        });
        for (var fi = 0; fi < bpDailyAllFields.length; fi++) {
          var lf = bpDailyAllFields[fi];
          if (lf.data_type === 'lookup' && lf.lookup && lf.lookup.module) {
            var lfMod = lf.lookup.module.api_name || lf.lookup.module.module || '';
            if ((pasteMfModApi && lfMod === pasteMfModApi) ||
                (!pasteMfModApi && pasteMfLabel &&
                 (lf.field_label || '').toLowerCase() === pasteMfLabel.toLowerCase())) {
              pasteMwLookupApi = lf.api_name;
              break;
            }
          }
        }
      }

      /* Meeting With lookup – populate the correct field; clear all others.
         This is the same assignment pattern used by .bp-row-save. */
      if (ev.mwRecordId && pasteMwLookupApi) {
        recordData[pasteMwLookupApi] = { id: ev.mwRecordId };
      }
      bpDailyAllFields.forEach(function (f) {
        if (f.data_type !== 'lookup' || !f.lookup || !f.lookup.module) { return; }
        if (f.api_name === pasteMwLookupApi) { return; }
        var modApi = f.lookup.module.api_name || f.lookup.module.module || '';
        if (beatPlanModulesList.some(function (mod) { return mod.api === modApi; })) {
          recordData[f.api_name] = null;
        }
      });

      /* Date / time fields */
      recordData['beatplanner__Date_Time_From'] = toIsoDt(ds, ev.startTime);
      recordData['beatplanner__Date_Time_To']   = toIsoDt(ds, ev.endTime);
      recordData['beatplanner__Date']           = ds;

      /* Associate with the correct Monthly Beat Plan for the target month */
      if (pasteMonthlyBeatPlanId) {
        recordData['beatplanner__Month'] = { id: pasteMonthlyBeatPlanId };
      }

      /* Mandatory Name field */
      recordData['Name'] = 'Meeting With ' + (ev.title || '') +
        ' on ' + fmtDateDMY(ds) +
        ' for the Time Slot ' + fmtTime(ev.startTime || '00:00') + ' - ' + fmtTime(ev.endTime || '00:00');

      /* New record always starts as Pending */
      recordData['beatplanner__Managers_Approval'] = 'Pending';

      /* Assign to the active user */
      var ownerId = $('#userProfile').attr('data-userid');
      if (ownerId) { recordData['Owner'] = { id: ownerId }; }

      pastePayloads.push({ ev: ev, recordData: recordData });
    }

    /* Single batch request for all pasted Beat Plan records */
    if (pastePayloads.length > 0) {
      try {
        var pasteResp = await zrc.post('/crm/v8/beatplanner__Daily_Beat_Plans', {
          data: pastePayloads.map(function (p) { return p.recordData; })
        });
        console.log('Pasted Beat Plan records saved', pasteResp);
        var pasteRespItems = (pasteResp && pasteResp.data && pasteResp.data.data) || [];
        pastePayloads.forEach(function (p, idx) {
          var item  = pasteRespItems[idx];
          var crmId = item && item.details && item.details.id;
          if (crmId) {
            var oldId = p.ev.id;
            var evIdx = state.events.indexOf(p.ev);
            if (evIdx !== -1) { state.events[evIdx].id = crmId; }
            p.ev.id = crmId;
            /* Sync all rendered DOM elements that still carry the temporary ID.
               Also update jQuery's internal data cache so subsequent .data('evid')
               calls (e.g. in the hover-card mouseenter handler) return the new ID. */
            $('[data-evid="' + oldId + '"]').attr('data-evid', crmId).data('evid', crmId);
          }
        });
        saveEvents();
      } catch (err) {
        console.error('Failed to persist pasted events to CRM', err);
        showToast('Failed to save pasted events to CRM.');
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
     EVENT POPUP
  /* ──────────────────────────────────────────────────────────
     APPROVE / REJECT
  ────────────────────────────────────────────────────────── */

  async function doApprove(evid) {
    var ev = findEvent(evid);
    if (!ev) return;
    try {
      await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
        data: [{ id: evid, beatplanner__Managers_Approval: 'Approved' }]
      });
      if (ev.bprFieldValues) { ev.bprFieldValues['beatplanner__Managers_Approval'] = 'Approved'; }
      saveEvents();
      render();
      showToast('Record approved.');
    } catch (err) {
      console.error('Approve failed', err);
      showToast('Failed to approve record.');
    }
  }

  async function doReject(evid) {
    var ev = findEvent(evid);
    if (!ev) return;
    try {
      await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
        data: [{ id: evid, beatplanner__Managers_Approval: 'Rejected' }]
      });
      if (ev.bprFieldValues) { ev.bprFieldValues['beatplanner__Managers_Approval'] = 'Rejected'; }
      saveEvents();
      render();
      showToast('Record rejected.');
    } catch (err) {
      console.error('Reject failed', err);
      showToast('Failed to reject record.');
    }
  }

  /**
   * Build the HTML for event action buttons (Edit, Approve, Reject, Copy, Paste, Delete).
   * Shared between the hover card and the day events modal cards.
   *
   * @param {string}  evid       – event id
   * @param {boolean} showPaste  – whether to show the Paste button
   */
  function buildEventActionsHtml(evid, showPaste) {
    var pasteBtn = showPaste
      ? '<button class="hc-act hc-act-paste"   data-evid="' + evid + '" title="Paste">'   + SVG.paste + '</button>'
      : '';
    return '<div class="hc-actions">' +
      '<button class="hc-act hc-act-edit"    data-evid="' + evid + '" title="Edit">'    + SVG.edit    + '</button>' +
      '<button class="hc-act hc-act-approve" data-evid="' + evid + '" title="Approve">' + SVG.approve + '</button>' +
      '<button class="hc-act hc-act-reject"  data-evid="' + evid + '" title="Reject">'  + SVG.reject  + '</button>' +
      '<button class="hc-act hc-act-copy"    data-evid="' + evid + '" title="Copy">'    + SVG.copy    + '</button>' +
      pasteBtn +
      '<button class="hc-act hc-act-delete"  data-evid="' + evid + '" title="Delete">'  + SVG.trash   + '</button>' +
      '</div>';
  }

  function closePopup() {
    hideHoverCard();
  }

  /* ──────────────────────────────────────────────────────────
     HOVER PREVIEW CARD
  ────────────────────────────────────────────────────────── */

  /**
   * Render all detail fields for an event into $container.
   * Shared between the hover preview card and any future event view.
   *
   * @param {Object} ev          – event data object from state.events
   * @param {jQuery} $container  – jQuery element to fill with field rows
   */
  function renderEventDetails(ev, $container) {
    var isBeatPlan = !!(ev.bprFieldValues && Object.keys(ev.bprFieldValues).length);
    var html = '';

    if (isBeatPlan) {
      /* ── Detect Leave event ── */
      var isLeave           = false;
      var attendanceApiName = '';
      if (bprPicklistFields) {
        for (var k = 0; k < bprPicklistFields.length; k++) {
          var lbl = (bprPicklistFields[k].field_label || '').toLowerCase().trim();
          if (lbl === 'attendance') {
            attendanceApiName = bprPicklistFields[k].api_name;
            var aVal = ev.bprFieldValues[attendanceApiName] || '';
            if (aVal.toLowerCase() === 'leave') { isLeave = true; }
            break;
          }
        }
      }

      /* ── Meeting With (avatar + name) – non-Leave records only ── */
      if (!isLeave && ev.title) {
        var initials = buildRecordInitials(ev.title);
        var avatarInner;
        if (ev.mwAvatarImgSrc) {
          avatarInner = '<img src="' + escHtml(ev.mwAvatarImgSrc) + '" alt="' + escHtml(ev.title) + '">';
        } else if (ev.mwAvatarText) {
          avatarInner = escHtml(ev.mwAvatarText);
        } else {
          avatarInner = escHtml(initials);
        }
        html += '<div class="hc-row hc-mw-row">' +
                '  <div class="hc-mw-avatar">' + avatarInner + '</div>' +
                '  <div class="hc-mw-info">' +
                '    <span class="hc-row-label">Meeting With</span>' +
                '    <span class="hc-mw-name">' + escHtml(ev.title) + '</span>' +
                '  </div>' +
                '</div>';
      }

      /* ── Time ── */
      html += '<div class="hc-row">' +
              '  <svg class="hc-row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v4l2.5 2.5"/></svg>' +
              '  <div class="hc-row-info">' +
              '    <span class="hc-row-label">Time</span>' +
              '    <span class="hc-row-val">' + escHtml(fmtTime(ev.startTime) + ' \u2013 ' + fmtTime(ev.endTime)) + '</span>' +
              '  </div>' +
              '</div>';

      /* ── Build field-label lookup (bpDailyAllFields + bprPicklistFields) ── */
      var fieldLabelMap = {};
      if (bpDailyAllFields && bpDailyAllFields.length) {
        bpDailyAllFields.forEach(function (f) {
          if (f.api_name && f.field_label) { fieldLabelMap[f.api_name] = f.field_label; }
        });
      }
      if (bprPicklistFields && bprPicklistFields.length) {
        bprPicklistFields.forEach(function (f) {
          if (f.api_name && f.field_label) { fieldLabelMap[f.api_name] = f.field_label; }
        });
      }

      /* ── Order: follow bprPicklistFields sequence, then any remaining keys ── */
      var orderedApis = [];
      if (bprPicklistFields && bprPicklistFields.length) {
        bprPicklistFields.forEach(function (f) {
          if (ev.bprFieldValues.hasOwnProperty(f.api_name)) {
            orderedApis.push(f.api_name);
          }
        });
      }
      Object.keys(ev.bprFieldValues).forEach(function (api) {
        if (orderedApis.indexOf(api) === -1) { orderedApis.push(api); }
      });

      orderedApis.forEach(function (api) {
        /* Date Time From / Date Time To are internal scheduling fields – never shown */
        if (api === 'beatplanner__Date_Time_From' || api === 'beatplanner__Date_Time_To') { return; }
        var val = ev.bprFieldValues[api];
        if (!val || val === 'Select\u2026') { return; }
        var label = fieldLabelMap[api] || api;
        html += '<div class="hc-row">' +
                '  <svg class="hc-row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 6h6M5 8.5h4M5 11h5"/></svg>' +
                '  <div class="hc-row-info">' +
                '    <span class="hc-row-label">' + escHtml(label) + '</span>' +
                '    <span class="hc-row-val">' + escHtml(val) + '</span>' +
                '  </div>' +
                '</div>';
      });

    } else {
      /* ── Standard (non-beat-plan) event ── */
      html += '<div class="hc-row">' +
              '  <svg class="hc-row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v4l2.5 2.5"/></svg>' +
              '  <div class="hc-row-info">' +
              '    <span class="hc-row-label">Time</span>' +
              '    <span class="hc-row-val">' + escHtml(fmtTime(ev.startTime) + ' \u2013 ' + fmtTime(ev.endTime)) + '</span>' +
              '  </div>' +
              '</div>';
      if (ev.description) {
        html += '<div class="hc-row">' +
                '  <svg class="hc-row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h11M2.5 6.5h8M2.5 9.5h9M2.5 12.5h6"/></svg>' +
                '  <div class="hc-row-info">' +
                '    <span class="hc-row-label">Description</span>' +
                '    <span class="hc-row-val">' + escHtml(ev.description) + '</span>' +
                '  </div>' +
                '</div>';
      }
    }

    $container.html(html);
  }

  /**
   * Compute metadata-driven styling for an event card header (.hc-head),
   * mirroring the BPR-driven styling applied to the .evt-chip.
   *
   * Returns:
   *   cardStyle       – full inline-style string to apply to the .hc-head element
   *   arrowBg         – resolved background CSS color for the hover arrow (unused, kept for compat)
   *   arrowBorderColor– resolved border CSS color for the hover arrow
   *   markerColor     – dot marker color (or empty string)
   */
  function buildHoverCardHeaderStyle(ev) {
    var cardStyle        = '';
    var arrowBg          = '';
    var arrowBorderColor = '';
    var markerColor      = '';

    if (ev.bprFieldValues && Object.keys(ev.bprFieldValues).length &&
        beatPlanHasRefs && bprPicklistFields && bprPicklistFields.length) {
      var leaveColor = getLeaveTypeColor(ev.bprFieldValues);
      if (leaveColor) {
        var leaveHcStyle = buildBprChipStyle(ev.bprFieldValues);
        var leaveBorderLeft = leaveHcStyle.borderLeft || leaveColor;
        cardStyle        = 'background:' + leaveColor + ';border-left:3px solid ' + leaveBorderLeft + ';';
        arrowBg          = leaveColor;
        arrowBorderColor = leaveBorderLeft;
        markerColor      = leaveHcStyle.markerColor || '';
      } else {
        var s = buildBprChipStyle(ev.bprFieldValues);
        if (s.bg)           { cardStyle += 'background:' + s.bg + ';';                                     arrowBg = s.bg; }
        if (s.borderTop)    { cardStyle += 'border-top:2px solid '    + s.borderTop    + ';'; }
        if (s.borderBottom) { cardStyle += 'border-bottom:2px solid ' + s.borderBottom + ';'; }
        if (s.borderLeft)   { cardStyle += 'border-left:3px solid '   + s.borderLeft   + ';';              arrowBorderColor = s.borderLeft; }
        if (s.borderRight)  { cardStyle += 'border-right:2px solid '  + s.borderRight  + ';'; }
        if (!s.bg && s.borderLeft) { cardStyle += 'background:' + s.borderLeft + '22;';                    arrowBg = s.borderLeft + '22'; }
        markerColor = s.markerColor || '';
      }
    } else {
      /* Fallback: use the event's manually chosen colour */
      cardStyle        = 'background:' + ev.color + '22;border-left:3px solid ' + ev.color + ';';
      arrowBg          = ev.color + '22';
      arrowBorderColor = ev.color;
    }

    return { cardStyle: cardStyle, arrowBg: arrowBg, arrowBorderColor: arrowBorderColor, markerColor: markerColor };
  }

  /**
   * Show the hover preview card for the given event near $chip.
   */
  function showHoverCard(ev, $chip) {
    clearTimeout(hoverTimer);
    hoverActiveId = ev.id;

    var $card  = dom.hoverCard;
    var style  = buildHoverCardHeaderStyle(ev);

    /* ── Header ── Apply metadata-driven styling only to .hc-head */
    var markerHtml = style.markerColor
      ? '<span class="hc-marker" style="background:' + escHtml(style.markerColor) + ';" aria-hidden="true"></span>'
      : '';

    var headerHtml =
      '<div class="hc-head" style="' + escHtml(style.cardStyle) + '">' +
      '  <div class="hc-head-top">' + markerHtml +
      '    <span class="hc-head-title">' + escHtml(getEventDisplayTitle(ev)) + '</span>' +
      '  </div>' +
      '</div>';

    /* ── Body ── */
    var $body = $('<div class="hc-body"></div>');
    renderEventDetails(ev, $body);

    /* ── Actions ── Paste button is never shown inside the hover card */
    var actionsHtml = buildEventActionsHtml(ev.id, false);

    $card.empty().append(headerHtml).append($body[0]).append(actionsHtml);

    /* ── Smart viewport-aware positioning ── */
    /* Temporarily place offscreen to measure dimensions */
    $card.css({ left: '-9999px', top: '-9999px' })
         .attr('aria-hidden', 'false')
         .addClass('hc-visible');

    var cardW = $card[0].offsetWidth  || 300;
    var cardH = $card[0].offsetHeight || 200;
    var rect  = $chip[0].getBoundingClientRect();
    var vw    = window.innerWidth;
    var vh    = window.innerHeight;
    var GAP   = 8;

    /* Prefer right of chip; fall back to left */
    var left = rect.right + GAP;
    if (left + cardW > vw - GAP) { left = rect.left - cardW - GAP; }
    left = Math.max(GAP, Math.min(left, vw - cardW - GAP));

    /* Prefer top-aligned with chip; push up if overflowing bottom */
    var top = rect.top;
    if (top + cardH > vh - GAP) { top = vh - cardH - GAP; }
    top = Math.max(GAP, top);

    $card.css({ left: left + 'px', top: top + 'px' });

    /* ── Arrow positioning + matching style ── */
    /* The arrow is a 12×12 rotated square (z-index 909, below card z-index 910).
       The card's background covers the inner half so only the outer tip is visible.
       Background and border-color are set dynamically to match the card. */
    var ARROW  = 6; /* half of 12px */
    var chipCX = rect.left + rect.width  / 2;
    var chipCY = rect.top  + rect.height / 2;
    var arrowL, arrowT;

    if (left >= rect.right - 1) {
      /* Card is to the right → arrow on left edge, pointing left toward chip */
      arrowL = left - ARROW;
      arrowT = Math.max(top + ARROW, Math.min(chipCY - ARROW, top + cardH - ARROW * 3));
    } else if (left + cardW <= rect.left + 1) {
      /* Card is to the left → arrow on right edge, pointing right toward chip */
      arrowL = left + cardW - ARROW;
      arrowT = Math.max(top + ARROW, Math.min(chipCY - ARROW, top + cardH - ARROW * 3));
    } else if (top >= rect.bottom - 1) {
      /* Card is below → arrow on top edge, pointing up toward chip */
      arrowL = Math.max(left + ARROW, Math.min(chipCX - ARROW, left + cardW - ARROW * 3));
      arrowT = top - ARROW;
    } else {
      /* Card is above → arrow on bottom edge, pointing down toward chip */
      arrowL = Math.max(left + ARROW, Math.min(chipCX - ARROW, left + cardW - ARROW * 3));
      arrowT = top + cardH - ARROW;
    }

    var arrowCss = { left: arrowL + 'px', top: arrowT + 'px' };
    /* The arrow background matches the card surface so the inner half blends into the card.
       The border color is always set (event accent colour, or card bg, or a strong default)
       to ensure the outer triangle tip is clearly visible in both Light and Dark themes. */
    arrowCss['background']    = style.arrowBg || 'var(--surface)';
    arrowCss['border-color']  = style.arrowBorderColor || style.arrowBg || 'var(--border-strong)';
    dom.hoverArrow.css(arrowCss).addClass('hc-arrow-visible');

    /* ── Disable state-changing actions when event is already Approved or Rejected ── */
    var approvalVal = (ev.bprFieldValues || {})['beatplanner__Managers_Approval'] || '';
    if (approvalVal === 'Approved' || approvalVal === 'Rejected') {
      $card.find('.hc-act-approve, .hc-act-reject, .hc-act-delete').prop('disabled', true);
    }

    /* ── Disable approve/reject for own records when the logged-in user is not Admin ── */
    if (isSelfApprovalBlocked()) {
      $card.find('.hc-act-approve, .hc-act-reject').prop('disabled', true);
    }

    /* ── Disable all editing actions for past events ── */
    if (!isEventEditable(ev)) {
      $card.find('.hc-act-edit, .hc-act-approve, .hc-act-reject, .hc-act-delete').prop('disabled', true);
    }

    /* ── Resolve mwPhotoId from cached module records if not already set ──
       Handles COQL-loaded events where photo_id was not available at init time. */
    if (!ev.mwPhotoId && ev.mwLookupApi && ev.mwRecordId) {
      var modRecs = moduleRecordsMap[ev.mwLookupApi] || [];
      for (var mri = 0; mri < modRecs.length; mri++) {
        if (String(modRecs[mri].id) === String(ev.mwRecordId)) {
          ev.mwPhotoId = modRecs[mri].photo_id || '';
          break;
        }
      }
    }

    /* ── Load Meeting With avatar asynchronously if not yet cached ── */
    if (!ev.mwAvatarImgSrc && ev.mwPhotoId) {
      var $hcAvatar = $card.find('.hc-mw-avatar');
      var evPhotoId = ev.mwPhotoId;
      ZOHO.CRM.API.getFile({ id: evPhotoId })
        .then(function (resp) {
          if (resp && $hcAvatar.length) {
            var imgBlob = new Blob([resp], { type: 'image/jpeg' });
            var reader  = new FileReader();
            reader.onloadend = function () {
              var dataUrl = reader.result;
              ev.mwAvatarImgSrc = dataUrl;
              saveEvents();
              $hcAvatar.html('<img src="' + dataUrl + '" alt="' + escHtml(ev.title) + '">');
            };
            reader.readAsDataURL(imgBlob);
          }
        })
        .catch(function () { /* keep initials fallback */ });
    }
  }

  /**
   * Hide the hover preview card.
   */
  function hideHoverCard() {
    clearTimeout(hoverTimer);
    hoverActiveId = null;
    dom.hoverCard.removeClass('hc-visible').attr('aria-hidden', 'true');
    dom.hoverArrow.removeClass('hc-arrow-visible').css({ background: '', 'border-color': '' });
  }

  /* ──────────────────────────────────────────────────────────
     TIME SLOT PICKER (inside modal)
  ────────────────────────────────────────────────────────── */

  /**
   * Open the modal in "slot picker" phase for the given date.
   * Renders all 24 hourly slots as a grid inside the modal body.
   * Taken slots are shown but disabled.
   * @param {string}  date         – "YYYY-MM-DD"
   * @param {string?} presetAttend – optional attendance value to pre-select (e.g. "Working")
   */

  /** Returns the API name of the Attendance picklist field, falling back to the known default. */
  function getAttendanceApiName() {
    if (bprPicklistFields) {
      for (var _k = 0; _k < bprPicklistFields.length; _k++) {
        if ((bprPicklistFields[_k].field_label || '').toLowerCase().trim() === 'attendance') {
          return bprPicklistFields[_k].api_name;
        }
      }
    }
    return 'beatplanner__Attendance';
  }

  /**
   * Programmatically pre-select an Attendance value in a slot-picker grid.
   * Toggles the slot table, leave-type field, and filter action accordingly.
   * @param {jQuery} $grid   – the #slotPickerGrid or equivalent container
   * @param {string} attend  – the attendance value to select (case-insensitive, e.g. "Working")
   */
  function preselectAttendance($grid, attend) {
    var $attendWrap = $grid.find('.bp-attend-field:not(.bp-leave-type-field) .bp-dd-wrap').first();
    if (!$attendWrap.length) { return; }
    $attendWrap.find('.bp-dd-opt').each(function () {
      var label  = $(this).data('label')  || '';
      var actual = $(this).data('actual') || label;
      if (actual.toLowerCase() === attend.toLowerCase() ||
          label.toLowerCase()  === attend.toLowerCase()) {
        $attendWrap.find('.bp-dd-val').text(label).attr('data-actual-val', actual);
        var isWorking = actual.toLowerCase() === 'working';
        var isLeave   = actual.toLowerCase() === 'leave';
        $grid.find('.bp-slots-table').toggle(isWorking);
        $grid.find('.bp-leave-type-field').toggle(isLeave);
        $grid.find('.bp-apply-leave-btn').hide();
        $grid.find('.bp-mc-leave-cb-label').toggle(isLeave);
        $grid.find('.bp-filter-action').toggle(isWorking);
        if (!isLeave) {
          $grid.find('.bp-leave-type-field .bp-dd-wrap .bp-dd-val')
               .text('Select\u2026')
               .removeAttr('data-actual-val');
        }
        return false; /* break each() */
      }
    });
  }

  /**
   * Programmatically pre-select a Leave Type value in a slot-picker grid or day group.
   * @param {jQuery} $grid     – the container to search within
   * @param {string} leaveType – the leave type value to select (case-insensitive)
   */
  function preselectLeaveType($grid, leaveType) {
    if (!leaveType) { return; }
    var $leaveWrap = $grid.find('.bp-leave-type-field .bp-dd-wrap').first();
    if (!$leaveWrap.length) { return; }
    $leaveWrap.find('.bp-dd-opt').each(function () {
      var label  = $(this).data('label')  || '';
      var actual = $(this).data('actual') || label;
      if (actual.toLowerCase() === leaveType.toLowerCase() ||
          label.toLowerCase()  === leaveType.toLowerCase()) {
        $leaveWrap.find('.bp-dd-val').text(label).attr('data-actual-val', actual);
        return false; /* break each() */
      }
    });
  }

  /**
   * Returns the attendance value (lowercase) for the given date from state.events,
   * or null if no event with attendance data exists.
   * Returns 'leave' or 'working' (or null).
   */
  function getDateAttendance(date) {
    var attendApi = getAttendanceApiName();
    var evts = state.events.filter(function (e) { return e.date === date; });
    for (var _i = 0; _i < evts.length; _i++) {
      var val = ((evts[_i].bprFieldValues || {})[attendApi] || '').toLowerCase();
      if (val === 'leave' || val === 'working') { return val; }
    }
    return null;
  }

  /**
   * Compute the "Month Year" string (e.g. "July 2026") for a YYYY-MM-DD date string.
   * Mirrors the same logic used in openSlotPicker and the Monthly Beat Plan COQL queries.
   */
  function getMonthYearFromDate(dateStr) {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /**
   * Ensure a beatplanner__Monthly_Beat_Plans record exists for the given "Month Year"
   * (e.g. "July 2026").  Reuses the same COQL lookup and ZOHO.CRM.API.insertRecord
   * logic as the .cell-add-btn / openSlotPicker workflow.
   *
   * @param {string} monthYear – e.g. "July 2026"
   * @returns {Promise<string|null>} the record ID, or null on error
   */
  async function ensureMonthlyBeatPlan(monthYear) {
    try {
      var coqlConfig = {
        select_query: "SELECT id FROM beatplanner__Monthly_Beat_Plans WHERE Name = '" + monthYear + "' LIMIT 1"
      };
      var coqlResp = await ZOHO.CRM.API.coql(coqlConfig);
      var existingData = coqlResp && coqlResp.data && Array.isArray(coqlResp.data) && coqlResp.data.length > 0
                           ? coqlResp.data
                           : null;
      if (existingData) {
        return existingData[0].id;
      }
      /* Record not found – create a new one */
      var insertResp = await ZOHO.CRM.API.insertRecord({
        Entity:  'beatplanner__Monthly_Beat_Plans',
        APIData: { Name: monthYear },
        Trigger: ['workflow']
      });
      if (insertResp && insertResp.data && insertResp.data[0] && insertResp.data[0].details) {
        return insertResp.data[0].details.id;
      }
      return null;
    } catch (err) {
      console.error('ensureMonthlyBeatPlan error for', monthYear, err);
      return null;
    }
  }

  async function openSlotPicker(date, presetAttend, targetHour) {
    /* Ensure no stale open beat-plan dropdown leaks into the new view */
    closeAllBpDropdowns();

    /* Format heading: e.g. "Monday, June 23, 2026" */
    var parts = date.split('-');
    var d     = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var heading = WDAYS_LONG[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    dom.modalHeading.text(heading);

    /* ── Generate Month Year value for this date (e.g. "July 2026") ── */
    var monthYear = MONTHS[d.getMonth()] + ' ' + d.getFullYear();

    /* ── Open the modal immediately; show loader and hide body/foot ── */
    var $modalBody  = dom.modal.find('.modal-body');
    var $modalFoot  = dom.modal.find('.modal-foot');
    var $initLoader = $('#modalInitLoader');
    dom.modal.addClass('modal-open');
    $initLoader.show();
    $modalBody.hide();
    $modalFoot.hide();

    /* ── Reset Monthly Beat Plan ID for this session ── */
    monthlyBeatPlanId = null;

    /* Reuse ensureMonthlyBeatPlan (same logic as the .cell-add-btn workflow) */
    monthlyBeatPlanId = await ensureMonthlyBeatPlan(monthYear);
    console.log('Monthly Beat Plan ID for', monthYear, ':', monthlyBeatPlanId);

    /* ── Build the picker content now that init is done ── */
    if (beatPlanHasRefs) {
      /* Ensure BPR picklist fields are loaded before building the table */
      if (bprPicklistFields === null) {
        await fetchBprPicklistFields().catch(function () { bprPicklistFields = []; });
      }
      /* Beat plan mode: table with all slots + Meetings For + Meeting With dropdowns */
      dom.slotPickerGrid.html(buildBeatPlanTable(date));
      updateFilterBadge();
      dom.modal.find('.modal-box').addClass('modal-box--wide');
      /* Pre-select attendance value when requested (e.g. when re-opening for a Working day) */
      if (presetAttend) {
        preselectAttendance(dom.slotPickerGrid, presetAttend);
      }
      /* When opened from a specific hour slot, show only that row and hide the rest
         so the user can immediately create an event for the selected time slot. */
      if (targetHour !== null && targetHour !== undefined) {
        dom.slotPickerGrid.find('.bp-slot-row').each(function () {
          $(this).toggle(parseInt($(this).data('hour'), 10) === targetHour);
        });
      }
    } else {
      /* Standard mode: clickable slot buttons, 1-hour intervals 00:00 – 23:00 */
      dom.modal.find('.modal-box').removeClass('modal-box--wide');
      var html = '';
      for (var h = 0; h < 24; h++) {
        var taken     = !!eventAtHour(date, h);
        var startLbl  = fmtTime(hourToTime(h));
        var endLbl    = fmtTime(h === 23 ? '23:59' : hourToTime(h + 1));
        var takenAttr = taken ? ' disabled aria-disabled="true"' : '';
        var takenCls  = taken ? ' time-slot-item--taken' : '';
        html += '<button class="time-slot-item' + takenCls + '" data-date="' + date +
                '" data-hour="' + h + '"' + takenAttr + '>' +
                '<span class="tsi-start">' + startLbl + '</span>' +
                '<span class="tsi-sep">–</span>' +
                '<span class="tsi-end">' + endLbl + '</span>' +
                (taken ? '<span class="tsi-taken-badge">taken</span>' : '') +
                '</button>';
      }
      dom.slotPickerGrid.html(html);
    }

    /* ── Hide loader; reveal body and foot ── */
    $initLoader.hide();
    $modalBody.show();
    $modalFoot.show();

    /* Show slot picker phase; hide form phase */
    dom.slotPickerSection.show();
    dom.eventFormSection.hide();
    dom.slotPickerFoot.show();
    dom.eventFormFoot.hide();
  }

  /**
   * Open the modal for editing an existing Beat Planner record.
   * Reuses the same Beat Planner form structure as event creation, but renders
   * a single pre-populated row for the existing CRM record. The save handler
   * calls updateRecord (instead of insertRecord) when data-edit-id is present.
   *
   * @param {Object} ev – calendar event from state.events
   */
  async function openBpEditModal(ev) {
    closeAllBpDropdowns();

    /* Format heading the same way as openSlotPicker */
    var parts   = ev.date.split('-');
    var d       = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var heading = WDAYS_LONG[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    dom.modalHeading.text(heading);

    var $modalBody  = dom.modal.find('.modal-body');
    var $modalFoot  = dom.modal.find('.modal-foot');
    var $initLoader = $('#modalInitLoader');
    dom.modal.addClass('modal-open');
    $initLoader.show();
    $modalBody.hide();
    $modalFoot.hide();

    try {
      /* Ensure picklist + field metadata is available (same guard as openSlotPicker) */
      if (bprPicklistFields === null) {
        await fetchBprPicklistFields().catch(function () { bprPicklistFields = []; });
      }

      /* Build a synthetic CRM record from the COQL event data already in memory.
         This avoids a redundant API call — all required field values are stored in
         ev.bprFieldValues (populated during loadBeatPlanEvents), which is the single
         source of truth for the calendar.  The Meeting With lookup object is
         reconstructed from ev.mwLookupApi / ev.mwRecordId. */
      var crmRecord = {};
      if (ev.bprFieldValues) {
        Object.keys(ev.bprFieldValues).forEach(function (key) {
          crmRecord[key] = ev.bprFieldValues[key];
        });
      }
      if (ev.mwLookupApi && ev.mwRecordId) {
        crmRecord[ev.mwLookupApi] = { id: ev.mwRecordId, name: ev.title || '' };
      }

      dom.slotPickerGrid.html(buildBpEditForm(ev.date, crmRecord, ev));
      updateFilterBadge();
      dom.modal.find('.modal-box').addClass('modal-box--wide');

      /* ── Pre-populate / async-load the Meeting With avatar ── */
      var $mwWrap = dom.slotPickerGrid.find('.bp-mw-wrap');
      var $avatar = $mwWrap.find('.bp-rec-avatar');

      if (ev.mwAvatarImgSrc) {
        /* Cached image data URL available – use it immediately */
        $avatar.html('<img src="' + escHtml(ev.mwAvatarImgSrc) + '">')
               .attr('data-img-src', ev.mwAvatarImgSrc)
               .attr('data-photo-id', ev.mwPhotoId || '')
               .addClass('bp-rec-avatar--show');
      } else if (ev.mwPhotoId) {
        /* Not yet cached – load asynchronously; initials remain until image arrives */
        var evPhotoId = ev.mwPhotoId;
        ZOHO.CRM.API.getFile({ id: evPhotoId })
          .then(function (resp) {
            if (resp) {
              var imgBlob = new Blob([resp], { type: 'image/jpeg' });
              var reader  = new FileReader();
              reader.onloadend = function () {
                var dataUrl = reader.result;
                ev.mwAvatarImgSrc = dataUrl;
                saveEvents();
                $avatar.html('<img src="' + dataUrl + '">')
                       .attr('data-img-src', dataUrl)
                       .addClass('bp-rec-avatar--show');
              };
              reader.readAsDataURL(imgBlob);
            }
          })
          .catch(function () { /* keep initials fallback */ });
      }

    } catch (err) {
      console.error('openBpEditModal error:', err);
    }

    $initLoader.hide();
    $modalBody.show();
    $modalFoot.show();
    dom.slotPickerSection.show();
    dom.eventFormSection.hide();
    dom.slotPickerFoot.show();
    dom.eventFormFoot.hide();
  }

  /**
   * Build the beat-plan slot table HTML for the given date.
   * Renders 24 rows (one per hour) with auto-filled Start/End times,
   * fixed Meetings For / Meeting With columns, and dynamically-built
   * picklist columns sourced from beatplanner__Beat_Plan_References metadata.
   * Attendance and Leave Type are shown at the top-left of the wrapper.
   */
  function buildBeatPlanTable(date, opts) {
    var chevSvg = '<svg class="bp-dd-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor"' +
                  ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';

    /* "Meetings For" options list (same for every row) */
    var mfOptions = '';
    beatPlanModulesList.forEach(function (mod) {
      mfOptions += '<li class="bp-dd-opt" data-api="' + escHtml(mod.api) +
                   '" data-label="' + escHtml(mod.label) + '">' + escHtml(mod.label) + '</li>';
    });

    /* ── Separate BPR picklist fields:
         - Attendance  → shown at top, controls table visibility
         - Leave Type  → shown at top, visible only when Attendance = "Leave"
         - Managers Approval, Record Status, Currency, Unsubscribed Mode → excluded entirely
         - Everything else → rendered as dynamic table columns
    ── */
    var HIDDEN_BPR_LABELS = ['managers approval', 'record status', 'currency', 'unsubscribed mode', 'meetings for'];
    var tablePicklistCols = [];
    var attendanceField   = null;
    var leaveTypeField    = null;

    if (bprPicklistFields && bprPicklistFields.length) {
      bprPicklistFields.forEach(function (f) {
        var lbl = (f.field_label || '').toLowerCase().trim();
        if (HIDDEN_BPR_LABELS.indexOf(lbl) !== -1) { return; }
        if (lbl === 'attendance')        { attendanceField = f; return; }
        if (lbl === 'leave type')        { leaveTypeField  = f; return; }
        tablePicklistCols.push(f);
      });
    }

    /* Build an <li> option list from an array of {display, actual} objects or strings */
    function buildOptList(opts) {
      if (!opts || !opts.length) {
        return '<li class="bp-dd-empty">No options available</li>';
      }
      return opts.map(function (v) {
        var display = (typeof v === 'object') ? v.display : v;
        var actual  = (typeof v === 'object') ? v.actual  : v;
        return '<li class="bp-dd-opt" data-label="' + escHtml(display) +
               '" data-actual="' + escHtml(actual) + '">' + escHtml(display) + '</li>';
      }).join('');
    }

    /* Build a full searchable bp-dd-wrap dropdown */
    function buildDdWrap(fieldApi, fieldLabel, placeholder, optListHtml, rowAttr) {
      var rowPart = rowAttr ? ' ' + rowAttr : '';
      return '<div class="bp-dd-wrap"' + rowPart + ' data-api="' + escHtml(fieldApi) + '" data-label="' + escHtml(fieldLabel) + '">' +
             '<div class="bp-dd-trigger" tabindex="0">' +
             '<span class="bp-dd-val">' + escHtml(placeholder) + '</span>' +
             chevSvg +
             '</div>' +
             '<div class="bp-dd-panel">' +
             '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
             '<ul class="bp-dd-list">' + optListHtml + '</ul>' +
             '</div>' +
             '</div>';
    }

    /* ── Resolve field metadata for time and meetings-for fields ── */
    var startTimeMeta = null, endTimeMeta = null, mfMeta = null;
    bpDailyAllFields.forEach(function (f) {
      var lbl = (f.field_label || '').toLowerCase();
      if (lbl === 'start time')   { startTimeMeta = f; }
      if (lbl === 'end time')     { endTimeMeta   = f; }
      if (lbl === 'meetings for') { mfMeta        = f; }
    });
    var startTimeApi   = 'beatplanner__Date_Time_From';
    var startTimeLbl   = 'Date Time From';
    var endTimeApi     = 'beatplanner__Date_Time_To';
    var endTimeLbl     = 'Date Time To';
    var mfFieldApi     = (mfMeta && mfMeta.api_name)                  || 'beatplanner__Meetings_For';
    var mfFieldLabel   = (mfMeta && mfMeta.field_label)               || 'Meetings For';

    /* ── Attendance + Leave Type bar (top-left of .bp-slots-wrap) ── */
    var attendBar = '<div class="bp-attend-bar">';
    /* Mass Create mode: leave-day checkbox sits to the left of the Attendance dropdown.
       Hidden by default; revealed by the Attendance change handler when Leave is selected.
       Not rendered when an existing Leave record already exists for this day (opts.existingLeave). */
    if (opts && opts.massCreate && !opts.existingLeave) {
      attendBar += '<label class="bp-mc-leave-cb-label" style="display:none;" title="Mark as leave day">' +
                   '<input type="checkbox" class="bp-mc-leave-cb" aria-label="Mark as leave day">' +
                   '</label>';
    }
    if (attendanceField) {
      attendBar += '<div class="bp-attend-field">' +
                   '<span class="bp-attend-label">' + escHtml(attendanceField.field_label) + '</span>' +
                   buildDdWrap(attendanceField.api_name, attendanceField.field_label, 'Select\u2026', buildOptList(attendanceField.options)) +
                   '</div>';
    }
    if (leaveTypeField) {
      attendBar += '<div class="bp-attend-field bp-leave-type-field" style="display:none;">' +
                   '<span class="bp-attend-label">' + escHtml(leaveTypeField.field_label) + '</span>' +
                   buildDdWrap(leaveTypeField.api_name, leaveTypeField.field_label, 'Select\u2026', buildOptList(leaveTypeField.options)) +
                   '</div>';
      /* "Apply Leave" button – shown in normal (single-event) mode only; omitted in Mass Create */
      if (!(opts && opts.massCreate)) {
        attendBar += '<button class="bp-apply-leave-btn" type="button" style="display:none;">Apply Leave</button>';
      }
    }
    attendBar += '<div class="bp-filter-action" style="display:none;">' +
                 '<button class="bp-filter-btn" id="bpFilterBtn" type="button" aria-label="Open filter panel">' +
                 '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="13" height="13"><path d="M2 4h12M5 8h6M7.5 12h1"/></svg>' +
                 'Filter</button>' +
                 '</div>';
    /* ── Mass Create button (right-aligned; hidden until a row checkbox is checked) ── */
    attendBar += '<button class="bp-mass-create-btn" type="button" style="display:none;">Mass Create</button>';
    attendBar += '</div>';

    /* ── Table header (hidden until Attendance = "Working") ── */
    var tableHtml = '<table class="bp-slots-table" style="display:none;">';
    tableHtml += '<thead><tr>';
    tableHtml += '<th class="bp-th bp-cb-th"><input type="checkbox" class="bp-select-all-cb" aria-label="Select all rows"></th>';
    tableHtml += '<th class="bp-th">Date Time From</th>';
    tableHtml += '<th class="bp-th">Date Time To</th>';
    tableHtml += '<th class="bp-th">Meetings For</th>';
    tableHtml += '<th class="bp-th">Meeting With</th>';
    tablePicklistCols.forEach(function (f) {
      tableHtml += '<th class="bp-th">' + escHtml(f.field_label) + '</th>';
    });
    tableHtml += '<th class="bp-th bp-action-th">Actions</th>';
    tableHtml += '</tr></thead><tbody>';

    /* Determine the earliest hour to show: for today, skip hours whose start time has passed.
       If there are any elapsed minutes in the current hour the whole slot is already started,
       so advance to the next full hour. */
    var _nowBpt = new Date();
    var currentHour = isToday(date)
      ? (_nowBpt.getMinutes() > 0 ? _nowBpt.getHours() + 1 : _nowBpt.getHours())
      : 0;

    for (var h = currentHour; h < 24; h++) {
      /* Skip slots that already contain an existing event, or externally-supplied occupied hours */
      if ((opts && opts.skipHours) ? opts.skipHours[h] : eventAtHour(date, h)) { continue; }

      var startLbl = fmtTime(hourToTime(h));
      var endLbl   = fmtTime(h === 23 ? '23:59' : hourToTime(h + 1));

      tableHtml += '<tr class="bp-slot-row" data-date="' + date + '" data-hour="' + h + '">';
      tableHtml += '<td class="bp-cb-cell"><input type="checkbox" class="bp-row-cb" aria-label="Select row"></td>';
      tableHtml += '<td class="bp-time-cell" data-api="' + escHtml(startTimeApi) + '" data-label="' + escHtml(startTimeLbl) + '">' + startLbl + '</td>';
      tableHtml += '<td class="bp-time-cell" data-api="' + escHtml(endTimeApi) + '" data-label="' + escHtml(endTimeLbl) + '">' + endLbl + '</td>';

      /* ── Meetings For dropdown ── */
      tableHtml += '<td class="bp-dd-cell">' +
                   '<div class="bp-dd-wrap bp-mf-wrap" data-row="' + h + '" data-api="' + escHtml(mfFieldApi) + '" data-label="' + escHtml(mfFieldLabel) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val">Select module\u2026</span>' +
                   chevSvg +
                   '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + mfOptions + '</ul>' +
                   '</div>' +
                   '</div>' +
                   '</td>';

      /* ── Meeting With dropdown (with avatar slot) ── */
      tableHtml += '<td class="bp-dd-cell">' +
                   '<div class="bp-dd-wrap bp-mw-wrap" data-row="' + h + '" data-api="" data-label="Meeting With">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-rec-avatar" aria-hidden="true"></span>' +
                   '<span class="bp-dd-val">Select\u2026</span>' +
                   chevSvg +
                   '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list bp-mw-list"></ul>' +
                   '</div>' +
                   '</div>' +
                   '</td>';

      /* ── Dynamic picklist columns ── */
      tablePicklistCols.forEach(function (f) {
        tableHtml += '<td class="bp-dd-cell">' +
                     '<div class="bp-dd-wrap" data-row="' + h + '" data-api="' + escHtml(f.api_name) + '" data-label="' + escHtml(f.field_label) + '">' +
                     '<div class="bp-dd-trigger" tabindex="0">' +
                     '<span class="bp-dd-val">Select\u2026</span>' +
                     chevSvg +
                     '</div>' +
                     '<div class="bp-dd-panel">' +
                     '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                     '<ul class="bp-dd-list">' + buildOptList(f.options) + '</ul>' +
                     '</div>' +
                     '</div>' +
                     '</td>';
      });

      /* ── Actions column ── */
      tableHtml += '<td class="bp-action-cell">' +
                   '<button class="bp-row-action bp-row-save" type="button" title="Save row">' + SVG.save + '</button>' +
                   '<button class="bp-row-action bp-row-copy" type="button" title="Copy row">' + SVG.copy + '</button>' +
                   '<button class="bp-row-action bp-row-paste" type="button" title="Paste row" disabled>' + SVG.paste + '</button>' +
                   '</td>';

      tableHtml += '</tr>';
    }

    tableHtml += '</tbody></table>';

    return '<div class="bp-plan-container" data-date="' + escHtml(date) + '">' + attendBar + '<div class="bp-slots-wrap">' + tableHtml + '</div></div>';
  }

  /**
   * Build the beat-plan EDIT form HTML for a single existing event.
   * Produces the same attend-bar + table structure as buildBeatPlanTable but:
   *   - Renders only ONE row (for the event being edited).
   *   - Pre-populates every field from the fetched CRM record.
   *   - Marks the row with data-edit-id so the .bp-row-save handler calls
   *     updateRecord instead of insertRecord.
   *
   * Any field added to beatplanner__Daily_Beat_Plans automatically appears here
   * because the same bprPicklistFields / bpDailyAllFields metadata is used.
   *
   * @param {string} date       – "YYYY-MM-DD"
   * @param {Object} crmRecord  – Full CRM record from getRecord, or null
   * @param {Object} ev         – Calendar event from state.events
   */
  function buildBpEditForm(date, crmRecord, ev) {
    var chevSvg = '<svg class="bp-dd-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor"' +
                  ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';

    /* "Meetings For" options list (same for every row) */
    var mfOptions = '';
    beatPlanModulesList.forEach(function (mod) {
      mfOptions += '<li class="bp-dd-opt" data-api="' + escHtml(mod.api) +
                   '" data-label="' + escHtml(mod.label) + '">' + escHtml(mod.label) + '</li>';
    });

    /* ── Separate BPR picklist fields (same logic as buildBeatPlanTable) ── */
    var HIDDEN_BPR_LABELS = ['managers approval', 'record status', 'currency', 'unsubscribed mode', 'meetings for'];
    var tablePicklistCols = [];
    var attendanceField   = null;
    var leaveTypeField    = null;

    if (bprPicklistFields && bprPicklistFields.length) {
      bprPicklistFields.forEach(function (f) {
        var lbl = (f.field_label || '').toLowerCase().trim();
        if (HIDDEN_BPR_LABELS.indexOf(lbl) !== -1) { return; }
        if (lbl === 'attendance') { attendanceField = f; return; }
        if (lbl === 'leave type') { leaveTypeField  = f; return; }
        tablePicklistCols.push(f);
      });
    }

    /* Build an <li> option list (same helper as in buildBeatPlanTable) */
    function buildOptList(opts) {
      if (!opts || !opts.length) {
        return '<li class="bp-dd-empty">No options available</li>';
      }
      return opts.map(function (v) {
        var display = (typeof v === 'object') ? v.display : v;
        var actual  = (typeof v === 'object') ? v.actual  : v;
        return '<li class="bp-dd-opt" data-label="' + escHtml(display) +
               '" data-actual="' + escHtml(actual) + '">' + escHtml(display) + '</li>';
      }).join('');
    }

    /* Build a full searchable bp-dd-wrap dropdown */
    function buildDdWrap(fieldApi, fieldLabel, placeholder, optListHtml) {
      return '<div class="bp-dd-wrap" data-api="' + escHtml(fieldApi) + '" data-label="' + escHtml(fieldLabel) + '">' +
             '<div class="bp-dd-trigger" tabindex="0">' +
             '<span class="bp-dd-val">' + escHtml(placeholder) + '</span>' +
             chevSvg +
             '</div>' +
             '<div class="bp-dd-panel">' +
             '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
             '<ul class="bp-dd-list">' + optListHtml + '</ul>' +
             '</div>' +
             '</div>';
    }

    /* ── Resolve field metadata for time and meetings-for fields ── */
    var startTimeMeta = null, endTimeMeta = null, mfMeta = null;
    bpDailyAllFields.forEach(function (f) {
      var lbl = (f.field_label || '').toLowerCase();
      if (lbl === 'start time')   { startTimeMeta = f; }
      if (lbl === 'end time')     { endTimeMeta   = f; }
      if (lbl === 'meetings for') { mfMeta        = f; }
    });
    var startTimeApi = (startTimeMeta && startTimeMeta.api_name) || 'beatplanner__Date_Time_From';
    var startTimeLbl = (startTimeMeta && startTimeMeta.field_label) || 'Date Time From';
    var endTimeApi   = (endTimeMeta   && endTimeMeta.api_name)   || 'beatplanner__Date_Time_To';
    var endTimeLbl   = (endTimeMeta   && endTimeMeta.field_label) || 'Date Time To';
    var mfFieldApi   = (mfMeta && mfMeta.api_name)               || 'beatplanner__Meetings_For';
    var mfFieldLabel = (mfMeta && mfMeta.field_label)            || 'Meetings For';

    /* ── Read existing field values from CRM record ── */
    var attendApi      = (attendanceField && attendanceField.api_name) || 'beatplanner__Attendance';
    var leaveApi       = (leaveTypeField  && leaveTypeField.api_name)  || 'beatplanner__Leave_Type';
    var existingAttend = crmRecord ? (String(crmRecord[attendApi]  || '')) : '';
    var existingLeave  = crmRecord ? (String(crmRecord[leaveApi]   || '')) : '';
    var existingMfVal  = crmRecord ? (String(crmRecord[mfFieldApi] || '')) : '';

    /* ── Find the CRM module API that matches the stored Meetings For display label ── */
    var existingMfApi = '';
    beatPlanModulesList.forEach(function (mod) {
      if (mod.label === existingMfVal) { existingMfApi = mod.api; }
    });

    /* ── Find the lookup field for the currently selected Meetings For module ── */
    var mwLookupApiName = '';
    var existingMwId    = '';
    var existingMwName  = ev.title || '';
    if (existingMfApi) {
      for (var i = 0; i < bpDailyAllFields.length; i++) {
        var f = bpDailyAllFields[i];
        if (f.data_type === 'lookup' && f.lookup && f.lookup.module) {
          var modApiName = f.lookup.module.api_name || f.lookup.module.module || '';
          var fldLbl     = (f.field_label || '').toLowerCase();
          if (modApiName === existingMfApi || fldLbl === existingMfVal.toLowerCase()) {
            mwLookupApiName = f.api_name;
            if (crmRecord && crmRecord[f.api_name]) {
              var mwLookupVal = crmRecord[f.api_name];
              existingMwId   = (mwLookupVal && mwLookupVal.id)   || '';
              existingMwName = (mwLookupVal && (mwLookupVal.name || mwLookupVal.Full_Name)) || ev.title || '';
            }
            break;
          }
        }
      }
    }

    /* ── Build Meeting With options from cached records ── */
    var mwOpts = '';
    if (existingMfApi) {
      var mwRecords = filteredModuleRecords.hasOwnProperty(existingMfApi)
        ? filteredModuleRecords[existingMfApi]
        : (moduleRecordsMap[existingMfApi] || []);
      if (mwRecords.length === 0) {
        mwOpts = '<li class="bp-dd-empty">No records found</li>';
      } else {
        mwRecords.forEach(function (rec) {
          mwOpts += '<li class="bp-dd-opt" data-id="' + escHtml(rec.id) +
                    '" data-label="' + escHtml(rec.name) +
                    '" data-photo-id="' + escHtml(rec.photo_id || '') + '">' + escHtml(rec.name) + '</li>';
        });
      }
    }

    /* ── Visibility flags based on existing attendance value ── */
    var isWorking   = existingAttend.toLowerCase() === 'working';
    var isLeaveMode = existingAttend.toLowerCase() === 'leave';
    var tableStyle  = isWorking   ? '' : 'display:none;';
    var leaveStyle  = isLeaveMode ? '' : 'display:none;';
    var filterStyle = isWorking   ? '' : 'display:none;';

    /* ── Leave Type colour applied to the attend-bar (not the container) ── */
    var containerLeaveColor = '';
    if (isLeaveMode && existingLeave && existingLeave !== '-None-') {
      var leaveBgFv = {};
      leaveBgFv[attendApi] = existingAttend;
      leaveBgFv[leaveApi]  = existingLeave;
      containerLeaveColor = getLeaveTypeColor(leaveBgFv);
    }
    var attendBarBgStyle = containerLeaveColor ? ' style="background:' + containerLeaveColor + ';"' : '';
    var labelColorStyle  = containerLeaveColor ? ' style="color:white;"' : '';

    /* ── Approval state (needed early for Leave-mode attend-bar action buttons) ── */
    var evApprovalVal       = (ev.bprFieldValues || {})['beatplanner__Managers_Approval'] || '';
    var approvalLocked      = (evApprovalVal === 'Approved' || evApprovalVal === 'Rejected');
    var lockedAttr          = approvalLocked ? ' disabled' : '';
    var approveRejectAttr   = (approvalLocked || isSelfApprovalBlocked()) ? ' disabled' : '';
    var approveClass        = evApprovalVal === 'Approved' ? ' is-approved' : (evApprovalVal === 'Rejected' ? ' is-rejected' : '');
    var rejectClass         = evApprovalVal === 'Rejected' ? ' is-rejected' : (evApprovalVal === 'Approved' ? ' is-approved' : '');

    /* ── Attendance bar ── */
    var attendBar = '<div class="bp-attend-bar"' + attendBarBgStyle + '>';
    if (attendanceField) {
      var attendOptList = buildOptList(attendanceField.options);
      attendBar += '<div class="bp-attend-field">' +
                   '<span class="bp-attend-label"' + labelColorStyle + '>' + escHtml(attendanceField.field_label) + '</span>' +
                   '<div class="bp-dd-wrap" data-api="' + escHtml(attendApi) + '" data-label="' + escHtml(attendanceField.field_label) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val"' +
                   (existingAttend ? ' data-actual-val="' + escHtml(existingAttend) + '"' : '') + '>' +
                   escHtml(existingAttend || 'Select\u2026') + '</span>' +
                   chevSvg +
                   '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + attendOptList + '</ul>' +
                   '</div>' +
                   '</div>' +
                   '</div>';
    }
    if (leaveTypeField) {
      var leaveOptList = buildOptList(leaveTypeField.options);
      attendBar += '<div class="bp-attend-field bp-leave-type-field" style="' + leaveStyle + '">' +
                   '<span class="bp-attend-label"' + labelColorStyle + '>' + escHtml(leaveTypeField.field_label) + '</span>' +
                   '<div class="bp-dd-wrap" data-api="' + escHtml(leaveApi) + '" data-label="' + escHtml(leaveTypeField.field_label) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val"' +
                   (existingLeave ? ' data-actual-val="' + escHtml(existingLeave) + '"' : '') + '>' +
                   escHtml(existingLeave || 'Select\u2026') + '</span>' +
                   chevSvg +
                   '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + leaveOptList + '</ul>' +
                   '</div>' +
                   '</div>' +
                   '</div>';
      /* "Update Leave" button rendered only for non-leave records so Working→Leave
         transitions in edit mode still have a save path; it's hidden initially and
         shown by the Leave Type change handler once a valid leave type is selected. */
      if (!isLeaveMode) {
        attendBar += '<button class="bp-apply-leave-btn" type="button" style="display:none;">Update Leave</button>';
      }
    }
    attendBar += '<div class="bp-filter-action" style="' + filterStyle + '">' +
                 '<button class="bp-filter-btn" id="bpFilterBtn" type="button" aria-label="Open filter panel">' +
                 '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="13" height="13"><path d="M2 4h12M5 8h6M7.5 12h1"/></svg>' +
                 'Filter</button>' +
                 '</div>';
    /* Leave mode: action buttons live in the attend-bar (right-aligned) instead of
       a table action-cell row. They are toggled by the attendance change handler. */
    if (isLeaveMode) {
      attendBar += '<div class="bp-attend-leave-actions"' + (containerLeaveColor ? ' style="color:white;"' : '') + '>' +
                   '<button class="bp-row-action bp-row-save"    type="button" title="Update record">' + SVG.save    + '</button>' +
                   '<button class="bp-row-action bp-row-copy"    type="button" title="Copy record">'   + SVG.copy    + '</button>' +
                   '<button class="bp-row-action bp-row-delete"  type="button" title="Delete record"'  + lockedAttr + '>' + SVG.trash   + '</button>' +
                   '<button class="bp-row-action bp-row-approve' + approveClass + '" type="button" title="Approve record"' + approveRejectAttr + '>' + SVG.approve + '</button>' +
                   '<button class="bp-row-action bp-row-reject'  + rejectClass  + '" type="button" title="Reject record"'  + approveRejectAttr + '>' + SVG.reject  + '</button>' +
                   '</div>';
    }
    /* No Mass Create button in edit mode */
    attendBar += '</div>';

    /* ── Table header ── */
    var tableHtml = '<table class="bp-slots-table" style="' + tableStyle + '">';
    tableHtml += '<thead><tr>';
    tableHtml += '<th class="bp-th bp-cb-th"></th>';
    tableHtml += '<th class="bp-th">Date Time From</th>';
    tableHtml += '<th class="bp-th">Date Time To</th>';
    tableHtml += '<th class="bp-th">Meetings For</th>';
    tableHtml += '<th class="bp-th">Meeting With</th>';
    tablePicklistCols.forEach(function (f) {
      tableHtml += '<th class="bp-th">' + escHtml(f.field_label) + '</th>';
    });
    tableHtml += '<th class="bp-th bp-action-th">Actions</th>';
    tableHtml += '</tr></thead><tbody>';

    /* ── Single edit row ── */
    var startLbl = fmtTime(ev.startTime || '00:00');
    var endLbl   = fmtTime(ev.endTime   || '00:00');

    /* Avatar: use cached profile image if available, otherwise show initials.
       openBpEditModal will still load uncached images asynchronously. */
    var avatarHtml  = ev.mwAvatarImgSrc
      ? '<img src="' + escHtml(ev.mwAvatarImgSrc) + '">'
      : (existingMwName ? escHtml(buildRecordInitials(existingMwName)) : '');
    var avatarClass = existingMwName ? ' bp-rec-avatar--show' : '';

    /* Apply the same metadata-driven styling as the .evt-chip being edited.
       Use the fresh crmRecord Attendance/Leave Type values so the row colour
       stays in sync with the record rather than the (potentially stale) COQL cache.
       With border-collapse:separate, border-* on <tr> does not render — the
       background is applied to the <tr>; all border sides go to individual <td>s:
       left + top + bottom borders on the first cell, top + bottom on middle cells,
       and top + bottom + right on the last cell. */
    var styleEv = ev;
    if (crmRecord && (attendApi || leaveApi)) {
      var mergedVals = Object.assign({}, ev.bprFieldValues || {});
      if (existingAttend) { mergedVals[attendApi] = existingAttend; }
      if (existingLeave)  { mergedVals[leaveApi]  = existingLeave; }
      styleEv = { bprFieldValues: mergedVals };
    }
    var editRowStyles = buildBprEventStyles(styleEv);
    var cellBorderTB  = editRowStyles.borderTopStr + editRowStyles.borderBottomStr;
    var cbCellStyle   = editRowStyles.borderLeftStr + cellBorderTB;
    var actCellStyle  = cellBorderTB + editRowStyles.borderRightStr;

    /* Collect original field values for change detection on save */
    var originalVals = {
      mf:     existingMfVal,
      mfApi:  existingMfApi,
      mwId:   existingMwId,
      attend: existingAttend,
      leave:  existingLeave
    };
    tablePicklistCols.forEach(function (f) {
      var rawVal    = crmRecord ? (crmRecord[f.api_name] || '') : '';
      var actualVal = (rawVal && typeof rawVal === 'object') ? (rawVal.name || rawVal.actual_value || '') : String(rawVal);
      if (actualVal) { originalVals[f.api_name] = actualVal; }
    });

    tableHtml += '<tr class="bp-slot-row bp-edit-row"' +
                 ' data-date="' + escHtml(date) + '"' +
                 ' data-edit-id="' + escHtml(ev.id) + '"' +
                 ' data-start-time="' + escHtml(ev.startTime || '') + '"' +
                 ' data-end-time="' + escHtml(ev.endTime || '') + '"' +
                 ' data-original-vals="' + escHtml(JSON.stringify(originalVals)) + '"' +
                 (editRowStyles.bgStr ? ' style="' + escHtml(editRowStyles.bgStr) + '"' : '') + '>';

    /* Checkbox cell – hidden in edit mode; carries left + top + bottom borders and
       the chip-marker (status dot) so the edit row mirrors the full .evt-chip appearance. */
    tableHtml += '<td class="bp-cb-cell"' +
                 (cbCellStyle ? ' style="' + escHtml(cbCellStyle) + '"' : '') +
                 '>' + editRowStyles.markerHtml +
                 '<input type="checkbox" class="bp-row-cb" aria-label="Select row" disabled style="visibility:hidden;"></td>';

    /* Time cells */
    tableHtml += '<td class="bp-time-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + ' data-api="' + escHtml(startTimeApi) + '" data-label="' + escHtml(startTimeLbl) + '">' + startLbl + '</td>';
    tableHtml += '<td class="bp-time-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + ' data-api="' + escHtml(endTimeApi)   + '" data-label="' + escHtml(endTimeLbl)   + '">' + endLbl   + '</td>';

    /* ── Meetings For dropdown (pre-selected) ── */
    tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                 '<div class="bp-dd-wrap bp-mf-wrap" data-row="edit" data-api="' + escHtml(mfFieldApi) + '" data-label="' + escHtml(mfFieldLabel) + '">' +
                 '<div class="bp-dd-trigger" tabindex="0">' +
                 '<span class="bp-dd-val"' +
                 (existingMfApi ? ' data-selected-api="' + escHtml(existingMfApi) + '"' : '') + '>' +
                 escHtml(existingMfVal || 'Select module\u2026') + '</span>' +
                 chevSvg + '</div>' +
                 '<div class="bp-dd-panel">' +
                 '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                 '<ul class="bp-dd-list">' + mfOptions + '</ul>' +
                 '</div>' +
                 '</div>' +
                 '</td>';

    /* ── Meeting With dropdown (pre-selected, with avatar) ── */
    tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                 '<div class="bp-dd-wrap bp-mw-wrap" data-row="edit" data-api="' + escHtml(mwLookupApiName) + '" data-label="Meeting With">' +
                 '<div class="bp-dd-trigger" tabindex="0">' +
                 '<span class="bp-rec-avatar' + avatarClass + '" aria-hidden="true"' +
                 ' data-photo-id="' + escHtml(ev.mwPhotoId || '') + '">' + avatarHtml + '</span>' +
                 '<span class="bp-dd-val"' +
                 (existingMwId ? ' data-selected-id="' + escHtml(existingMwId) + '"' : '') + '>' +
                 escHtml(existingMwName || 'Select\u2026') + '</span>' +
                 chevSvg + '</div>' +
                 '<div class="bp-dd-panel">' +
                 '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                 '<ul class="bp-dd-list bp-mw-list">' + mwOpts + '</ul>' +
                 '</div>' +
                 '</div>' +
                 '</td>';

    /* ── Dynamic picklist columns (pre-populated) ── */
    tablePicklistCols.forEach(function (f) {
      var rawVal    = crmRecord ? (crmRecord[f.api_name] || '') : '';
      /* rawVal may be an object (lookup) – coerce to string */
      var actualVal = (rawVal && typeof rawVal === 'object') ? (rawVal.name || rawVal.actual_value || '') : String(rawVal);
      /* Find matching display label from field options */
      var displayVal = actualVal;
      if (actualVal && f.options) {
        f.options.forEach(function (opt) {
          var a = (typeof opt === 'object') ? opt.actual  : opt;
          var disp = (typeof opt === 'object') ? opt.display : opt;
          if (a === actualVal || disp === actualVal) { displayVal = disp; }
        });
      }

      tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                   '<div class="bp-dd-wrap" data-row="edit" data-api="' + escHtml(f.api_name) + '" data-label="' + escHtml(f.field_label) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val"' +
                   (actualVal ? ' data-actual-val="' + escHtml(actualVal) + '"' : '') + '>' +
                   escHtml(displayVal || 'Select\u2026') + '</span>' +
                   chevSvg +
                   '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + buildOptList(f.options) + '</ul>' +
                   '</div>' +
                   '</div>' +
                   '</td>';
    });

    /* ── Actions column: Update, Copy, Delete, Approve, Reject ── */
    tableHtml += '<td class="bp-action-cell"' + (actCellStyle ? ' style="' + escHtml(actCellStyle) + '"' : '') + '>' +
                 '<button class="bp-row-action bp-row-save"    type="button" title="Update record">' + SVG.save    + '</button>' +
                 '<button class="bp-row-action bp-row-copy"    type="button" title="Copy record">'   + SVG.copy    + '</button>' +
                 '<button class="bp-row-action bp-row-delete"  type="button" title="Delete record"'  + lockedAttr + '>' + SVG.trash   + '</button>' +
                 '<button class="bp-row-action bp-row-approve' + approveClass + '" type="button" title="Approve record"' + approveRejectAttr + '>' + SVG.approve + '</button>' +
                 '<button class="bp-row-action bp-row-reject'  + rejectClass  + '" type="button" title="Reject record"'  + approveRejectAttr + '>' + SVG.reject  + '</button>' +
                 '</td>';

    tableHtml += '</tr>';
    tableHtml += '</tbody></table>';

    /* For leave mode: replace the full (hidden) table with a hidden data-only row.
       Action buttons are rendered in the attend-bar instead of a table action-cell.
       The row is kept in the DOM so button handlers can find editId, date, etc. */
    if (isLeaveMode) {
      tableHtml = '<table class="bp-slots-table" style="display:none;">' +
                  '<tbody>' +
                  '<tr class="bp-slot-row bp-edit-row"' +
                  ' data-date="' + escHtml(date) + '"' +
                  ' data-edit-id="' + escHtml(ev.id) + '"' +
                  ' data-start-time="' + escHtml(ev.startTime || '') + '"' +
                  ' data-end-time="' + escHtml(ev.endTime || '') + '"' +
                  ' data-original-vals="' + escHtml(JSON.stringify(originalVals)) + '">' +
                  '</tr>' +
                  '</tbody></table>';
    }

    return '<div class="bp-plan-container" data-date="' + escHtml(date) + '" data-edit-id="' + escHtml(ev.id) + '">' +
           attendBar + '<div class="bp-slots-wrap">' + tableHtml + '</div></div>';
  }

  /**
   * Build the bulk-edit table HTML for the Day Events modal.
   * Renders one .bp-slot-row.bp-edit-row per event with enabled row checkboxes,
   * a "Select All" header checkbox, and a bulk-actions toolbar.
   *
   * All picklist fields (including Attendance and Leave Type) are rendered as
   * regular table columns so every event can be edited independently.
   *
   * @param {string} date          – "YYYY-MM-DD"
   * @param {Array}  evts          – calendar events for that date
   * @param {Object} crmRecordsMap – { [ev.id]: crmRecord } fetched from CRM API
   */
  function buildDemBulkTable(date, evts, crmRecordsMap) {
    /* ── Filter action bar (same #bpFilterBtn as in #eventModal) ── */
    var demFilterBar =
      '<div class="bp-attend-bar">' +
        '<div class="bp-filter-action">' +
          '<button class="bp-filter-btn" id="bpFilterBtn" type="button" aria-label="Open filter panel">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="13" height="13"><path d="M2 4h12M5 8h6M7.5 12h1"/></svg>' +
            'Filter' +
          '</button>' +
        '</div>' +
      '</div>';

    /* ── Bulk-actions toolbar (hidden until at least one row is checked) ── */
    var toolbarHtml =
      '<div class="dem-bulk-toolbar" style="display:none;">' +
        '<span class="dem-sel-count"></span>' +
        '<div class="dem-actions-dropdown">' +
          '<button class="dem-actions-btn" type="button">' +
            'Actions' +
            '<svg class="dem-actions-chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="10" height="6"><path d="M1 1l4 4 4-4"/></svg>' +
          '</button>' +
          '<ul class="dem-actions-menu" role="menu">' +
            '<li><button class="dem-mass-update-btn" type="button" role="menuitem">Mass Update</button></li>' +
            '<li><button class="dem-mass-delete-btn" type="button" role="menuitem">Mass Delete</button></li>' +
            '<li><button class="dem-mass-approve-btn" type="button" role="menuitem">Mass Approve</button></li>' +
            '<li><button class="dem-mass-reject-btn" type="button" role="menuitem">Mass Reject</button></li>' +
          '</ul>' +
        '</div>' +
      '</div>';

    return '<div id="demBulkGrid" class="bp-plan-container" data-date="' + escHtml(date) + '">' +
           demFilterBar +
           toolbarHtml +
           '<div class="bp-slots-wrap">' + buildBpEditTableHtml(date, evts, crmRecordsMap) + '</div>' +
           '</div>';
  }

  /**
   * Build and return the inner <table class="bp-slots-table"> HTML for a given
   * date and set of events, using the same structure as the Day Events Modal.
   * Each <tr> also receives data-pf-* attributes so the mass-actions popup
   * filter can show/hide rows without extra DOM queries.
   * Shared by buildDemBulkTable() and buildMassActionsBodyHtml().
   *
   * @param {string} date         – YYYY-MM-DD
   * @param {Array}  evts         – event objects for this date
   * @param {Object} crmRecordsMap – { [evId]: syntheticCrmRecord }
   * @returns {string} HTML string for the complete <table>
   */
  function buildBpEditTableHtml(date, evts, crmRecordsMap) {
    var chevSvg = '<svg class="bp-dd-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor"' +
                  ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';

    /* "Meetings For" options list (shared for every row) */
    var mfOptions = '';
    beatPlanModulesList.forEach(function (mod) {
      mfOptions += '<li class="bp-dd-opt" data-api="' + escHtml(mod.api) +
                   '" data-label="' + escHtml(mod.label) + '">' + escHtml(mod.label) + '</li>';
    });

    /* ── Collect picklist columns (exclude Attendance + Leave Type; they are no longer
         shown as separate columns in the Day Events Modal table) ── */
    var HIDDEN_BPR_LABELS = ['managers approval', 'record status', 'currency', 'unsubscribed mode', 'meetings for', 'attendance', 'leave type'];
    var tablePicklistCols = [];

    if (bprPicklistFields && bprPicklistFields.length) {
      bprPicklistFields.forEach(function (f) {
        var lbl = (f.field_label || '').toLowerCase().trim();
        if (HIDDEN_BPR_LABELS.indexOf(lbl) !== -1) { return; }
        tablePicklistCols.push(f);
      });
    }

    /* Build <li> option list */
    function buildOptList(opts) {
      if (!opts || !opts.length) {
        return '<li class="bp-dd-empty">No options available</li>';
      }
      return opts.map(function (v) {
        var display = (typeof v === 'object') ? v.display : v;
        var actual  = (typeof v === 'object') ? v.actual  : v;
        return '<li class="bp-dd-opt" data-label="' + escHtml(display) +
               '" data-actual="' + escHtml(actual) + '">' + escHtml(display) + '</li>';
      }).join('');
    }

    /* ── Resolve time / meetings-for field metadata ── */
    var startTimeApi = 'beatplanner__Date_Time_From';
    var startTimeLbl = 'Date Time From';
    var endTimeApi   = 'beatplanner__Date_Time_To';
    var endTimeLbl   = 'Date Time To';
    var mfFieldApi   = 'beatplanner__Meetings_For';
    var mfFieldLabel = 'Meetings For';
    bpDailyAllFields.forEach(function (f) {
      var lbl = (f.field_label || '').toLowerCase();
      if (lbl === 'start time')   { startTimeApi = f.api_name || startTimeApi; startTimeLbl = f.field_label || startTimeLbl; }
      if (lbl === 'end time')     { endTimeApi   = f.api_name || endTimeApi;   endTimeLbl   = f.field_label || endTimeLbl; }
      if (lbl === 'meetings for') { mfFieldApi   = f.api_name || mfFieldApi;   mfFieldLabel = f.field_label || mfFieldLabel; }
    });

    /* ── Table header ── */
    var tableHtml = '<table class="bp-slots-table">';
    tableHtml += '<thead><tr>';
    tableHtml += '<th class="bp-th bp-cb-th"><input type="checkbox" class="bp-select-all-cb" aria-label="Select all rows"></th>';
    tableHtml += '<th class="bp-th">' + escHtml(startTimeLbl) + '</th>';
    tableHtml += '<th class="bp-th">' + escHtml(endTimeLbl) + '</th>';
    tableHtml += '<th class="bp-th">' + escHtml(mfFieldLabel) + '</th>';
    tableHtml += '<th class="bp-th">Meeting With</th>';
    tablePicklistCols.forEach(function (f) {
      tableHtml += '<th class="bp-th">' + escHtml(f.field_label) + '</th>';
    });
    tableHtml += '<th class="bp-th bp-action-th">Actions</th>';
    tableHtml += '</tr></thead><tbody>';

    /* ── One row per event ── */
    evts.forEach(function (ev) {
      var crmRecord = crmRecordsMap[ev.id] || null;

      var startLbl = fmtTime(ev.startTime || '00:00');
      var endLbl   = fmtTime(ev.endTime   || '00:00');

      /* Meetings For */
      var existingMfVal = crmRecord ? String(crmRecord[mfFieldApi] || '') : '';
      var existingMfApi = '';
      beatPlanModulesList.forEach(function (mod) {
        if (mod.label === existingMfVal) { existingMfApi = mod.api; }
      });

      /* Meeting With */
      var mwLookupApiName = '';
      var existingMwId    = '';
      var existingMwName  = ev.title || '';
      if (existingMfApi) {
        for (var i = 0; i < bpDailyAllFields.length; i++) {
          var f = bpDailyAllFields[i];
          if (f.data_type === 'lookup' && f.lookup && f.lookup.module) {
            var modApiName = f.lookup.module.api_name || f.lookup.module.module || '';
            var fldLbl     = (f.field_label || '').toLowerCase();
            if (modApiName === existingMfApi || fldLbl === existingMfVal.toLowerCase()) {
              mwLookupApiName = f.api_name;
              if (crmRecord && crmRecord[f.api_name]) {
                var mwLookupVal = crmRecord[f.api_name];
                existingMwId   = (mwLookupVal && mwLookupVal.id)   || '';
                existingMwName = (mwLookupVal && (mwLookupVal.name || mwLookupVal.Full_Name)) || ev.title || '';
              }
              break;
            }
          }
        }
      }

      /* Meeting With option list */
      var mwOpts = '';
      if (existingMfApi) {
        var mwRecords = filteredModuleRecords.hasOwnProperty(existingMfApi)
          ? filteredModuleRecords[existingMfApi]
          : (moduleRecordsMap[existingMfApi] || []);
        if (mwRecords.length === 0) {
          mwOpts = '<li class="bp-dd-empty">No records found</li>';
        } else {
          mwRecords.forEach(function (rec) {
            mwOpts += '<li class="bp-dd-opt" data-id="' + escHtml(rec.id) +
                      '" data-label="' + escHtml(rec.name) +
                      '" data-photo-id="' + escHtml(rec.photo_id || '') + '">' + escHtml(rec.name) + '</li>';
          });
        }
      }

      /* Avatar – use cached profile image if available, else initials */
      var avatarHtml  = ev.mwAvatarImgSrc
        ? '<img src="' + escHtml(ev.mwAvatarImgSrc) + '">'
        : (existingMwName ? escHtml(buildRecordInitials(existingMwName)) : '');
      var avatarClass = existingMwName ? ' bp-rec-avatar--show' : '';

      /* Row styling (same as single-edit row) */
      var editRowStyles = buildBprEventStyles(ev);
      var cellBorderTB  = editRowStyles.borderTopStr + editRowStyles.borderBottomStr;
      var cbCellStyle   = editRowStyles.borderLeftStr + cellBorderTB;
      var actCellStyle  = cellBorderTB + editRowStyles.borderRightStr;

      /* Original field values for per-row change detection */
      var originalVals = {
        mf:    existingMfVal,
        mfApi: existingMfApi,
        mwId:  existingMwId
      };
      tablePicklistCols.forEach(function (f) {
        var rawVal    = crmRecord ? (crmRecord[f.api_name] || '') : '';
        var actualVal = (rawVal && typeof rawVal === 'object') ? (rawVal.name || rawVal.actual_value || '') : String(rawVal);
        if (actualVal) { originalVals[f.api_name] = actualVal; }
      });

      /* Disable approve/reject/delete when already Approved or Rejected */
      var evApprovalVal    = (ev.bprFieldValues || {})['beatplanner__Managers_Approval'] || '';
      var approvalLocked   = (evApprovalVal === 'Approved' || evApprovalVal === 'Rejected');
      var lockedAttr       = approvalLocked ? ' disabled' : '';
      var approveClass     = evApprovalVal === 'Approved' ? ' is-approved' : (evApprovalVal === 'Rejected' ? ' is-rejected' : '');
      var rejectClass      = evApprovalVal === 'Rejected' ? ' is-rejected' : (evApprovalVal === 'Approved' ? ' is-approved' : '');

      /* data-pf-* attributes for mass-actions popup filter matching */
      var pfAttrs = '';
      if (ev.bprFieldValues && bprPicklistFields && bprPicklistFields.length) {
        bprPicklistFields.forEach(function (pf2) {
          var v2 = ev.bprFieldValues[pf2.api_name];
          if (v2) {
            pfAttrs += ' data-pf-' + escHtml(pf2.api_name.toLowerCase()) + '="' + escHtml(v2) + '"';
          }
        });
      }

      tableHtml += '<tr class="bp-slot-row bp-edit-row"' +
                   ' data-date="' + escHtml(date) + '"' +
                   ' data-edit-id="' + escHtml(ev.id) + '"' +
                   ' data-start-time="' + escHtml(ev.startTime || '') + '"' +
                   ' data-end-time="' + escHtml(ev.endTime || '') + '"' +
                   ' data-original-vals="' + escHtml(JSON.stringify(originalVals)) + '"' +
                   pfAttrs +
                   (editRowStyles.bgStr ? ' style="' + escHtml(editRowStyles.bgStr) + '"' : '') + '>';

      /* Checkbox cell – disabled for Approved/Rejected rows (those cannot be bulk-selected) */
      tableHtml += '<td class="bp-cb-cell"' +
                   (cbCellStyle ? ' style="' + escHtml(cbCellStyle) + '"' : '') +
                   '>' + editRowStyles.markerHtml +
                   '<input type="checkbox" class="bp-row-cb" aria-label="Select row"' + (approvalLocked ? ' disabled' : '') + '></td>';

      /* Time cells */
      tableHtml += '<td class="bp-time-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') +
                   ' data-api="' + escHtml(startTimeApi) + '" data-label="' + escHtml(startTimeLbl) + '">' + startLbl + '</td>';
      tableHtml += '<td class="bp-time-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') +
                   ' data-api="' + escHtml(endTimeApi) + '" data-label="' + escHtml(endTimeLbl) + '">' + endLbl + '</td>';

      /* Meetings For dropdown (pre-selected) */
      tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                   '<div class="bp-dd-wrap bp-mf-wrap" data-row="edit" data-api="' + escHtml(mfFieldApi) + '" data-label="' + escHtml(mfFieldLabel) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val"' + (existingMfApi ? ' data-selected-api="' + escHtml(existingMfApi) + '"' : '') + '>' +
                   escHtml(existingMfVal || 'Select module\u2026') + '</span>' +
                   chevSvg + '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + mfOptions + '</ul>' +
                   '</div></div></td>';

      /* Meeting With dropdown (pre-selected, with avatar) */
      tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                   '<div class="bp-dd-wrap bp-mw-wrap" data-row="edit" data-api="' + escHtml(mwLookupApiName) + '" data-label="Meeting With">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-rec-avatar' + avatarClass + '" aria-hidden="true"' +
                   ' data-photo-id="' + escHtml(ev.mwPhotoId || '') + '">' + avatarHtml + '</span>' +
                   '<span class="bp-dd-val"' + (existingMwId ? ' data-selected-id="' + escHtml(existingMwId) + '"' : '') + '>' +
                   escHtml(existingMwName || 'Select\u2026') + '</span>' +
                   chevSvg + '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list bp-mw-list">' + mwOpts + '</ul>' +
                   '</div></div></td>';

      /* Dynamic picklist columns (including Attendance and Leave Type) */
      tablePicklistCols.forEach(function (f) {
        var rawVal    = crmRecord ? (crmRecord[f.api_name] || '') : '';
        var actualVal = (rawVal && typeof rawVal === 'object') ? (rawVal.name || rawVal.actual_value || '') : String(rawVal);
        var displayVal = actualVal;
        if (actualVal && f.options) {
          f.options.forEach(function (opt) {
            var a    = (typeof opt === 'object') ? opt.actual  : opt;
            var disp = (typeof opt === 'object') ? opt.display : opt;
            if (a === actualVal || disp === actualVal) { displayVal = disp; }
          });
        }

        tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                     '<div class="bp-dd-wrap" data-row="edit" data-api="' + escHtml(f.api_name) + '" data-label="' + escHtml(f.field_label) + '">' +
                     '<div class="bp-dd-trigger" tabindex="0">' +
                     '<span class="bp-dd-val"' + (actualVal ? ' data-actual-val="' + escHtml(actualVal) + '"' : '') + '>' +
                     escHtml(displayVal || 'Select\u2026') + '</span>' +
                     chevSvg + '</div>' +
                     '<div class="bp-dd-panel">' +
                     '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                     '<ul class="bp-dd-list">' + buildOptList(f.options) + '</ul>' +
                     '</div></div></td>';
      });

      /* Actions column: Save, Copy, Delete, Approve, Reject.
         Disable modifying actions when the event is in the past (past date or elapsed time today). */
      var pastLocked   = !isEventEditable(ev);
      var pastAttr     = pastLocked ? ' disabled' : '';
      tableHtml += '<td class="bp-action-cell"' + (actCellStyle ? ' style="' + escHtml(actCellStyle) + '"' : '') + '>' +
                   '<button class="bp-row-action bp-row-save"    type="button" title="Update record"'  + pastAttr   + '>' + SVG.save    + '</button>' +
                   '<button class="bp-row-action bp-row-copy"    type="button" title="Copy record">'   + SVG.copy    + '</button>' +
                   '<button class="bp-row-action bp-row-delete"  type="button" title="Delete record"'  + (approvalLocked || pastLocked ? ' disabled' : '') + '>' + SVG.trash   + '</button>' +
                   '<button class="bp-row-action bp-row-approve' + approveClass + '" type="button" title="Approve record"' + (approvalLocked || pastLocked || isSelfApprovalBlocked() ? ' disabled' : '') + '>' + SVG.approve + '</button>' +
                   '<button class="bp-row-action bp-row-reject'  + rejectClass  + '" type="button" title="Reject record"'  + (approvalLocked || pastLocked || isSelfApprovalBlocked() ? ' disabled' : '') + '>' + SVG.reject  + '</button>' +
                   '</td>';

      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  /**
   * Build one .bp-plan-container for a single event inside the Mass Update popup.
   * Renders an editable attend bar (Attendance + Leave Type) at the top.
   * For Working records the full slot table is shown (one .bp-slot-row.bp-edit-row
   * with an enabled checkbox). For Leave records only the attend bar is visible.
   * Leave Type picklist colour is applied as an inline background on the container.
   *
   * @param {Object} ev – calendar event from state.events
   * @returns {string} HTML string
   */
  function buildMassUpdateEventHtml(ev) {
    if (!ev) { return ''; }

    var chevSvg = '<svg class="bp-dd-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor"' +
                  ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';

    /* Meetings For options */
    var mfOptions = '';
    beatPlanModulesList.forEach(function (mod) {
      mfOptions += '<li class="bp-dd-opt" data-api="' + escHtml(mod.api) +
                   '" data-label="' + escHtml(mod.label) + '">' + escHtml(mod.label) + '</li>';
    });

    /* Separate BPR picklist fields */
    var HIDDEN_BPR_LABELS_MU = ['managers approval', 'record status', 'currency', 'unsubscribed mode', 'meetings for'];
    var tablePicklistCols = [];
    var attendanceField   = null;
    var leaveTypeField    = null;

    if (bprPicklistFields && bprPicklistFields.length) {
      bprPicklistFields.forEach(function (f) {
        var lbl = (f.field_label || '').toLowerCase().trim();
        if (HIDDEN_BPR_LABELS_MU.indexOf(lbl) !== -1) { return; }
        if (lbl === 'attendance') { attendanceField = f; return; }
        if (lbl === 'leave type') { leaveTypeField  = f; return; }
        tablePicklistCols.push(f);
      });
    }

    function buildOptList(opts) {
      if (!opts || !opts.length) {
        return '<li class="bp-dd-empty">No options available</li>';
      }
      return opts.map(function (v) {
        var display = (typeof v === 'object') ? v.display : v;
        var actual  = (typeof v === 'object') ? v.actual  : v;
        return '<li class="bp-dd-opt" data-label="' + escHtml(display) +
               '" data-actual="' + escHtml(actual) + '">' + escHtml(display) + '</li>';
      }).join('');
    }

    /* Resolve field metadata */
    var startTimeApi = 'beatplanner__Date_Time_From', startTimeLbl = 'Date Time From';
    var endTimeApi   = 'beatplanner__Date_Time_To',   endTimeLbl   = 'Date Time To';
    var mfFieldApi   = 'beatplanner__Meetings_For',   mfFieldLabel = 'Meetings For';
    bpDailyAllFields.forEach(function (f) {
      var lbl = (f.field_label || '').toLowerCase();
      if (lbl === 'start time')   { startTimeApi = f.api_name || startTimeApi; startTimeLbl = f.field_label || startTimeLbl; }
      if (lbl === 'end time')     { endTimeApi   = f.api_name || endTimeApi;   endTimeLbl   = f.field_label || endTimeLbl; }
      if (lbl === 'meetings for') { mfFieldApi   = f.api_name || mfFieldApi;   mfFieldLabel = f.field_label || mfFieldLabel; }
    });

    /* Read existing field values */
    var attendApi      = (attendanceField && attendanceField.api_name) || 'beatplanner__Attendance';
    var leaveApi       = (leaveTypeField  && leaveTypeField.api_name)  || 'beatplanner__Leave_Type';
    var bprVals        = ev.bprFieldValues || {};
    var existingAttend = String(bprVals[attendApi]  || '');
    var existingLeave  = String(bprVals[leaveApi]   || '');

    /* Meetings For */
    var existingMfVal = String(bprVals[mfFieldApi] || '');
    var existingMfApi = '';
    beatPlanModulesList.forEach(function (mod) {
      if (mod.label === existingMfVal) { existingMfApi = mod.api; }
    });

    /* Meeting With */
    var mwLookupApiName = '';
    var existingMwId    = ev.mwRecordId || '';
    var existingMwName  = ev.title || '';
    if (existingMfApi) {
      for (var fi = 0; fi < bpDailyAllFields.length; fi++) {
        var fld = bpDailyAllFields[fi];
        if (fld.data_type === 'lookup' && fld.lookup && fld.lookup.module) {
          var modApiName = fld.lookup.module.api_name || fld.lookup.module.module || '';
          var fldLbl     = (fld.field_label || '').toLowerCase();
          if (modApiName === existingMfApi || fldLbl === existingMfVal.toLowerCase()) {
            mwLookupApiName = fld.api_name;
            break;
          }
        }
      }
    }

    /* Meeting With option list */
    var mwOpts = '';
    if (existingMfApi) {
      var mwRecords = filteredModuleRecords.hasOwnProperty(existingMfApi)
        ? filteredModuleRecords[existingMfApi]
        : (moduleRecordsMap[existingMfApi] || []);
      if (mwRecords.length === 0) {
        mwOpts = '<li class="bp-dd-empty">No records found</li>';
      } else {
        mwRecords.forEach(function (rec) {
          mwOpts += '<li class="bp-dd-opt" data-id="' + escHtml(rec.id) +
                    '" data-label="' + escHtml(rec.name) +
                    '" data-photo-id="' + escHtml(rec.photo_id || '') + '">' + escHtml(rec.name) + '</li>';
        });
      }
    }

    /* Visibility flags */
    var isLeaveMode = existingAttend.toLowerCase() === 'leave';
    var isWorking   = existingAttend.toLowerCase() === 'working';
    var tableStyle  = isWorking   ? '' : 'display:none;';
    var leaveStyle  = isLeaveMode ? '' : 'display:none;';

    /* Row styling – computed early so borderLeftStr is available for the attend-bar */
    var editRowStyles = buildBprEventStyles(ev);
    var cellBorderTB  = editRowStyles.borderTopStr + editRowStyles.borderBottomStr;
    var cbCellStyle   = editRowStyles.borderLeftStr + cellBorderTB;
    var actCellStyle  = cellBorderTB + editRowStyles.borderRightStr;

    /* Leave Type colour applied to the attend-bar (not the container) */
    var containerLeaveColor = '';
    if (isLeaveMode && existingLeave && existingLeave !== '-None-') {
      var colorFv = {};
      colorFv[attendApi] = existingAttend;
      colorFv[leaveApi]  = existingLeave;
      containerLeaveColor = getLeaveTypeColor(colorFv);
    }
    /* For Leave records: combine Leave Type background with Manager Approval left-border
       on the attend-bar so the status indicator is visible (the table row is hidden). */
    var attendBarStyleStr = '';
    if (containerLeaveColor) { attendBarStyleStr += 'background:' + containerLeaveColor + ';'; }
    if (isLeaveMode && editRowStyles.borderLeftStr) { attendBarStyleStr += editRowStyles.borderLeftStr; }
    var attendBarBgStyle  = attendBarStyleStr ? ' style="' + attendBarStyleStr + '"' : '';
    var muLabelColorStyle = containerLeaveColor ? ' style="color:white;"' : '';

    /* Approval state (needed early for Leave-mode attend-bar action buttons) */
    var evApprovalVal     = bprVals['beatplanner__Managers_Approval'] || '';
    var approvalLocked    = (evApprovalVal === 'Approved' || evApprovalVal === 'Rejected');
    var lockedAttr        = approvalLocked ? ' disabled' : '';
    var approveRejectAttr = (approvalLocked || isSelfApprovalBlocked()) ? ' disabled' : '';
    var approveClass      = evApprovalVal === 'Approved' ? ' is-approved' : (evApprovalVal === 'Rejected' ? ' is-rejected' : '');
    var rejectClass       = evApprovalVal === 'Rejected' ? ' is-rejected' : (evApprovalVal === 'Approved' ? ' is-approved' : '');

    /* Attend bar */
    var attendBar = '<div class="bp-attend-bar"' + attendBarBgStyle + '>';
    /* For Leave records: show the selection checkbox on the left side of the attend-bar
       so it is always visible and participates in mass-action selection. */
    if (isLeaveMode) {
      attendBar += editRowStyles.markerHtml +
                   '<input type="checkbox" class="bp-row-cb" aria-label="Select row">';
    }
    if (attendanceField) {
      attendBar += '<div class="bp-attend-field">' +
                   '<span class="bp-attend-label"' + muLabelColorStyle + '>' + escHtml(attendanceField.field_label) + '</span>' +
                   '<div class="bp-dd-wrap" data-api="' + escHtml(attendApi) + '" data-label="' + escHtml(attendanceField.field_label) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val"' +
                   (existingAttend ? ' data-actual-val="' + escHtml(existingAttend) + '"' : '') + '>' +
                   escHtml(existingAttend || 'Select\u2026') + '</span>' +
                   chevSvg + '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + buildOptList(attendanceField.options) + '</ul>' +
                   '</div></div></div>';
    }
    if (leaveTypeField) {
      attendBar += '<div class="bp-attend-field bp-leave-type-field" style="' + leaveStyle + '">' +
                   '<span class="bp-attend-label"' + muLabelColorStyle + '>' + escHtml(leaveTypeField.field_label) + '</span>' +
                   '<div class="bp-dd-wrap" data-api="' + escHtml(leaveApi) + '" data-label="' + escHtml(leaveTypeField.field_label) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val"' +
                   (existingLeave ? ' data-actual-val="' + escHtml(existingLeave) + '"' : '') + '>' +
                   escHtml(existingLeave || 'Select\u2026') + '</span>' +
                   chevSvg + '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + buildOptList(leaveTypeField.options) + '</ul>' +
                   '</div></div></div>';
      /* "Update Leave" button rendered only for non-leave records so Working→Leave
         transitions still have a save path via the attend-bar Leave Type handler. */
      if (!isLeaveMode) {
        attendBar += '<button class="bp-apply-leave-btn" type="button" style="display:none;">Update Leave</button>';
      }
    }
    /* Leave mode: action buttons rendered in the attend-bar (right-aligned). */
    if (isLeaveMode) {
      attendBar += '<div class="bp-attend-leave-actions"' + (containerLeaveColor ? ' style="color:white;"' : '') + '>' +
                   '<button class="bp-row-action bp-row-save"    type="button" title="Update record">' + SVG.save    + '</button>' +
                   '<button class="bp-row-action bp-row-copy"    type="button" title="Copy record">'   + SVG.copy    + '</button>' +
                   '<button class="bp-row-action bp-row-delete"  type="button" title="Delete record"'  + lockedAttr + '>' + SVG.trash   + '</button>' +
                   '<button class="bp-row-action bp-row-approve' + approveClass + '" type="button" title="Approve record"' + approveRejectAttr + '>' + SVG.approve + '</button>' +
                   '<button class="bp-row-action bp-row-reject'  + rejectClass  + '" type="button" title="Reject record"'  + approveRejectAttr + '>' + SVG.reject  + '</button>' +
                   '</div>';
    }
    attendBar += '</div>';

    /* Working records: don't show the Attendance / Leave Type bar.
       The full Working table already contains all required fields + action buttons. */
    if (isWorking) { attendBar = ''; }

    /* Table */
    var date    = ev.date || '';
    var startLbl = fmtTime(ev.startTime || '00:00');
    var endLbl   = fmtTime(ev.endTime   || '00:00');

    /* Avatar – use cached image if available */
    var avatarHtml  = ev.mwAvatarImgSrc
      ? '<img src="' + escHtml(ev.mwAvatarImgSrc) + '">'
      : (existingMwName ? escHtml(buildRecordInitials(existingMwName)) : '');
    var avatarClass = existingMwName ? ' bp-rec-avatar--show' : '';

    /* Original field values for change detection */
    var originalVals = {
      mf:     existingMfVal,
      mfApi:  existingMfApi,
      mwId:   existingMwId,
      attend: existingAttend,
      leave:  existingLeave
    };
    tablePicklistCols.forEach(function (f) {
      var rawVal    = bprVals[f.api_name] || '';
      var actualVal = (rawVal && typeof rawVal === 'object') ? (rawVal.name || rawVal.actual_value || '') : String(rawVal);
      if (actualVal) { originalVals[f.api_name] = actualVal; }
    });

    /* data-pf-* attributes for filter matching */
    var pfAttrs = '';
    if (bprPicklistFields && bprPicklistFields.length) {
      bprPicklistFields.forEach(function (pf) {
        var v = bprVals[pf.api_name];
        if (v) { pfAttrs += ' data-pf-' + escHtml(pf.api_name.toLowerCase()) + '="' + escHtml(v) + '"'; }
      });
    }

    /* Build table */
    var tableHtml = '<table class="bp-slots-table" style="' + tableStyle + '">';
    tableHtml += '<thead><tr>';
    tableHtml += '<th class="bp-th bp-cb-th"></th>';
    tableHtml += '<th class="bp-th">' + escHtml(startTimeLbl) + '</th>';
    tableHtml += '<th class="bp-th">' + escHtml(endTimeLbl) + '</th>';
    tableHtml += '<th class="bp-th">' + escHtml(mfFieldLabel) + '</th>';
    tableHtml += '<th class="bp-th">Meeting With</th>';
    tablePicklistCols.forEach(function (f) {
      tableHtml += '<th class="bp-th">' + escHtml(f.field_label) + '</th>';
    });
    tableHtml += '<th class="bp-th bp-action-th">Actions</th>';
    tableHtml += '</tr></thead><tbody>';

    tableHtml += '<tr class="bp-slot-row bp-edit-row"' +
                 ' data-date="' + escHtml(date) + '"' +
                 ' data-edit-id="' + escHtml(ev.id) + '"' +
                 ' data-start-time="' + escHtml(ev.startTime || '') + '"' +
                 ' data-end-time="' + escHtml(ev.endTime || '') + '"' +
                 ' data-original-vals="' + escHtml(JSON.stringify(originalVals)) + '"' +
                 pfAttrs +
                 (editRowStyles.bgStr ? ' style="' + escHtml(editRowStyles.bgStr) + '"' : '') + '>';

    tableHtml += '<td class="bp-cb-cell"' +
                 (cbCellStyle ? ' style="' + escHtml(cbCellStyle) + '"' : '') +
                 '>' + editRowStyles.markerHtml +
                 '<input type="checkbox" class="bp-row-cb" aria-label="Select row"></td>';

    tableHtml += '<td class="bp-time-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') +
                 ' data-api="' + escHtml(startTimeApi) + '" data-label="' + escHtml(startTimeLbl) + '">' + startLbl + '</td>';
    tableHtml += '<td class="bp-time-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') +
                 ' data-api="' + escHtml(endTimeApi) + '" data-label="' + escHtml(endTimeLbl) + '">' + endLbl + '</td>';

    /* Meetings For */
    tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                 '<div class="bp-dd-wrap bp-mf-wrap" data-row="edit" data-api="' + escHtml(mfFieldApi) + '" data-label="' + escHtml(mfFieldLabel) + '">' +
                 '<div class="bp-dd-trigger" tabindex="0">' +
                 '<span class="bp-dd-val"' + (existingMfApi ? ' data-selected-api="' + escHtml(existingMfApi) + '"' : '') + '>' +
                 escHtml(existingMfVal || 'Select module\u2026') + '</span>' +
                 chevSvg + '</div>' +
                 '<div class="bp-dd-panel">' +
                 '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                 '<ul class="bp-dd-list">' + mfOptions + '</ul>' +
                 '</div></div></td>';

    /* Meeting With */
    tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                 '<div class="bp-dd-wrap bp-mw-wrap" data-row="edit" data-api="' + escHtml(mwLookupApiName) + '" data-label="Meeting With">' +
                 '<div class="bp-dd-trigger" tabindex="0">' +
                 '<span class="bp-rec-avatar' + avatarClass + '" aria-hidden="true"' +
                 ' data-photo-id="' + escHtml(ev.mwPhotoId || '') + '">' + avatarHtml + '</span>' +
                 '<span class="bp-dd-val"' + (existingMwId ? ' data-selected-id="' + escHtml(existingMwId) + '"' : '') + '>' +
                 escHtml(existingMwName || 'Select\u2026') + '</span>' +
                 chevSvg + '</div>' +
                 '<div class="bp-dd-panel">' +
                 '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                 '<ul class="bp-dd-list bp-mw-list">' + mwOpts + '</ul>' +
                 '</div></div></td>';

    /* Dynamic picklist columns */
    tablePicklistCols.forEach(function (f) {
      var rawVal    = bprVals[f.api_name] || '';
      var actualVal = (rawVal && typeof rawVal === 'object') ? (rawVal.name || rawVal.actual_value || '') : String(rawVal);
      var displayVal = actualVal;
      if (actualVal && f.options) {
        f.options.forEach(function (opt) {
          var a    = (typeof opt === 'object') ? opt.actual  : opt;
          var disp = (typeof opt === 'object') ? opt.display : opt;
          if (a === actualVal || disp === actualVal) { displayVal = disp; }
        });
      }
      tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                   '<div class="bp-dd-wrap" data-row="edit" data-api="' + escHtml(f.api_name) + '" data-label="' + escHtml(f.field_label) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val"' + (actualVal ? ' data-actual-val="' + escHtml(actualVal) + '"' : '') + '>' +
                   escHtml(displayVal || 'Select\u2026') + '</span>' +
                   chevSvg + '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + buildOptList(f.options) + '</ul>' +
                   '</div></div></td>';
    });

    /* Actions */
    tableHtml += '<td class="bp-action-cell"' + (actCellStyle ? ' style="' + escHtml(actCellStyle) + '"' : '') + '>' +
                 '<button class="bp-row-action bp-row-save"    type="button" title="Update record">' + SVG.save    + '</button>' +
                 '<button class="bp-row-action bp-row-copy"    type="button" title="Copy record">'   + SVG.copy    + '</button>' +
                 '<button class="bp-row-action bp-row-delete"  type="button" title="Delete record"'  + lockedAttr + '>' + SVG.trash   + '</button>' +
                 '<button class="bp-row-action bp-row-approve' + approveClass + '" type="button" title="Approve record"' + approveRejectAttr + '>' + SVG.approve + '</button>' +
                 '<button class="bp-row-action bp-row-reject'  + rejectClass  + '" type="button" title="Reject record"'  + approveRejectAttr + '>' + SVG.reject  + '</button>' +
                 '</td>';

    tableHtml += '</tr></tbody></table>';

    /* For leave mode: the checkbox has moved to the attend-bar (left side); the hidden
       table is kept so that toggling Attendance back to Working can still show a table.
       The .bp-slot-row / .bp-edit-row class and all data attributes are promoted to the
       outer container so that the mass-actions selection logic finds them correctly. */
    if (isLeaveMode) {
      tableHtml = '<table class="bp-slots-table" style="display:none;"><tbody></tbody></table>';

      return '<div class="bp-plan-container map-event-container bp-slot-row bp-edit-row"' +
             pfAttrs +
             ' data-date="' + escHtml(date) + '"' +
             ' data-edit-id="' + escHtml(ev.id) + '"' +
             ' data-start-time="' + escHtml(ev.startTime || '') + '"' +
             ' data-end-time="' + escHtml(ev.endTime || '') + '"' +
             ' data-original-vals="' + escHtml(JSON.stringify(originalVals)) + '">' +
             attendBar + '<div class="bp-slots-wrap">' + tableHtml + '</div></div>';
    }

    return '<div class="bp-plan-container map-event-container"' +
           ' data-date="' + escHtml(date) + '"' +
           ' data-edit-id="' + escHtml(ev.id) + '">' +
           attendBar + '<div class="bp-slots-wrap">' + tableHtml + '</div></div>';
  }

  /**
   * Build the HTML for the Mass Update popup body.
   * Renders one .bp-plan-container per event (via buildMassUpdateEventHtml),
   * grouped by date in a collapsible accordion.
   *
   * @param {Array} groups – output of getVisibleEventsByDate()
   * @returns {string} HTML string
   */
  function buildMassUpdateBodyHtml(groups) {
    if (!groups.length) { return ''; }

    var chevSvg = '<svg class="map-day-toggle-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor" ' +
                  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';
    var html = '';
    groups.forEach(function (group) {
      html += '<div class="map-day-group" data-date="' + escHtml(group.date) + '">' +
              '  <div class="map-day-header">' +
              '    <label class="map-cb-label">' +
              '      <input type="checkbox" class="map-cb map-day-cb" data-date="' + escHtml(group.date) + '" />' +
              '      <span class="map-cb-text map-day-label">' + escHtml(fmtDateLabel(group.date)) + '</span>' +
              '    </label>' +
              '    <button type="button" class="map-day-toggle" aria-label="Toggle day" aria-expanded="true">' + chevSvg + '</button>' +
              '  </div>' +
              '  <div class="map-day-events">';

      group.events.forEach(function (ev) {
        html += buildMassUpdateEventHtml(ev);
      });

      html += '  </div>' +
              '</div>';
    });
    return html;
  }

  /**
   * Return a human-readable display name for a CRM record fetched from
   * Contacts, Accounts, Deals and other common modules).
   *
   * Some related/lookup fields (e.g. Account_Name inside a Deals record)
   * are returned by the API as objects {name, id} rather than plain strings.
   * toStr() extracts the human-readable value from either form.
   */
  function recordDisplayName(rec) {
    function toStr(v) {
      if (!v) { return ''; }
      if (typeof v === 'string') { return v; }
      if (typeof v === 'object') { return v.name || v.Full_Name || ''; }
      return '';
    }
    return toStr(rec.Deal_Name)    ||
           toStr(rec.Full_Name)    ||
           toStr(rec.Account_Name) ||
           toStr(rec.Name)         ||
           toStr(rec.Last_Name)    ||
           toStr(rec.Subject)      ||
           rec.id                  || '';
  }

  /**
   * Return 1-2 uppercase initials from a display name (used for record avatars).
   */
  function buildRecordInitials(name) {
    var parts = (name || '?').trim().split(/\s+/);
    return (parts.length >= 2
      ? parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
      : (parts[0] || '?').charAt(0)).toUpperCase();
  }

  /**
   * Return the .bp-dd-wrap that owns a given element inside a beat-plan
   * dropdown.
   */
  function bpWrapOf($el) {
    return $el.closest('.bp-dd-wrap');
  }

  /**
   * Close a single .bp-dd-wrap dropdown.
   */
  function closeBpDropdown($wrap) {
    $wrap.removeClass('bp-dd-open');
  }

  /**
   * Close all open beat-plan dropdowns inside the slot picker grid or the
   * day-events bulk modal grid.
   */
  function closeAllBpDropdowns() {
    $('#slotPickerGrid .bp-dd-wrap.bp-dd-open, #demBulkGrid .bp-dd-wrap.bp-dd-open, #massActionsBody .bp-dd-wrap.bp-dd-open').each(function () {
      closeBpDropdown($(this));
    });
  }

  /* ── Image preview overlay ──────────────────────────────── */

  function openImgPreview(src, alt) {
    $('#imgPreviewImg').attr({ src: src, alt: alt || '' });
    $('#imgPreviewOverlay').addClass('img-prev-open');
  }

  function closeImgPreview() {
    $('#imgPreviewOverlay').removeClass('img-prev-open');
    /* Delay clearing src so the close animation (if any) finishes before the image disappears */
    setTimeout(function () { $('#imgPreviewImg').attr('src', ''); }, 50);
  }

  function closeSlotPicker() {
    closeAllBpDropdowns();
    dom.modal.removeClass('modal-open');
    massCreateMode = false;
    /* Defer DOM resets until after the fade-out transition (0.22s) to avoid a blink */
    setTimeout(function () {
      dom.modal.find('.modal-box').removeClass('modal-box--wide');
      dom.modal.find('.modal-body').removeClass('modal-body--mc');
      dom.slotPickerSection.hide();
      dom.eventFormSection.show();
      dom.slotPickerFoot.hide();
      dom.eventFormFoot.show();
    }, 250);
  }

  /**
   * Refresh the event display for a single date in the current view without
   * closing the slot picker or triggering a full render. Called after a new
   * Beat Plan row is saved so the .evt-chip appears immediately.
   *
   * @param {string} ds  Date string "YYYY-MM-DD".
   */
  function refreshCalendarCell(ds) {
    var past = isPast(ds);

    if (state.view === 'month') {
      var $cell = dom.canvas.find('.m-cell[data-date="' + ds + '"]');
      if (!$cell.length) { return; }
      var evts    = eventsOn(ds);
      var maxShow = 3;
      var chips   = '';
      evts.slice(0, maxShow).forEach(function (ev) {
        chips += renderChip(ev, past);
      });
      $cell.find('.cell-events').html(chips);
      /* Sync the "+N more" chip that follows the cell */
      var $more = $cell.find('.more-chip');
      if (evts.length > maxShow) {
        var moreHtml = '<div class="more-chip" data-date="' + ds + '">+' + (evts.length - maxShow) + ' more</div>';
        if ($more.length) { $more.replaceWith(moreHtml); } else { $cell.append(moreHtml); }
      } else {
        $more.remove();
      }

    } else if (state.view === 'week') {
      var $col = dom.canvas.find('.week-day-col[data-date="' + ds + '"]');
      if (!$col.length) { return; }
      $col.find('.time-event').remove();
      eventsOn(ds).forEach(function (ev) {
        $col.append(renderTimeEvent(ev, ds));
      });

    } else if (state.view === 'day') {
      var $grid = dom.canvas.find('.day-grid');
      if (!$grid.length) { return; }
      $grid.find('.time-event').remove();
      eventsOn(ds).forEach(function (ev) {
        $grid.append(renderTimeEvent(ev, ds));
      });
    }
  }

  /**
   * Build and show the day events modal for a given date string.
   *
   * When the widget has Beat Plan refs (beatPlanHasRefs), every event is rendered
   * using the same .bp-slot-row.bp-edit-row layout as the single-event edit form,
   * with enabled row checkboxes and a bulk-actions toolbar (Mass Update / Mass Delete).
   * Otherwise falls back to the original hover-card list.
   */
  async function showDayEventsModal(ds) {
    var evts = eventsOn(ds);

    /* Build date label */
    var parts = ds.split('-');
    var d     = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    dom.demDate.text(WDAYS_LONG[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear());

    /* Track the currently open DEM date for post-action refreshes */
    demCurrentDs = ds;

    /* Open the overlay immediately (show loading state) */
    dom.demList.removeClass('dem-table-mode');
    dom.dayEventsModal.find('.day-events-modal-box').removeClass('dem-box-wide');
    dom.dayEventsModal.addClass('dem-open');

    /* ── Beat Plan mode: render bulk-edit table ── */
    if (beatPlanHasRefs) {
      dom.demList.addClass('dem-table-mode');
      dom.dayEventsModal.find('.day-events-modal-box').addClass('dem-box-wide');

      if (evts.length === 0) {
        dom.demList.html('<div class="dem-loading">No events on this day.</div>');
        return;
      }

      /* Ensure picklist metadata is loaded */
      if (bprPicklistFields === null) {
        dom.demList.html('<div class="dem-loading">Loading\u2026</div>');
        await fetchBprPicklistFields().catch(function () { bprPicklistFields = []; });
      }

      /* Build crmRecordsMap from already-loaded COQL event data – no API call needed */
      var crmRecordsMap = {};
      evts.forEach(function (ev) {
        var synthetic = {};
        /* Copy all stored string field values */
        if (ev.bprFieldValues) {
          Object.keys(ev.bprFieldValues).forEach(function (key) {
            synthetic[key] = ev.bprFieldValues[key];
          });
        }
        /* Restore the Meeting With lookup object so buildDemBulkTable can resolve id/name */
        if (ev.mwLookupApi && ev.mwRecordId) {
          synthetic[ev.mwLookupApi] = { id: ev.mwRecordId, name: ev.title || '' };
        }
        crmRecordsMap[ev.id] = synthetic;
      });

      dom.demList.html(buildDemBulkTable(ds, evts, crmRecordsMap));

      /* Populate avatars from the photo cache — no new API calls needed */
      evts.forEach(function (ev) {
        if (!ev.mwAvatarImgSrc) return;
        var $row = dom.demList.find('.bp-slot-row[data-edit-id="' + ev.id + '"]');
        if (!$row.length) return;
        var $avatar = $row.find('.bp-rec-avatar');
        if (!$avatar.length) return;
        $avatar.html('<img src="' + escHtml(ev.mwAvatarImgSrc) + '">')
               .attr('data-img-src', ev.mwAvatarImgSrc)
               .attr('data-photo-id', ev.mwPhotoId || '')
               .addClass('bp-rec-avatar--show');
      });

      updateFilterBadge();
      return;
    }

    /* ── Fallback: hover-card list (non-Beat-Plan mode) ── */
    var listHtml = '';
    evts.forEach(function (ev) {
      var style      = buildHoverCardHeaderStyle(ev);
      var markerHtml = style.markerColor
        ? '<span class="hc-marker" style="background:' + escHtml(style.markerColor) + ';" aria-hidden="true"></span>'
        : '';

      /* Render details into a detached element to reuse renderEventDetails */
      var $detailsContainer = $('<div class="hc-body"></div>');
      renderEventDetails(ev, $detailsContainer);
      var detailsHtml = $detailsContainer[0].outerHTML;

      var canPaste    = !!(state.clipboard && isValid(ev.date));
      var actionsHtml = buildEventActionsHtml(ev.id, canPaste);

      /* Disable state-changing actions when event is already Approved or Rejected */
      var evApprovalVal = (ev.bprFieldValues || {})['beatplanner__Managers_Approval'] || '';
      var disableActionsAttr = (evApprovalVal === 'Approved' || evApprovalVal === 'Rejected')
        ? ' data-approval-locked="1"'
        : '';

      /* Mark past events so editing is disabled after render */
      var pastLockedAttr = !isEventEditable(ev) ? ' data-past-locked="1"' : '';

      listHtml +=
        '<div class="dem-card" data-evid="' + escHtml(ev.id) + '"' + disableActionsAttr + pastLockedAttr + '>' +
        '  <div class="hc-head" style="' + escHtml(style.cardStyle) + '">' +
        '    <div class="hc-head-top">' + markerHtml +
        '      <span class="hc-head-title">' + escHtml(getEventDisplayTitle(ev)) + '</span>' +
        '    </div>' +
        '  </div>' +
        detailsHtml +
        actionsHtml +
        '</div>';
    });

    dom.demList.html(listHtml);
    /* Apply disabled state to action buttons for locked events */
    dom.demList.find('.dem-card[data-approval-locked="1"]')
               .find('.hc-act-approve, .hc-act-reject, .hc-act-delete')
               .prop('disabled', true);
    /* Disable all editing actions for past events */
    dom.demList.find('.dem-card[data-past-locked="1"]')
               .find('.hc-act-edit, .hc-act-approve, .hc-act-reject, .hc-act-delete')
               .prop('disabled', true);
    /* Disable approve/reject for own records when the logged-in user is not Admin */
    if (isSelfApprovalBlocked()) {
      dom.demList.find('.hc-act-approve, .hc-act-reject').prop('disabled', true);
    }
  }

  function closeDayEventsModal() {
    closeAllBpDropdowns();
    demCurrentDs = '';
    dom.dayEventsModal.removeClass('dem-open');
    /* Defer class cleanup until after the fade-out transition */
    setTimeout(function () {
      dom.demList.removeClass('dem-table-mode');
      dom.dayEventsModal.find('.day-events-modal-box').removeClass('dem-box-wide');
    }, 200);
  }

  /* ──────────────────────────────────────────────────────────
     MASS ACTIONS POPUP
  ────────────────────────────────────────────────────────── */

  /** Tracks which action is currently open in the Mass Actions popup */
  var massActionsCurrentAction = '';

  /**
   * Return all currently visible *Pending* events grouped by date string.
   * Only events whose beatplanner__Managers_Approval equals "Pending" are
   * included – Approved and Rejected events are excluded from the Mass Actions
   * overlay.  Active calendar filters (calEventFilters) are also respected via
   * eventsOn().
   * @returns {Array<{date: string, events: Array}>} sorted ascending by date
   */
  function getVisibleEventsByDate() {
    var c    = state.cursor;
    var dates = [];

    if (state.view === 'month') {
      var year  = c.getFullYear();
      var month = c.getMonth();
      var days  = daysInMonth(year, month);
      for (var d = 1; d <= days; d++) {
        var dt = new Date(year, month, d);
        dates.push(dateToStr(dt));
      }
    } else if (state.view === 'week') {
      var ws = weekStart(c);
      for (var w = 0; w < 7; w++) {
        var wd = new Date(ws); wd.setDate(ws.getDate() + w);
        dates.push(dateToStr(wd));
      }
    } else {
      dates.push(dateToStr(c));
    }

    var groups = [];
    dates.forEach(function (ds) {
      /* Only include events with Pending approval status */
      var evts = eventsOn(ds).filter(function (ev) {
        var approval = (ev.bprFieldValues || {})['beatplanner__Managers_Approval'] || '';
        return approval === 'Pending';
      });
      if (evts.length > 0) {
        groups.push({ date: ds, events: evts });
      }
    });
    return groups;
  }

  /**
   * Format a YYYY-MM-DD string into a human-readable label.
   * Example: "2026-07-10" → "Friday, July 10, 2026"
   */
  function fmtDateLabel(ds) {
    var parts = ds.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return WDAYS_LONG[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /**
   * Build the HTML for ONE shared .bp-plan-container that holds all Working-mode events
   * for a single date group inside the Mass Actions popup.
   * Creates exactly one container, one .bp-slots-wrap, one .bp-slots-table, one <thead>,
   * and one <tbody> whose rows correspond to the supplied working events.
   *
   * @param {string} date        – YYYY-MM-DD date string
   * @param {Array}  workingEvts – calendar events (Attendance = Working) for this date
   * @returns {string} HTML string
   */
  function buildMassActionsWorkingSection(date, workingEvts) {
    if (!workingEvts.length) { return ''; }

    var chevSvg = '<svg class="bp-dd-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor"' +
                  ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';

    /* Meetings For options (shared across all rows) */
    var mfOptions = '';
    beatPlanModulesList.forEach(function (mod) {
      mfOptions += '<li class="bp-dd-opt" data-api="' + escHtml(mod.api) +
                   '" data-label="' + escHtml(mod.label) + '">' + escHtml(mod.label) + '</li>';
    });

    /* Separate BPR picklist fields (same set as buildMassUpdateEventHtml) */
    var HIDDEN_BPR_LABELS_WS = ['managers approval', 'record status', 'currency', 'unsubscribed mode', 'meetings for'];
    var tablePicklistCols = [];
    var attendanceField   = null;
    var leaveTypeField    = null;
    if (bprPicklistFields && bprPicklistFields.length) {
      bprPicklistFields.forEach(function (f) {
        var lbl = (f.field_label || '').toLowerCase().trim();
        if (HIDDEN_BPR_LABELS_WS.indexOf(lbl) !== -1) { return; }
        if (lbl === 'attendance') { attendanceField = f; return; }
        if (lbl === 'leave type') { leaveTypeField  = f; return; }
        tablePicklistCols.push(f);
      });
    }

    function buildOptList(opts) {
      if (!opts || !opts.length) {
        return '<li class="bp-dd-empty">No options available</li>';
      }
      return opts.map(function (v) {
        var display = (typeof v === 'object') ? v.display : v;
        var actual  = (typeof v === 'object') ? v.actual  : v;
        return '<li class="bp-dd-opt" data-label="' + escHtml(display) +
               '" data-actual="' + escHtml(actual) + '">' + escHtml(display) + '</li>';
      }).join('');
    }

    /* Resolve time / meetings-for field metadata */
    var startTimeApi = 'beatplanner__Date_Time_From', startTimeLbl = 'Date Time From';
    var endTimeApi   = 'beatplanner__Date_Time_To',   endTimeLbl   = 'Date Time To';
    var mfFieldApi   = 'beatplanner__Meetings_For',   mfFieldLabel = 'Meetings For';
    bpDailyAllFields.forEach(function (f) {
      var lbl = (f.field_label || '').toLowerCase();
      if (lbl === 'start time')   { startTimeApi = f.api_name || startTimeApi; startTimeLbl = f.field_label || startTimeLbl; }
      if (lbl === 'end time')     { endTimeApi   = f.api_name || endTimeApi;   endTimeLbl   = f.field_label || endTimeLbl; }
      if (lbl === 'meetings for') { mfFieldApi   = f.api_name || mfFieldApi;   mfFieldLabel = f.field_label || mfFieldLabel; }
    });

    var attendApi = (attendanceField && attendanceField.api_name) || 'beatplanner__Attendance';
    var leaveApi  = (leaveTypeField  && leaveTypeField.api_name)  || 'beatplanner__Leave_Type';

    /* Build shared table header – ONE thead for all working rows */
    var tableHtml = '<table class="bp-slots-table">';
    tableHtml += '<thead><tr>';
    tableHtml += '<th class="bp-th bp-cb-th"></th>';
    tableHtml += '<th class="bp-th">' + escHtml(startTimeLbl) + '</th>';
    tableHtml += '<th class="bp-th">' + escHtml(endTimeLbl)   + '</th>';
    tableHtml += '<th class="bp-th">' + escHtml(mfFieldLabel) + '</th>';
    tableHtml += '<th class="bp-th">Meeting With</th>';
    tablePicklistCols.forEach(function (f) {
      tableHtml += '<th class="bp-th">' + escHtml(f.field_label) + '</th>';
    });
    tableHtml += '<th class="bp-th bp-action-th">Actions</th>';
    tableHtml += '</tr></thead><tbody>';

    /* ONE row per working event, all in the same <tbody> */
    workingEvts.forEach(function (ev) {
      var bprVals = ev.bprFieldValues || {};

      var existingAttend = String(bprVals[attendApi] || '');
      var existingLeave  = String(bprVals[leaveApi]  || '');

      /* Meetings For */
      var existingMfVal = String(bprVals[mfFieldApi] || '');
      var existingMfApi = '';
      beatPlanModulesList.forEach(function (mod) {
        if (mod.label === existingMfVal) { existingMfApi = mod.api; }
      });

      /* Meeting With lookup field */
      var mwLookupApiName = '';
      var existingMwId    = ev.mwRecordId || '';
      var existingMwName  = ev.title || '';
      if (existingMfApi) {
        for (var fi = 0; fi < bpDailyAllFields.length; fi++) {
          var fld = bpDailyAllFields[fi];
          if (fld.data_type === 'lookup' && fld.lookup && fld.lookup.module) {
            var modApiName = fld.lookup.module.api_name || fld.lookup.module.module || '';
            var fldLbl     = (fld.field_label || '').toLowerCase();
            if (modApiName === existingMfApi || fldLbl === existingMfVal.toLowerCase()) {
              mwLookupApiName = fld.api_name;
              break;
            }
          }
        }
      }

      /* Meeting With option list */
      var mwOpts = '';
      if (existingMfApi) {
        var mwRecords = filteredModuleRecords.hasOwnProperty(existingMfApi)
          ? filteredModuleRecords[existingMfApi]
          : (moduleRecordsMap[existingMfApi] || []);
        if (mwRecords.length === 0) {
          mwOpts = '<li class="bp-dd-empty">No records found</li>';
        } else {
          mwRecords.forEach(function (rec) {
            mwOpts += '<li class="bp-dd-opt" data-id="' + escHtml(rec.id) +
                      '" data-label="' + escHtml(rec.name) +
                      '" data-photo-id="' + escHtml(rec.photo_id || '') + '">' + escHtml(rec.name) + '</li>';
          });
        }
      }

      /* Avatar */
      var avatarHtml  = ev.mwAvatarImgSrc
        ? '<img src="' + escHtml(ev.mwAvatarImgSrc) + '">'
        : (existingMwName ? escHtml(buildRecordInitials(existingMwName)) : '');
      var avatarClass = existingMwName ? ' bp-rec-avatar--show' : '';

      /* Row styling */
      var editRowStyles = buildBprEventStyles(ev);
      var cellBorderTB  = editRowStyles.borderTopStr + editRowStyles.borderBottomStr;
      var cbCellStyle   = editRowStyles.borderLeftStr + cellBorderTB;
      var actCellStyle  = cellBorderTB + editRowStyles.borderRightStr;

      /* Original field values for change detection */
      var originalVals = {
        mf:     existingMfVal,
        mfApi:  existingMfApi,
        mwId:   existingMwId,
        attend: existingAttend,
        leave:  existingLeave
      };
      tablePicklistCols.forEach(function (f) {
        var rawVal    = bprVals[f.api_name] || '';
        var actualVal = (rawVal && typeof rawVal === 'object') ? (rawVal.name || rawVal.actual_value || '') : String(rawVal);
        if (actualVal) { originalVals[f.api_name] = actualVal; }
      });

      /* Approval state */
      var evApprovalVal     = bprVals['beatplanner__Managers_Approval'] || '';
      var approvalLocked    = (evApprovalVal === 'Approved' || evApprovalVal === 'Rejected');
      var lockedAttr        = approvalLocked ? ' disabled' : '';
      var approveRejectAttr = (approvalLocked || isSelfApprovalBlocked()) ? ' disabled' : '';
      var approveClass      = evApprovalVal === 'Approved' ? ' is-approved' : (evApprovalVal === 'Rejected' ? ' is-rejected' : '');
      var rejectClass       = evApprovalVal === 'Rejected' ? ' is-rejected' : (evApprovalVal === 'Approved' ? ' is-approved' : '');

      /* data-pf-* attributes for filter matching */
      var pfAttrs = '';
      if (bprPicklistFields && bprPicklistFields.length) {
        bprPicklistFields.forEach(function (pf) {
          var v = bprVals[pf.api_name];
          if (v) { pfAttrs += ' data-pf-' + escHtml(pf.api_name.toLowerCase()) + '="' + escHtml(v) + '"'; }
        });
      }

      var startLbl = fmtTime(ev.startTime || '00:00');
      var endLbl   = fmtTime(ev.endTime   || '00:00');

      tableHtml += '<tr class="bp-slot-row bp-edit-row"' +
                   ' data-date="' + escHtml(date) + '"' +
                   ' data-edit-id="' + escHtml(ev.id) + '"' +
                   ' data-start-time="' + escHtml(ev.startTime || '') + '"' +
                   ' data-end-time="' + escHtml(ev.endTime || '') + '"' +
                   ' data-original-vals="' + escHtml(JSON.stringify(originalVals)) + '"' +
                   pfAttrs +
                   (editRowStyles.bgStr ? ' style="' + escHtml(editRowStyles.bgStr) + '"' : '') + '>';

      tableHtml += '<td class="bp-cb-cell"' +
                   (cbCellStyle ? ' style="' + escHtml(cbCellStyle) + '"' : '') +
                   '>' + editRowStyles.markerHtml +
                   '<input type="checkbox" class="bp-row-cb" aria-label="Select row"></td>';

      tableHtml += '<td class="bp-time-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') +
                   ' data-api="' + escHtml(startTimeApi) + '" data-label="' + escHtml(startTimeLbl) + '">' + startLbl + '</td>';
      tableHtml += '<td class="bp-time-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') +
                   ' data-api="' + escHtml(endTimeApi)   + '" data-label="' + escHtml(endTimeLbl)   + '">' + endLbl   + '</td>';

      /* Meetings For */
      tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                   '<div class="bp-dd-wrap bp-mf-wrap" data-row="edit" data-api="' + escHtml(mfFieldApi) + '" data-label="' + escHtml(mfFieldLabel) + '">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-dd-val"' + (existingMfApi ? ' data-selected-api="' + escHtml(existingMfApi) + '"' : '') + '>' +
                   escHtml(existingMfVal || 'Select module\u2026') + '</span>' +
                   chevSvg + '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list">' + mfOptions + '</ul>' +
                   '</div></div></td>';

      /* Meeting With */
      tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                   '<div class="bp-dd-wrap bp-mw-wrap" data-row="edit" data-api="' + escHtml(mwLookupApiName) + '" data-label="Meeting With">' +
                   '<div class="bp-dd-trigger" tabindex="0">' +
                   '<span class="bp-rec-avatar' + avatarClass + '" aria-hidden="true"' +
                   ' data-photo-id="' + escHtml(ev.mwPhotoId || '') + '">' + avatarHtml + '</span>' +
                   '<span class="bp-dd-val"' + (existingMwId ? ' data-selected-id="' + escHtml(existingMwId) + '"' : '') + '>' +
                   escHtml(existingMwName || 'Select\u2026') + '</span>' +
                   chevSvg + '</div>' +
                   '<div class="bp-dd-panel">' +
                   '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                   '<ul class="bp-dd-list bp-mw-list">' + mwOpts + '</ul>' +
                   '</div></div></td>';

      /* Dynamic picklist columns */
      tablePicklistCols.forEach(function (f) {
        var rawVal    = bprVals[f.api_name] || '';
        var actualVal = (rawVal && typeof rawVal === 'object') ? (rawVal.name || rawVal.actual_value || '') : String(rawVal);
        var displayVal = actualVal;
        if (actualVal && f.options) {
          f.options.forEach(function (opt) {
            var a    = (typeof opt === 'object') ? opt.actual  : opt;
            var disp = (typeof opt === 'object') ? opt.display : opt;
            if (a === actualVal || disp === actualVal) { displayVal = disp; }
          });
        }
        tableHtml += '<td class="bp-dd-cell"' + (cellBorderTB ? ' style="' + escHtml(cellBorderTB) + '"' : '') + '>' +
                     '<div class="bp-dd-wrap" data-row="edit" data-api="' + escHtml(f.api_name) + '" data-label="' + escHtml(f.field_label) + '">' +
                     '<div class="bp-dd-trigger" tabindex="0">' +
                     '<span class="bp-dd-val"' + (actualVal ? ' data-actual-val="' + escHtml(actualVal) + '"' : '') + '>' +
                     escHtml(displayVal || 'Select\u2026') + '</span>' +
                     chevSvg + '</div>' +
                     '<div class="bp-dd-panel">' +
                     '<input class="bp-dd-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
                     '<ul class="bp-dd-list">' + buildOptList(f.options) + '</ul>' +
                     '</div></div></td>';
      });

      /* Actions */
      tableHtml += '<td class="bp-action-cell"' + (actCellStyle ? ' style="' + escHtml(actCellStyle) + '"' : '') + '>' +
                   '<button class="bp-row-action bp-row-save"    type="button" title="Update record">'  + SVG.save    + '</button>' +
                   '<button class="bp-row-action bp-row-copy"    type="button" title="Copy record">'    + SVG.copy    + '</button>' +
                   '<button class="bp-row-action bp-row-delete"  type="button" title="Delete record"'   + lockedAttr + '>' + SVG.trash   + '</button>' +
                   '<button class="bp-row-action bp-row-approve' + approveClass + '" type="button" title="Approve record"' + approveRejectAttr + '>' + SVG.approve + '</button>' +
                   '<button class="bp-row-action bp-row-reject'  + rejectClass  + '" type="button" title="Reject record"'  + approveRejectAttr + '>' + SVG.reject  + '</button>' +
                   '</td>';

      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';

    return '<div class="bp-plan-container map-event-container" data-date="' + escHtml(date) + '">' +
           '<div class="bp-slots-wrap">' + tableHtml + '</div></div>';
  }

  /**
   * Build and return the HTML content for the Mass Actions popup body.
   * Renders events day-by-day in a collapsible accordion layout using
   * buildMassUpdateEventHtml() for each event.  Working records show the
   * full editable table; Leave records show only the attend-bar (coloured
   * by Leave Type) with Attendance + Leave Type dropdowns and action buttons
   * – identical to the Leave UI in #eventModal.
   * @param {Array} groups – output of getVisibleEventsByDate()
   */
  function buildMassActionsBodyHtml(groups) {
    if (!groups.length) { return ''; }

    /* Resolve the Attendance API name once – same for all events */
    var attendApi = 'beatplanner__Attendance';
    if (bprPicklistFields) {
      bprPicklistFields.forEach(function (f) {
        if ((f.field_label || '').toLowerCase().trim() === 'attendance') { attendApi = f.api_name; }
      });
    }

    var chevSvg = '<svg class="map-day-toggle-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor" ' +
                  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';

    var html = '';

    groups.forEach(function (group) {
      /* Separate events: Working records share ONE container; Leave / other records
         each keep their own individual container (existing Leave layout). */
      var workingEvts = [];
      var leaveEvts   = [];
      group.events.forEach(function (ev) {
        var val = String(((ev.bprFieldValues || {})[attendApi]) || '').toLowerCase();
        if (val === 'working') {
          workingEvts.push(ev);
        } else {
          leaveEvts.push(ev);
        }
      });

      html += '<div class="map-day-group" data-date="' + escHtml(group.date) + '">' +
              '  <div class="map-day-header">' +
              '    <label class="map-cb-label">' +
              '      <input type="checkbox" class="map-cb map-day-cb" data-date="' + escHtml(group.date) + '" />' +
              '      <span class="map-cb-text map-day-label">' + escHtml(fmtDateLabel(group.date)) + '</span>' +
              '    </label>' +
              '    <button type="button" class="map-day-toggle" aria-label="Toggle day" aria-expanded="true">' + chevSvg + '</button>' +
              '  </div>' +
              '  <div class="map-day-events">';

      /* Working records: ONE shared container with ONE table for the whole day */
      if (workingEvts.length) {
        html += buildMassActionsWorkingSection(group.date, workingEvts);
      }

      /* Leave / other records: individual containers (existing Leave layout). */
      if (leaveEvts.length) {
        leaveEvts.forEach(function (ev) {
          html += buildMassUpdateEventHtml(ev);
        });
      }

      html += '  </div>' +
              '</div>';
    });

    return html;
  }

  /**
   * Build the HTML for the filter bar rendered inside the Mass Actions popup.
   * Reuses buildCalFilterMultiSelect() with the massActionsPopupFilters state.
   * Returns an empty string when no picklist fields are available.
   */
  function buildMassActionsFilterBarHtml() {
    if (!beatPlanHasRefs || !bprPicklistFields || !bprPicklistFields.length) { return ''; }

    var EXCLUDED = ['record status', 'currency', 'unsubscribed mode'];
    var html = '';
    bprPicklistFields.forEach(function (f) {
      var lbl = (f.field_label || '').toLowerCase().trim();
      if (EXCLUDED.indexOf(lbl) !== -1) { return; }
      if (!f.options || !f.options.length) { return; }
      var selectedVals = massActionsPopupFilters[f.api_name] || [];
      html += '<div class="bp-cal-filter-item">' +
              '<span class="bp-cal-filter-lbl">' + escHtml(f.field_label) + '</span>' +
              buildMassActionsFilterMultiSelect(f, selectedVals) +
              '</div>';
    });
    if (!html) { return ''; }

    var hasActive = Object.keys(massActionsPopupFilters).some(function (k) {
      return massActionsPopupFilters[k] && massActionsPopupFilters[k].length > 0;
    });
    html += '<button class="bp-cal-filter-clear-btn" id="mapFilterClear" type="button"' +
            (hasActive ? '' : ' style="display:none;"') + '>Clear filters</button>';

    return '<div class="mass-actions-filter-bar" id="massActionsFilterBar">' + html + '</div>';
  }

  /**
   * Build the HTML for one multi-select filter dropdown inside the Mass Actions popup.
   * Uses map-popup-filter-* markers to scope event delegation away from the cal filter bar.
   */
  function buildMassActionsFilterMultiSelect(field, selectedVals) {
    var chevSvg = '<svg class="bpf-ms-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor" ' +
                  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';
    var chipsHtml = '';
    selectedVals.forEach(function (v) {
      chipsHtml += '<span class="bpf-ms-chip map-filter-chip" data-mapfield="' + escHtml(field.api_name) +
                   '" data-value="' + escHtml(v) + '">' + escHtml(v) +
                   '<span class="bpf-ms-chip-rm" role="button" aria-label="Remove ' + escHtml(v) + '">\u00d7</span>' +
                   '</span>';
    });
    var placeholder = selectedVals.length === 0 ? '<span class="bpf-ms-placeholder">All</span>' : '';
    var optsHtml = '';
    field.options.forEach(function (opt) {
      var display = (typeof opt === 'object') ? (opt.display || opt.actual || '') : String(opt);
      var actual  = (typeof opt === 'object') ? (opt.actual  || opt.display || '') : String(opt);
      var checked = selectedVals.indexOf(actual) !== -1;
      optsHtml += '<li class="bpf-ms-opt map-filter-opt" data-mapfield="' + escHtml(field.api_name) +
                  '" data-value="' + escHtml(actual) + '">' +
                  '<input type="checkbox"' + (checked ? ' checked' : '') + ' tabindex="-1" />' +
                  escHtml(display) +
                  '</li>';
    });
    return '<div class="bpf-ms-wrap map-filter-ms-wrap" data-mapfield="' + escHtml(field.api_name) + '">' +
           '<div class="bpf-ms-trigger" tabindex="0">' + chipsHtml + placeholder + chevSvg + '</div>' +
           '<div class="bpf-ms-panel">' +
           '<div class="bpf-ms-panel-head">' +
           '<input class="bpf-ms-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
           '<button class="bpf-ms-panel-act map-filter-sel-all" type="button" data-mapfield="' + escHtml(field.api_name) + '">All</button>' +
           '<button class="bpf-ms-panel-act map-filter-clr-all" type="button" data-mapfield="' + escHtml(field.api_name) + '">Clear</button>' +
           '</div>' +
           '<ul class="bpf-ms-list">' + optsHtml + '</ul>' +
           '</div>' +
           '</div>';
  }

  /**
   * Refresh the chips and placeholder inside a .map-filter-ms-wrap trigger
   * based on the current massActionsPopupFilters state for that wrap's field.
   */
  function refreshMapFilterTrigger($wrap) {
    var fieldApi     = String($wrap.data('mapfield') || '');
    var selectedVals = massActionsPopupFilters[fieldApi] || [];
    var $trigger     = $wrap.find('.bpf-ms-trigger');
    $trigger.find('.map-filter-chip, .bpf-ms-placeholder').remove();
    var $chev = $trigger.find('.bpf-ms-chev');
    if (selectedVals.length > 0) {
      var chipsHtml = '';
      selectedVals.forEach(function (v) {
        chipsHtml += '<span class="bpf-ms-chip map-filter-chip" data-mapfield="' + escHtml(fieldApi) +
                     '" data-value="' + escHtml(v) + '">' + escHtml(v) +
                     '<span class="bpf-ms-chip-rm" role="button" aria-label="Remove ' + escHtml(v) + '">\u00d7</span>' +
                     '</span>';
      });
      $chev.before(chipsHtml);
    } else {
      $chev.before('<span class="bpf-ms-placeholder">All</span>');
    }
  }

  /**
   * Apply massActionsPopupFilters to show/hide .bp-slot-row elements
   * and collapse/show .map-day-group elements that become empty.
   * Also unchecks hidden rows and resyncs the Select All state.
   */
  function applyMassActionsPopupFilters() {
    var keys = Object.keys(massActionsPopupFilters).filter(function (k) {
      return massActionsPopupFilters[k] && massActionsPopupFilters[k].length > 0;
    });

    $('#massActionsBody .bp-slot-row').each(function () {
      var $row    = $(this);
      var visible = true;
      for (var i = 0; i < keys.length; i++) {
        var api     = keys[i];
        var sel     = massActionsPopupFilters[api];
        /* Attribute names are lowercased by the browser; match accordingly */
        var attrVal = String($row.attr('data-pf-' + api.toLowerCase()) || '');
        if (sel.indexOf(attrVal) === -1) { visible = false; break; }
      }
      $row.toggleClass('map-filter-hidden', !visible).toggle(visible);
      if (!visible) { $row.find('.bp-row-cb').prop('checked', false); }
    });

    /* Hide day groups where every event row is filtered out */
    $('#massActionsBody .map-day-group').each(function () {
      var $group = $(this);
      var anyVisible = $group.find('.bp-slot-row:not(.map-filter-hidden)').length > 0;
      $group.toggle(anyVisible);
    });

    syncMassActionsSelectAll();
  }

  /** Open the Mass Actions popup for a given action */
  async function openMassActionsPopup(action) {
    var titleMap = {
      'mass-update':  'Mass Update',
      'mass-delete':  'Mass Delete',
      'mass-approve': 'Mass Approve',
      'mass-reject':  'Mass Reject'
    };
    var confirmMap = {
      'mass-update':  'Update Selected',
      'mass-delete':  'Delete Selected',
      'mass-approve': 'Approve Selected',
      'mass-reject':  'Reject Selected'
    };

    massActionsCurrentAction = action;
    massActionsPopupFilters  = {};

    /* Show the overlay immediately so the user sees it opening */
    $('#massActionsTitle').text(titleMap[action] || 'Mass Action');
    $('#massActionsConfirm').text(confirmMap[action] || 'Confirm');
    $('#massActionsSelectAll').prop('checked', false).prop('indeterminate', false);
    $('#massActionsBody').empty();
    $('#mapSelCount').text('');
    $('#massActionsOverlay').css('display', 'flex');
    $('#massActionsOverlay')[0].offsetWidth; // eslint-disable-line no-unused-expressions
    $('#massActionsOverlay').addClass('map-open');

    /* Ensure picklist metadata is loaded (needed for buildBpEditTableHtml) */
    if (beatPlanHasRefs && bprPicklistFields === null) {
      $('#massActionsBody').html('<div class="dem-loading">Loading\u2026</div>');
      await fetchBprPicklistFields().catch(function () { bprPicklistFields = []; });
    }

    /* Make the overlay box wide (like Day Events Modal) when showing editable event rows */
    if (beatPlanHasRefs) {
      $('.mass-actions-box').addClass('map-wide-mode');
    } else {
      $('.mass-actions-box').removeClass('map-wide-mode');
    }

    var groups = getVisibleEventsByDate();

    /* For all beat-plan actions (mass-update, mass-approve, mass-reject, mass-delete),
       use the original bp-slots-table layout (one table per day via buildMassActionsBodyHtml).
       This is the same event view that was originally used by mass-delete, mass-approve
       and mass-reject; mass-update now adopts this layout for a consistent UI. */
    if (beatPlanHasRefs) {
      /* Populate the filter button row (#bpFilterBtn) and filter bar row (.bp-filter-action)
         above the scrollable body so they are always visible ("sticky"). */
      var mapFilterSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
                         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="13" height="13">' +
                         '<path d="M2 4h12M5 8h6M7.5 12h1"/></svg>';
      $('#massActionsFilterBtnRow')
        .html('<button class="bp-filter-btn" id="bpFilterBtn" type="button" aria-label="Open filter panel">' +
              mapFilterSvg + 'Filter</button>')
        .show();

      var mapFilterBarHtml = buildMassActionsFilterBarHtml();
      if (mapFilterBarHtml) {
        $('#massActionsFilterBarRow')
          .html('<div class="bp-filter-action">' + mapFilterBarHtml + '</div>')
          .show();
      }

      $('#massActionsBody').html(buildMassActionsBodyHtml(groups));

      /* Populate cached avatars immediately and schedule async load for the rest */
      groups.forEach(function (group) {
        group.events.forEach(function (ev) {
          var $row = $('#massActionsBody .bp-slot-row[data-edit-id="' + ev.id + '"]');
          if (!$row.length) { return; }
          var $avatar = $row.find('.bp-rec-avatar');
          if (!$avatar.length) { return; }
          if (ev.mwAvatarImgSrc) {
            /* Already rendered inline; ensure classes are set */
            $avatar.addClass('bp-rec-avatar--show')
                   .attr('data-img-src', ev.mwAvatarImgSrc)
                   .attr('data-photo-id', ev.mwPhotoId || '');
          } else if (ev.mwPhotoId && !$avatar.find('img').length) {
            /* Load asynchronously */
            (function (evRef, photoId) {
              ZOHO.CRM.API.getFile({ id: photoId })
                .then(function (resp) {
                  if (!resp) { return; }
                  var imgBlob = new Blob([resp], { type: 'image/jpeg' });
                  var reader  = new FileReader();
                  reader.onloadend = function () {
                    var dataUrl = reader.result;
                    evRef.mwAvatarImgSrc = dataUrl;
                    saveEvents();
                    $('#massActionsBody .bp-slot-row[data-edit-id="' + evRef.id + '"] .bp-rec-avatar')
                      .html('<img src="' + escHtml(dataUrl) + '">')
                      .attr('data-img-src', dataUrl)
                      .attr('data-photo-id', photoId)
                      .addClass('bp-rec-avatar--show');
                  };
                  reader.readAsDataURL(imgBlob);
                })
                .catch(function () {});
            }(ev, ev.mwPhotoId));
          }
        });
      });
    } else {
      $('#massActionsBody').html(buildMassActionsBodyHtml(groups));
    }

    /* After the open animation (200 ms), clear the CSS transform on the box so that
       position:fixed dropdown panels inside the overlay are not clipped by
       overflow:hidden on the CSS-transformed ancestor. */
    setTimeout(function () {
      if ($('#massActionsOverlay').hasClass('map-open')) {
        $('.mass-actions-box').css('transform', 'none');
      }
    }, 220);

  }

  /** Close the Mass Actions popup */
  function closeMassActionsPopup() {
    massActionsPopupFilters = {};
    /* Restore the CSS-controlled transform before starting the close animation
       so the outward transition plays correctly. */
    $('.mass-actions-box').css('transform', '');
    $('#massActionsOverlay').removeClass('map-open');
    setTimeout(function () {
      $('#massActionsOverlay').css('display', 'none');
      $('.mass-actions-box').removeClass('map-wide-mode');
      $('#massActionsBody').empty();
      $('#massActionsFilterBar').remove();
      $('#massActionsFilterBtnRow').hide().empty();
      $('#massActionsFilterBarRow').hide().empty();
    }, 220);
  }

  /* ──────────────────────────────────────────────────────────
     MASS CREATE MODAL
  ────────────────────────────────────────────────────────── */

  /**
   * Calculate the start/end date strings (YYYY-MM-DD) for a given mass-create action.
   * @param {string} action    – 'tomorrow' | 'next-week' | 'next-month' | 'between'
   * @param {string} fromDate  – YYYY-MM-DD (only used for 'between')
   * @param {string} toDate    – YYYY-MM-DD (only used for 'between')
   * @returns {{startDate: string, endDate: string}}
   */
  function getMassCreateDateRange(action, fromDate, toDate) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    if (action === 'tomorrow') {
      var t = new Date(today);
      t.setDate(t.getDate() + 1);
      var ts = dateToStr(t);
      return { startDate: ts, endDate: ts };
    }

    if (action === 'next-week') {
      /* Sun-based week: next week starts on the Sunday after today's week-end */
      var thisSun = new Date(today);
      thisSun.setDate(today.getDate() - today.getDay()); /* this Sunday */
      var nextSun = new Date(thisSun);
      nextSun.setDate(thisSun.getDate() + 7);
      var nextSat = new Date(nextSun);
      nextSat.setDate(nextSun.getDate() + 6);
      return { startDate: dateToStr(nextSun), endDate: dateToStr(nextSat) };
    }

    if (action === 'next-month') {
      var y  = today.getFullYear();
      var m  = today.getMonth() + 1; /* next month (0-indexed + 1) */
      if (m > 11) { y += 1; m = 0; }
      var firstDay = new Date(y, m, 1);
      var lastDay  = new Date(y, m + 1, 0);
      return { startDate: dateToStr(firstDay), endDate: dateToStr(lastDay) };
    }

    if (action === 'between') {
      return { startDate: fromDate, endDate: toDate };
    }

    return { startDate: dateToStr(today), endDate: dateToStr(today) };
  }

  /**
   * Fetch all beatplanner__Daily_Beat_Plans records in the given date/time range
   * for the given owner, handling COQL pagination automatically (up to 2000/page).
   *
   * @param {string} startDt  – ISO datetime string, e.g. "2026-07-14T00:00:00+05:30"
   * @param {string} endDt    – ISO datetime string, e.g. "2026-07-20T23:59:59+05:30"
   * @param {string} ownerId  – CRM user id
   * @returns {Promise<Array>} merged array of COQL record objects
   */
  async function fetchMassCreateRecords(startDt, endDt, ownerId) {
    /* Build the select field list from the already-loaded module metadata,
       mirroring the same logic used in loadBeatPlanEvents but without parsing HTML. */
    var rawApiList = bpDailyAllFields.map(function (f) { return f.api_name; }).filter(Boolean);
    if (bpSavedRec) {
      var mfApis = (bpSavedRec['beatplanner__Meetings_For_Apis'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      mfApis.forEach(function (api) { rawApiList.push(api); });
    }
    var seenApis    = {};
    var selectFields = ['id', 'beatplanner__Managers_Approval', 'Owner'];
    rawApiList.forEach(function (api) {
      if (api && !seenApis[api] && selectFields.indexOf(api) === -1) {
        seenApis[api] = true;
        selectFields.push(api);
      }
    });
    var dynamicFieldList = selectFields.filter(function (f) { return f !== 'id' && f !== 'beatplanner__Managers_Approval'; }).join(', ');

    var allRecords = [];
    var offset     = 0;
    var pageSize   = 2000;

    do {
      var query = {
        select_query: (
          'SELECT id, beatplanner__Managers_Approval, ' + dynamicFieldList +
          ' FROM beatplanner__Daily_Beat_Plans' +
          " WHERE (((beatplanner__Date_Time_From >= '" + startDt + "'" +
          " AND beatplanner__Date_Time_From <= '" + endDt + "')" +
          " AND (beatplanner__Date_Time_To >= '" + startDt + "'" +
          " AND beatplanner__Date_Time_To <= '" + endDt + "'))" +
          " AND Owner.id='" + ownerId + "')" +
          ' LIMIT ' + offset + ',' + pageSize
        ).replace(/\s+/g, ' ').trim()
      };
      var res     = await zrc.post('/crm/v8/coql', query);
      var records = (res && res.data && res.data.data && Array.isArray(res.data.data)) ? res.data.data : [];
      allRecords  = allRecords.concat(records);
      offset     += pageSize;
      if (records.length < pageSize) { break; }
    } while (true);

    return allRecords;
  }

  /**
   * Build an array of YYYY-MM-DD strings from startDate to endDate (inclusive).
   */
  function buildDateList(startDate, endDate) {
    var list = [];
    var cur  = new Date(startDate + 'T00:00:00');
    var end  = new Date(endDate   + 'T00:00:00');
    while (cur <= end) {
      list.push(dateToStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }

  /**
   * Given an array of COQL records, return a map {dateStr: {h: true}}
   * where each key h (0–23) is an occupied hour on that date.
   */
  function buildOccupiedHoursMap(coqlRecords) {
    var map = {};
    coqlRecords.forEach(function (rec) {
      var fromStr = rec['beatplanner__Date_Time_From'] || '';
      var toStr   = rec['beatplanner__Date_Time_To']   || '';
      if (!fromStr) { return; }
      var dateStr   = fromStr.substring(0, 10);
      var startMins = timeToMins(fromStr.substring(11, 16));
      var endMins   = timeToMins(toStr ? toStr.substring(11, 16) : fromStr.substring(11, 16));
      if (endMins <= startMins) { endMins = startMins + 60; }
      if (!map[dateStr]) { map[dateStr] = {}; }
      /* Mark every 1-hour slot (0–23) that the record overlaps */
      for (var h = 0; h < 24; h++) {
        var slotStart = h * 60;
        var slotEnd   = (h + 1) * 60;
        if (startMins < slotEnd && endMins > slotStart) {
          map[dateStr][h] = true;
        }
      }
    });
    return map;
  }

  /**
   * Given an array of COQL records, return a map:
   *   { dateStr: { attendance: string, leaveType: string } }
   * "Leave" takes priority over "Working" for any given day.
   *
   * @param {Array} coqlRecords
   * @returns {Object}
   */
  function buildAttendanceMap(coqlRecords) {
    var attendApi = getAttendanceApiName();
    var leaveApi  = 'beatplanner__Leave_Type';
    var map = {};
    coqlRecords.forEach(function (rec) {
      var fromStr = rec['beatplanner__Date_Time_From'] || '';
      if (!fromStr) { return; }
      var dateStr   = fromStr.substring(0, 10);
      var attend    = rec[attendApi] || '';
      var leaveType = rec[leaveApi]  || '';
      if (!map[dateStr]) { map[dateStr] = { attendance: '', leaveType: '' }; }
      if (attend.toLowerCase() === 'leave') {
        map[dateStr].attendance = attend;
        if (leaveType) { map[dateStr].leaveType = leaveType; }
      } else if (attend && !map[dateStr].attendance) {
        map[dateStr].attendance = attend;
      }
    });
    return map;
  }

  /**
   * Build the HTML for the Mass Create accordion inside #slotPickerGrid.
   * Each day is a collapsible section containing the same beatplan table
   * rendered by buildBeatPlanTable (or time-slot buttons in non-beatplan mode).
   *
   * @param {string[]} dateList       – YYYY-MM-DD strings in the range
   * @param {object}   occupiedHrsMap – {dateStr: {h: true}} from buildOccupiedHoursMap
   * @param {object}   [attendanceMap] – {dateStr: {attendance, leaveType}} from buildAttendanceMap
   * @returns {string} HTML string
   */
  function buildMassCreateAccordionHtml(dateList, occupiedHrsMap, attendanceMap) {
    if (!dateList.length) { return '<div class="mc-loading">No dates in range.</div>'; }

    var chevSvg = '<svg class="map-day-toggle-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor" ' +
                  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';

    /* ── Single global action bar: Filter button + Mass Create button ── */
    var filterSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
                    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="13" height="13">' +
                    '<path d="M2 4h12M5 8h6M7.5 12h1"/></svg>';
    var html = '<div class="mc-action-bar">' +
               '<div class="bp-filter-action">' +
               '<button class="bp-filter-btn" id="bpFilterBtn" type="button" aria-label="Open filter panel">' +
               filterSvg + 'Filter' +
               '</button>' +
               '</div>' +
               '<button class="bp-mass-create-btn mc-global-mass-create-btn" type="button" style="display:none;">Mass Create</button>' +
               '</div>';

    /* Sentinel used to suppress all rows inside a beatplan table for leave/no-slot days */
    var allHoursOccupied = {};
    for (var ah = 0; ah < 24; ah++) { allHoursOccupied[ah] = true; }

    dateList.forEach(function (ds) {
      var skipHours    = occupiedHrsMap[ds] || {};
      var dayAttendInfo = attendanceMap ? (attendanceMap[ds] || null) : null;
      var isLeave      = dayAttendInfo && dayAttendInfo.attendance.toLowerCase() === 'leave';
      var isWorking    = dayAttendInfo && dayAttendInfo.attendance.toLowerCase() !== 'leave' && !!dayAttendInfo.attendance;
      var leaveType    = (dayAttendInfo && dayAttendInfo.leaveType) || '';

      /* Determine the first eligible hour (skip slots whose start time has already passed).
         When there are elapsed minutes in the current hour the slot has already started,
         so advance to the next full hour. */
      var _nowMc = new Date();
      var currentHour = isToday(ds)
        ? (_nowMc.getMinutes() > 0 ? _nowMc.getHours() + 1 : _nowMc.getHours())
        : 0;
      /* Check whether there are any available working-hour slots */
      var hasSlots    = false;
      if (!isLeave) {
        for (var hc = currentHour; hc < 24; hc++) {
          if (!skipHours[hc]) { hasSlots = true; break; }
        }
      }

      /* Build data attributes for post-DOM attendance pre-selection */
      var dayDataAttrs = ' data-date="' + escHtml(ds) + '"';
      if (dayAttendInfo && dayAttendInfo.attendance) {
        dayDataAttrs += ' data-mc-attendance="' + escHtml(dayAttendInfo.attendance) + '"';
      }
      if (leaveType) {
        dayDataAttrs += ' data-mc-leave-type="' + escHtml(leaveType) + '"';
      }

      html += '<div class="map-day-group mc-day-group"' + dayDataAttrs + '>';
      html += '<div class="map-day-header">';
      html += '<label class="map-cb-label">' +
              '<input type="checkbox" class="map-cb map-day-cb" data-date="' + escHtml(ds) + '">' +
              '<span class="map-cb-text map-day-label">' + escHtml(fmtDateLabel(ds)) + '</span>' +
              '</label>';
      html += '<button type="button" class="map-day-toggle" aria-label="Toggle day" aria-expanded="true">' + chevSvg + '</button>';
      html += '</div>';
      html += '<div class="map-day-events">';

      if (isLeave) {
        /* Leave day: render attend bar for pre-selection (table suppressed), show leave message.
           Pass existingLeave:true so the bp-mc-leave-cb is NOT rendered for already-leave days. */
        if (beatPlanHasRefs) {
          html += buildBeatPlanTable(ds, { skipHours: allHoursOccupied, massCreate: true, existingLeave: true });
        }
        var leaveMsg = leaveType
          ? 'No available slots.<br>User is on ' + escHtml(leaveType) + '.'
          : 'No available slots.<br>User is on Leave.';
        html += '<div class="mc-no-slots">' + leaveMsg + '</div>';
      } else if (!hasSlots) {
        /* Working or unknown – all slots occupied */
        if (beatPlanHasRefs && isWorking) {
          html += buildBeatPlanTable(ds, { skipHours: allHoursOccupied, massCreate: true });
        }
        html += '<div class="mc-no-slots">No available slots.</div>';
      } else if (beatPlanHasRefs) {
        html += buildBeatPlanTable(ds, { skipHours: skipHours, massCreate: true });
      } else {
        /* Non-beatplan fallback: clickable time-slot buttons */
        var _nowFb = new Date();
        var nowHour = isToday(ds)
          ? (_nowFb.getMinutes() > 0 ? _nowFb.getHours() + 1 : _nowFb.getHours())
          : 0;
        for (var hb = nowHour; hb < 24; hb++) {
          if (skipHours[hb]) { continue; }
          var startLbl = fmtTime(pad2(hb) + ':00');
          var endLbl   = fmtTime(hb === 23 ? '23:59' : pad2(hb + 1) + ':00');
          html += '<button class="time-slot-item mc-tsi" data-date="' + escHtml(ds) + '" data-hour="' + hb + '">' +
                  '<span class="tsi-start">' + escHtml(startLbl) + '</span>' +
                  '<span class="tsi-sep">\u2013</span>' +
                  '<span class="tsi-end">' + escHtml(endLbl) + '</span>' +
                  '</button>';
        }
      }

      html += '</div></div>';
    });

    return html || '<div class="mc-loading">No available slots in the selected range.</div>';
  }

  /**
   * Open the Mass Create flow inside the shared #eventModal.
   * Fetches COQL records, computes available 1-hour slots, and renders
   * a multi-day accordion with the same beatplan form in each day section.
   */
  async function openMassCreateModal(action, fromDate, toDate) {
    var range = getMassCreateDateRange(action, fromDate, toDate);


    closeAllBpDropdowns();

    /* ── Open #eventModal immediately with a loading indicator ── */
    massCreateMode         = true;
    monthlyBeatPlanId      = null;
    massCreateMonthPlanMap = {};

    dom.modalHeading.text('Mass Create');
    dom.modal.addClass('modal-open');
    dom.modal.find('.modal-box').addClass('modal-box--wide');
    dom.modal.find('.modal-body').addClass('modal-body--mc');

    var $modalBody  = dom.modal.find('.modal-body');
    var $modalFoot  = dom.modal.find('.modal-foot');
    var $initLoader = $('#modalInitLoader');
    $initLoader.show();
    $modalBody.hide();
    $modalFoot.hide();

    try {
      /* Ensure BPR picklist field metadata is available before rendering tables */
      if (bprPicklistFields === null) {
        await fetchBprPicklistFields().catch(function () { bprPicklistFields = []; });
      }

      var ownerId = activeUserId || ($('#userProfile').attr('data-userid') || '');
      /* Query the full day range; past-slot filtering is handled in the rendering */
      var startDt = toIsoDt(range.startDate, '00:00');
      var endDt   = toIsoDt(range.endDate,   '23:59');

      var records        = await fetchMassCreateRecords(startDt, endDt, ownerId);
      var occupiedHrsMap = buildOccupiedHoursMap(records);
      var attendanceMap  = buildAttendanceMap(records);
      var dateList       = buildDateList(range.startDate, range.endDate);

      /* ── Ensure a Monthly Beat Plan record exists for every unique month in the range ── */
      var uniqueMonths = [];
      dateList.forEach(function (ds) {
        var my = getMonthYearFromDate(ds);
        if (uniqueMonths.indexOf(my) === -1) { uniqueMonths.push(my); }
      });
      for (var mi = 0; mi < uniqueMonths.length; mi++) {
        var my = uniqueMonths[mi];
        var mbpId = await ensureMonthlyBeatPlan(my);
        if (mbpId) { massCreateMonthPlanMap[my] = mbpId; }
        console.log('Monthly Beat Plan for', my, ':', mbpId);
      }

      var accordionHtml  = buildMassCreateAccordionHtml(dateList, occupiedHrsMap, attendanceMap);

      dom.slotPickerGrid.html(accordionHtml);

      /* ── Post-DOM: pre-select Attendance (and Leave Type) for each day ── */
      dom.slotPickerGrid.find('.mc-day-group[data-mc-attendance]').each(function () {
        var $dayGroup = $(this);
        var attend    = $dayGroup.data('mc-attendance') || '';
        var lType     = $dayGroup.data('mc-leave-type') || '';
        if (attend) {
          preselectAttendance($dayGroup, attend);
        }
        if (attend.toLowerCase() === 'leave' && lType) {
          preselectLeaveType($dayGroup, lType);
        }
        /* Records already exist for this day – hide the Attendance and Leave Type
           fields so they cannot be accidentally changed. The values are already
           known from the fetched records. */
        $dayGroup.find('.bp-attend-field').hide();
      });

      updateFilterBadge();
    } catch (err) {
      console.error('Mass Create fetch error:', err);
      dom.slotPickerGrid.html('<div class="mc-loading">Failed to load records. Please try again.</div>');
    }

    /* ── Reveal the modal ── */
    $initLoader.hide();
    $modalBody.show();
    $modalFoot.show();

    dom.slotPickerSection.show();
    dom.eventFormSection.hide();
    dom.slotPickerFoot.show();
    dom.eventFormFoot.hide();
  }

  /** Close the Mass Create modal (delegates to the shared slot-picker close path) */
  function closeMassCreateModal() {
    closeSlotPicker();
  }

  /** Synchronize the Select All checkbox state based on visible event checkboxes */
  function syncMassActionsSelectAll() {
    /* Only consider row checkboxes that are not filtered out */
    var $allEvtCbs  = $('#massActionsBody .bp-slot-row:not(.map-filter-hidden) .bp-row-cb');
    var $checked    = $allEvtCbs.filter(':checked');
    var total       = $allEvtCbs.length;
    var checkedCount = $checked.length;
    var $selectAll  = $('#massActionsSelectAll');

    if (total === 0) {
      $selectAll.prop('checked', false).prop('indeterminate', false);
    } else if (checkedCount === total) {
      $selectAll.prop('checked', true).prop('indeterminate', false);
    } else if (checkedCount === 0) {
      $selectAll.prop('checked', false).prop('indeterminate', false);
    } else {
      $selectAll.prop('checked', false).prop('indeterminate', true);
    }

    var label = checkedCount === 0
      ? ''
      : checkedCount + ' event' + (checkedCount === 1 ? '' : 's') + ' selected';
    $('#mapSelCount').text(label);
  }

  /** Synchronize a day checkbox based on its visible events' checked state */
  function syncMassActionsDayCb($dayCb) {
    var date     = $dayCb.data('date');
    /* Only count non-filtered event rows for this date */
    var $evtCbs  = $('#massActionsBody .bp-slot-row[data-date="' + date + '"]:not(.map-filter-hidden) .bp-row-cb');
    var total    = $evtCbs.length;
    var checked  = $evtCbs.filter(':checked').length;

    if (total === 0) {
      $dayCb.prop('checked', false).prop('indeterminate', false);
    } else if (checked === total) {
      $dayCb.prop('checked', true).prop('indeterminate', false);
    } else if (checked === 0) {
      $dayCb.prop('checked', false).prop('indeterminate', false);
    } else {
      $dayCb.prop('checked', false).prop('indeterminate', true);
    }
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
    closeAllBpDropdowns();
    dom.modal.removeClass('modal-open');
    state.editId = null;
    massCreateMode = false;
    /* Defer DOM resets until after the fade-out transition (0.22s) to avoid a blink */
    setTimeout(function () {
      dom.modal.find('.modal-box').removeClass('modal-box--wide');
      dom.modal.find('.modal-body').removeClass('modal-body--mc');
      dom.slotPickerSection.hide();
      dom.eventFormSection.show();
      dom.slotPickerFoot.hide();
      dom.eventFormFoot.show();
    }, 250);
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

  async function deleteEvent(evid) {
    var ev = findEvent(evid);

    /* Delete from CRM when this is a Beat Plan record (has bprFieldValues) */
    if (ev && ev.bprFieldValues && Object.keys(ev.bprFieldValues).length) {
      try {
        await zrc.delete('/crm/v8/beatplanner__Daily_Beat_Plans?ids=' + evid);
        console.log('CRM record deleted', evid);
      } catch (err) {
        console.error('Failed to delete CRM record', err);
        showToast('Failed to delete record from CRM.');
        return;
      }
    }

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
    /* Discard stale COQL events so the initial render does not show events
       from the previous date range while the new fetch is in progress. */
    state.events = state.events.filter(function (e) { return !e.fromCoql; });
    render();
    if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
  }

  function goToday() {
    state.cursor = new Date();
    /* Discard stale COQL events before rendering the new date range. */
    state.events = state.events.filter(function (e) { return !e.fromCoql; });
    render();
    if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
  }

  /* ──────────────────────────────────────────────────────────
     VIEW BOUNDARIES + DYNAMIC EVENT LOADER
  ────────────────────────────────────────────────────────── */

  /**
   * Return the visible calendar grid start/end as ISO-8601 datetime strings that
   * include the local timezone offset.  For month view the boundaries cover the
   * entire visible grid (leading/trailing cells from adjacent months included),
   * not just the selected month.
   */
  function getViewBoundaries() {
    var vc       = state.cursor;
    var tzOffset = -new Date().getTimezoneOffset(); /* minutes ahead of UTC */
    var tzSign   = tzOffset >= 0 ? '+' : '-';
    var tzAbs    = Math.abs(tzOffset);
    var tzStr    = tzSign + pad2(Math.floor(tzAbs / 60)) + ':' + pad2(tzAbs % 60);

    var startDt, endDt;
    if (state.view === 'month') {
      var vy       = vc.getFullYear();
      var vm       = vc.getMonth();
      var fdow     = firstDOW(vy, vm);
      var dim      = daysInMonth(vy, vm);
      var total    = fdow + dim;
      var trailing = (7 - (total % 7)) % 7;
      /* gridStartDate = first visible cell (may be in previous month) */
      var gridStartDate = new Date(vy, vm, 1 - fdow);
      /* gridEndDate   = last visible cell (may be in next month) */
      var gridEndDate   = new Date(vy, vm, dim + trailing);
      startDt = dateToStr(gridStartDate) + 'T00:00:00' + tzStr;
      endDt   = dateToStr(gridEndDate)   + 'T23:59:59' + tzStr;
    } else if (state.view === 'week') {
      var vws = weekStart(vc);
      var vwe = new Date(vws); vwe.setDate(vws.getDate() + 6);
      startDt = dateToStr(vws) + 'T00:00:00' + tzStr;
      endDt   = dateToStr(vwe) + 'T23:59:59' + tzStr;
    } else {
      var vds = dateToStr(vc);
      startDt = vds + 'T00:00:00' + tzStr;
      endDt   = vds + 'T23:59:59' + tzStr;
    }
    return { startDt: startDt, endDt: endDt };
  }

  /**
   * Fetch beatplanner__Daily_Beat_Plans records for the current view/owner via COQL,
   * convert them to event objects, and render.  This single function is reused for
   * the initial page load, calendar navigation, view changes, and user switches.
   *
   * Requires beatPlanHasRefs and bpSavedRec to be truthy before calling.
   */
  async function loadBeatPlanEvents() {
    if (!beatPlanHasRefs || !bpSavedRec) { return; }

    /* Capture a generation token so that stale responses (from a previous call
       that was superseded by a newer user selection) are silently discarded. */
    var myGen = ++beatPlanLoadGen;

    /* ── Show horizontal loading bar and disable calendar interactions ── */
    $('#bpEventsLoader').show();
    $('.cal-body').addClass('cal-body--loading');
    $('#userProfile').prop('disabled', true);

    try {
      /* Step 1: Probe a beat-plan table to collect all data-api field names.
         Use a date far enough in the future so all 24 hour slots are present. */
      var probeDate   = dateToStr(new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1));
      var tempHtml    = buildBeatPlanTable(probeDate);
      var $tempRoot   = $(tempHtml);
      var rawApiList  = [];
      $tempRoot.find('[data-api]').each(function () {
        var api = $(this).attr('data-api');
        if (api) { rawApiList.push(api); }
      });

      /* Also include every lookup API from Beat Plan References so the COQL
         response contains the Meeting With object for every possible module. */
      var mfModuleApis   = (bpSavedRec['beatplanner__Meetings_For_Apis']    || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var mfModuleLabels = (bpSavedRec['beatplanner__Meetings_For_Modules'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      mfModuleApis.forEach(function (api) { rawApiList.push(api); });

      /* Deduplicate */
      var seenApis    = {};
      var dynamicFields = [];
      rawApiList.forEach(function (api) {
        if (api && !seenApis[api]) {
          seenApis[api]  = true;
          dynamicFields.push(api);
        }
      });

      /* SELECT: id + beatplanner__Managers_Approval + Owner + dynamic fields (deduped).
         Owner is included in dynamicFieldList so the COQL WHERE clause Owner.id
         filter is valid and the response contains the owner object. */
      var selectFields = ['id', 'beatplanner__Managers_Approval', 'Owner'];
      dynamicFields.forEach(function (api) {
        if (selectFields.indexOf(api) === -1) { selectFields.push(api); }
      });

      /* Step 2: Compute the actual visible grid date range */
      var bounds = getViewBoundaries();

      /* Step 3: Assemble the COQL query */
      var dynamicFieldList = selectFields.filter(function (f) { return f !== 'id' && f !== 'beatplanner__Managers_Approval'; }).join(', ');
      var currentViewStart = bounds.startDt;
      var currentViewEnd   = bounds.endDt;
      var ownerId = activeUserId;
      var query = {
        select_query: `
          SELECT
            id,
            beatplanner__Managers_Approval,
            ${dynamicFieldList}
          FROM beatplanner__Daily_Beat_Plans
          WHERE ((
            (beatplanner__Date_Time_From >= '${currentViewStart}' AND beatplanner__Date_Time_From <= '${currentViewEnd}')
            AND
            (beatplanner__Date_Time_To >= '${currentViewStart}' AND beatplanner__Date_Time_To <= '${currentViewEnd}')
          ) AND Owner.id = '${ownerId}')
          LIMIT 0,2000
        `
        .replace(/\s+/g, " ")
        .trim()
      };

      console.log(query.select_query);
      var coqlRes     = await zrc.post('/crm/v8/coql', query);

      /* Discard this response if a newer loadBeatPlanEvents() call has since started
         (e.g. the user switched to a different owner while this request was in flight).
         Also verify the owner this response was fetched for still matches the active user,
         providing an extra guard against out-of-order responses. */
      if (myGen !== beatPlanLoadGen || String(ownerId) !== String(activeUserId)) { return; }

      console.log(coqlRes && coqlRes.data && coqlRes.data.data);
      var coqlRecords = (coqlRes && coqlRes.data && coqlRes.data.data && Array.isArray(coqlRes.data.data) ? coqlRes.data.data : []);

      /* Step 5: Remove previously COQL-loaded events; keep user-created events */
      state.events = state.events.filter(function (e) { return !e.fromCoql; });
      var existingIds = {};
      state.events.forEach(function (e) { existingIds[e.id] = true; });

      coqlRecords.forEach(function (rec) {
        if (existingIds[rec.id]) { return; }

        /* Extract date and time from ISO-8601 datetime strings */
        var fromStr   = rec['beatplanner__Date_Time_From'] || '';
        var toStr     = rec['beatplanner__Date_Time_To']   || '';
        var datePart  = fromStr ? fromStr.substring(0, 10) : todayStr();
        var startTime = fromStr ? fromStr.substring(11, 16) : '00:00';
        var endTime   = toStr   ? toStr.substring(11, 16)   : '01:00';

        /* Build bprFieldValues: always include Managers Approval + all dynamic fields */
        var bprFieldValues = {};
        var maVal = rec['beatplanner__Managers_Approval'];
        if (maVal !== null && maVal !== undefined && typeof maVal !== 'object') {
          bprFieldValues['beatplanner__Managers_Approval'] = String(maVal);
        }
        dynamicFields.forEach(function (fieldApi) {
          var val = rec[fieldApi];
          if (val !== null && val !== undefined && typeof val !== 'object') {
            bprFieldValues[fieldApi] = String(val);
          }
        });

        /* Resolve CRM Module API by checking which lookup field has a value */
        var moduleApi = '';
        var lookupRec = null;
        for (var mi = 0; mi < mfModuleApis.length; mi++) {
          var candidate = rec[mfModuleApis[mi]];
          if (candidate && typeof candidate === 'object') {
            moduleApi = mfModuleApis[mi];
            lookupRec = candidate;
            break;
          }
        }
        var recTitle  = (lookupRec && (lookupRec.name || lookupRec.Full_Name)) || 'Beat Plan';

        var newEv = {
          id:             rec.id || uid(),
          title:          recTitle,
          date:           datePart,
          startTime:      startTime,
          endTime:        endTime,
          color:          '#1565C0',
          description:    '',
          bprFieldValues: bprFieldValues,
          mwRecordId:     lookupRec ? (lookupRec.id || '') : '',
          mwLookupApi:    moduleApi,
          mwAvatarText:   buildRecordInitials(recTitle),
          mwAvatarImgSrc: '',
          mwPhotoId:      '',
          fromCoql:       true
        };

        state.events.push(newEv);
        existingIds[rec.id] = true;
      });

      /* Step 8: Render all events using the existing pipeline */
      saveEvents();
      render();

      /* Step 9: Load profile images from the module records cache */
      var avatarLoadPromises = coqlRecords.map(async function (rec) {
        var evObj = findEvent(rec.id);
        if (!evObj) { return; }

        var modApi  = evObj.mwLookupApi || '';
        var mwRecId = evObj.mwRecordId  || '';
        if (!modApi || !mwRecId) { return; }

        var cachedRecs = moduleRecordsMap[modApi] || [];
        var photoId    = '';
        for (var ci = 0; ci < cachedRecs.length; ci++) {
          if (String(cachedRecs[ci].id) === String(mwRecId)) {
            photoId = cachedRecs[ci].photo_id || '';
            break;
          }
        }
        if (!photoId) { return; }

        evObj.mwPhotoId = photoId;

        await new Promise(function (resolve) {
          ZOHO.CRM.API.getFile({ id: photoId })
            .then(function (resp) {
              if (!resp) { resolve(); return; }
              var imgBlob = new Blob([resp], { type: 'image/jpeg' });
              var reader  = new FileReader();
              reader.onloadend = function () {
                var dataUrl = reader.result;
                evObj.mwAvatarImgSrc = dataUrl;
                dom.canvas.find('[data-evid="' + evObj.id + '"] .bp-rec-avatar')
                  .html('<img src="' + escHtml(dataUrl) + '">')
                  .attr('data-img-src', dataUrl)
                  .attr('data-photo-id', photoId);
                resolve();
              };
              reader.readAsDataURL(imgBlob);
            })
            .catch(function () { resolve(); });
        });
      });

      await Promise.all(avatarLoadPromises);
      /* Only persist avatar data if this is still the most-recent call; a newer
         call's own saveEvents() will handle the final state. */
      if (myGen === beatPlanLoadGen) { saveEvents(); }

    } catch (err) {
      console.error('Failed to load Daily Beat Plans:', err);
    } finally {
      /* Hide loader and restore calendar interactions only if this is still the
         most-recent call (a newer call will handle its own cleanup). */
      if (myGen === beatPlanLoadGen) {
        $('#bpEventsLoader').hide();
        $('.cal-body').removeClass('cal-body--loading');
        $('#userProfile').prop('disabled', false);
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
     THEME
  ────────────────────────────────────────────────────────── */

  function setTheme(theme) {
    state.theme = theme;
    /* Swap only the theme-* class so that other body classes (e.g. cal-bg-colour-mapped)
       are preserved across theme switches. */
    $('body').removeClass('theme-light theme-dark theme-night').addClass('theme-' + theme);
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
          /* Discard stale COQL events so the render does not show events from
             the previous period while the new fetch is in progress. */
          state.events = state.events.filter(function (e) { return !e.fromCoql; });
          render();
          if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
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
      /* Discard stale COQL events so the render does not show events from
         the previous period while the new fetch is in progress. */
      state.events = state.events.filter(function (e) { return !e.fromCoql; });
      render();
      if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
    });

    /* Week row click (week/day view): navigate to the week containing this row */
    $('#cpGrid').on('click', '.cp-week-row', function (e) {
      e.stopPropagation();
      if (state.view === 'month') return;
      /* Find the first date in this row */
      var $firstDay = $(this).find('.cp-day[data-date]').first();
      var ds = $firstDay.data('date');
      if (!ds) return;
      var parts = ds.split('-');
      var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      state.cursor = (state.view === 'week') ? weekStart(d) : d;
      closePicker();
      /* Discard stale COQL events so the render does not show events from
         the previous period while the new fetch is in progress. */
      state.events = state.events.filter(function (e) { return !e.fromCoql; });
      render();
      if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
    });

    /* Footer button – jump to current period */
    $('#cpFooterBtn').on('click', function (e) {
      e.stopPropagation();
      state.cursor = new Date();
      closePicker();
      /* Discard stale COQL events so the render does not show events from
         the previous period while the new fetch is in progress. */
      state.events = state.events.filter(function (e) { return !e.fromCoql; });
      render();
      if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
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

  var allUsers        = [];   /* fetched from /crm/v8/users?type=ActiveConfirmedUsers */
  var userMap         = {};   /* id → user object */
  var childrenMap     = {};   /* id → [childId, …] */
  var loggedInUserId  = null; /* id of the logged-in user (root of hierarchy) */
  var expandedNodes   = {};   /* id → boolean (true = expanded) */
  var activeUserId    = null; /* currently selected user id */
  var loggedInIsAdmin = false; /* true when logged-in user's profile is Administrator */

  /**
   * Normalize a user object so that full_name and profile_pic are always set,
   * regardless of which API response (ActiveConfirmedUsers vs COQL) it came from.
   */
  function normalizeUser(u) {
    if (!u.full_name && (u.first_name || u.last_name)) {
      u.full_name = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
    }
    /* Map all possible ZOHO CRM profile picture field names to profile_pic */
    if (!u.profile_pic) {
      u.profile_pic = u.image_link || u.image_url || u.image || u.photo_url || u.pic_url ||
                      u.Profile_Pic || u.profile_photo || u.avatar_url || '';
    }
    return u;
  }

  /** Populate userMap and childrenMap from allUsers using the Reporting_To field */
  function buildUserMaps() {
    /* Do NOT reset userMap here – preserve any profile_pic already stored (e.g.
       from getCurrentUser) so that images are not lost when the users list is loaded. */
    childrenMap   = {};
    expandedNodes = {};
    allUsers.forEach(function (u) {
      var existing = userMap[u.id];
      var norm     = normalizeUser(u);
      /* If an earlier fetch already stored a profile picture, keep it. */
      if (existing && existing.profile_pic && !norm.profile_pic) {
        norm.profile_pic = existing.profile_pic;
      }
      userMap[u.id] = norm;
      var managerId = u.Reporting_To && u.Reporting_To.id;
      if (managerId) {
        if (!childrenMap[managerId]) childrenMap[managerId] = [];
        childrenMap[managerId].push(u.id);
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

  /**
   * Returns true when the logged-in user is NOT an Administrator AND is currently
   * viewing their own records (activeUserId === loggedInUserId).
   * In this case, approve/reject actions must be disabled on all rows.
   * Administrators can always approve/reject any record (own or subordinate).
   * Non-administrators can approve/reject subordinate records only.
   */
  function isSelfApprovalBlocked() {
    return !loggedInIsAdmin && (activeUserId === loggedInUserId);
  }

  /** Return the inner HTML for an avatar: profile image if available, else initials */
  function buildAvatarInnerHtml(user) {
    if (user.profile_pic) {
      return '<img src="' + escHtml(user.profile_pic) + '" alt="' + escHtml(user.full_name || '') + '">';
    }
    var name  = (user.full_name || user.email || '?').trim();
    var parts = name.split(/\s+/);
    var initials = parts.length >= 2
      ? (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
      : name.charAt(0).toUpperCase();
    return escHtml(initials || '?');
  }

  /**
   * Wrap matching portion of text in a highlight span.
   * q must be a lowercase string; matching is case-insensitive but the
   * original casing of text is preserved inside the span.
   */
  function highlightText(text, q) {
    if (!q) return escHtml(text);
    var lText = text.toLowerCase();
    var idx   = lText.indexOf(q);
    if (idx === -1) return escHtml(text);
    return escHtml(text.slice(0, idx)) +
           '<span class="ud-search-highlight">' + escHtml(text.slice(idx, idx + q.length)) + '</span>' +
           escHtml(text.slice(idx + q.length));
  }

  /** Build the HTML string for a single user row.
   *  depth  – nesting level (0 = root); controls content indentation.
   *  q      – optional lowercase search query for result highlighting.
   */
  function buildUserRowHtml(user, depth, q) {
    var isActive    = user.id === activeUserId;
    var hasChildren = !!(childrenMap[user.id] && childrenMap[user.id].length);
    var isExpanded  = !!expandedNodes[user.id];
    var roleName    = (user.role && user.role.name) ? user.role.name : '';

    var html =
      '<div class="ud-item' + (isActive ? ' ud-item-active' : '') +
      '" data-uid="' + escHtml(user.id) + '">' +
      '<div class="ud-item-avatar">' + buildAvatarInnerHtml(user) + '</div>' +
      '<div class="ud-item-info">' +
      '<div class="ud-item-name">'  + highlightText(user.full_name, q) + '</div>' +
      '<div class="ud-item-email">' + highlightText(user.email, q)     + '</div>' +
      (roleName ? '<div class="ud-item-role">' + highlightText(roleName, q) + '</div>' : '') +
      '</div>';

    if (hasChildren) {
      html +=
        '<button class="ud-expand-btn' + (isExpanded ? ' ud-expanded' : '') +
        '" data-expand-uid="' + escHtml(user.id) +
        '" title="' + (isExpanded ? 'Collapse' : 'Expand') + '">' +
        '<svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>' +
        '</button>';
    } else {
      /* Placeholder keeps the expand-button column reserved so all rows align */
      html += '<div class="ud-item-expand-gap"></div>';
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
    /* Children are rendered only when the node has been explicitly expanded. */
    if (children.length && expandedNodes[nodeId]) {
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
      /* Flat filtered view: only users within the logged-in user's subtree */
      var subtree = getSubtreeIds(loggedInUserId);
      subtree[loggedInUserId] = true;
      var matches = allUsers.filter(function (u) {
        if (!subtree[u.id]) return false;
        var role = (u.role && u.role.name) ? u.role.name.toLowerCase() : '';
        return u.full_name.toLowerCase().indexOf(q) !== -1 ||
               u.email.toLowerCase().indexOf(q)     !== -1 ||
               role.indexOf(q)                      !== -1;
      });

      if (matches.length === 0) {
        $list.html('<div class="ud-empty">No users found.</div>');
        return;
      }

      var flatHtml = '';
      matches.forEach(function (u) { flatHtml += buildUserRowHtml(u, 0, q); });
      $list.html(flatHtml);
      return;
    }

    /* Tree view: always rooted at the logged-in user based on reporting structure */
    if (!userMap[loggedInUserId]) {
      $list.html('<div class="ud-empty">User not found.</div>');
      return;
    }
    $list.html(buildNodeHtml(loggedInUserId, 0));
  }

  /**
   * Background task: for each user in the logged-in user's hierarchy who has no
   * profile picture yet, fetch their individual record from the CRM and update
   * their profile_pic.  Re-renders the open dropdown whenever a new image arrives.
   */
  async function fetchHierarchyUserPhotos() {
    if (!loggedInUserId) return;
    var subtree = getSubtreeIds(loggedInUserId);
    subtree[loggedInUserId] = true;
    var needPhoto = Object.keys(subtree).filter(function (id) {
      return userMap[id] && !userMap[id].profile_pic;
    });
    for (var i = 0; i < needPhoto.length; i++) {
      var uid = needPhoto[i];
      try {
        var resp = await ZOHO.CRM.API.getUser({ ID: uid });
        if (resp && resp.users && resp.users[0]) {
          var fresh = normalizeUser(resp.users[0]);
          if (fresh.profile_pic) {
            userMap[uid].profile_pic = fresh.profile_pic;
            /* Re-render the open dropdown so the new image appears immediately */
            if ($('#userDropdown').hasClass('ud-open')) {
              renderUserTree($('#udSearch').val());
            }
          }
        }
      } catch (e) { /* ignore per-user failures */ }
    }
  }

  function openUserDropdown() {
    var $btn = $('#userProfile');
    var $dd  = $('#userDropdown');
    renderUserTree('');
    $('#udSearch').val('');
    $('#udClearBtn').hide();

    /* Position below the button */
    var off  = $btn.offset();
    var btnH = $btn.outerHeight();
    $dd.css({ top: off.top + btnH + 6, left: off.left });

    $dd.addClass('ud-open');
    $btn.attr('aria-expanded', 'true');
    setTimeout(function () {
      $('#udSearch').focus();
      /* Scroll the active item into view */
      var $active = $('#udList .ud-item-active');
      if ($active.length) {
        var list = document.getElementById('udList');
        var itemTop = $active[0].offsetTop;
        list.scrollTop = Math.max(0, itemTop - 60);
      }
    }, 60);
  }

  function closeUserDropdown() {
    $('#userDropdown').removeClass('ud-open');
    $('#userProfile').attr('aria-expanded', 'false');
  }

  function initUserDropdown() {
    /* Toggle on button click */
    $('#userProfile').on('click', function (e) {
      e.stopPropagation();
      /* Click came from the avatar photo → open preview, do not toggle dropdown */
      if ($(e.target).is('.user-avatar img')) {
        openImgPreview($(e.target).attr('src') || '', $(e.target).attr('alt') || '');
        return;
      }
      if ($('#userDropdown').hasClass('ud-open')) {
        closeUserDropdown();
      } else {
        openUserDropdown();
      }
    });

    /* Live search + clear-button visibility */
    $(document).on('input', '#udSearch', function () {
      var q = $(this).val();
      $('#udClearBtn').toggle(q.length > 0);
      renderUserTree(q);
    });

    /* Clear-button click */
    $(document).on('click', '#udClearBtn', function (e) {
      e.stopPropagation();
      $('#udSearch').val('');
      $(this).hide();
      renderUserTree('');
    });

    /* Select a user */
    $(document).on('click', '.ud-item', function (e) {
      if ($(e.target).closest('.ud-expand-btn').length) return;
      var userId = $(this).data('uid');
      var user   = userMap[userId];
      if (!user) return;

      /* Compare the selected user against the currently active user BEFORE modifying anything */
      var currentUserId = $('#userProfile').attr('data-userid');

      /* Case 1 — Same user: close the selector and do nothing else */
      if (String(userId) === String(currentUserId)) {
        closeUserDropdown();
        return;
      }

      /* Case 2 — Different user */

      /* Step 1: Immediately clear all COQL-loaded events and every piece of
         owner-specific state so the calendar appears clean before the new
         user's events are fetched.
         The filter runs whenever beatPlanHasRefs is true (independent of bpSavedRec)
         so that even edge-cases where bpSavedRec is temporarily null still produce a
         clean slate – loadBeatPlanEvents itself guards against a missing bpSavedRec. */
      if (beatPlanHasRefs) {
        state.events = state.events.filter(function (ev) { return !ev.fromCoql; });
        saveEvents();
        render();
      }
      /* Clear copied event state – clipboard events belong to the previous owner
         and must not persist after switching users. */
      state.clipboard       = null;
      state.clipboardSource = null;
      /* Clear any filter-based record collections derived for the previous owner. */
      filteredModuleRecords = {};

      /* Step 2: Update #userProfile and the header with the selected user's details */
      activeUserId = userId;
      $('#userProfile').attr('data-userid', userId);
      $('.user-name').text(user.full_name);
      /* Copy the exact avatar content from the selected .ud-item-avatar so the
         header always reflects what is shown in the list (image or initials). */
      var avatarHtml = $(this).find('.ud-item-avatar').html();
      $('.user-avatar').html(avatarHtml || buildAvatarInnerHtml(user));
      closeUserDropdown();

      /* Steps 3-5: Execute the COQL query (filtered server-side by Owner.id)
         and render only the selected user's events. */
      if (beatPlanHasRefs && bpSavedRec) {
        loadBeatPlanEvents();
      }
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

  /* ── Beat Plan References state ── */
  var beatPlanHasRefs     = false;  /* true when beatplanner__Beat_Plan_References has data */
  var beatPlanModulesList = [];     /* [{label: 'Leads', api: 'Leads'}, …] */
  var moduleRecordsMap    = {};     /* {apiName: [{id, name}]} pre-fetched for "Meeting With" */
  var bprPicklistFields   = null;   /* null = not fetched; [] = empty; [{api_name,field_label,options}] */
  var bpDailyAllFields    = [];     /* all fields from beatplanner__Daily_Beat_Plans (including lookups) */
  var bprStyleConfig      = null;   /* style slot → field API name, read directly from BPR record */
  var bpSavedRec          = null;   /* saved beatplanner__Beat_Plan_References record (for navigation reloads) */
  var beatPlanLoadGen     = 0;      /* incremented on every loadBeatPlanEvents() call; used to discard stale responses */
  var copiedRowData       = null;   /* temporarily stored row data for Copy & Paste */
  var monthlyBeatPlanId   = null;   /* ID of the beatplanner__Monthly_Beat_Plans record for the open modal's month */
  var massCreateMonthPlanMap = {};  /* { 'July 2026': 'id', ... } – per-month IDs for the mass create accordion */
  var massCreateMode      = false;  /* true while the event modal is open for Mass Create (multi-day accordion) */

  /* ── Filter Panel state ── */
  var modulePicklistMeta    = {};  /* {moduleName: [{api_name, field_label, options}]} – per-module picklist fields */
  var activeModuleFilters   = {};  /* {moduleName: {fieldApiName: ['val1','val2']}} – currently applied filter selections */
  var filteredModuleRecords = {};  /* {moduleName: [{id, name, photo_id}]} – records matching active filters */

  /* ── Calendar Event Filters state (client-side event filtering by BPR picklist values) ── */
  var calEventFilters = {};  /* {fieldApiName: ['val1','val2',...]} – empty array / absent key = "All" */

  /* ── Mass Actions popup filter state (scoped to the overlay, independent of calEventFilters) ── */
  var massActionsPopupFilters = {};  /* same shape as calEventFilters; applied to .bp-slot-row visibility */

  /* ── Day Events Modal (DEM) current date ── */
  var demCurrentDs = '';  /* YYYY-MM-DD of the currently open Day Events Modal, '' when closed */

  /* ── Hover preview card state ── */
  var hoverTimer    = null;  /* debounce timer – delays hiding the hover card */
  var hoverActiveId = null;  /* event id of the currently-visible hover card */

  /* ── Mass Create submenu hover state ── */
  var submenuHideTimer = null;  /* debounce timer – delays hiding the mass-create submenu */

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
      var newView = $(this).data('view');
      /* When switching TO the Day view from Month or Week, normalize the cursor to
         today if the currently displayed period contains today.  This prevents the
         Day view from opening on the first-of-month or week-start date when the
         user was simply viewing the current period. */
      if (newView === 'day' && state.view !== 'day') {
        var tdStr = todayStr();
        var today = new Date();
        if (state.view === 'month') {
          var c = state.cursor;
          if (c.getFullYear() === today.getFullYear() && c.getMonth() === today.getMonth()) {
            state.cursor = today;
          }
        } else if (state.view === 'week') {
          var ws = weekStart(state.cursor);
          var we = new Date(ws); we.setDate(ws.getDate() + 6);
          if (dateToStr(ws) <= tdStr && tdStr <= dateToStr(we)) {
            state.cursor = today;
          }
        }
      }
      state.view = newView;
      updateViewTab(state.view);
      /* Discard stale COQL events so the view switch renders a clean slate
         while the new range fetch is in progress. This prevents month-view
         events from being mis-positioned when switching to week or day view. */
      state.events = state.events.filter(function (e) { return !e.fromCoql; });
      render();
      if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
    });

    /* Theme toggle – cycles light → dark → night → light */
    dom.themeToggle.on('click', function () {
      var themes = ['light', 'dark', 'night'];
      var idx = themes.indexOf(state.theme);
      setTheme(themes[(idx + 1) % themes.length]);
    });

    /* ── Actions Dropdown ── */
    $('#calActionsBtn').on('click', function (e) {
      e.stopPropagation();
      var $menu    = $('#calActionsMenu');
      var $btn     = $(this);
      var isOpen   = $menu.is(':visible');
      /* Close any open submenu first */
      $('#calMassCreateSubmenu').hide();
      $('.cal-mass-create-btn').attr('aria-expanded', 'false');
      if (isOpen) {
        $menu.hide();
        $btn.attr('aria-expanded', 'false');
      } else {
        $menu.show();
        $btn.attr('aria-expanded', 'true');
      }
    });

    /* Mass Create – show submenu on click/hover; use a timer to avoid flicker
       when the cursor moves between the parent button and the submenu panel.    */
    function showMassCreateSubmenu() {
      clearTimeout(submenuHideTimer);
      $('#calMassCreateSubmenu').show();
      $('.cal-mass-create-btn').attr('aria-expanded', 'true');
    }
    function hideMassCreateSubmenuDelayed() {
      submenuHideTimer = setTimeout(function () {
        $('#calMassCreateSubmenu').hide();
        $('.cal-mass-create-btn').attr('aria-expanded', 'false');
      }, 120);
    }

    $(document).on('click mouseenter', '.cal-mass-create-btn', function (e) {
      e.stopPropagation();
      showMassCreateSubmenu();
    });

    /* Keep submenu open while cursor is inside it */
    $(document).on('mouseenter', '#calMassCreateSubmenu', function () {
      clearTimeout(submenuHideTimer);
    });

    /* Start hide timer when cursor leaves the button or the submenu panel */
    $(document).on('mouseleave', '.cal-mass-create-btn, #calMassCreateSubmenu', function () {
      hideMassCreateSubmenuDelayed();
    });

    /* Close submenu immediately when hovering DIRECT main-menu items (not submenu options) */
    $(document).on('mouseenter', '#calActionsMenu > .cal-actions-option', function () {
      clearTimeout(submenuHideTimer);
      $('#calMassCreateSubmenu').hide();
      $('.cal-mass-create-btn').attr('aria-expanded', 'false');
    });

    /* Close Actions dropdown and submenu when clicking outside */
    $(document).on('click.calActions', function (e) {
      if (!$(e.target).closest('#calActionsWrap').length) {
        clearTimeout(submenuHideTimer);
        $('#calActionsMenu').hide();
        $('#calMassCreateSubmenu').hide();
        $('#calActionsBtn').attr('aria-expanded', 'false');
        $('.cal-mass-create-btn').attr('aria-expanded', 'false');
      }
    });

    /* Mass Create submenu options */
    $(document).on('click', '#calMassCreateSubmenu .cal-actions-option:not(.cal-between-trigger)', async function () {
      var action = $(this).data('mass-create');
      $('#calActionsMenu').hide();
      $('#calMassCreateSubmenu').hide();
      $('#calActionsBtn').attr('aria-expanded', 'false');
      $('.cal-mass-create-btn').attr('aria-expanded', 'false');
      await openMassCreateModal(action);
    });

    /* Between trigger – open the Between date range modal */
    $(document).on('click', '.cal-between-trigger', function (e) {
      e.stopPropagation();
      $('#calActionsMenu').hide();
      $('#calMassCreateSubmenu').hide();
      $('#calActionsBtn').attr('aria-expanded', 'false');
      $('.cal-mass-create-btn').attr('aria-expanded', 'false');
      /* Reset fields and errors */
      $('#calBetweenFrom').val('').removeClass('input-err');
      $('#calBetweenTo').val('').removeClass('input-err');
      $('#calBetweenFromErr').text('').removeClass('show');
      $('#calBetweenToErr').text('').removeClass('show');
      /* Set min date for From input to today */
      $('#calBetweenFrom').attr('min', todayStr());
      $('#calBetweenOverlay').show();
    });

    /* Between modal – close */
    function closeBetweenModal() {
      $('#calBetweenOverlay').hide();
    }
    $('#calBetweenClose, #calBetweenCancel').on('click', closeBetweenModal);
    $('#calBetweenOverlay').on('click', function (e) {
      if (e.target === this) { closeBetweenModal(); }
    });

    /* Between modal – live validation on date change */
    function validateBetweenDates() {
      var today   = todayStr();
      var fromVal = $('#calBetweenFrom').val();
      var toVal   = $('#calBetweenTo').val();
      var valid   = true;

      if (fromVal && fromVal < today) {
        $('#calBetweenFrom').addClass('input-err');
        $('#calBetweenFromErr').text('The From date cannot be earlier than today.').addClass('show');
        valid = false;
      } else {
        $('#calBetweenFrom').removeClass('input-err');
        $('#calBetweenFromErr').text('').removeClass('show');
      }

      if (fromVal && toVal && toVal < fromVal) {
        $('#calBetweenTo').addClass('input-err');
        $('#calBetweenToErr').text('The To date must be the same as or later than the From date.').addClass('show');
        valid = false;
      } else if (toVal) {
        $('#calBetweenTo').removeClass('input-err');
        $('#calBetweenToErr').text('').removeClass('show');
      }

      return valid;
    }

    $('#calBetweenFrom').on('change', function () {
      /* Update the To input's min attribute to match the From date */
      var fromVal = $(this).val();
      if (fromVal) { $('#calBetweenTo').attr('min', fromVal); }
      validateBetweenDates();
    });

    $('#calBetweenTo').on('change', function () {
      validateBetweenDates();
    });

    /* Between modal – submit */
    $('#calBetweenSubmit').on('click', async function () {
      var fromVal = $('#calBetweenFrom').val();
      var toVal   = $('#calBetweenTo').val();

      if (!fromVal) {
        $('#calBetweenFrom').addClass('input-err');
        $('#calBetweenFromErr').text('Please select a From date.').addClass('show');
        return;
      }
      if (!toVal) {
        $('#calBetweenTo').addClass('input-err');
        $('#calBetweenToErr').text('Please select a To date.').addClass('show');
        return;
      }
      if (!validateBetweenDates()) { return; }

      closeBetweenModal();
      await openMassCreateModal('between', fromVal, toVal);
    });

    /* ── Mass Create: accordion day header toggle (inside #slotPickerGrid) ── */
    $(document).on('click', '#slotPickerGrid .mc-day-group .map-day-header', function (e) {
      /* Ignore clicks on the checkbox label so the day-level checkbox can be toggled independently */
      if ($(e.target).closest('.map-cb-label').length) { return; }
      var $group    = $(this).closest('.map-day-group');
      var collapsed = $group.toggleClass('map-day-collapsed').hasClass('map-day-collapsed');
      $(this).find('.map-day-toggle').attr('aria-expanded', String(!collapsed));
    });

    /* ── Mass Create: non-beatplan time-slot click — opens form for that slot ── */
    $(document).on('click', '#slotPickerGrid .mc-tsi', function () {
      var date = $(this).data('date');
      var hour = parseInt($(this).data('hour'), 10);
      openModal(date, hourToTime(hour), hourToTime(hour + 1));
    });

    $(document).on('click', '#calActionsMenu .cal-actions-option[data-action]', async function () {
      var action = $(this).data('action');
      $('#calActionsMenu').hide();
      $('#calActionsBtn').attr('aria-expanded', 'false');
      await openMassActionsPopup(action);
    });

    /* Mass Actions popup – close */
    $(document).on('click', '#massActionsClose, #massActionsCancel', function () {
      closeMassActionsPopup();
    });
    $(document).on('click', '#massActionsOverlay', function (e) {
      if (e.target === this) { closeMassActionsPopup(); }
    });

    /* Mass Actions popup – Select All checkbox */
    $(document).on('change', '#massActionsSelectAll', function () {
      var checked = $(this).prop('checked');
      /* Only operate on non-filtered-out rows (accordion-collapsed rows are included) */
      var $visibleEvtCbs = $('#massActionsBody .bp-slot-row:not(.map-filter-hidden) .bp-row-cb');
      var $visibleDayCbs = $('#massActionsBody .map-day-group:visible .map-day-cb');
      $visibleEvtCbs.prop('checked', checked);
      $visibleDayCbs.prop('checked', checked).prop('indeterminate', false);
      /* Also sync per-day table select-all checkboxes */
      $('#massActionsBody .bp-select-all-cb').prop('checked', checked).prop('indeterminate', false);
      var total = $visibleEvtCbs.length;
      var label = checked && total > 0
        ? total + ' event' + (total === 1 ? '' : 's') + ' selected'
        : '';
      $('#mapSelCount').text(label);
    });

    /* Mass Actions popup – day checkbox */
    $(document).on('change', '#massActionsBody .map-day-cb', function () {
      var date    = $(this).data('date');
      var checked = $(this).prop('checked');
      /* Check/uncheck non-filtered event rows for this date (includes accordion-collapsed) */
      $('#massActionsBody .bp-slot-row[data-date="' + date + '"]:not(.map-filter-hidden) .bp-row-cb').prop('checked', checked);
      /* Sync per-day table select-all checkbox */
      var $dayGroup = $(this).closest('.map-day-group');
      $dayGroup.find('.bp-select-all-cb').prop('checked', checked).prop('indeterminate', false);
      syncMassActionsSelectAll();
    });

    /* Mass Actions popup – individual row checkbox (bp-row-cb inside #massActionsBody) */
    $(document).on('change', '#massActionsBody .bp-row-cb', function () {
      var date   = $(this).closest('.bp-slot-row').data('date') || '';
      var $dayCb = $('#massActionsBody .map-day-cb[data-date="' + date + '"]');
      syncMassActionsDayCb($dayCb);
      /* Also sync the per-day table select-all */
      var $dayGroup = $(this).closest('.map-day-group');
      var $dayCbs   = $dayGroup.find('.bp-slot-row:not(.map-filter-hidden) .bp-row-cb');
      var dayCkd    = $dayCbs.filter(':checked').length;
      $dayGroup.find('.bp-select-all-cb').prop('checked', dayCkd === $dayCbs.length && $dayCbs.length > 0)
                                         .prop('indeterminate', dayCkd > 0 && dayCkd < $dayCbs.length);
      syncMassActionsSelectAll();
    });

    /* Mass Actions popup – per-day table select-all checkbox inside #massActionsBody */
    $(document).on('change', '#massActionsBody .bp-select-all-cb', function () {
      var checked   = $(this).is(':checked');
      var $dayGroup = $(this).closest('.map-day-group');
      var date      = $dayGroup.data('date') || '';
      $dayGroup.find('.bp-slot-row:not(.map-filter-hidden) .bp-row-cb').prop('checked', checked);
      var $dayCb = $('#massActionsBody .map-day-cb[data-date="' + date + '"]');
      syncMassActionsDayCb($dayCb);
      syncMassActionsSelectAll();
    });

    /* Mass Actions popup – accordion day header toggle */
    $(document).on('click', '#massActionsBody .map-day-header', function (e) {
      /* Ignore clicks on the checkbox label (let the checkbox handle those) */
      if ($(e.target).closest('.map-cb-label').length) { return; }
      var $group = $(this).closest('.map-day-group');
      var collapsed = $group.toggleClass('map-day-collapsed').hasClass('map-day-collapsed');
      $(this).find('.map-day-toggle').attr('aria-expanded', String(!collapsed));
    });

    /* Mass Actions popup – Confirm button */
    $(document).on('click', '#massActionsConfirm', async function () {
      var $btn    = $(this);
      var action  = massActionsCurrentAction;
      var selIds  = [];
      $('#massActionsBody .bp-row-cb:checked').each(function () {
        var evid = String($(this).closest('.bp-slot-row').data('editId') || '');
        if (evid) { selIds.push(evid); }
      });

      if (selIds.length === 0) {
        showToast('No events selected.');
        return;
      }

      $btn.prop('disabled', true);

      /* Helper: show progress text in the footer */
      function setMapProgress(msg) {
        var $p = $('#mapProgressMsg');
        if (!$p.length) {
          $('.mass-actions-foot').prepend('<span class="map-progress-msg" id="mapProgressMsg"></span>');
          $p = $('#mapProgressMsg');
        }
        if (msg) { $p.text(msg).show(); } else { $p.hide(); }
      }

      /* Helper: chunk an array into sub-arrays of at most size n */
      function chunkArray(arr, n) {
        var chunks = [];
        for (var ci = 0; ci < arr.length; ci += n) { chunks.push(arr.slice(ci, ci + n)); }
        return chunks;
      }

      var BATCH_SIZE = 500;

      if (action === 'mass-delete') {
        if (!window.confirm('Delete ' + selIds.length + ' selected event(s)?')) {
          $btn.prop('disabled', false);
          return;
        }

        var bpIds    = selIds.filter(function (id) { var ev = findEvent(id); return ev && ev.bprFieldValues && Object.keys(ev.bprFieldValues).length; });
        var localIds = selIds.filter(function (id) { return bpIds.indexOf(id) === -1; });
        var deletedIds = {};
        var delFailed  = 0;

        var bpChunks = chunkArray(bpIds, BATCH_SIZE);
        for (var dci = 0; dci < bpChunks.length; dci++) {
          setMapProgress('Deleting batch ' + (dci + 1) + ' of ' + bpChunks.length + '\u2026');
          try {
            var delResp = await zrc.post('/crm/v8/beatplanner__Daily_Beat_Plans/actions/mass_delete', {
              ids: bpChunks[dci]
            });
            var delData = (delResp && delResp.data && delResp.data.data) ? delResp.data.data : [];
            delData.forEach(function (entry) {
              if (entry && entry.status === 'success' && entry.details && entry.details.id) {
                deletedIds[entry.details.id] = true;
              }
            });
            /* If response has no per-record status, treat all in chunk as success */
            if (delData.length === 0) {
              bpChunks[dci].forEach(function (id) { deletedIds[id] = true; });
            }
          } catch (delErr) {
            console.error('Mass delete batch ' + (dci + 1) + ' failed', delErr);
            delFailed += bpChunks[dci].length;
          }
        }
        localIds.forEach(function (id) { deletedIds[id] = true; });

        var deleted = 0;
        selIds.forEach(function (id) {
          if (deletedIds[id]) {
            state.events = state.events.filter(function (e) { return e.id !== id; });
            if (state.clipboard) {
              state.clipboard = state.clipboard.filter(function (e) { return e.id !== id; });
              if (state.clipboard.length === 0) { state.clipboard = null; state.clipboardSource = null; }
            }
            deleted++;
          }
        });
        setMapProgress('');
        saveEvents();
        render();
        hideHoverCard();
        if (dom.modal.hasClass('modal-open')) { closeModal(); }
        /* Refresh day events modal if currently open */
        if (demCurrentDs && dom.dayEventsModal.hasClass('dem-open')) {
          showDayEventsModal(demCurrentDs).catch(function () {});
        }
        closeMassActionsPopup();
        if (delFailed > 0) {
          showToast(deleted + ' event(s) deleted. ' + delFailed + ' failed.');
        } else {
          showToast(deleted + ' event(s) deleted.');
        }

      } else if (action === 'mass-approve' || action === 'mass-reject') {
        var approvalVal  = action === 'mass-approve' ? 'Approved' : 'Rejected';
        var updated      = 0;
        var arFailed     = 0;
        var arChunks     = chunkArray(selIds, 100);

        for (var arci = 0; arci < arChunks.length; arci++) {
          setMapProgress('Processing batch ' + (arci + 1) + ' of ' + arChunks.length + '\u2026');
          try {
            var arResp = await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
              data: arChunks[arci].map(function (id) {
                return { id: id, beatplanner__Managers_Approval: approvalVal };
              })
            });
            var arResults = (arResp && arResp.data && arResp.data.data) ? arResp.data.data : [];
            arChunks[arci].forEach(function (id, idx) {
              var res = arResults[idx] || {};
              if (res.status !== 'error') {
                var ev = findEvent(id);
                if (ev) {
                  if (!ev.bprFieldValues) { ev.bprFieldValues = {}; }
                  ev.bprFieldValues['beatplanner__Managers_Approval'] = approvalVal;
                }
                updated++;
              } else {
                console.error('Mass ' + action + ' failed for', id, res);
                arFailed++;
              }
            });
          } catch (arErr) {
            console.error('Mass ' + action + ' batch ' + (arci + 1) + ' failed', arErr);
            arFailed += arChunks[arci].length;
          }
        }

        setMapProgress('');
        saveEvents();
        render();
        hideHoverCard();
        if (dom.modal.hasClass('modal-open')) { closeModal(); }
        /* Refresh day events modal if currently open */
        if (demCurrentDs && dom.dayEventsModal.hasClass('dem-open')) {
          showDayEventsModal(demCurrentDs).catch(function () {});
        }
        closeMassActionsPopup();
        var actionLabel = action === 'mass-approve' ? 'approved' : 'rejected';
        if (arFailed > 0) {
          showToast(updated + ' record(s) ' + actionLabel + '. ' + arFailed + ' failed.');
        } else {
          showToast(updated + ' record(s) ' + actionLabel + '.');
        }

      } else if (action === 'mass-update') {
        /* Collect field values from each checked edit row, then batch-update via Records Update API */
        var muUpdated = 0;
        var muFailed  = 0;
        var muPayloads = [];

        for (var muIdx = 0; muIdx < selIds.length; muIdx++) {
          var muId  = selIds[muIdx];
          var $muRow = $('#massActionsBody .bp-slot-row[data-edit-id="' + muId + '"]');
          if (!$muRow.length) { continue; }

          var muDate = $muRow.data('date') || '';
          var $muContainer = $muRow.closest('.bp-plan-container');

          /* Attendance + Leave Type (from attend bar above the table) */
          var $muAttendWrap = $muContainer.find('.bp-attend-field:not(.bp-leave-type-field) .bp-dd-wrap');
          var muAttendApi   = $muAttendWrap.data('api') || 'beatplanner__Attendance';
          var muAttendVal   = $muAttendWrap.find('.bp-dd-val').attr('data-actual-val') || '';
          var $muLeaveWrap  = $muContainer.find('.bp-leave-type-field .bp-dd-wrap');
          var muLeaveApi    = $muLeaveWrap.data('api') || 'beatplanner__Leave_Type';
          var muLeaveVal    = $muLeaveWrap.find('.bp-dd-val').attr('data-actual-val') || '';
          var muIsLeave     = muAttendVal.toLowerCase() === 'leave';

          var muRecordData     = {};
          var muBprFieldValues = {};

          if (muAttendVal) {
            muRecordData[muAttendApi]     = muAttendVal;
            muBprFieldValues[muAttendApi] = muAttendVal;
          }

          if (muIsLeave) {
            /* Leave records: only Attendance + Leave Type */
            if (muLeaveVal) {
              muRecordData[muLeaveApi]     = muLeaveVal;
              muBprFieldValues[muLeaveApi] = muLeaveVal;
            }
          } else {
            /* Working records: all editable fields from the row */
            var muStartTime = String($muRow.data('startTime') || '00:00');
            var muEndTime   = String($muRow.data('endTime')   || '00:00');
            var muStartIso  = muDate && muStartTime ? toIsoDt(muDate, muStartTime) : muStartTime;
            var muEndIso    = muDate && muEndTime   ? toIsoDt(muDate, muEndTime)   : muEndTime;
            var $muStart    = $muRow.find('.bp-time-cell').eq(0);
            var $muEnd      = $muRow.find('.bp-time-cell').eq(1);
            muRecordData[$muStart.data('api') || 'beatplanner__Date_Time_From'] = muStartIso;
            muRecordData[$muEnd.data('api')   || 'beatplanner__Date_Time_To']   = muEndIso;
            if (muDate) { muRecordData['beatplanner__Date'] = muDate; }

            /* Meetings For */
            var $muMfWrap    = $muRow.find('.bp-mf-wrap');
            var $muMfVal     = $muMfWrap.find('.bp-dd-val');
            var muMfDisplay  = $muMfVal.text().trim() || '';
            var muMfFieldApi = $muMfWrap.data('api') || 'beatplanner__Meetings_For';
            if (muMfDisplay && muMfDisplay !== 'Select module\u2026') {
              muRecordData[muMfFieldApi]     = muMfDisplay;
              muBprFieldValues[muMfFieldApi] = muMfDisplay;
            }

            /* Meeting With */
            var $muMwWrap    = $muRow.find('.bp-mw-wrap');
            var $muMwVal     = $muMwWrap.find('.bp-dd-val');
            var muMwId       = $muMwVal.attr('data-selected-id') || '';
            var muMwLookupApi = $muMwWrap.attr('data-api') || '';
            var muMwName     = $muMwVal.text() || '';
            if (muMwId && muMwLookupApi) {
              muRecordData[muMwLookupApi] = { id: muMwId };
              /* Null-out any other meeting-with lookup fields for this module list */
              bpDailyAllFields.forEach(function (f) {
                if (f.data_type !== 'lookup' || !f.lookup || !f.lookup.module) { return; }
                if (f.api_name === muMwLookupApi) { return; }
                var modApi2 = f.lookup.module.api_name || f.lookup.module.module || '';
                if (beatPlanModulesList.some(function (mod) { return mod.api === modApi2; })) {
                  muRecordData[f.api_name] = null;
                }
              });
            }

            /* Other picklist fields in the row (excludes attend-bar fields) */
            $muRow.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
              var $w    = $(this);
              var fApi  = String($w.data('api') || '');
              if (!fApi || fApi === muAttendApi || fApi === muLeaveApi) { return; }
              var $v    = $w.find('.bp-dd-val');
              var fAct  = $v.attr('data-actual-val') || $v.text() || '';
              if (fAct && fAct !== 'Select\u2026') {
                muRecordData[fApi]     = fAct;
                muBprFieldValues[fApi] = fAct;
              }
            });

            muRecordData['Name'] = 'Meeting With ' + muMwName +
              ' on ' + fmtDateDMY(muDate) +
              ' for the Time Slot ' + fmtTime(muStartTime) + ' - ' + fmtTime(muEndTime);
          }

          if (Object.keys(muRecordData).length === 0) { continue; }

          muPayloads.push({ id: muId, data: muRecordData, bprFieldValues: muBprFieldValues });
        }

        /* Send in batches of 100 using the standard Records Update API */
        var muChunks = chunkArray(muPayloads, 100);
        for (var muci = 0; muci < muChunks.length; muci++) {
          setMapProgress('Updating batch ' + (muci + 1) + ' of ' + muChunks.length + '\u2026');
          try {
            var muBatchData = muChunks[muci].map(function (p) {
              return Object.assign({ id: p.id }, p.data);
            });
            var muResp = await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', { data: muBatchData });
            var muResults = (muResp && muResp.data && muResp.data.data) ? muResp.data.data : [];
            muChunks[muci].forEach(function (p, idx) {
              var res = muResults[idx] || {};
              if (res.status !== 'error') {
                var muEv = findEvent(p.id);
                if (muEv) {
                  if (!muEv.bprFieldValues) { muEv.bprFieldValues = {}; }
                  Object.assign(muEv.bprFieldValues, p.bprFieldValues);
                }
                muUpdated++;
              } else {
                console.error('Mass update failed for', p.id, res);
                muFailed++;
              }
            });
          } catch (muErr) {
            console.error('Mass update batch ' + (muci + 1) + ' failed', muErr);
            muFailed += muChunks[muci].length;
          }
        }

        setMapProgress('');
        saveEvents();
        render();
        hideHoverCard();
        if (dom.modal.hasClass('modal-open')) { closeModal(); }
        if (demCurrentDs && dom.dayEventsModal.hasClass('dem-open')) {
          showDayEventsModal(demCurrentDs).catch(function () {});
        }
        closeMassActionsPopup();
        if (muFailed > 0) {
          showToast(muUpdated + ' record(s) updated. ' + muFailed + ' failed.');
        } else {
          showToast(muUpdated + ' record(s) updated.');
        }
      }

      $btn.prop('disabled', false);
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

    /* Hover preview card – show on mouseenter, hide on mouseleave with debounce */
    dom.canvas.on('mouseenter.hovercard', '.evt-chip', function () {
      clearTimeout(hoverTimer);
      var ev = findEvent($(this).data('evid'));
      if (ev) { showHoverCard(ev, $(this)); }
    });
    dom.canvas.on('mouseleave.hovercard', '.evt-chip', function () {
      hoverTimer = setTimeout(hideHoverCard, 150);
    });
    /* Hover preview card – also show for .time-event elements in Week and Day views */
    dom.canvas.on('mouseenter.hovercard', '.time-event', function () {
      clearTimeout(hoverTimer);
      var ev = findEvent($(this).data('evid'));
      if (ev) { showHoverCard(ev, $(this)); }
    });
    dom.canvas.on('mouseleave.hovercard', '.time-event', function () {
      hoverTimer = setTimeout(hideHoverCard, 150);
    });
    dom.hoverCard.on('mouseenter', function () {
      clearTimeout(hoverTimer);
    });
    dom.hoverCard.on('mouseleave', function () {
      hideHoverCard();
    });

    /* ── Action buttons: hover card ── */
    dom.hoverCard.on('click', '.hc-act-edit', function (e) {
      e.stopPropagation();
      var ev = findEvent($(this).data('evid'));
      hideHoverCard();
      if (ev) {
        if (beatPlanHasRefs) { openBpEditModal(ev); } else { openModal(ev.date, ev.startTime, ev.endTime, ev); }
      }
    });
    dom.hoverCard.on('click', '.hc-act-approve', function (e) {
      e.stopPropagation();
      if (isSelfApprovalBlocked()) { return; }
      var evid = $(this).data('evid');
      hideHoverCard();
      doApprove(evid);
    });
    dom.hoverCard.on('click', '.hc-act-reject', function (e) {
      e.stopPropagation();
      if (isSelfApprovalBlocked()) { return; }
      var evid = $(this).data('evid');
      hideHoverCard();
      doReject(evid);
    });
    dom.hoverCard.on('click', '.hc-act-copy', function (e) {
      e.stopPropagation();
      doCopy($(this).data('evid'));
      hideHoverCard();
    });
    dom.hoverCard.on('click', '.hc-act-paste', function (e) {
      e.stopPropagation();
      var ev = findEvent($(this).data('evid'));
      if (ev && state.clipboard && isValid(ev.date)) { doPaste(ev.date); }
      hideHoverCard();
    });
    dom.hoverCard.on('click', '.hc-act-delete', function (e) {
      e.stopPropagation();
      var evid = $(this).data('evid');
      if (window.confirm('Delete this event?')) { deleteEvent(evid); }
      hideHoverCard();
    });

    /* ── Day events modal controls ── */
    dom.demClose.on('click', closeDayEventsModal);
    dom.dayEventsModal.on('click', function (e) {
      if (e.target === this) { closeDayEventsModal(); }
    });

    /* ── Action buttons: day events modal cards ── */
    dom.dayEventsModal.on('click', '.hc-act-edit', function (e) {
      e.stopPropagation();
      var ev = findEvent($(this).data('evid'));
      closeDayEventsModal();
      if (ev) {
        if (beatPlanHasRefs) { openBpEditModal(ev); } else { openModal(ev.date, ev.startTime, ev.endTime, ev); }
      }
    });
    dom.dayEventsModal.on('click', '.hc-act-approve', function (e) {
      e.stopPropagation();
      if (isSelfApprovalBlocked()) { return; }
      doApprove($(this).data('evid'));
    });
    dom.dayEventsModal.on('click', '.hc-act-reject', function (e) {
      e.stopPropagation();
      if (isSelfApprovalBlocked()) { return; }
      doReject($(this).data('evid'));
    });
    dom.dayEventsModal.on('click', '.hc-act-copy', function (e) {
      e.stopPropagation();
      doCopy($(this).data('evid'));
    });
    dom.dayEventsModal.on('click', '.hc-act-paste', function (e) {
      e.stopPropagation();
      var ev = findEvent($(this).data('evid'));
      if (ev && state.clipboard && isValid(ev.date)) { doPaste(ev.date); closeDayEventsModal(); }
    });
    dom.dayEventsModal.on('click', '.hc-act-delete', function (e) {
      e.stopPropagation();
      var evid = $(this).data('evid');
      if (window.confirm('Delete this event?')) { deleteEvent(evid); closeDayEventsModal(); }
    });

    /* Time slot picker – item click inside modal */
    $(document).on('click', '#slotPickerGrid .time-slot-item', function (e) {
      e.stopPropagation();
      var h    = parseInt($(this).data('hour'), 10);
      var date = $(this).data('date');
      /* Switch from slot-picker phase to form phase */
      dom.slotPickerSection.hide();
      dom.eventFormSection.show();
      dom.slotPickerFoot.hide();
      dom.eventFormFoot.show();
      /* Pre-fill the form for the selected slot */
      openModal(date, hourToTime(h), hourToTime(h + 1));
    });

    /* Slot picker cancel button */
    dom.slotPickerCancel.on('click', function () {
      closeSlotPicker();
    });

    /* ── Beat plan table: custom searchable dropdown handlers ── */
    /* These handlers cover both #slotPickerGrid and #demBulkGrid (day-events modal). */

    /* Toggle open / close a dropdown trigger */
    $(document).on('click', '#slotPickerGrid .bp-dd-trigger, #demBulkGrid .bp-dd-trigger, #massActionsBody .bp-dd-trigger', function (e) {
      e.stopPropagation();
      var $wrap  = $(this).closest('.bp-dd-wrap');
      var isOpen = $wrap.hasClass('bp-dd-open');
      /* Close any other open dropdown first */
      closeAllBpDropdowns();
      if (!isOpen) {
        $wrap.addClass('bp-dd-open');
        var $panel = $wrap.find('.bp-dd-panel');
        $panel.find('.bp-dd-opt').show();
        $panel.find('.bp-dd-search').val('');
        $panel.find('.bp-dd-search').focus();
      }
    });

    /* Prevent search input click from bubbling and closing the panel */
    $(document).on('click', '#slotPickerGrid .bp-dd-search, #demBulkGrid .bp-dd-search, #massActionsBody .bp-dd-search', function (e) {
      e.stopPropagation();
    });

    /* Live-filter dropdown options as the user types */
    $(document).on('input', '#slotPickerGrid .bp-dd-search, #demBulkGrid .bp-dd-search, #massActionsBody .bp-dd-search', function () {
      var q    = $(this).val().toLowerCase();
      var $ul  = $(this).closest('.bp-dd-panel').find('.bp-dd-opt');
      $ul.each(function () {
        var label = ($(this).data('label') || $(this).text()).toLowerCase();
        $(this).toggle(label.indexOf(q) !== -1);
      });
    });

    /* "Meetings For" option selected → set value + populate Meeting With */
    $(document).on('click', '#slotPickerGrid .bp-mf-wrap .bp-dd-opt, #demBulkGrid .bp-mf-wrap .bp-dd-opt, #massActionsBody .bp-mf-wrap .bp-dd-opt', function (e) {
      e.stopPropagation();
      var $opt   = $(this);
      var $wrap  = bpWrapOf($opt);
      var $row   = $wrap.closest('.bp-slot-row');
      var label  = $opt.data('label');
      var api    = $opt.data('api');

      $wrap.find('.bp-dd-val').text(label).attr('data-selected-api', api);
      closeBpDropdown($wrap);

      /* Find the lookup field in beatplanner__Daily_Beat_Plans whose lookup.module.api_name
         matches the selected module, and stamp its api_name onto the Meeting With wrap */
      var lookupApiName = '';
      for (var i = 0; i < bpDailyAllFields.length; i++) {
        var f = bpDailyAllFields[i];
        if (f.data_type === 'lookup' && f.lookup && f.lookup.module) {
          var modApiName = f.lookup.module.api_name || f.lookup.module.module || '';
          var fieldLbl   = (f.field_label || '').toLowerCase();
          if (modApiName === api || fieldLbl === label.toLowerCase()) {
            lookupApiName = f.api_name;
            break;
          }
        }
      }

      /* Populate the "Meeting With" dropdown for this row */
      var $mwWrap  = $row.find('.bp-mw-wrap');
      /* Stamp the resolved lookup field API name onto data-api so it can be used when saving */
      $mwWrap.attr('data-api', lookupApiName || '');
      /* Use filtered records if a filter has been applied for this module; fall back to full list */
      var records  = filteredModuleRecords.hasOwnProperty(api)
                       ? filteredModuleRecords[api]
                       : (moduleRecordsMap[api] || []);
      var mwOpts;
      if (records.length === 0) {
        mwOpts = '<li class="bp-dd-empty">No records found</li>';
      } else {
        mwOpts = '';
        records.forEach(function (rec) {
          mwOpts += '<li class="bp-dd-opt" data-id="' + escHtml(rec.id) +
                    '" data-label="' + escHtml(rec.name) +
                    '" data-photo-id="' + escHtml(rec.photo_id || '') + '">' + escHtml(rec.name) + '</li>';
        });
      }
      $mwWrap.find('.bp-mw-list').html(mwOpts);
      /* Reset Meeting With selection and clear its avatar */
      $mwWrap.find('.bp-dd-val').text('Select…').removeAttr('data-selected-id');
      $mwWrap.find('.bp-rec-avatar').text('').removeClass('bp-rec-avatar--show').removeAttr('data-img-src');
    });

    /* "Meeting With" option selected → show initials avatar; try to load actual photo */
    $(document).on('click', '#slotPickerGrid .bp-mw-wrap .bp-dd-opt, #demBulkGrid .bp-mw-wrap .bp-dd-opt, #massActionsBody .bp-mw-wrap .bp-dd-opt', function (e) {
      e.stopPropagation();
      var $opt    = $(this);
      var $wrap   = bpWrapOf($opt);
      var label   = $opt.data('label')    || '';
      var id      = $opt.data('id')       || '';
      var photoId = $opt.data('photo-id') || '';

      $wrap.find('.bp-dd-val').text(label).attr('data-selected-id', id);

      /* Show initials avatar immediately */
      var $avatar = $wrap.find('.bp-rec-avatar');
      $avatar.text(buildRecordInitials(label))
             .removeClass('bp-rec-avatar--show')
             .removeAttr('data-img-src')
             .attr('data-photo-id', photoId || '')  /* store for later retrieval at save time */
             .addClass('bp-rec-avatar--show');

      closeBpDropdown($wrap);

      /* Attempt to load the actual record photo */
      if (photoId) {
        ZOHO.CRM.API.getFile({ id: photoId })
          .then(function (resp) {
            if (resp) {
              /* Convert to a data URL so the src remains valid across page reloads
                 (Blob URLs are revoked when the session ends). */
              var imgBlob = new Blob([resp], { type: 'image/jpeg' });
              var reader  = new FileReader();
              reader.onloadend = function () {
                var dataUrl = reader.result;
                $avatar
                  .html('<img src="' + dataUrl + '">')
                  .attr('data-img-src', dataUrl);
              };
              reader.readAsDataURL(imgBlob);
            }
          })
          .catch(function () {
            /* no photo – keep initials fallback */
          });
      }
    });

    /* Generic picklist option selected for all dynamic BPR columns
       (meetings-for and meeting-with have their own handlers above) */
    $(document).on('click', '#slotPickerGrid .bp-dd-wrap:not(.bp-mf-wrap):not(.bp-mw-wrap) .bp-dd-opt, #demBulkGrid .bp-dd-wrap:not(.bp-mf-wrap):not(.bp-mw-wrap) .bp-dd-opt, #massActionsBody .bp-dd-wrap:not(.bp-mf-wrap):not(.bp-mw-wrap) .bp-dd-opt', function (e) {
      e.stopPropagation();
      var $opt   = $(this);
      var $wrap  = bpWrapOf($opt);
      var label  = $opt.data('label');
      var actual = $opt.data('actual') || label;

      $wrap.find('.bp-dd-val').text(label).attr('data-actual-val', actual);
      closeBpDropdown($wrap);

      /* Attendance controls table / Leave Type / Apply Leave button visibility.
         Identify attendance dropdown by its position in the attend bar (not the leave-type field). */
      var isAttendanceDd = $wrap.closest('.bp-attend-bar').length > 0 &&
                           !$wrap.closest('.bp-leave-type-field').length;
      if (isAttendanceDd) {
        var isWorking = (label || '').toLowerCase() === 'working';
        var isLeave   = (label || '').toLowerCase() === 'leave';

        if ($wrap.closest('#massActionsBody').length) {
          /* ── Mass Update popup: per-event container handling ── */
          var $mc = $wrap.closest('.bp-plan-container');
          $mc.find('.bp-slots-table').toggle(isWorking);
          $mc.find('.bp-leave-type-field').toggle(isLeave);
          $mc.find('.bp-apply-leave-btn').hide();
          /* Toggle leave-mode action buttons in the attend-bar */
          $mc.find('.bp-attend-leave-actions').toggle(isLeave);
          if (!isLeave) {
            /* Reset Leave Type and clear attend-bar background + label colours */
            $mc.find('.bp-leave-type-field .bp-dd-wrap .bp-dd-val')
               .text('Select\u2026')
               .removeAttr('data-actual-val');
            $mc.find('.bp-attend-bar').css('background', '');
            $mc.find('.bp-attend-label').css('color', '');
            $mc.find('.bp-attend-leave-actions').css('color', '');
          }
        } else {
          /* ── Check if inside a Mass Create accordion day group ── */
          var $dayGroup = $wrap.closest('.mc-day-group');

          if ($dayGroup.length) {
            /* ── Mass Create accordion: scope all changes to this day group only ── */
            $dayGroup.find('.bp-slots-table').toggle(isWorking);
            $dayGroup.find('.bp-leave-type-field').toggle(isLeave);
            /* Show/hide leave-day checkbox (Mass Create mode only) */
            $dayGroup.find('.bp-mc-leave-cb-label').toggle(isLeave);
            if (!isLeave) {
              /* Uncheck leave checkbox and reset Leave Type when switching away from Leave */
              $dayGroup.find('.bp-mc-leave-cb').prop('checked', false);
              $dayGroup.find('.bp-leave-type-field .bp-dd-wrap .bp-dd-val')
                       .text('Select\u2026')
                       .removeAttr('data-actual-val');
              $dayGroup.find('.bp-attend-bar').css('background', '');
              $dayGroup.find('.bp-attend-label').css('color', '');
            }
          } else {
          /* ── slotPickerGrid (single-event edit modal) handling ── */
          var $grid     = $('#slotPickerGrid');

          /* ── Feature 3: Leave → Working in edit mode ──
             When editing a Leave record and the user switches Attendance to Working,
             replace the single edit row with the full slot table (all available hours),
             and save the original Leave record ID so it can be deleted on save. */
          if (isWorking) {
            var $container = $grid.find('.bp-plan-container').first();
            var leaveEditId = String($container.data('editId') || '');
            if (leaveEditId) {
              /* Generate the full slot table from buildBeatPlanTable and extract its slots-wrap */
              var $fullTable = $('<div>').html(buildBeatPlanTable($container.data('date') || ''));
              var $newSlotsWrap = $fullTable.find('.bp-slots-wrap');
              $container.find('.bp-slots-wrap').replaceWith($newSlotsWrap);
              /* Mark the container: remember the leave record ID for later deletion,
                 and remove data-edit-id to switch the container back to create mode. */
              $container.attr('data-leave-edit-id', leaveEditId);
              $container.removeAttr('data-edit-id');
            }
          }

          $grid.find('.bp-slots-table').toggle(isWorking);
          $grid.find('.bp-leave-type-field').toggle(isLeave);
          /* Always hide the Apply/Update Leave button when Attendance changes — it becomes
             visible only after a valid Leave Type is selected (see Leave Type handler). */
          $grid.find('.bp-apply-leave-btn').hide();
          /* Toggle leave-mode action buttons in the attend-bar */
          $grid.find('.bp-attend-leave-actions').toggle(isLeave);
          /* Show Filter button only when Working; hide and close panel otherwise */
          $grid.find('.bp-filter-action').toggle(isWorking);
          if (!isWorking) {
            closeFilterPanel();
          }
          if (!isLeave) {
            /* Reset Leave Type selection when switching away from Leave */
            $grid.find('.bp-leave-type-field .bp-dd-wrap .bp-dd-val')
                 .text('Select\u2026')
                 .removeAttr('data-actual-val');
            /* Clear attend-bar background colour and label/action-button colours */
            $grid.find('.bp-attend-bar').css('background', '');
            $grid.find('.bp-attend-label').css('color', '');
            $grid.find('.bp-attend-leave-actions').css('color', '');
          }
          } /* end single-event else */
        }
      }

      /* Leave Type controls Apply Leave button visibility and container background colour.
         Works for both #slotPickerGrid containers and #massActionsBody event containers. */
      var isLeaveTypeDd = $wrap.closest('.bp-leave-type-field').length > 0;
      if (isLeaveTypeDd) {
        var $container3   = $wrap.closest('.bp-plan-container');
        if ($container3.length) {
          var validLeaveType3 = actual && actual !== '-None-';
          $container3.find('.bp-apply-leave-btn').toggle(!!validLeaveType3);

          /* Apply Leave Type picklist colour as attend-bar background */
          if (validLeaveType3) {
            var $attendWrap3 = $container3.find('.bp-attend-field:not(.bp-leave-type-field) .bp-dd-wrap');
            var attendVal3   = $attendWrap3.find('.bp-dd-val').attr('data-actual-val') || '';
            var fv3          = {};
            fv3[$attendWrap3.data('api') || 'beatplanner__Attendance'] = attendVal3;
            fv3[$wrap.data('api')        || 'beatplanner__Leave_Type'] = actual;
            var leaveColor3  = getLeaveTypeColor(fv3);
            $container3.find('.bp-attend-bar').css('background', leaveColor3 || '');
            $container3.find('.bp-attend-label').css('color', leaveColor3 ? 'white' : '');
            $container3.find('.bp-attend-leave-actions').css('color', leaveColor3 ? 'white' : '');
          } else {
            $container3.find('.bp-attend-bar').css('background', '');
            $container3.find('.bp-attend-label').css('color', '');
            $container3.find('.bp-attend-leave-actions').css('color', '');
          }
        }
      }
    });

    /* Row checkbox → show/hide Mass Create button + sync Select-All header checkbox + sync day checkbox */
    $(document).on('change', '#slotPickerGrid .bp-row-cb', function () {
      var $grid      = $('#slotPickerGrid');
      var $allCbs    = $grid.find('.bp-row-cb:not(:disabled)');
      var checkedCnt = $grid.find('.bp-row-cb:not(:disabled):checked').length;
      var hasCheckedLeave = $grid.find('.mc-day-group .bp-mc-leave-cb:checked').length > 0;
      $grid.find('.bp-mass-create-btn').toggle(checkedCnt > 0 || hasCheckedLeave);
      var $selectAll = $grid.find('.bp-select-all-cb');
      if ($selectAll.length) {
        $selectAll.prop('indeterminate', checkedCnt > 0 && checkedCnt < $allCbs.length);
        $selectAll.prop('checked', checkedCnt === $allCbs.length && $allCbs.length > 0);
      }
      /* Sync the day-level checkbox for the day group containing this row */
      var $dayGroup = $(this).closest('.mc-day-group');
      if ($dayGroup.length) {
        var $dayRows  = $dayGroup.find('.bp-slot-row:not(.map-filter-hidden) .bp-row-cb:not(:disabled)');
        var dayTotal  = $dayRows.length;
        var dayChecked = $dayRows.filter(':checked').length;
        var $dayCb    = $dayGroup.find('.map-day-cb');
        $dayCb.prop('checked', dayTotal > 0 && dayChecked === dayTotal)
              .prop('indeterminate', dayChecked > 0 && dayChecked < dayTotal);
      }
    });

    /* Day-level checkbox in Mass Create accordion → check/uncheck all rows for that day.
       For leave days, also keep the bp-mc-leave-cb in sync (Issue 1). */
    $(document).on('change', '#slotPickerGrid .map-day-cb', function () {
      var checked   = $(this).prop('checked');
      var $dayGroup = $(this).closest('.mc-day-group');
      $dayGroup.find('.bp-slot-row:not(.map-filter-hidden) .bp-row-cb:not(:disabled)').prop('checked', checked);
      /* Sync leave checkbox for this day when it is a leave day.
         prop() is used intentionally – it does not fire a 'change' event, preventing recursion. */
      var $leaveCb = $dayGroup.find('.bp-mc-leave-cb');
      if ($leaveCb.length && $leaveCb.closest('.bp-mc-leave-cb-label').is(':visible')) {
        $leaveCb.prop('checked', checked);
      }
      /* Sync the global Mass Create button and select-all */
      var $grid      = $('#slotPickerGrid');
      var $allCbs    = $grid.find('.bp-row-cb:not(:disabled)');
      var checkedCnt = $grid.find('.bp-row-cb:not(:disabled):checked').length;
      var hasCheckedLeave = $grid.find('.mc-day-group .bp-mc-leave-cb:checked').length > 0;
      $grid.find('.bp-mass-create-btn').toggle(checkedCnt > 0 || hasCheckedLeave);
      var $selectAll = $grid.find('.bp-select-all-cb');
      if ($selectAll.length) {
        $selectAll.prop('indeterminate', checkedCnt > 0 && checkedCnt < $allCbs.length);
        $selectAll.prop('checked', checkedCnt === $allCbs.length && $allCbs.length > 0);
      }
    });

    /* Leave-day checkbox in Mass Create accordion → keep the day-level checkbox in sync (Issue 1).
       prop() is used in both directions so neither handler triggers the other. */
    $(document).on('change', '#slotPickerGrid .bp-mc-leave-cb', function () {
      var checked   = $(this).prop('checked');
      var $dayGroup = $(this).closest('.mc-day-group');
      /* Sync the day-level checkbox without triggering its own change handler */
      $dayGroup.find('.map-day-cb').prop('checked', checked);
      /* Update the global Mass Create button visibility */
      var $grid = $('#slotPickerGrid');
      var hasCheckedRows  = $grid.find('.bp-row-cb:not(:disabled):checked').length > 0;
      var hasCheckedLeave = $grid.find('.mc-day-group .bp-mc-leave-cb:checked').length > 0;
      $grid.find('.bp-mass-create-btn').toggle(hasCheckedRows || hasCheckedLeave);
    });

    /* Select-All header checkbox → check/uncheck all row checkboxes */
    $(document).on('change', '#slotPickerGrid .bp-select-all-cb', function () {
      var $grid    = $('#slotPickerGrid');
      var checked  = $(this).is(':checked');
      $grid.find('.bp-row-cb:not(:disabled)').prop('checked', checked);
      /* Sync all day checkboxes and leave checkboxes for leave days */
      $grid.find('.mc-day-group').each(function () {
        var $dg       = $(this);
        var $dayRows  = $dg.find('.bp-slot-row:not(.map-filter-hidden) .bp-row-cb:not(:disabled)');
        var dayTotal  = $dayRows.length;
        var dayCbVal  = checked && dayTotal > 0;
        $dg.find('.map-day-cb').prop('checked', dayCbVal).prop('indeterminate', false);
        /* For leave days: also sync the leave checkbox */
        var $leaveCb = $dg.find('.bp-mc-leave-cb');
        if ($leaveCb.length && $leaveCb.closest('.bp-mc-leave-cb-label').is(':visible')) {
          $leaveCb.prop('checked', checked);
          /* Ensure the day checkbox matches the leave checkbox state for leave days */
          $dg.find('.map-day-cb').prop('checked', checked).prop('indeterminate', false);
        }
      });
      var hasCheckedLeave = $grid.find('.mc-day-group .bp-mc-leave-cb:checked').length > 0;
      $grid.find('.bp-mass-create-btn').toggle(checked || hasCheckedLeave);
    });

    /* ── Bulk Create Daily Beat Plans ── */
    $(document).on('click', '#slotPickerGrid .bp-mass-create-btn', async function () {
      var $btn  = $(this);
      var $grid = $('#slotPickerGrid');

      /* ── Determine mode: multi-day Mass Create accordion vs single-event edit modal ── */
      var isMcAccordion = $grid.find('.mc-day-group').length > 0;

      /* Collect checked working rows */
      var $checkedRows = $grid.find('.bp-slot-row').filter(function () {
        return $(this).find('.bp-row-cb').is(':checked');
      });

      /* In accordion mode, also collect leave-day groups whose checkbox is checked */
      var $leaveGroups = isMcAccordion
        ? $grid.find('.mc-day-group').filter(function () {
            return $(this).find('.bp-mc-leave-cb').is(':checked');
          })
        : $();

      if ($checkedRows.length === 0 && $leaveGroups.length === 0) { return; }

      $btn.prop('disabled', true);

      var created = 0;
      var failed  = 0;

      /* ── Feature 4 (single-event mode): delete previous Leave record before creating ── */
      if (!isMcAccordion) {
        var $singleContainer = $grid.find('.bp-plan-container').first();
        var singleLeaveEditId = String($singleContainer.data('leaveEditId') || '');
        if (singleLeaveEditId) {
          try {
            await zrc.delete('/crm/v8/beatplanner__Daily_Beat_Plans?ids=' + singleLeaveEditId);
            state.events = state.events.filter(function (e) { return e.id !== singleLeaveEditId; });
            $singleContainer.removeAttr('data-leave-edit-id');
            console.log('Deleted leave record before mass-creating working records', singleLeaveEditId);
          } catch (err) {
            console.error('Failed to delete leave record', err);
            showToast('Failed to remove existing Leave record. Aborting.');
            $btn.prop('disabled', false);
            return;
          }
        }
      }

      /* ── Build all record payloads ── */
      var massPayloads = []; /* [{ recordData, massEv }] */

      /* Helper: resolve attendance/leave-type from the container enclosing $row or from the
         provided explicit container (used for leave-day groups). */
      function resolveAttendFromContainer($container) {
        var $aw = $container.find('.bp-attend-field:not(.bp-leave-type-field) .bp-dd-wrap');
        var $lw = $container.find('.bp-leave-type-field .bp-dd-wrap');
        return {
          attendApi: $aw.data('api') || 'beatplanner__Attendance',
          attendVal: $aw.find('.bp-dd-val').attr('data-actual-val') || '',
          leaveApi:  $lw.data('api') || 'beatplanner__Leave_Type',
          leaveVal:  $lw.find('.bp-dd-val').attr('data-actual-val') || ''
        };
      }

      /* ── Working-day rows ── */
      for (var ri = 0; ri < $checkedRows.length; ri++) {
        var $row = $($checkedRows[ri]);
        var date = $row.data('date') || '';
        var hour = $row.data('hour');

        /* In accordion mode, read attendance from THIS row's day group;
           in single-event mode, read from the (only) plan container. */
        var rowContainer = isMcAccordion
          ? $row.closest('.mc-day-group').find('.bp-plan-container')
          : $grid.find('.bp-plan-container').first();
        var ra = resolveAttendFromContainer(rowContainer);
        var attendApi = ra.attendApi;
        var attendVal = ra.attendVal;
        var leaveApi  = ra.leaveApi;
        var leaveVal  = ra.leaveVal;

        var recordData = {};

        /* Start / End time fields */
        var isLeaveRecord = (attendVal && attendVal !== 'Select\u2026' &&
                             attendVal.toLowerCase() === 'leave');
        var startIso, endIso;
        if (isLeaveRecord && date) {
          startIso = toIsoDt(date, '00:00');
          endIso   = toIsoDt(date, '23:59').replace('T23:59:00', 'T23:59:59');
        } else {
          startIso = date ? toIsoDt(date, hourToTime(hour))                             : hourToTime(hour);
          endIso   = date ? toIsoDt(date, hour === 23 ? '23:59' : hourToTime(hour + 1)) : (hour === 23 ? '23:59' : hourToTime(hour + 1));
        }
        var $sc = $row.find('.bp-time-cell').eq(0);
        var $ec = $row.find('.bp-time-cell').eq(1);
        recordData[$sc.data('api') || 'beatplanner__Date_Time_From'] = startIso;
        recordData[$ec.data('api') || 'beatplanner__Date_Time_To']   = endIso;

        if (date) { recordData['beatplanner__Date'] = date; }

        /* Meetings For */
        var $mfWrap      = $row.find('.bp-mf-wrap');
        var $mfVal       = $mfWrap.find('.bp-dd-val');
        var mfDisplayVal = $mfVal.text().trim() || '';
        var mfFieldApi   = $mfWrap.data('api') || 'beatplanner__Meetings_For';
        if (mfDisplayVal && mfDisplayVal !== 'Select module\u2026') {
          recordData[mfFieldApi] = mfDisplayVal;
        }

        /* Meeting With */
        var $mwWrap     = $row.find('.bp-mw-wrap');
        var $mwVal      = $mwWrap.find('.bp-dd-val');
        var mwId        = $mwVal.attr('data-selected-id') || '';
        var mwLookupApi = $mwWrap.attr('data-api') || '';
        var mwName      = $mwVal.text() || '';
        if (mwId && mwLookupApi) {
          recordData[mwLookupApi] = { id: mwId };
        }
        bpDailyAllFields.forEach(function (f) {
          if (f.data_type !== 'lookup' || !f.lookup || !f.lookup.module) { return; }
          if (f.api_name === mwLookupApi) { return; }
          var modApi = f.lookup.module.api_name || f.lookup.module.module || '';
          if (beatPlanModulesList.some(function (mod) { return mod.api === modApi; })) {
            recordData[f.api_name] = null;
          }
        });

        /* Dynamic picklist columns */
        $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
          var $wrapCell = $(this);
          var fieldApi  = String($wrapCell.data('api') || '');
          if (!fieldApi) { return; }
          var actual = $wrapCell.find('.bp-dd-val').attr('data-actual-val') || '';
          if (actual && actual !== 'Select\u2026') {
            recordData[fieldApi] = actual;
          }
        });

        /* Attendance / Leave Type */
        if (attendVal && attendVal !== 'Select\u2026') {
          recordData[attendApi] = attendVal;
        }
        if (isLeaveRecord && leaveVal && leaveVal !== 'Select\u2026') {
          recordData[leaveApi] = leaveVal;
        }

        /* Look up the Monthly Beat Plan ID for this record's month.
           In accordion mode use massCreateMonthPlanMap (which covers multi-month ranges);
           in single-event mode fall back to the global monthlyBeatPlanId. */
        var rowMonthYear  = date ? getMonthYearFromDate(date) : '';
        var rowMonthPlanId = (isMcAccordion && rowMonthYear)
          ? (massCreateMonthPlanMap[rowMonthYear] || null)
          : monthlyBeatPlanId;
        if (rowMonthPlanId) {
          recordData['beatplanner__Month'] = { id: rowMonthPlanId };
        }
        recordData['Name'] = 'Meeting With ' + mwName +
          ' on ' + fmtDateDMY(date) +
          ' for the Time Slot ' +
          fmtTime(isLeaveRecord ? '00:00' : hourToTime(hour)) + ' - ' +
          fmtTime(isLeaveRecord ? '23:59' : (hour === 23 ? '23:59' : hourToTime(hour + 1)));
        recordData['beatplanner__Managers_Approval'] = 'Pending';
        var massOwnerId = $('#userProfile').attr('data-userid');
        if (massOwnerId) { recordData['Owner'] = { id: massOwnerId }; }

        /* bprFieldValues for in-memory event */
        var massBprFv = {};
        if (mfDisplayVal && mfDisplayVal !== 'Select module\u2026') {
          massBprFv[mfFieldApi] = mfDisplayVal;
        }
        $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
          var $wrapCell = $(this);
          var fieldApi  = String($wrapCell.data('api') || '');
          if (!fieldApi) { return; }
          var actual = $wrapCell.find('.bp-dd-val').attr('data-actual-val') || '';
          if (actual && actual !== 'Select\u2026') { massBprFv[fieldApi] = actual; }
        });
        if (attendVal && attendVal !== 'Select\u2026') { massBprFv[attendApi] = attendVal; }
        if (isLeaveRecord && leaveVal && leaveVal !== 'Select\u2026') { massBprFv[leaveApi] = leaveVal; }
        massBprFv['beatplanner__Managers_Approval'] = 'Pending';

        var $massMwAvatar = $mwWrap.find('.bp-rec-avatar');
        var massStartTime = isLeaveRecord ? '00:00' : hourToTime(hour);
        var massEndTime   = isLeaveRecord ? '23:59' : (hour === 23 ? '23:59' : hourToTime(hour + 1));

        massPayloads.push({
          recordData: recordData,
          massEv: {
            id:             uid(),
            title:          mwName || (mfDisplayVal || 'Beat Plan'),
            date:           date,
            startTime:      massStartTime,
            endTime:        massEndTime,
            color:          '#1565C0',
            description:    '',
            bprFieldValues: massBprFv,
            mwAvatarImgSrc: $massMwAvatar.find('img').attr('src') || $massMwAvatar.attr('data-img-src') || '',
            mwAvatarText:   $massMwAvatar.text() || '',
            mwPhotoId:      $massMwAvatar.attr('data-photo-id') || '',
            mwRecordId:     mwId,
            mwLookupApi:    mwLookupApi
          }
        });
      }

      /* ── Leave-day groups (accordion mode only) ── */
      $leaveGroups.each(function () {
        var $dg         = $(this);
        var $lc         = $dg.find('.bp-plan-container');
        var leaveDate   = $lc.data('date') || '';
        if (!leaveDate) { return; }
        var la          = resolveAttendFromContainer($lc);
        var lAttendVal  = la.attendVal;
        var lLeaveVal   = la.leaveVal;
        var lAttendApi  = la.attendApi;
        var lLeaveApi   = la.leaveApi;

        /* Resolve time-field API names */
        var lStartApi = 'beatplanner__Date_Time_From';
        var lEndApi   = 'beatplanner__Date_Time_To';
        bpDailyAllFields.forEach(function (f) {
          var lbl = (f.field_label || '').toLowerCase();
          if (lbl === 'start time') { lStartApi = f.api_name || lStartApi; }
          if (lbl === 'end time')   { lEndApi   = f.api_name || lEndApi; }
        });

        var lStartIso = toIsoDt(leaveDate, '00:00');
        var lEndIso   = toIsoDt(leaveDate, '23:59').replace('T23:59:00', 'T23:59:59');

        var lBprFv = {};
        lBprFv[lAttendApi] = lAttendVal;
        if (lLeaveVal && lLeaveVal !== 'Select\u2026') { lBprFv[lLeaveApi] = lLeaveVal; }
        lBprFv['beatplanner__Managers_Approval'] = 'Pending';

        var lRecordData = {};
        lRecordData[lStartApi]                        = lStartIso;
        lRecordData[lEndApi]                          = lEndIso;
        lRecordData['beatplanner__Date']              = leaveDate;
        lRecordData[lAttendApi]                       = lAttendVal;
        if (lLeaveVal && lLeaveVal !== 'Select\u2026') { lRecordData[lLeaveApi] = lLeaveVal; }
        lRecordData['beatplanner__Managers_Approval'] = 'Pending';
        lRecordData['Name'] = 'Leave \u2013 ' + (lLeaveVal || lAttendVal || 'Leave');
        var lMonthYear    = leaveDate ? getMonthYearFromDate(leaveDate) : '';
        var lMonthPlanId  = (isMcAccordion && lMonthYear)
          ? (massCreateMonthPlanMap[lMonthYear] || null)
          : monthlyBeatPlanId;
        if (lMonthPlanId) { lRecordData['beatplanner__Month'] = { id: lMonthPlanId }; }
        var lOwner = $('#userProfile').attr('data-userid');
        if (lOwner) { lRecordData['Owner'] = { id: lOwner }; }

        massPayloads.push({
          recordData: lRecordData,
          massEv: {
            id:             uid(),
            title:          lLeaveVal || 'Leave',
            date:           leaveDate,
            startTime:      '00:00',
            endTime:        '23:59',
            color:          '#1565C0',
            description:    '',
            bprFieldValues: lBprFv
          }
        });
      });

      /* ── Send payloads in sequential batches of 100 ── */
      var BATCH_SIZE = 100;
      for (var bi = 0; bi < massPayloads.length; bi += BATCH_SIZE) {
        var batch = massPayloads.slice(bi, bi + BATCH_SIZE);
        try {
          var massResp = await zrc.post('/crm/v8/beatplanner__Daily_Beat_Plans', {
            data: batch.map(function (p) { return p.recordData; })
          });
          var massRespItems = (massResp && massResp.data && massResp.data.data) || [];
          batch.forEach(function (p, idx) {
            var item      = massRespItems[idx];
            var massCrmId = item && item.details && item.details.id;
            if (massCrmId) { p.massEv.id = massCrmId; }
            state.events.push(p.massEv);
            created++;
          });
        } catch (err) {
          console.error('Bulk create batch failed (offset ' + bi + ')', err);
          failed += batch.length;
        }
      }

      /* Uncheck all rows and leave checkboxes; hide the Mass Create button */
      $grid.find('.bp-row-cb').prop('checked', false);
      $grid.find('.bp-select-all-cb').prop('checked', false).prop('indeterminate', false);
      $grid.find('.bp-mc-leave-cb').prop('checked', false);
      $btn.hide();

      saveEvents();
      render();

      if (failed > 0) {
        showToast(created + ' record(s) created. ' + failed + ' failed.');
      } else {
        showToast(created + ' beat plan record(s) created.');
      }

      $btn.prop('disabled', false);
    });

    /* ── Apply / Update Leave button ── */
    $(document).on('click', '#slotPickerGrid .bp-apply-leave-btn', async function () {
      var $btn       = $(this);
      var $container = $btn.closest('.bp-plan-container');
      var editId     = String($container.data('editId') || '');
      var date       = $container.data('date') || '';

      /* Read shared attendance / leave-type values */
      var $attendWrap = $container.find('.bp-attend-field:not(.bp-leave-type-field) .bp-dd-wrap');
      var attendVal   = $attendWrap.find('.bp-dd-val').attr('data-actual-val') || '';
      var $leaveWrap  = $container.find('.bp-leave-type-field .bp-dd-wrap');
      var leaveVal    = $leaveWrap.find('.bp-dd-val').attr('data-actual-val') || '';

      /* Validation */
      if (attendVal.toLowerCase() !== 'leave') {
        showToast('Please set Attendance to "Leave" before applying leave.');
        return;
      }
      if (!leaveVal || leaveVal === 'Select\u2026') {
        showToast('Please select a Leave Type.');
        return;
      }
      if (!date) {
        showToast('Cannot determine the selected date.');
        return;
      }

      /* Build full-day ISO-8601 datetimes */
      var startIso = toIsoDt(date, '00:00');
      var endIso   = toIsoDt(date, '23:59').replace('T23:59:00', 'T23:59:59');

      /* Resolve field API names from metadata */
      var startTimeApi = 'beatplanner__Date_Time_From';
      var endTimeApi   = 'beatplanner__Date_Time_To';
      bpDailyAllFields.forEach(function (f) {
        var lbl = (f.field_label || '').toLowerCase();
        if (lbl === 'start time') { startTimeApi = f.api_name || startTimeApi; }
        if (lbl === 'end time')   { endTimeApi   = f.api_name || endTimeApi; }
      });
      var attendApi = $attendWrap.data('api') || 'beatplanner__Attendance';
      var leaveApi  = $leaveWrap.data('api')  || 'beatplanner__Leave_Type';

      /* Build record payload */
      var bprFieldValues = {};
      bprFieldValues[attendApi] = attendVal;
      bprFieldValues[leaveApi]  = leaveVal;
      bprFieldValues['beatplanner__Managers_Approval'] = 'Pending';

      var recordData = {};
      recordData[startTimeApi] = startIso;
      recordData[endTimeApi]   = endIso;
      recordData['beatplanner__Date']              = date;
      recordData[attendApi]                        = attendVal;
      recordData[leaveApi]                         = leaveVal;
      recordData['beatplanner__Managers_Approval'] = 'Pending';
      recordData['Name'] = 'Leave \u2013 ' + leaveVal;

      if (!editId && monthlyBeatPlanId) {
        recordData['beatplanner__Month'] = { id: monthlyBeatPlanId };
      }
      var ownerId = $('#userProfile').attr('data-userid');
      if (!editId && ownerId) { recordData['Owner'] = { id: ownerId }; }

      $btn.prop('disabled', true);
      try {
        if (editId) {
          /* ── UPDATE mode: leave record already exists – update it via PUT ── */
          await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
            data: [Object.assign({ id: editId }, recordData)]
          });
          console.log('Leave record updated', editId);

          /* Update the in-memory event */
          var evIdx = state.events.findIndex(function (e) { return e.id === editId; });
          if (evIdx !== -1) {
            var updEv = state.events[evIdx];
            updEv.title          = leaveVal;
            updEv.startTime      = '00:00';
            updEv.endTime        = '23:59';
            updEv.bprFieldValues = Object.assign({}, updEv.bprFieldValues || {}, bprFieldValues);
          }

          saveEvents();
          closeSlotPicker();
          render();
          showToast('Leave record updated.');
        } else {
          /* ── CREATE mode: new leave record ── */
          var resp = await zrc.post('/crm/v8/beatplanner__Daily_Beat_Plans', { data: [recordData] });
          console.log('Leave record created', resp);

          var newEv = {
            id:             uid(),
            title:          leaveVal,
            date:           date,
            startTime:      '00:00',
            endTime:        '23:59',
            color:          '#1565C0',
            description:    '',
            bprFieldValues: bprFieldValues
          };

          /* Update event ID with the CRM record ID */
          var crmId = resp && resp.data && resp.data.data && resp.data.data[0] && resp.data.data[0].details && resp.data.data[0].details.id;
          if (crmId) { newEv.id = crmId; }

          state.events.push(newEv);
          saveEvents();
          render();
          showToast('Leave record created.');
        }
      } catch (err) {
        console.error('Failed to apply/update leave record', err);
        showToast('Failed to apply leave record.');
      } finally {
        $btn.prop('disabled', false);
      }
    });

    /* ── Beat plan row: Save ── */
    $(document).on('click', '#slotPickerGrid .bp-row-save', async function () {
      var $btn   = $(this);
      var $row   = $btn.closest('.bp-slot-row');
      /* For Leave mode the Save button lives in the attend-bar, not inside a row. */
      if (!$row.length) {
        $row = $btn.closest('.bp-plan-container').find('.bp-slot-row').first();
      }
      var editId = String($row.data('editId') || '');
      var date   = $row.data('date') || '';
      var hour   = $row.data('hour');  /* undefined in edit mode */

      /* Build the record data for beatplanner__Daily_Beat_Plans */
      var recordData     = {};
      var bprFieldValues = {};

      /* Attendance / Leave Type (top-bar fields) – read first so we know if this is a Leave record
         before building the datetime fields. */
      var $attendWrap = $row.closest('.bp-plan-container').find('.bp-attend-field:not(.bp-leave-type-field) .bp-dd-wrap');
      var attendVal   = $attendWrap.find('.bp-dd-val').attr('data-actual-val') || '';
      var $leaveWrap  = $row.closest('.bp-plan-container').find('.bp-leave-type-field .bp-dd-wrap');
      var leaveVal    = $leaveWrap.find('.bp-dd-val').attr('data-actual-val') || '';

      var isLeaveRecord = (attendVal && attendVal !== 'Select\u2026' &&
                           attendVal.toLowerCase() === 'leave');

      /* ── Start / End times ──
         Edit mode: read stored times from the data attributes set in buildBpEditForm.
         Create mode: derive from the hour slot. */
      var startTime, endTime, startIso, endIso;
      if (editId) {
        startTime = String($row.data('startTime') || '00:00');
        endTime   = String($row.data('endTime')   || '00:00');
        if (isLeaveRecord && date) {
          startIso  = toIsoDt(date, '00:00');
          endIso    = toIsoDt(date, '23:59').replace('T23:59:00', 'T23:59:59');
          startTime = '00:00';
          endTime   = '23:59';
        } else {
          startIso = date && startTime ? toIsoDt(date, startTime) : startTime;
          endIso   = date && endTime   ? toIsoDt(date, endTime)   : endTime;
        }
      } else {
        if (isLeaveRecord && date) {
          startIso  = toIsoDt(date, '00:00');
          endIso    = toIsoDt(date, '23:59').replace('T23:59:00', 'T23:59:59');
          startTime = '00:00';
          endTime   = '23:59';
        } else {
          startIso  = date ? toIsoDt(date, hourToTime(hour))                             : hourToTime(hour);
          endIso    = date ? toIsoDt(date, hour === 23 ? '23:59' : hourToTime(hour + 1)) : (hour === 23 ? '23:59' : hourToTime(hour + 1));
          startTime = hourToTime(hour);
          endTime   = hour === 23 ? '23:59' : hourToTime(hour + 1);
        }
      }

      var $startCell = $row.find('.bp-time-cell').eq(0);
      var $endCell   = $row.find('.bp-time-cell').eq(1);
      recordData[$startCell.data('api') || 'beatplanner__Date_Time_From'] = startIso;
      recordData[$endCell.data('api')   || 'beatplanner__Date_Time_To']   = endIso;

      /* Date field */
      if (date) {
        recordData['beatplanner__Date'] = date;
      }

      /* Meetings For (picklist) – save the user-visible display text, not the module API name */
      var $mfWrap      = $row.find('.bp-mf-wrap');
      var $mfVal       = $mfWrap.find('.bp-dd-val');
      var mfDisplayVal = $mfVal.text().trim() || '';
      var mfApi        = $mfVal.attr('data-selected-api') || '';
      var mfFieldApi   = $mfWrap.data('api') || 'beatplanner__Meetings_For';
      if (mfDisplayVal && mfDisplayVal !== 'Select module\u2026') {
        recordData[mfFieldApi]     = mfDisplayVal;
        bprFieldValues[mfFieldApi] = mfDisplayVal;
      }

      /* Meeting With (lookup field) – data-api is set dynamically to the resolved lookup API */
      var $mwWrap     = $row.find('.bp-mw-wrap');
      var $mwVal      = $mwWrap.find('.bp-dd-val');
      var mwId        = $mwVal.attr('data-selected-id') || '';
      var mwLookupApi = $mwWrap.attr('data-api') || '';
      var mwName      = $mwVal.text() || '';
      if (mwId && mwLookupApi) {
        recordData[mwLookupApi] = { id: mwId };
      }
      /* Include all other module lookup fields as null to clear them so the payload
         always contains every Meetings For module field, not just the selected one */
      bpDailyAllFields.forEach(function (f) {
        if (f.data_type !== 'lookup' || !f.lookup || !f.lookup.module) { return; }
        if (f.api_name === mwLookupApi) { return; }
        var modApi = f.lookup.module.api_name || f.lookup.module.module || '';
        if (beatPlanModulesList.some(function (mod) { return mod.api === modApi; })) {
          recordData[f.api_name] = null;
        }
      });

      /* Dynamic picklist columns – also collect values for BPR chip styling */
      $row.find('.bp-dd-wrap')
          .not('.bp-mf-wrap')
          .not('.bp-mw-wrap')
          .each(function () {
            var $wrap    = $(this);
            var fieldApi = String($wrap.data('api') || '');
            if (!fieldApi) { return; }
            var $val     = $wrap.find('.bp-dd-val');
            var actual   = $val.attr('data-actual-val') || $val.text() || '';
            if (actual && actual !== 'Select\u2026') {
              recordData[fieldApi]     = actual;
              bprFieldValues[fieldApi] = actual;
            }
          });

      /* Attendance / Leave Type – include in payload and bprFieldValues */
      if (attendVal && attendVal !== 'Select\u2026') {
        var attendApi = $attendWrap.data('api') || 'beatplanner__Attendance';
        recordData[attendApi]     = attendVal;
        bprFieldValues[attendApi] = attendVal;
      }
      if (isLeaveRecord && leaveVal && leaveVal !== 'Select\u2026') {
        var leaveApi = $leaveWrap.data('api') || 'beatplanner__Leave_Type';
        recordData[leaveApi]     = leaveVal;
        bprFieldValues[leaveApi] = leaveVal;
      }

      /* Mandatory Name field */
      recordData['Name'] = 'Meeting With ' + mwName +
        ' on ' + fmtDateDMY(date) +
        ' for the Time Slot ' + fmtTime(startTime) + ' - ' + fmtTime(endTime);
      var $mwAvatar      = $mwWrap.find('.bp-rec-avatar');
      var mwAvatarImgSrc = $mwAvatar.find('img').attr('src') || $mwAvatar.attr('data-img-src') || '';
      var mwAvatarText   = $mwAvatar.text() || '';
      var mwPhotoId      = $mwAvatar.attr('data-photo-id') || '';

      /* Disable the save button while the API call is in progress */
      $btn.prop('disabled', true);

      if (editId) {
        /* ── EDIT MODE: compare current values against originals to detect changes ── */
        var origValsStr = $row.attr('data-original-vals') || '{}';
        var origVals;
        try { origVals = JSON.parse(origValsStr); } catch (e) { origVals = {}; }

        /* Build current values snapshot using the same keys as originalVals */
        var currentVals = {
          mf:     (mfDisplayVal && mfDisplayVal !== 'Select module\u2026') ? mfDisplayVal : '',
          mfApi:  mfApi,
          mwId:   mwId,
          attend: (attendVal && attendVal !== 'Select\u2026') ? attendVal : '',
          leave:  (isLeaveRecord && leaveVal && leaveVal !== 'Select\u2026') ? leaveVal : ''
        };
        $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
          var fieldApi = String($(this).data('api') || '');
          if (!fieldApi) { return; }
          var $v   = $(this).find('.bp-dd-val');
          var actual = $v.attr('data-actual-val') || $v.text() || '';
          if (actual && actual !== 'Select\u2026') { currentVals[fieldApi] = actual; }
        });

        /* Check whether any editable field has changed */
        var allKeys    = Object.keys(origVals).concat(Object.keys(currentVals));
        var hasChanges = allKeys.some(function (k) {
          return (origVals[k] || '') !== (currentVals[k] || '');
        });

        var existingEv       = findEvent(editId);
        var existingApproval = (existingEv && existingEv.bprFieldValues)
          ? (existingEv.bprFieldValues['beatplanner__Managers_Approval'] || '')
          : '';

        if (hasChanges) {
          /* Fields changed – reset approval workflow back to Pending */
          recordData['beatplanner__Managers_Approval'] = 'Pending';
          bprFieldValues['beatplanner__Managers_Approval'] = 'Pending';
        } else {
          /* No changes – preserve existing approval status */
          if (existingApproval) {
            bprFieldValues['beatplanner__Managers_Approval'] = existingApproval;
          }
        }

        try {
          await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
            data: [Object.assign({ id: editId }, recordData)]
          });
          console.log('Daily Beat Plan updated', editId);

          /* Update the in-memory event – merge so any fields not collected from the form
             (e.g. future-added BPR columns) are preserved from the original event. */
          var evIdx = state.events.findIndex(function (e) { return e.id === editId; });
          if (evIdx !== -1) {
            var updEv          = state.events[evIdx];
            updEv.title          = mwName || (mfDisplayVal || 'Beat Plan');
            updEv.startTime      = startTime;
            updEv.endTime        = endTime;
            updEv.bprFieldValues = Object.assign({}, updEv.bprFieldValues || {}, bprFieldValues);
            updEv.mwAvatarImgSrc = mwAvatarImgSrc;
            updEv.mwAvatarText   = mwAvatarText;
            updEv.mwPhotoId      = mwPhotoId;
            updEv.mwRecordId     = mwId;
            updEv.mwLookupApi    = mwLookupApi;
          }

          saveEvents();
          closeSlotPicker();
          render();
          showToast('Beat plan record updated.');
        } catch (err) {
          console.error('Failed to update Daily Beat Plan', err);
          showToast('Failed to update beat plan record.');
        } finally {
          $btn.prop('disabled', false);
        }

      } else {
        /* ── CREATE MODE: call insertRecord, default Managers Approval to Pending ── */

        /* ── Feature 4: If this session began as a Leave→Working edit, delete the Leave record first ── */
        var createLeaveEditId = String($row.closest('.bp-plan-container').data('leaveEditId') || '');
        if (createLeaveEditId) {
          try {
            await zrc.delete('/crm/v8/beatplanner__Daily_Beat_Plans?ids=' + createLeaveEditId);
            state.events = state.events.filter(function (e) { return e.id !== createLeaveEditId; });
            $row.closest('.bp-plan-container').removeAttr('data-leave-edit-id');
            console.log('Deleted leave record before creating working record', createLeaveEditId);
          } catch (err) {
            console.error('Failed to delete leave record', err);
            showToast('Failed to remove existing Leave record. Aborting.');
            $btn.prop('disabled', false);
            return;
          }
        }

        /* Conflict check – prevent creating a record when a meeting already occupies
           an overlapping time slot on the same date. */
        var hasTimeOverlap = state.events.some(function (e) {
          return e.date === date && e.startTime < endTime && e.endTime > startTime;
        });
        if (hasTimeOverlap) {
          showToast('A meeting already exists within the selected time interval for this date.');
          $btn.prop('disabled', false);
          return;
        }

        /* Link to the Monthly Beat Plan record resolved during modal init */
        if (monthlyBeatPlanId) {
          recordData['beatplanner__Month'] = { id: monthlyBeatPlanId };
        }

        /* Always default Managers Approval to "Pending" on creation.
           Also add to bprFieldValues so the left-border colour is resolved from
           the beatplanner__Daily_Beat_Plans metadata. */
        recordData['beatplanner__Managers_Approval'] = 'Pending';
        bprFieldValues['beatplanner__Managers_Approval'] = 'Pending';

        /* Assign the record to the currently selected user */
        var saveOwnerId = $('#userProfile').attr('data-userid');
        if (saveOwnerId) {
          recordData['Owner'] = { id: saveOwnerId };
        }

        try {
          var resp = await zrc.post('/crm/v8/beatplanner__Daily_Beat_Plans', { data: [recordData] });
          console.log('Daily Beat Plan saved', resp);

          /* Also save as a calendar event so it appears on the grid with BPR styling */
          var $mwValText = $mwWrap.find('.bp-dd-val').text() || '';
          var newEv = {
            id:             uid(),
            title:          $mwValText || (mfDisplayVal || 'Beat Plan'),
            date:           date,
            startTime:      startTime,
            endTime:        endTime,
            color:          '#1565C0',
            description:    '',
            bprFieldValues: bprFieldValues,
            mwAvatarImgSrc: mwAvatarImgSrc,
            mwAvatarText:   mwAvatarText,
            mwPhotoId:      mwPhotoId,
            mwRecordId:     mwId,
            mwLookupApi:    mwLookupApi
          };

          /* Update event ID with the CRM record ID returned in the response */
          var crmId = resp && resp.data && resp.data.data && resp.data.data[0] && resp.data.data[0].details && resp.data.data[0].details.id;
          if (crmId) { newEv.id = crmId; }

          state.events.push(newEv);
          saveEvents();

          /* Remove only the saved row; keep the modal open so users can
             continue creating additional events without reopening the dialog. */
          $row.remove();

          /* Immediately render the new event chip in the calendar without
             closing the modal — render() would close the slot picker, so
             we use a targeted cell refresh instead. */
          refreshCalendarCell(date);

          showToast('Beat plan record saved.');
        } catch (err) {
          console.error('Failed to save Daily Beat Plan', err);
          showToast('Failed to save beat plan record.');
        } finally {
          $btn.prop('disabled', false);
        }
      }
    });

    /* ── Beat plan row: Copy ── */
    $(document).on('click', '#slotPickerGrid .bp-row-copy', function () {
      var $row  = $(this).closest('.bp-slot-row');
      /* For Leave mode the Copy button lives in the attend-bar, not inside a row. */
      if (!$row.length) {
        $row = $(this).closest('.bp-plan-container').find('.bp-slot-row').first();
      }
      var data  = {};

      /* Meetings For */
      var $mfWrap = $row.find('.bp-mf-wrap');
      var $mfVal  = $mfWrap.find('.bp-dd-val');
      data['meetings-for'] = {
        label: $mfVal.text(),
        api:   $mfVal.attr('data-selected-api') || ''
      };

      /* Meeting With */
      var $mwWrap   = $row.find('.bp-mw-wrap');
      var $mwVal    = $mwWrap.find('.bp-dd-val');
      var $mwAvatar = $mwWrap.find('.bp-rec-avatar');
      data['meeting-with'] = {
        label:        $mwVal.text(),
        id:           $mwVal.attr('data-selected-id') || '',
        lookupApi:    $mwWrap.attr('data-api') || '',
        avatarText:   $mwAvatar.text(),
        avatarImgSrc: $mwAvatar.find('img').attr('src') || $mwAvatar.attr('data-img-src') || '',
        avatarPhotoId: $mwAvatar.attr('data-photo-id') || '',
        avatarShow:   $mwAvatar.hasClass('bp-rec-avatar--show')
      };

      /* All other dropdowns (dynamic picklist columns) */
      $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
        var $wrap = $(this);
        var field = String($wrap.data('api') || '');
        if (!field) { return; }
        var $val = $wrap.find('.bp-dd-val');
        data[field] = {
          label:     $val.text(),
          actualVal: $val.attr('data-actual-val') || ''
        };
      });

      copiedRowData = data;

      /* Enable paste on every row except the source row */
      $('#slotPickerGrid .bp-slot-row').not($row).find('.bp-row-paste').prop('disabled', false);
    });

    /* ── Beat plan row: Paste ── */
    $(document).on('click', '#slotPickerGrid .bp-row-paste', function () {
      if (!copiedRowData) { return; }
      var $row = $(this).closest('.bp-slot-row');

      /* ── Meetings For ── */
      var mfData  = copiedRowData['meetings-for'];
      var $mfWrap = $row.find('.bp-mf-wrap');
      var $mfVal  = $mfWrap.find('.bp-dd-val');
      $mfVal.text(mfData.label);
      if (mfData.api) {
        $mfVal.attr('data-selected-api', mfData.api);
      } else {
        $mfVal.removeAttr('data-selected-api');
      }

      /* ── Meeting With: repopulate list then restore selection ── */
      var mwData  = copiedRowData['meeting-with'];
      var $mwWrap = $row.find('.bp-mw-wrap');

      /* Stamp resolved lookup API name onto data-api */
      $mwWrap.attr('data-api', mwData.lookupApi || '');

      /* Re-populate the Meeting With list so the option exists in the DOM */
      if (mfData.api) {
        var records = filteredModuleRecords.hasOwnProperty(mfData.api)
                        ? filteredModuleRecords[mfData.api]
                        : (moduleRecordsMap[mfData.api] || []);
        var mwOpts;
        if (records.length === 0) {
          mwOpts = '<li class="bp-dd-empty">No records found</li>';
        } else {
          mwOpts = '';
          records.forEach(function (rec) {
            mwOpts += '<li class="bp-dd-opt" data-id="' + escHtml(rec.id) +
                      '" data-label="' + escHtml(rec.name) +
                      '" data-photo-id="' + escHtml(rec.photo_id || '') + '">' + escHtml(rec.name) + '</li>';
          });
        }
        $mwWrap.find('.bp-mw-list').html(mwOpts);
      }

      /* Restore Meeting With value */
      var $mwVal = $mwWrap.find('.bp-dd-val');
      $mwVal.text(mwData.label);
      if (mwData.id) {
        $mwVal.attr('data-selected-id', mwData.id);
      } else {
        $mwVal.removeAttr('data-selected-id');
      }

      /* Restore avatar */
      var $mwAvatar = $mwWrap.find('.bp-rec-avatar');
      $mwAvatar.removeClass('bp-rec-avatar--show').removeAttr('data-img-src').removeAttr('data-photo-id').html('');
      if (mwData.avatarShow) {
        if (mwData.avatarImgSrc) {
          $mwAvatar.html('<img src="' + escHtml(mwData.avatarImgSrc) + '">')
                   .attr('data-img-src', mwData.avatarImgSrc)
                   .attr('data-photo-id', mwData.avatarPhotoId || '')
                   .addClass('bp-rec-avatar--show');
        } else if (mwData.avatarText) {
          $mwAvatar.text(mwData.avatarText)
                   .attr('data-photo-id', mwData.avatarPhotoId || '')
                   .addClass('bp-rec-avatar--show');
        }
      }

      /* ── Dynamic picklist columns ── */
      $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
        var $wrap = $(this);
        var field = String($wrap.data('api') || '');
        if (!field || !copiedRowData.hasOwnProperty(field)) { return; }
        var fData = copiedRowData[field];
        var $val  = $wrap.find('.bp-dd-val');
        $val.text(fData.label);
        if (fData.actualVal) {
          $val.attr('data-actual-val', fData.actualVal);
        } else {
          $val.removeAttr('data-actual-val');
        }
      });
    });

    /* ── Beat plan edit row: Delete ── */
    $(document).on('click', '#slotPickerGrid .bp-edit-row .bp-row-delete, #slotPickerGrid .bp-attend-bar .bp-row-delete', function () {
      var $btn   = $(this);
      var $row   = $btn.closest('.bp-slot-row');
      if (!$row.length) { $row = $btn.closest('.bp-plan-container').find('.bp-slot-row').first(); }
      var editId = String($row.data('editId') || '');
      if (!editId) { return; }
      if (window.confirm('Delete this event?')) { deleteEvent(editId); }
    });

    /* ── Beat plan edit row: Approve ── */
    $(document).on('click', '#slotPickerGrid .bp-edit-row .bp-row-approve, #slotPickerGrid .bp-attend-bar .bp-row-approve', function () {
      if (isSelfApprovalBlocked()) { return; }
      var $btn   = $(this);
      var $row   = $btn.closest('.bp-slot-row');
      if (!$row.length) { $row = $btn.closest('.bp-plan-container').find('.bp-slot-row').first(); }
      var editId = String($row.data('editId') || '');
      if (editId) { doApprove(editId); }
    });

    /* ── Beat plan edit row: Reject ── */
    $(document).on('click', '#slotPickerGrid .bp-edit-row .bp-row-reject, #slotPickerGrid .bp-attend-bar .bp-row-reject', function () {
      if (isSelfApprovalBlocked()) { return; }
      var $btn   = $(this);
      var $row   = $btn.closest('.bp-slot-row');
      if (!$row.length) { $row = $btn.closest('.bp-plan-container').find('.bp-slot-row').first(); }
      var editId = String($row.data('editId') || '');
      if (editId) { doReject(editId); }
    });

    /* ══════════════════════════════════════════════════════════
       DAY-EVENTS MODAL (BULK EDIT) – #demBulkGrid handlers
    ══════════════════════════════════════════════════════════ */

    /* Helper: sync bulk toolbar and Select-All header state in the modal */
    function syncDemBulkToolbar() {
      var $grid      = $('#demBulkGrid');
      var $allCbs    = $grid.find('.bp-row-cb:not(:disabled)');
      var checkedCnt = $grid.find('.bp-row-cb:not(:disabled):checked').length;
      var $toolbar   = $grid.find('.dem-bulk-toolbar');
      $toolbar.toggle(checkedCnt > 0);
      $toolbar.find('.dem-sel-count').text(checkedCnt + ' row' + (checkedCnt === 1 ? '' : 's') + ' selected');
      var $selectAll = $grid.find('.bp-select-all-cb');
      if ($selectAll.length) {
        $selectAll.prop('indeterminate', checkedCnt > 0 && checkedCnt < $allCbs.length);
        $selectAll.prop('checked', checkedCnt > 0 && checkedCnt === $allCbs.length);
      }
    }

    /* Row checkbox change → update toolbar & Select All */
    $(document).on('change', '#demBulkGrid .bp-row-cb', function () {
      syncDemBulkToolbar();
    });

    /* Actions dropdown toggle */
    $(document).on('click', '#demBulkGrid .dem-actions-btn', function (e) {
      e.stopPropagation();
      var $btn  = $(this);
      var $menu = $btn.siblings('.dem-actions-menu');
      var isOpen = $menu.hasClass('dem-actions-menu-open');
      $('.dem-actions-menu').removeClass('dem-actions-menu-open');
      $('.dem-actions-btn').removeClass('dem-actions-open');
      if (!isOpen) {
        $menu.addClass('dem-actions-menu-open');
        $btn.addClass('dem-actions-open');
      }
    });

    /* Close Actions dropdown when clicking outside */
    $(document).on('click', function (e) {
      if (!$(e.target).closest('.dem-actions-dropdown').length) {
        $('.dem-actions-menu').removeClass('dem-actions-menu-open');
        $('.dem-actions-btn').removeClass('dem-actions-open');
      }
    });

    /* Select-All header checkbox → check/uncheck all non-disabled rows */
    $(document).on('change', '#demBulkGrid .bp-select-all-cb', function () {
      var checked = $(this).is(':checked');
      $('#demBulkGrid .bp-row-cb:not(:disabled)').prop('checked', checked);
      syncDemBulkToolbar();
    });

    /* ── demBulkGrid / massActionsBody: single-row Save (Update) ── */
    $(document).on('click', '#demBulkGrid .bp-row-save, #massActionsBody .bp-row-save', async function () {
      var $btn   = $(this);
      var $row   = $btn.closest('.bp-slot-row');
      /* For Leave mode the Save button lives in the attend-bar, not inside a row. */
      if (!$row.length) {
        $row = $btn.closest('.bp-plan-container, .map-event-container').find('.bp-slot-row').first();
      }
      var editId = String($row.data('editId') || '');
      var date   = $row.data('date') || '';

      if (!editId) { return; } /* modal only contains existing records */

      var recordData     = {};
      var bprFieldValues = {};

      /* Times – use stored data attributes (edit mode always has them) */
      var startTime = String($row.data('startTime') || '00:00');
      var endTime   = String($row.data('endTime')   || '00:00');
      var startIso  = date && startTime ? toIsoDt(date, startTime) : startTime;
      var endIso    = date && endTime   ? toIsoDt(date, endTime)   : endTime;

      var $startCell = $row.find('.bp-time-cell').eq(0);
      var $endCell   = $row.find('.bp-time-cell').eq(1);
      recordData[$startCell.data('api') || 'beatplanner__Date_Time_From'] = startIso;
      recordData[$endCell.data('api')   || 'beatplanner__Date_Time_To']   = endIso;
      if (date) { recordData['beatplanner__Date'] = date; }

      /* Meetings For */
      var $mfWrap      = $row.find('.bp-mf-wrap');
      var $mfVal       = $mfWrap.find('.bp-dd-val');
      var mfDisplayVal = $mfVal.text().trim() || '';
      var mfApi        = $mfVal.attr('data-selected-api') || '';
      var mfFieldApi   = $mfWrap.data('api') || 'beatplanner__Meetings_For';
      if (mfDisplayVal && mfDisplayVal !== 'Select module\u2026') {
        recordData[mfFieldApi]     = mfDisplayVal;
        bprFieldValues[mfFieldApi] = mfDisplayVal;
      }

      /* Meeting With */
      var $mwWrap     = $row.find('.bp-mw-wrap');
      var $mwVal      = $mwWrap.find('.bp-dd-val');
      var mwId        = $mwVal.attr('data-selected-id') || '';
      var mwLookupApi = $mwWrap.attr('data-api') || '';
      var mwName      = $mwVal.text() || '';
      if (mwId && mwLookupApi) { recordData[mwLookupApi] = { id: mwId }; }
      bpDailyAllFields.forEach(function (f) {
        if (f.data_type !== 'lookup' || !f.lookup || !f.lookup.module) { return; }
        if (f.api_name === mwLookupApi) { return; }
        var modApi = f.lookup.module.api_name || f.lookup.module.module || '';
        if (beatPlanModulesList.some(function (mod) { return mod.api === modApi; })) {
          recordData[f.api_name] = null;
        }
      });

      /* All other picklist columns (includes Attendance, Leave Type in bulk table) */
      $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
        var $wrap    = $(this);
        var fieldApi = String($wrap.data('api') || '');
        if (!fieldApi) { return; }
        var $v   = $wrap.find('.bp-dd-val');
        var actual = $v.attr('data-actual-val') || $v.text() || '';
        if (actual && actual !== 'Select\u2026') {
          recordData[fieldApi]     = actual;
          bprFieldValues[fieldApi] = actual;
        }
      });

      /* For leave-mode rows (action cell only), also read Attendance + Leave Type
         from the container attend-bar since they are not in the row itself. */
      if ($row.find('.bp-dd-wrap').length === 0) {
        var $leaveContainer = $row.closest('.bp-plan-container');
        $leaveContainer.find('.bp-attend-bar .bp-dd-wrap').each(function () {
          var $wrap    = $(this);
          var fieldApi = String($wrap.data('api') || '');
          if (!fieldApi) { return; }
          var $v   = $wrap.find('.bp-dd-val');
          var actual = $v.attr('data-actual-val') || $v.text() || '';
          if (actual && actual !== 'Select\u2026') {
            recordData[fieldApi]     = actual;
            bprFieldValues[fieldApi] = actual;
          }
        });
      }

      recordData['Name'] = 'Meeting With ' + mwName +
        ' on ' + fmtDateDMY(date) +
        ' for the Time Slot ' + fmtTime(startTime) + ' - ' + fmtTime(endTime);
      var $mwAvatar      = $mwWrap.find('.bp-rec-avatar');
      var mwAvatarImgSrc = $mwAvatar.find('img').attr('src') || $mwAvatar.attr('data-img-src') || '';
      var mwAvatarText   = $mwAvatar.text() || '';
      var mwPhotoId      = $mwAvatar.attr('data-photo-id') || '';

      $btn.prop('disabled', true);

      /* Compare current values vs originals to decide if approval resets */
      var origValsStr = $row.attr('data-original-vals') || '{}';
      var origVals;
      try { origVals = JSON.parse(origValsStr); } catch (e) { origVals = {}; }

      var currentVals = {
        mf:    (mfDisplayVal && mfDisplayVal !== 'Select module\u2026') ? mfDisplayVal : '',
        mfApi: mfApi,
        mwId:  mwId
      };
      $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
        var fieldApi = String($(this).data('api') || '');
        if (!fieldApi) { return; }
        var $v   = $(this).find('.bp-dd-val');
        var actual = $v.attr('data-actual-val') || $v.text() || '';
        if (actual && actual !== 'Select\u2026') { currentVals[fieldApi] = actual; }
      });
      /* Also capture attend-bar values for leave-mode rows */
      if ($row.find('.bp-dd-wrap').length === 0) {
        $row.closest('.bp-plan-container').find('.bp-attend-bar .bp-dd-wrap').each(function () {
          var fieldApi = String($(this).data('api') || '');
          if (!fieldApi) { return; }
          var $v = $(this).find('.bp-dd-val');
          var actual = $v.attr('data-actual-val') || $v.text() || '';
          if (actual && actual !== 'Select\u2026') { currentVals[fieldApi] = actual; }
        });
      }

      var allKeys    = Object.keys(origVals).concat(Object.keys(currentVals));
      var hasChanges = allKeys.some(function (k) {
        return (origVals[k] || '') !== (currentVals[k] || '');
      });

      var existingEv       = findEvent(editId);
      var existingApproval = (existingEv && existingEv.bprFieldValues)
        ? (existingEv.bprFieldValues['beatplanner__Managers_Approval'] || '')
        : '';

      if (hasChanges) {
        recordData['beatplanner__Managers_Approval'] = 'Pending';
        bprFieldValues['beatplanner__Managers_Approval'] = 'Pending';
      } else {
        if (existingApproval) {
          bprFieldValues['beatplanner__Managers_Approval'] = existingApproval;
        }
      }

      try {
        await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
          data: [Object.assign({ id: editId }, recordData)]
        });

        /* Update in-memory event – merge new values so fields not shown in the Day Events
           Modal (Attendance, Leave Type) are preserved from the original event. */
        var evIdx = state.events.findIndex(function (e) { return e.id === editId; });
        if (evIdx !== -1) {
          var updEv          = state.events[evIdx];
          updEv.title          = mwName || (mfDisplayVal || 'Beat Plan');
          updEv.startTime      = startTime;
          updEv.endTime        = endTime;
          updEv.bprFieldValues = Object.assign({}, updEv.bprFieldValues || {}, bprFieldValues);
          updEv.mwAvatarImgSrc = mwAvatarImgSrc;
          updEv.mwAvatarText   = mwAvatarText;
          updEv.mwPhotoId      = mwPhotoId;
          updEv.mwRecordId     = mwId;
          updEv.mwLookupApi    = mwLookupApi;
        }

        /* Update stored original-vals so the next save can detect further changes */
        $row.attr('data-original-vals', JSON.stringify(currentVals));

        saveEvents();
        refreshCalendarCell(date);
        /* Refresh row border/background in the open Day Events Modal immediately */
        if (evIdx !== -1) { refreshDemRowStyles($row, state.events[evIdx]); }
        showToast('Beat plan record updated.');
      } catch (err) {
        console.error('Failed to update Daily Beat Plan (bulk modal)', err);
        showToast('Failed to update beat plan record.');
      } finally {
        $btn.prop('disabled', false);
      }
    });

    /* ── demBulkGrid / massActionsBody: single-row Delete ── */
    $(document).on('click', '#demBulkGrid .bp-edit-row .bp-row-delete, #massActionsBody .bp-edit-row .bp-row-delete, #massActionsBody .bp-attend-bar .bp-row-delete', async function () {
      var $btn      = $(this);
      var $row      = $btn.closest('.bp-slot-row');
      /* For Leave mode the Delete button may be in the attend-bar. */
      if (!$row.length) {
        $row = $btn.closest('.bp-plan-container, .map-event-container').find('.bp-slot-row').first();
      }
      var editId    = String($row.data('editId') || '');
      if (!editId) { return; }
      if (!window.confirm('Delete this event?')) { return; }

      /* Capture context before async operation (row may be removed from DOM) */
      var inMassOverlay = $btn.closest('#massActionsBody').length > 0;
      var $dayGroup     = inMassOverlay ? $btn.closest('.map-day-group') : null;
      var rowDate       = $row.data('date') || '';

      $btn.prop('disabled', true);
      try {
        await zrc.delete('/crm/v8/beatplanner__Daily_Beat_Plans?ids=' + editId);
      } catch (delErr) {
        console.error('delete failed, removing from local state anyway', delErr);
      }

      state.events = state.events.filter(function (e) { return e.id !== editId; });
      if (state.clipboard) {
        state.clipboard = state.clipboard.filter(function (e) { return e.id !== editId; });
        if (state.clipboard.length === 0) { state.clipboard = null; state.clipboardSource = null; }
      }
      saveEvents();
      $row.remove();
      refreshCalendarCell(rowDate);

      if (inMassOverlay) {
        /* Sync mass overlay state after row removal */
        syncMassActionsSelectAll();
        if ($dayGroup && $dayGroup.find('.bp-slot-row').length === 0) {
          $dayGroup.hide();
        }
      } else {
        syncDemBulkToolbar();
        /* If no rows remain in the Day Events Modal, close it */
        if ($('#demBulkGrid .bp-slot-row').length === 0) {
          closeDayEventsModal();
        }
      }
      showToast('Event deleted.');
      $btn.prop('disabled', false);
    });

    /* ── demBulkGrid: single-row Approve – stays in modal, updates row in-place ── */
    /**
     * Re-apply metadata-driven border/background styles to a .bp-slot-row inside
     * #demBulkGrid after the event's bprFieldValues have changed (e.g. approve/reject).
     * Also refreshes the hover card header if it is currently showing the same event.
     *
     * @param {jQuery} $row – the .bp-slot-row element to update
     * @param {Object} ev   – the updated local event object
     */
    function refreshDemRowStyles($row, ev) {
      var newStyles  = buildBprEventStyles(ev);
      var newCellTB  = newStyles.borderTopStr + newStyles.borderBottomStr;
      var newCbStyle = newStyles.borderLeftStr + newCellTB;
      var newActStyle = newCellTB + newStyles.borderRightStr;

      /* Row background */
      if (newStyles.bgStr) {
        $row.attr('style', newStyles.bgStr);
      } else {
        $row.removeAttr('style');
      }

      /* Checkbox cell – carries left border */
      $row.find('.bp-cb-cell').attr('style', newCbStyle || '');

      /* Time cells – carry top/bottom borders only */
      $row.find('.bp-time-cell').each(function () {
        $(this).attr('style', newCellTB || '');
      });

      /* Action cell – carries right border */
      $row.find('.bp-action-cell').attr('style', newActStyle || '');

      /* If the hover card is currently showing this event, update its header styling */
      if (hoverActiveId === ev.id) {
        var hcStyle = buildHoverCardHeaderStyle(ev);
        dom.hoverCard.find('.hc-head').attr('style', hcStyle.cardStyle || '');
        var $hcMarker = dom.hoverCard.find('.hc-marker');
        if (hcStyle.markerColor) {
          if ($hcMarker.length) {
            $hcMarker.css('background', hcStyle.markerColor);
          } else {
            dom.hoverCard.find('.hc-head-top').prepend(
              '<span class="hc-marker" style="background:' + escHtml(hcStyle.markerColor) + ';" aria-hidden="true"></span>'
            );
          }
        } else {
          $hcMarker.remove();
        }
        /* Update arrow to match new header style */
        dom.hoverArrow.css({
          'background':    hcStyle.arrowBg         || 'var(--surface)',
          'border-color':  hcStyle.arrowBorderColor || hcStyle.arrowBg || 'var(--border-strong)'
        });
      }
    }

    $(document).on('click', '#demBulkGrid .bp-edit-row .bp-row-approve, #massActionsBody .bp-edit-row .bp-row-approve, #massActionsBody .bp-attend-bar .bp-row-approve', async function () {
      if (isSelfApprovalBlocked()) { return; }
      var $btn   = $(this);
      var $row   = $btn.closest('.bp-slot-row');
      /* For Leave mode the Approve button may be in the attend-bar. */
      if (!$row.length) {
        $row = $btn.closest('.bp-plan-container, .map-event-container').find('.bp-slot-row').first();
      }
      var editId = String($row.data('editId') || '');
      if (!editId) { return; }
      $btn.prop('disabled', true);
      try {
        await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
          data: [{ id: editId, beatplanner__Managers_Approval: 'Approved' }]
        });
        var ev = findEvent(editId);
        if (ev && ev.bprFieldValues) { ev.bprFieldValues['beatplanner__Managers_Approval'] = 'Approved'; }
        saveEvents();
        refreshCalendarCell($row.data('date') || '');
        /* Update action buttons in-place (search container to cover attend-bar buttons too) */
        var $btnsScope = $btn.closest('.bp-plan-container, .map-event-container');
        if (!$btnsScope.length) { $btnsScope = $row; }
        $btnsScope.find('.bp-row-approve').prop('disabled', true).addClass('is-approved').removeClass('is-rejected');
        $btnsScope.find('.bp-row-reject').prop('disabled', true).addClass('is-approved').removeClass('is-rejected');
        $btnsScope.find('.bp-row-delete').prop('disabled', true);
        /* Refresh row border/background and hover card to reflect new approval status */
        if (ev) { refreshDemRowStyles($row, ev); }
        showToast('Record approved.');
      } catch (err) {
        console.error('Approve failed', err);
        showToast('Failed to approve record.');
        $btn.prop('disabled', false);
      }
    });

    /* ── demBulkGrid / massActionsBody: single-row Reject – updates row in-place ── */
    $(document).on('click', '#demBulkGrid .bp-edit-row .bp-row-reject, #massActionsBody .bp-edit-row .bp-row-reject, #massActionsBody .bp-attend-bar .bp-row-reject', async function () {
      if (isSelfApprovalBlocked()) { return; }
      var $btn   = $(this);
      var $row   = $btn.closest('.bp-slot-row');
      /* For Leave mode the Reject button may be in the attend-bar. */
      if (!$row.length) {
        $row = $btn.closest('.bp-plan-container, .map-event-container').find('.bp-slot-row').first();
      }
      var editId = String($row.data('editId') || '');
      if (!editId) { return; }
      $btn.prop('disabled', true);
      try {
        await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
          data: [{ id: editId, beatplanner__Managers_Approval: 'Rejected' }]
        });
        var ev = findEvent(editId);
        if (ev && ev.bprFieldValues) { ev.bprFieldValues['beatplanner__Managers_Approval'] = 'Rejected'; }
        saveEvents();
        refreshCalendarCell($row.data('date') || '');
        /* Update action buttons in-place (search container to cover attend-bar buttons too) */
        var $btnsScope2 = $btn.closest('.bp-plan-container, .map-event-container');
        if (!$btnsScope2.length) { $btnsScope2 = $row; }
        $btnsScope2.find('.bp-row-reject').prop('disabled', true).addClass('is-rejected').removeClass('is-approved');
        $btnsScope2.find('.bp-row-approve').prop('disabled', true).addClass('is-rejected').removeClass('is-approved');
        $btnsScope2.find('.bp-row-delete').prop('disabled', true);
        /* Refresh row border/background and hover card to reflect new rejection status */
        if (ev) { refreshDemRowStyles($row, ev); }
        showToast('Record rejected.');
      } catch (err) {
        console.error('Reject failed', err);
        showToast('Failed to reject record.');
        $btn.prop('disabled', false);
      }
    });

    /* ── demBulkGrid: Mass Update ── */
    $(document).on('click', '#demBulkGrid .dem-mass-update-btn', async function () {
      var $btn  = $(this);
      var $grid = $('#demBulkGrid');
      $('.dem-actions-menu').removeClass('dem-actions-menu-open');

      var $checkedRows = $grid.find('.bp-slot-row').filter(function () {
        return $(this).find('.bp-row-cb').is(':checked');
      });
      if ($checkedRows.length === 0) { return; }

      $btn.prop('disabled', true);
      var updated = 0;
      var failed  = 0;

      /* Build batch items: collect payload + metadata for every checked row */
      var batchItems = [];

      for (var ri = 0; ri < $checkedRows.length; ri++) {
        var $row   = $($checkedRows[ri]);
        var editId = String($row.data('editId') || '');
        var date   = $row.data('date') || '';
        if (!editId) { continue; }

        var recordData     = {};
        var bprFieldValues = {};

        /* Times */
        var startTime = String($row.data('startTime') || '00:00');
        var endTime   = String($row.data('endTime')   || '00:00');
        var startIso  = date && startTime ? toIsoDt(date, startTime) : startTime;
        var endIso    = date && endTime   ? toIsoDt(date, endTime)   : endTime;
        var $startCell = $row.find('.bp-time-cell').eq(0);
        var $endCell   = $row.find('.bp-time-cell').eq(1);
        recordData[$startCell.data('api') || 'beatplanner__Date_Time_From'] = startIso;
        recordData[$endCell.data('api')   || 'beatplanner__Date_Time_To']   = endIso;
        if (date) { recordData['beatplanner__Date'] = date; }

        /* Meetings For */
        var $mfWrap      = $row.find('.bp-mf-wrap');
        var $mfVal       = $mfWrap.find('.bp-dd-val');
        var mfDisplayVal = $mfVal.text().trim() || '';
        var mfApi        = $mfVal.attr('data-selected-api') || '';
        var mfFieldApi   = $mfWrap.data('api') || 'beatplanner__Meetings_For';
        if (mfDisplayVal && mfDisplayVal !== 'Select module\u2026') {
          recordData[mfFieldApi]     = mfDisplayVal;
          bprFieldValues[mfFieldApi] = mfDisplayVal;
        }

        /* Meeting With */
        var $mwWrap     = $row.find('.bp-mw-wrap');
        var $mwVal      = $mwWrap.find('.bp-dd-val');
        var mwId        = $mwVal.attr('data-selected-id') || '';
        var mwLookupApi = $mwWrap.attr('data-api') || '';
        var mwName      = $mwVal.text() || '';
        if (mwId && mwLookupApi) { recordData[mwLookupApi] = { id: mwId }; }
        bpDailyAllFields.forEach(function (f) {
          if (f.data_type !== 'lookup' || !f.lookup || !f.lookup.module) { return; }
          if (f.api_name === mwLookupApi) { return; }
          var modApi = f.lookup.module.api_name || f.lookup.module.module || '';
          if (beatPlanModulesList.some(function (mod) { return mod.api === modApi; })) {
            recordData[f.api_name] = null;
          }
        });

        /* All other picklist columns */
        $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
          var $wrap    = $(this);
          var fieldApi = String($wrap.data('api') || '');
          if (!fieldApi) { return; }
          var $v   = $wrap.find('.bp-dd-val');
          var actual = $v.attr('data-actual-val') || $v.text() || '';
          if (actual && actual !== 'Select\u2026') {
            recordData[fieldApi]     = actual;
            bprFieldValues[fieldApi] = actual;
          }
        });

        recordData['Name'] = 'Meeting With ' + mwName +
          ' on ' + fmtDateDMY(date) +
          ' for the Time Slot ' + fmtTime(startTime) + ' - ' + fmtTime(endTime);
        var origValsStr = $row.attr('data-original-vals') || '{}';
        var origVals;
        try { origVals = JSON.parse(origValsStr); } catch (e) { origVals = {}; }

        var currentVals = {
          mf:    (mfDisplayVal && mfDisplayVal !== 'Select module\u2026') ? mfDisplayVal : '',
          mfApi: mfApi,
          mwId:  mwId
        };
        $row.find('.bp-dd-wrap').not('.bp-mf-wrap').not('.bp-mw-wrap').each(function () {
          var fieldApi = String($(this).data('api') || '');
          if (!fieldApi) { return; }
          var $v   = $(this).find('.bp-dd-val');
          var actual = $v.attr('data-actual-val') || $v.text() || '';
          if (actual && actual !== 'Select\u2026') { currentVals[fieldApi] = actual; }
        });

        var allKeys    = Object.keys(origVals).concat(Object.keys(currentVals));
        var hasChanges = allKeys.some(function (k) {
          return (origVals[k] || '') !== (currentVals[k] || '');
        });

        var existingEv       = findEvent(editId);
        var existingApproval = (existingEv && existingEv.bprFieldValues)
          ? (existingEv.bprFieldValues['beatplanner__Managers_Approval'] || '')
          : '';

        if (hasChanges) {
          recordData['beatplanner__Managers_Approval'] = 'Pending';
          bprFieldValues['beatplanner__Managers_Approval'] = 'Pending';
        } else {
          if (existingApproval) {
            bprFieldValues['beatplanner__Managers_Approval'] = existingApproval;
          }
        }

        batchItems.push({
          $row:           $row,
          $mwWrap:        $mwWrap,
          editId:         editId,
          recordData:     Object.assign({ id: editId }, recordData),
          bprFieldValues: bprFieldValues,
          currentVals:    currentVals,
          mwName:         mwName,
          mfDisplayVal:   mfDisplayVal
        });
      }

      /* Send all records in a single batch PUT request */
      if (batchItems.length > 0) {
        try {
          var batchResp = await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', {
            data: batchItems.map(function (item) { return item.recordData; })
          });
          var batchResults = (batchResp && batchResp.data && batchResp.data.data) ? batchResp.data.data : [];

          for (var bi = 0; bi < batchItems.length; bi++) {
            var item   = batchItems[bi];
            var result = batchResults[bi] || {};
            if (result.status === 'success') {
              /* Update in-memory event */
              var evIdx = state.events.findIndex(function (e) { return e.id === item.editId; });
              if (evIdx !== -1) {
                var updEv2          = state.events[evIdx];
                updEv2.title          = item.mwName || (item.mfDisplayVal || 'Beat Plan');
                updEv2.bprFieldValues = item.bprFieldValues;
                var $mwAvatar2        = item.$mwWrap.find('.bp-rec-avatar');
                updEv2.mwAvatarImgSrc = $mwAvatar2.find('img').attr('src') || $mwAvatar2.attr('data-img-src') || '';
                updEv2.mwAvatarText   = $mwAvatar2.text() || '';
                updEv2.mwPhotoId      = $mwAvatar2.attr('data-photo-id') || '';
              }

              /* Update the row's stored original-vals for future comparisons */
              item.$row.attr('data-original-vals', JSON.stringify(item.currentVals));
              updated++;
            } else {
              console.error('Mass update failed for record', item.editId, result);
              failed++;
            }
          }
        } catch (err) {
          console.error('Mass update batch request failed', err);
          failed = batchItems.length;
        }
      }

      saveEvents();
      render();

      /* Uncheck all rows */
      $grid.find('.bp-row-cb').prop('checked', false);
      $grid.find('.bp-select-all-cb').prop('checked', false).prop('indeterminate', false);
      syncDemBulkToolbar();

      $btn.prop('disabled', false);
      if (failed > 0) {
        showToast(updated + ' record(s) updated. ' + failed + ' failed.');
      } else {
        showToast(updated + ' beat plan record(s) updated.');
      }
    });

    /* ── demBulkGrid: Mass Delete ── */
    $(document).on('click', '#demBulkGrid .dem-mass-delete-btn', async function () {
      var $btn  = $(this);
      var $grid = $('#demBulkGrid');
      $('.dem-actions-menu').removeClass('dem-actions-menu-open');

      var $checkedRows = $grid.find('.bp-slot-row').filter(function () {
        return $(this).find('.bp-row-cb').is(':checked');
      });
      if ($checkedRows.length === 0) { return; }

      if (!window.confirm('Delete ' + $checkedRows.length + ' selected record(s)?')) { return; }

      $btn.prop('disabled', true);
      var deleted  = 0;
      var failed   = 0;
      var datesToRefresh = {};

      /* Collect all record IDs and their associated rows/dates */
      var deleteItems = [];
      for (var rj = 0; rj < $checkedRows.length; rj++) {
        var $row2  = $($checkedRows[rj]);
        var delId  = String($row2.data('editId') || '');
        var delDate = $row2.data('date') || '';
        if (!delId) { continue; }
        deleteItems.push({ id: delId, date: delDate, $row: $row2 });
      }

      if (deleteItems.length > 0) {
        var allIds = deleteItems.map(function (item) { return item.id; });
        var successIds = {};
        try {
          var bulkResp = await zrc.delete(
            '/crm/v8/beatplanner__Daily_Beat_Plans?ids=' + allIds.join(',')
          );
          /* Determine which IDs succeeded based on the response */
          var respData = (bulkResp && bulkResp.data && bulkResp.data.data) ? bulkResp.data.data : [];
          respData.forEach(function (entry) {
            if (entry && entry.status === 'success' && entry.details && entry.details.id) {
              successIds[entry.details.id] = true;
            }
          });
          /* If the API does not return per-record status, treat all as success */
          if (respData.length === 0) {
            allIds.forEach(function (id) { successIds[id] = true; });
          }
        } catch (bulkErr) {
          console.error('Bulk delete request failed', bulkErr);
        }

        deleteItems.forEach(function (item) {
          if (successIds[item.id]) {
            state.events = state.events.filter(function (e) { return e.id !== item.id; });
            if (state.clipboard) {
              state.clipboard = state.clipboard.filter(function (e) { return e.id !== item.id; });
              if (state.clipboard.length === 0) { state.clipboard = null; state.clipboardSource = null; }
            }
            item.$row.remove();
            if (item.date) { datesToRefresh[item.date] = true; }
            deleted++;
          } else {
            console.error('Mass delete failed for record', item.id);
            failed++;
          }
        });
      }

      saveEvents();
      Object.keys(datesToRefresh).forEach(function (ds) { refreshCalendarCell(ds); });
      syncDemBulkToolbar();

      $btn.prop('disabled', false);

      /* Close modal if no rows remain */
      if ($grid.find('.bp-slot-row').length === 0) {
        closeDayEventsModal();
      }

      if (failed > 0) {
        showToast(deleted + ' record(s) deleted. ' + failed + ' failed.');
      } else {
        showToast(deleted + ' beat plan record(s) deleted.');
      }
    });

    /* ── demBulkGrid: Mass Approve ── */
    $(document).on('click', '#demBulkGrid .dem-mass-approve-btn', async function () {
      var $btn  = $(this);
      var $grid = $('#demBulkGrid');
      $('.dem-actions-menu').removeClass('dem-actions-menu-open');

      var $checkedRows = $grid.find('.bp-slot-row').filter(function () {
        return $(this).find('.bp-row-cb').is(':checked');
      });
      if ($checkedRows.length === 0) { return; }

      $btn.prop('disabled', true);
      var updated = 0;
      var failed  = 0;

      var batchData = [];
      var batchRows = [];
      for (var ai = 0; ai < $checkedRows.length; ai++) {
        var $aRow  = $($checkedRows[ai]);
        var aId    = String($aRow.data('editId') || '');
        if (!aId) { continue; }
        batchData.push({ id: aId, beatplanner__Managers_Approval: 'Approved' });
        batchRows.push({ $row: $aRow, editId: aId });
      }

      if (batchData.length > 0) {
        try {
          var approveResp = await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', { data: batchData });
          var approveResults = (approveResp && approveResp.data && approveResp.data.data) ? approveResp.data.data : [];
          for (var aj = 0; aj < batchRows.length; aj++) {
            var aResult = approveResults[aj] || {};
            if (aResult.status === 'success') {
              var aEvIdx = state.events.findIndex(function (e) { return e.id === batchRows[aj].editId; });
              if (aEvIdx !== -1) {
                if (!state.events[aEvIdx].bprFieldValues) { state.events[aEvIdx].bprFieldValues = {}; }
                state.events[aEvIdx].bprFieldValues['beatplanner__Managers_Approval'] = 'Approved';
              }
              updated++;
            } else {
              console.error('Mass approve failed for record', batchRows[aj].editId, aResult);
              failed++;
            }
          }
        } catch (aErr) {
          console.error('Mass approve batch request failed', aErr);
          failed = batchData.length;
        }
      }

      saveEvents();
      render();
      $grid.find('.bp-row-cb').prop('checked', false);
      $grid.find('.bp-select-all-cb').prop('checked', false).prop('indeterminate', false);
      syncDemBulkToolbar();
      $btn.prop('disabled', false);
      if (failed > 0) {
        showToast(updated + ' record(s) approved. ' + failed + ' failed.');
      } else {
        showToast(updated + ' beat plan record(s) approved.');
      }
    });

    /* ── demBulkGrid: Mass Reject ── */
    $(document).on('click', '#demBulkGrid .dem-mass-reject-btn', async function () {
      var $btn  = $(this);
      var $grid = $('#demBulkGrid');
      $('.dem-actions-menu').removeClass('dem-actions-menu-open');

      var $checkedRows = $grid.find('.bp-slot-row').filter(function () {
        return $(this).find('.bp-row-cb').is(':checked');
      });
      if ($checkedRows.length === 0) { return; }

      $btn.prop('disabled', true);
      var updated = 0;
      var failed  = 0;

      var batchData = [];
      var batchRows = [];
      for (var rri = 0; rri < $checkedRows.length; rri++) {
        var $rRow  = $($checkedRows[rri]);
        var rId    = String($rRow.data('editId') || '');
        if (!rId) { continue; }
        batchData.push({ id: rId, beatplanner__Managers_Approval: 'Rejected' });
        batchRows.push({ $row: $rRow, editId: rId });
      }

      if (batchData.length > 0) {
        try {
          var rejectResp = await zrc.put('/crm/v8/beatplanner__Daily_Beat_Plans', { data: batchData });
          var rejectResults = (rejectResp && rejectResp.data && rejectResp.data.data) ? rejectResp.data.data : [];
          for (var rj = 0; rj < batchRows.length; rj++) {
            var rResult = rejectResults[rj] || {};
            if (rResult.status === 'success') {
              var rEvIdx = state.events.findIndex(function (e) { return e.id === batchRows[rj].editId; });
              if (rEvIdx !== -1) {
                if (!state.events[rEvIdx].bprFieldValues) { state.events[rEvIdx].bprFieldValues = {}; }
                state.events[rEvIdx].bprFieldValues['beatplanner__Managers_Approval'] = 'Rejected';
              }
              updated++;
            } else {
              console.error('Mass reject failed for record', batchRows[rj].editId, rResult);
              failed++;
            }
          }
        } catch (rErr) {
          console.error('Mass reject batch request failed', rErr);
          failed = batchData.length;
        }
      }

      saveEvents();
      render();
      $grid.find('.bp-row-cb').prop('checked', false);
      $grid.find('.bp-select-all-cb').prop('checked', false).prop('indeterminate', false);
      syncDemBulkToolbar();
      $btn.prop('disabled', false);
      if (failed > 0) {
        showToast(updated + ' record(s) rejected. ' + failed + ' failed.');
      } else {
        showToast(updated + ' beat plan record(s) rejected.');
      }
    });

    $(document).on('click', function (e) {
      /* Clicks inside an open trigger wrap (in either grid) must not close */
      if (!$(e.target).closest('#slotPickerGrid .bp-dd-wrap').length &&
          !$(e.target).closest('#demBulkGrid .bp-dd-wrap').length &&
          !$(e.target).closest('#massActionsBody .bp-dd-wrap').length) {
        closeAllBpDropdowns();
      }
      /* Close open filter-panel multi-selects when clicking outside */
      if (!$(e.target).closest('#bpFilterBody .bpf-ms-wrap').length) {
        $('#bpFilterBody .bpf-ms-wrap').each(function () {
          $(this).removeClass('bpf-ms-open');
          $(this).find('.bpf-ms-panel').css({ position: '', top: '', bottom: '', left: '', right: '', width: '' });
          $(this).find('.bpf-ms-list').css('max-height', '');
        });
      }
      /* Close open cal-filter-bar multi-selects when clicking outside */
      if (!$(e.target).closest('#bpCalFilterBar .cal-filter-ms-wrap').length) {
        $('#bpCalFilterBar .cal-filter-ms-wrap').each(function () {
          $(this).removeClass('bpf-ms-open');
          $(this).find('.bpf-ms-panel').css({ position: '', top: '', bottom: '', left: '', right: '', width: '' });
        });
      }
      /* Close open mass-actions popup filter multi-selects when clicking outside */
      if (!$(e.target).closest('#massActionsFilterBar .map-filter-ms-wrap').length) {
        $('#massActionsFilterBar .map-filter-ms-wrap').each(function () {
          $(this).removeClass('bpf-ms-open');
          $(this).find('.bpf-ms-panel').css({ position: '', top: '', bottom: '', left: '', right: '', width: '' });
        });
      }
    });

    /* ── Filter Panel event handlers ── */

    /* Calendar filter bar: multi-select trigger toggle */
    $(document).on('click', '#bpCalFilterBar .cal-filter-ms-wrap .bpf-ms-trigger', function (e) {
      e.stopPropagation();
      var $wrap  = $(this).closest('.cal-filter-ms-wrap');
      var isOpen = $wrap.hasClass('bpf-ms-open');
      /* Close all other cal filter wraps */
      $('#bpCalFilterBar .cal-filter-ms-wrap').each(function () {
        $(this).removeClass('bpf-ms-open');
        $(this).find('.bpf-ms-panel').css({ position: '', top: '', bottom: '', left: '', right: '', width: '' });
      });
      if (!isOpen) {
        $wrap.addClass('bpf-ms-open');
        positionBpMsPanel($wrap);
        $wrap.find('.bpf-ms-search').val('').focus();
        $wrap.find('.bpf-ms-opt').show();
      }
    });

    /* Prevent cal filter panel inner clicks from bubbling */
    $(document).on('click', '#bpCalFilterBar .bpf-ms-panel', function (e) {
      e.stopPropagation();
    });

    /* Cal filter bar: live search */
    $(document).on('input', '#bpCalFilterBar .bpf-ms-search', function () {
      var q = $(this).val().toLowerCase();
      $(this).closest('.bpf-ms-panel').find('.bpf-ms-opt').each(function () {
        $(this).toggle(String($(this).data('value')).toLowerCase().indexOf(q) !== -1);
      });
    });

    /* Cal filter bar: toggle individual option */
    $(document).on('click', '#bpCalFilterBar .cal-filter-opt', function (e) {
      e.stopPropagation();
      var $opt     = $(this);
      var fieldApi = String($opt.data('calfield') || '');
      var value    = String($opt.data('value') || '');
      if (!calEventFilters[fieldApi]) { calEventFilters[fieldApi] = []; }
      var arr = calEventFilters[fieldApi];
      var idx = arr.indexOf(value);
      var nowChecked;
      if (idx === -1) {
        arr.push(value);
        nowChecked = true;
      } else {
        arr.splice(idx, 1);
        nowChecked = false;
        if (arr.length === 0) { delete calEventFilters[fieldApi]; }
      }
      $opt.find('input[type="checkbox"]').prop('checked', nowChecked);
      refreshCalFilterTrigger($opt.closest('.cal-filter-ms-wrap'));
      var hasActive = Object.keys(calEventFilters).some(function (k) {
        return calEventFilters[k] && calEventFilters[k].length > 0;
      });
      $('#bpCalFilterClear').toggle(hasActive);
      render();
    });

    /* Cal filter bar: chip remove */
    $(document).on('click', '#bpCalFilterBar .cal-filter-chip .bpf-ms-chip-rm', function (e) {
      e.stopPropagation();
      var $chip    = $(this).closest('.cal-filter-chip');
      var fieldApi = String($chip.data('calfield') || '');
      var value    = String($chip.data('value') || '');
      var $wrap    = $(this).closest('.cal-filter-ms-wrap');
      if (calEventFilters[fieldApi]) {
        var arr = calEventFilters[fieldApi];
        var idx = arr.indexOf(value);
        if (idx !== -1) {
          arr.splice(idx, 1);
          if (arr.length === 0) { delete calEventFilters[fieldApi]; }
        }
      }
      /* Uncheck the corresponding option */
      $wrap.find('.cal-filter-opt').each(function () {
        if (String($(this).data('value') || '') === value) {
          $(this).find('input[type="checkbox"]').prop('checked', false);
        }
      });
      refreshCalFilterTrigger($wrap);
      var hasActive = Object.keys(calEventFilters).some(function (k) {
        return calEventFilters[k] && calEventFilters[k].length > 0;
      });
      $('#bpCalFilterClear').toggle(hasActive);
      render();
    });

    /* Cal filter bar: Select All visible options */
    $(document).on('click', '#bpCalFilterBar .cal-filter-sel-all', function (e) {
      e.stopPropagation();
      var fieldApi = String($(this).data('calfield') || '');
      var $wrap    = $(this).closest('.cal-filter-ms-wrap');
      if (!calEventFilters[fieldApi]) { calEventFilters[fieldApi] = []; }
      $wrap.find('.bpf-ms-opt:visible').each(function () {
        var v = String($(this).data('value') || '');
        if (calEventFilters[fieldApi].indexOf(v) === -1) {
          calEventFilters[fieldApi].push(v);
        }
        $(this).find('input[type="checkbox"]').prop('checked', true);
      });
      refreshCalFilterTrigger($wrap);
      $('#bpCalFilterClear').show();
      render();
    });

    /* Cal filter bar: Clear All for a single field */
    $(document).on('click', '#bpCalFilterBar .cal-filter-clr-all', function (e) {
      e.stopPropagation();
      var fieldApi = String($(this).data('calfield') || '');
      var $wrap    = $(this).closest('.cal-filter-ms-wrap');
      delete calEventFilters[fieldApi];
      $wrap.find('.bpf-ms-opt input[type="checkbox"]').prop('checked', false);
      refreshCalFilterTrigger($wrap);
      var hasActive = Object.keys(calEventFilters).some(function (k) {
        return calEventFilters[k] && calEventFilters[k].length > 0;
      });
      $('#bpCalFilterClear').toggle(hasActive);
      render();
    });

    /* Calendar event filter bar: Clear All button */
    $(document).on('click', '#bpCalFilterClear', function () {
      calEventFilters = {};
      buildCalFilterBar(); /* rebuild to reset all multi-selects to "All" */
      render();
    });

    /* ── Mass Actions popup filter bar event handlers ── */

    /* Popup filter: multi-select trigger toggle */
    $(document).on('click', '#massActionsFilterBar .map-filter-ms-wrap .bpf-ms-trigger', function (e) {
      e.stopPropagation();
      var $wrap  = $(this).closest('.map-filter-ms-wrap');
      var isOpen = $wrap.hasClass('bpf-ms-open');
      /* Close all other popup filter wraps */
      $('#massActionsFilterBar .map-filter-ms-wrap').each(function () {
        $(this).removeClass('bpf-ms-open');
        $(this).find('.bpf-ms-panel').css({ position: '', top: '', bottom: '', left: '', right: '', width: '' });
      });
      if (!isOpen) {
        $wrap.addClass('bpf-ms-open');
        positionBpMsPanel($wrap);
        $wrap.find('.bpf-ms-search').val('').focus();
        $wrap.find('.bpf-ms-opt').show();
      }
    });

    /* Prevent popup filter panel inner clicks from bubbling */
    $(document).on('click', '#massActionsFilterBar .bpf-ms-panel', function (e) {
      e.stopPropagation();
    });

    /* Popup filter: live search */
    $(document).on('input', '#massActionsFilterBar .bpf-ms-search', function () {
      var q = $(this).val().toLowerCase();
      $(this).closest('.bpf-ms-panel').find('.bpf-ms-opt').each(function () {
        $(this).toggle(String($(this).data('value')).toLowerCase().indexOf(q) !== -1);
      });
    });

    /* Popup filter: toggle individual option */
    $(document).on('click', '#massActionsFilterBar .map-filter-opt', function (e) {
      e.stopPropagation();
      var $opt     = $(this);
      var fieldApi = String($opt.data('mapfield') || '');
      var value    = String($opt.data('value') || '');
      if (!massActionsPopupFilters[fieldApi]) { massActionsPopupFilters[fieldApi] = []; }
      var arr = massActionsPopupFilters[fieldApi];
      var idx = arr.indexOf(value);
      var nowChecked;
      if (idx === -1) {
        arr.push(value);
        nowChecked = true;
      } else {
        arr.splice(idx, 1);
        nowChecked = false;
        if (arr.length === 0) { delete massActionsPopupFilters[fieldApi]; }
      }
      $opt.find('input[type="checkbox"]').prop('checked', nowChecked);
      refreshMapFilterTrigger($opt.closest('.map-filter-ms-wrap'));
      var hasActive = Object.keys(massActionsPopupFilters).some(function (k) {
        return massActionsPopupFilters[k] && massActionsPopupFilters[k].length > 0;
      });
      $('#mapFilterClear').toggle(hasActive);
      applyMassActionsPopupFilters();
    });

    /* Popup filter: chip remove */
    $(document).on('click', '#massActionsFilterBar .map-filter-chip .bpf-ms-chip-rm', function (e) {
      e.stopPropagation();
      var $chip    = $(this).closest('.map-filter-chip');
      var fieldApi = String($chip.data('mapfield') || '');
      var value    = String($chip.data('value') || '');
      var $wrap    = $(this).closest('.map-filter-ms-wrap');
      if (massActionsPopupFilters[fieldApi]) {
        var arr = massActionsPopupFilters[fieldApi];
        var idx = arr.indexOf(value);
        if (idx !== -1) {
          arr.splice(idx, 1);
          if (arr.length === 0) { delete massActionsPopupFilters[fieldApi]; }
        }
      }
      $wrap.find('.map-filter-opt').each(function () {
        if (String($(this).data('value') || '') === value) {
          $(this).find('input[type="checkbox"]').prop('checked', false);
        }
      });
      refreshMapFilterTrigger($wrap);
      var hasActive = Object.keys(massActionsPopupFilters).some(function (k) {
        return massActionsPopupFilters[k] && massActionsPopupFilters[k].length > 0;
      });
      $('#mapFilterClear').toggle(hasActive);
      applyMassActionsPopupFilters();
    });

    /* Popup filter: Select All visible options */
    $(document).on('click', '#massActionsFilterBar .map-filter-sel-all', function (e) {
      e.stopPropagation();
      var fieldApi = String($(this).data('mapfield') || '');
      var $wrap    = $(this).closest('.map-filter-ms-wrap');
      if (!massActionsPopupFilters[fieldApi]) { massActionsPopupFilters[fieldApi] = []; }
      $wrap.find('.bpf-ms-opt:visible').each(function () {
        var v = String($(this).data('value') || '');
        if (massActionsPopupFilters[fieldApi].indexOf(v) === -1) {
          massActionsPopupFilters[fieldApi].push(v);
        }
        $(this).find('input[type="checkbox"]').prop('checked', true);
      });
      refreshMapFilterTrigger($wrap);
      $('#mapFilterClear').show();
      applyMassActionsPopupFilters();
    });

    /* Popup filter: Clear All for a single field */
    $(document).on('click', '#massActionsFilterBar .map-filter-clr-all', function (e) {
      e.stopPropagation();
      var fieldApi = String($(this).data('mapfield') || '');
      var $wrap    = $(this).closest('.map-filter-ms-wrap');
      delete massActionsPopupFilters[fieldApi];
      $wrap.find('.bpf-ms-opt input[type="checkbox"]').prop('checked', false);
      refreshMapFilterTrigger($wrap);
      var hasActive = Object.keys(massActionsPopupFilters).some(function (k) {
        return massActionsPopupFilters[k] && massActionsPopupFilters[k].length > 0;
      });
      $('#mapFilterClear').toggle(hasActive);
      applyMassActionsPopupFilters();
    });

    /* Popup filter: Clear All filters button */
    $(document).on('click', '#mapFilterClear', function () {
      massActionsPopupFilters = {};
      /* Rebuild filter bar to reset all dropdowns to "All" */
      var filterBarHtml = buildMassActionsFilterBarHtml();
      if (filterBarHtml) {
        $('#massActionsFilterBar').replaceWith(filterBarHtml);
      }
      applyMassActionsPopupFilters();
    });

    /* Open filter panel when Filter button is clicked */
    $(document).on('click', '#bpFilterBtn', function (e) {
      e.stopPropagation();
      openFilterPanel();
    });

    /* Close filter panel: close button or backdrop click */
    $(document).on('click', '#bpFilterClose, #bpFilterBackdrop', function () {
      closeFilterPanel();
    });

    /* Apply filters */
    $(document).on('click', '#bpFilterApply', function () {
      applyActiveFilters();
      closeFilterPanel();
    });

    /* Clear all filters and filtered records */
    $(document).on('click', '#bpFilterClear', function () {
      activeModuleFilters   = {};
      filteredModuleRecords = {};
      updateFilterBadge();
      /* Refresh every row's Meeting With list to restore the full unfiltered records */
      beatPlanModulesList.forEach(function (mod) {
        refreshMeetingWithRows(mod.api);
      });
      closeFilterPanel();
    });

    /* Multi-select trigger: toggle open/closed */
    $(document).on('click', '#bpFilterBody .bpf-ms-trigger', function (e) {
      e.stopPropagation();
      var $wrap  = $(this).closest('.bpf-ms-wrap');
      var isOpen = $wrap.hasClass('bpf-ms-open');
      /* Close all other open multi-selects first */
      $('#bpFilterBody .bpf-ms-wrap').each(function () {
        $(this).removeClass('bpf-ms-open');
        $(this).find('.bpf-ms-panel').css({ position: '', top: '', bottom: '', left: '', right: '', width: '' });
        $(this).find('.bpf-ms-list').css('max-height', '');
      });
      if (!isOpen) {
        $wrap.addClass('bpf-ms-open');
        positionBpMsPanel($wrap);
        $wrap.find('.bpf-ms-search').val('').focus();
        $wrap.find('.bpf-ms-opt').show();
      }
    });

    /* Prevent panel inner clicks from bubbling up (would close the panel) */
    $(document).on('click', '#bpFilterBody .bpf-ms-panel', function (e) {
      e.stopPropagation();
    });

    /* Live search within a multi-select panel */
    $(document).on('input', '#bpFilterBody .bpf-ms-search', function () {
      var q   = $(this).val().toLowerCase();
      $(this).closest('.bpf-ms-panel').find('.bpf-ms-opt').each(function () {
        $(this).toggle(String($(this).data('value')).toLowerCase().indexOf(q) !== -1);
      });
    });

    /* Toggle individual option */
    $(document).on('click', '#bpFilterBody .bpf-ms-opt', function (e) {
      e.stopPropagation();
      var $opt     = $(this);
      var modApi   = String($opt.data('module')  || '');
      var fieldApi = String($opt.data('field')   || '');
      var value    = String($opt.data('value')   || '');
      if (!activeModuleFilters[modApi])           { activeModuleFilters[modApi] = {}; }
      if (!activeModuleFilters[modApi][fieldApi]) { activeModuleFilters[modApi][fieldApi] = []; }
      var arr = activeModuleFilters[modApi][fieldApi];
      var idx = arr.indexOf(value);
      var nowChecked;
      if (idx === -1) {
        arr.push(value);
        nowChecked = true;
      } else {
        arr.splice(idx, 1);
        nowChecked = false;
        if (arr.length === 0) { delete activeModuleFilters[modApi][fieldApi]; }
        if (Object.keys(activeModuleFilters[modApi]).length === 0) { delete activeModuleFilters[modApi]; }
      }
      $opt.find('input[type="checkbox"]').prop('checked', nowChecked);
      refreshMsWrapTrigger($opt.closest('.bpf-ms-wrap'));
    });

    /* Chip remove button */
    $(document).on('click', '#bpFilterBody .bpf-ms-chip-rm', function (e) {
      e.stopPropagation();
      var $chip    = $(this).closest('.bpf-ms-chip');
      var modApi   = String($chip.data('module') || '');
      var fieldApi = String($chip.data('field')  || '');
      var value    = String($chip.data('value')  || '');
      removeFromActiveFilter(modApi, fieldApi, value);
      var $wrap = $(this).closest('.bpf-ms-wrap');
      /* Uncheck the corresponding option */
      $wrap.find('.bpf-ms-opt[data-value="' + value + '"] input[type="checkbox"]').prop('checked', false);
      refreshMsWrapTrigger($wrap);
    });

    /* Select All (visible options) */
    $(document).on('click', '#bpFilterBody .bpf-ms-sel-all', function (e) {
      e.stopPropagation();
      var $btn     = $(this);
      var modApi   = String($btn.data('module') || '');
      var fieldApi = String($btn.data('field')  || '');
      var $wrap    = $btn.closest('.bpf-ms-wrap');
      if (!activeModuleFilters[modApi])           { activeModuleFilters[modApi] = {}; }
      if (!activeModuleFilters[modApi][fieldApi]) { activeModuleFilters[modApi][fieldApi] = []; }
      $wrap.find('.bpf-ms-opt:visible').each(function () {
        var v = String($(this).data('value') || '');
        if (activeModuleFilters[modApi][fieldApi].indexOf(v) === -1) {
          activeModuleFilters[modApi][fieldApi].push(v);
        }
        $(this).find('input[type="checkbox"]').prop('checked', true);
      });
      refreshMsWrapTrigger($wrap);
    });

    /* Clear All for a single field */
    $(document).on('click', '#bpFilterBody .bpf-ms-clr-all', function (e) {
      e.stopPropagation();
      var $btn     = $(this);
      var modApi   = String($btn.data('module') || '');
      var fieldApi = String($btn.data('field')  || '');
      var $wrap    = $btn.closest('.bpf-ms-wrap');
      if (activeModuleFilters[modApi]) {
        delete activeModuleFilters[modApi][fieldApi];
        if (Object.keys(activeModuleFilters[modApi]).length === 0) { delete activeModuleFilters[modApi]; }
      }
      $wrap.find('.bpf-ms-opt input[type="checkbox"]').prop('checked', false);
      refreshMsWrapTrigger($wrap);
    });

    /* Accordion: toggle a module section open/closed on header click or Enter/Space */
    $(document).on('click keydown', '#bpFilterBody .bpf-mod-name', function (e) {
      if (e.type === 'keydown' && e.which !== 13 && e.which !== 32) { return; }
      if (e.type === 'keydown') { e.preventDefault(); }
      var $header = $(this);
      var $fields = $header.next('.bpf-mod-fields');
      var isOpen  = $header.hasClass('bpf-acc-open');
      $header.toggleClass('bpf-acc-open', !isOpen)
             .attr('aria-expanded', String(!isOpen));
      if (isOpen) {
        $fields.slideUp(200);
      } else {
        $fields.slideDown(200);
      }
    });

    /* Reposition any open filter multi-select panel when its container scrolls.
       Scroll events do not bubble, so bind directly on the element. */
    $('#bpFilterBody').on('scroll.bpms', function () {
      var $open = $('#bpFilterBody .bpf-ms-wrap.bpf-ms-open');
      if ($open.length) { positionBpMsPanel($open); }
    });

    /* Reposition open filter multi-select panel on viewport resize */
    $(window).on('resize.bpms', function () {
      var $open = $('#bpFilterBody .bpf-ms-wrap.bpf-ms-open');
      if ($open.length) { positionBpMsPanel($open); }
      var $calOpen = $('#bpCalFilterBar .cal-filter-ms-wrap.bpf-ms-open');
      if ($calOpen.length) { positionBpMsPanel($calOpen); }
    });

    /* ── Image preview ── */

    /* Click on any avatar image → open full preview (delegated for dynamic avatars) */
    $(document).on('click', '.bp-rec-avatar img, .user-avatar img', function () {
      var src = $(this).attr('src') || '';
      if (src) {
        openImgPreview(src, $(this).attr('alt') || '');
      }
    });

    /* Close preview: backdrop or close button */
    $(document).on('click', '#imgPreviewOverlay .img-preview-backdrop, #imgPreviewClose', function () {
      closeImgPreview();
    });

    /* Close preview: ESC key */
    $(document).on('keydown.imgPreview', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27) && $('#imgPreviewOverlay').hasClass('img-prev-open')) {
        closeImgPreview();
      }
    });

    /* Close hover card when clicking outside */
    $(document).on('click', function (e) {
      if (!$(e.target).closest('#evtHoverCard').length &&
          !$(e.target).closest('.evt-chip').length &&
          !$(e.target).closest('.time-event').length) {
        hideHoverCard();
      }
    });

    /* Keyboard shortcuts */
    $(document).on('keydown', function (e) {
      if (dom.modal.hasClass('modal-open')) return; /* modal captures input */
      switch (e.key) {
        case 'Escape':     hideHoverCard(); closeDayEventsModal(); closeSlotPicker(); closeMassActionsPopup(); break;
        case 'ArrowLeft':  navigate(-1); break;
        case 'ArrowRight': navigate(1);  break;
        case 't':          goToday();    break;
        case 'm': case 'M':
          state.view = 'month'; updateViewTab('month');
          state.events = state.events.filter(function (e) { return !e.fromCoql; });
          render();
          if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
          break;
        case 'w': case 'W':
          state.view = 'week';  updateViewTab('week');
          state.events = state.events.filter(function (e) { return !e.fromCoql; });
          render();
          if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
          break;
        case 'd': case 'D':
          /* Normalize cursor to today when switching to Day via keyboard shortcut,
             same logic as the view tab click handler. */
          if (state.view !== 'day') {
            var _tdStr = todayStr();
            var _today = new Date();
            if (state.view === 'month') {
              var _c = state.cursor;
              if (_c.getFullYear() === _today.getFullYear() && _c.getMonth() === _today.getMonth()) {
                state.cursor = _today;
              }
            } else if (state.view === 'week') {
              var _ws = weekStart(state.cursor);
              var _we = new Date(_ws); _we.setDate(_ws.getDate() + 6);
              if (dateToStr(_ws) <= _tdStr && _tdStr <= dateToStr(_we)) {
                state.cursor = _today;
              }
            }
          }
          state.view = 'day';   updateViewTab('day');
          state.events = state.events.filter(function (e) { return !e.fromCoql; });
          render();
          if (beatPlanHasRefs && bpSavedRec) { loadBeatPlanEvents(); }
          break;
      }
    });

    /* Auto-refresh current time indicator every minute */
    setInterval(function () {
      if (state.view === 'week' || state.view === 'day') {
        renderCurrentTimeLine();
      }
    }, 60000);

    /* Initial render – discard any stale COQL events that may have been loaded
       from localStorage in a previous session so the calendar starts clean.
       The PageLoad callback will fetch fresh events for the active user. */
    state.events = state.events.filter(function (e) { return !e.fromCoql; });
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
    /* Non-administrators never see the settings/meetings-bar UI.
       Redirect them to the main calendar content instead. */
    if (!loggedInIsAdmin) { showMainContent(); return; }
    $meetingsBar.show();
    $otherContent.hide();
    $('#legendsDisplay').hide();
  }

  function showMainContent() {
    $meetingsBar.hide();
    $styleBar.hide();
    $legendBar.hide();
    $settingsBackBtn.hide();
    $otherContent.show();
    /* Admin-only toolbar controls must stay hidden for non-administrators */
    if (!loggedInIsAdmin) { $('.toolbar-right').hide(); }
    /* Show the legends display strip only if it has been populated */
    if ($('#legendsDisplay').children().length > 0) {
      $('#legendsDisplay').show();
    }
  }

  /* Settings icon → show meetings-bar + styleBar + back button, hide rest */
  $('#settingsIconBtn').on('click', function () {
    /* Non-administrators cannot access the settings view */
    if (!loggedInIsAdmin) { return; }
    showMeetingsBarOnly();
    $settingsBackBtn.show();
  });

  /**
   * Re-initialize the calendar after returning from Settings (either via the
   * back button or after saving with setupSave).  Replaces location.reload() so
   * the entire page does not need to be hard-refreshed:
   *
   *   1. Re-fetch the latest Beat Plan References record.
   *   2. Restore slot assignments, bprStyleConfig, and legend chips.
   *   3. Re-fetch picklist field metadata (fields may have changed).
   *   4. Rebuild the calendar event filter bar.
   *   5. Re-render the legends display strip.
   *   6. Clear stale COQL events, show main content, and render.
   *   7. Re-apply BPR chip styles to any events already in the DOM.
   *   8. Load fresh beat plan events for the current view range.
   */
  async function reinitializeCalendar() {
    $('#widgetLoaderOverlay').show();
    try {
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

      var resp = await zrc.get('/crm/v8/beatplanner__Beat_Plan_References?fields=' + prefFields);
      var hasRecords = resp &&
                       resp.data &&
                       resp.data.data &&
                       resp.data.data.length > 0;
      var savedRec = hasRecords ? resp.data.data[0] : null;

      beatPlanHasRefs = hasRecords;

      if (hasRecords && savedRec) {
        bpSavedRec = savedRec;

        /* Rebuild mfSelected and beatPlanModulesList from the saved record */
        mfSelected = (savedRec['beatplanner__Meetings_For_Apis'] || '').split(',').filter(Boolean);
        var bpModLabels = (savedRec['beatplanner__Meetings_For_Modules'] || '').split(',').filter(Boolean);
        var bpModApis   = (savedRec['beatplanner__Meetings_For_Apis']    || '').split(',').filter(Boolean);
        beatPlanModulesList = bpModLabels.map(function (label, i) {
          return { label: label.trim(), api: (bpModApis[i] || '').trim() };
        });

        /* Force a fresh fetch of picklist metadata (slot assignments may have changed) */
        bprPicklistFields = null;
        await fetchBprPicklistFields().catch(function () { bprPicklistFields = []; });

        /* Restore slot assignments and bprStyleConfig from the latest saved record */
        restorePreferences(savedRec);

        /* Rebuild the calendar event filter bar with the updated picklist metadata */
        buildCalFilterBar();

        /* Re-render the legends display strip */
        var savedLegApiNames = (savedRec['beatplanner__Legends_Field_Api_Name']   || '').split(',').filter(Boolean);
        var savedMfModLabels = (savedRec['beatplanner__Meetings_For_Modules']     || '').split(',').filter(Boolean);
        await renderLegendsDisplay(savedLegApiNames, savedMfModLabels).catch(function (e) {
          console.error('Legend render error:', e);
        });

        /* Clear stale COQL events so the calendar does not display data from the
           previous configuration while fresh events are being fetched. */
        state.events = state.events.filter(function (e) { return !e.fromCoql; });

        showMainContent();
        render();
        updateBgColourClass();
        applyBprChipStyles();

        /* Load fresh beat plan events for the current view date range */
        await loadBeatPlanEvents();
      } else {
        showMeetingsBarOnly();
      }
    } catch (err) {
      console.error('Failed to reinitialize calendar:', err);
    } finally {
      $('#widgetLoaderOverlay').hide();
    }
  }

  /* Back button → re-initialize the calendar without a full page reload */
  $settingsBackBtn.on('click', function () {
    reinitializeCalendar();
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

  /**
   * Build a CSS style object for an .evt-chip using the configured slot assignments
   * and the picklist colour codes from bprPicklistFields metadata.
   *
   * @param  {Object} fieldValues  Maps field API name → selected picklist actual value.
   *                               e.g. { 'beatplanner__Status': 'Active', ... }
   * @return {Object}  { bg, borderTop, borderBottom, borderLeft, borderRight, markerColor }
   *                   Each value is a CSS colour string or empty string when not configured.
   */
  function buildBprChipStyle(fieldValues) {
    var result = {
      bg:          '',
      borderTop:   '',
      borderBottom:'',
      borderLeft:  '',
      borderRight: '',
      markerColor: ''
    };

    if (!fieldValues || !bprPicklistFields || !bprPicklistFields.length) { return result; }

    /* Build lookup map: api_name → options array */
    var fieldMap = {};
    bprPicklistFields.forEach(function (f) {
      fieldMap[f.api_name] = f.options || [];
    });

    /* Slot → style property mapping */
    var SLOT_TO_PROP = {
      'bg-colour':     'bg',
      'marker':        'markerColor',
      'top-border':    'borderTop',
      'bottom-border': 'borderBottom',
      'left-border':   'borderLeft',
      'right-border':  'borderRight'
    };

    Object.keys(SLOT_TO_PROP).forEach(function (slot) {
      /* Use bprStyleConfig (read directly from BPR record) as the single source of truth.
         Fall back to syeSlotAssignments only when bprStyleConfig is not yet available. */
      var fieldApi = (bprStyleConfig && bprStyleConfig[slot]) ||
                     (syeSlotAssignments[slot] && syeSlotAssignments[slot].api_name) || '';
      if (!fieldApi) {
        /* Field not configured for this slot – skip silently */
        return;
      }
      if (!fieldMap[fieldApi]) {
        /* Field not found in beatplanner__Daily_Beat_Plans metadata – skip with warning */
        console.warn('BPR style: field "' + fieldApi + '" not found in Daily Beat Plans metadata (slot: ' + slot + ')');
        return;
      }
      var selectedVal = fieldValues[fieldApi];
      if (!selectedVal) { return; }
      var options = fieldMap[fieldApi] || [];
      for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        if (opt.actual === selectedVal || opt.display === selectedVal) {
          var colour = opt.colour || '';
          if (colour && colour.charAt(0) !== '#') { colour = '#' + colour; }
          if (colour) { result[SLOT_TO_PROP[slot]] = colour; }
          break;
        }
      }
    });

    return result;
  }

  /**
   * When Attendance = "Leave", resolve the background colour for the .evt-chip
   * from the beatplanner__Leave_Type picklist metadata (fully metadata-driven).
   * Field API names are resolved dynamically from bprPicklistFields by label.
   *
   * @param  {Object} fieldValues  Maps field API name → selected picklist actual value.
   * @return {string}  CSS colour string (with leading '#') or empty string when not found.
   */
  function getLeaveTypeColor(fieldValues) {
    if (!fieldValues || !bprPicklistFields || !bprPicklistFields.length) { return ''; }

    /* Resolve attendance and leave-type field API names from metadata by label */
    var attendanceApiName = '';
    var leaveTypeApiName  = '';
    for (var k = 0; k < bprPicklistFields.length; k++) {
      var lbl = (bprPicklistFields[k].field_label || '').toLowerCase().trim();
      if (lbl === 'attendance')  { attendanceApiName = bprPicklistFields[k].api_name; }
      if (lbl === 'leave type')  { leaveTypeApiName  = bprPicklistFields[k].api_name; }
      if (attendanceApiName && leaveTypeApiName) { break; }
    }
    if (!attendanceApiName || !leaveTypeApiName) { return ''; }

    var attendVal    = fieldValues[attendanceApiName] || '';
    if (attendVal.toLowerCase() !== 'leave') { return ''; }
    var leaveTypeVal = fieldValues[leaveTypeApiName] || '';
    if (!leaveTypeVal) { return ''; }

    for (var i = 0; i < bprPicklistFields.length; i++) {
      var f = bprPicklistFields[i];
      if (f.api_name !== leaveTypeApiName) { continue; }
      for (var j = 0; j < f.options.length; j++) {
        var opt = f.options[j];
        if (opt.actual === leaveTypeVal || opt.display === leaveTypeVal) {
          var colour = opt.colour || '';
          if (colour && colour.charAt(0) !== '#') { colour = '#' + colour; }
          return colour;
        }
      }
      break;
    }
    return '';
  }

  /**
   * Add or remove the `cal-bg-colour-mapped` class on <body> based on whether
   * the Background Colour field has been configured in the BPR record.
   * - Mapped   → adds class → CSS rule forces white text on chip/time-event labels.
   * - Unmapped → removes class → CSS rule forces near-black text in light theme.
   *
   * Applied to <body> (instead of #calApp) so that the class propagates into
   * all UI surfaces: calendar views, #eventModal, #dayEventsModal, #evtHoverCard,
   * editable rows, and every other element rendered outside #calApp.
   */
  function updateBgColourClass() {
    var isMapped = !!(bprStyleConfig && bprStyleConfig['bg-colour']);
    $('body').toggleClass('cal-bg-colour-mapped', isMapped);
  }

  /**
   * Apply BPR-driven dynamic styles to all .evt-chip and .time-event elements
   * currently in the DOM that carry a data-bpr-fields JSON attribute.
   * Also restores the .chip-marker element if it was missing because metadata
   * had not loaded when the element was first rendered.
   */
  function applyBprChipStyles() {
    if (!beatPlanHasRefs || !bprPicklistFields || !bprPicklistFields.length) { return; }

    /* ── Shared inner helper: resolve BPR styles and apply them to one element ── */
    function applyToElement($el, posPrefix) {
      var fieldValues;
      try { fieldValues = JSON.parse($el.attr('data-bpr-fields') || '{}'); }
      catch (e) { return; }

      var styleStr   = '';
      var s          = buildBprChipStyle(fieldValues);
      var leaveColor = getLeaveTypeColor(fieldValues);

      /* When Attendance = Leave, use the Leave Type picklist color as the background
         and the Managers Approval color as the left border (fully metadata-driven). */
      if (leaveColor) {
        var leaveBorderLeft = s.borderLeft || leaveColor;
        styleStr = 'background:' + leaveColor + ';border-left-color:' + leaveBorderLeft +
                   ';border-left-style:solid;border-left-width:3px;color:#fff;';
      } else {
        if (s.bg)           { styleStr += 'background:' + s.bg + ';'; }
        if (s.borderTop)    { styleStr += 'border-top-color:'    + s.borderTop    + ';border-top-style:solid;border-top-width:2px;'; }
        if (s.borderBottom) { styleStr += 'border-bottom-color:' + s.borderBottom + ';border-bottom-style:solid;border-bottom-width:2px;'; }
        if (s.borderLeft)   { styleStr += 'border-left-color:'   + s.borderLeft   + ';border-left-style:solid;border-left-width:3px;'; }
        if (s.borderRight)  { styleStr += 'border-right-color:'  + s.borderRight  + ';border-right-style:solid;border-right-width:2px;'; }
        /* When no bg-colour is resolved but a left-border color exists, derive a tinted background. */
        if (!s.bg && s.borderLeft) { styleStr += 'background:' + s.borderLeft + '22;'; }
        /* Apply white text only when a solid background colour is configured */
        if (s.bg) { styleStr += 'color:#fff;'; }
      }

      /* Always replace the element style so any stale fallback colour is cleared.
         For .time-event, posPrefix preserves the top/height positioning values. */
      $el.attr('style', posPrefix + (styleStr || ''));

      /* ── Restore .chip-marker if it was not rendered on initial load ── */
      if (s.markerColor) {
        var $marker = $el.find('.chip-marker');
        if (!$marker.length) {
          /* Insert before .chip-name (evt-chip) or .te-title (time-event) */
          $el.find('.chip-name, .te-title').first()
             .before('<span class="chip-marker" aria-hidden="true"></span>');
          $marker = $el.find('.chip-marker');
        }
        $marker.css('background', s.markerColor);
      }
    }

    $('.evt-chip[data-bpr-fields]').each(function () {
      applyToElement($(this), '');
    });

    $('.time-event[data-bpr-fields]').each(function () {
      var $te       = $(this);
      var posPrefix = $te.attr('data-te-pos') || '';
      applyToElement($te, posPrefix);
    });
  }

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

  /**
   * Fetch all picklist fields from beatplanner__Daily_Beat_Plans metadata.
   * The result is cached in bprPicklistFields so only one API call is made per session.
   * Each entry: { api_name, field_label, options: [{display, actual}, …] }
   */
  async function fetchBprPicklistFields() {
    try {
      var resp = await zrc.get('/crm/v8/settings/fields?module=beatplanner__Daily_Beat_Plans&type=all');
      var allFields = (resp && resp.data && resp.data.fields) ? resp.data.fields : [];

      /* Cache the full field list (used for lookup resolution) */
      bpDailyAllFields = allFields;

      bprPicklistFields = [];
      allFields.forEach(function (f) {
        if (f.data_type !== 'picklist' && f.data_type !== 'pick_list') { return; }
        var options = [];
        if (f.pick_list_values && f.pick_list_values.length) {
          options = f.pick_list_values.map(function (pv) {
            var display = pv.display_value || pv.actual_value || '';
            var actual  = pv.actual_value  || pv.display_value || '';
            /* Zoho CRM v8 returns the colour as colour_code (hex, with or without '#').
               Guard against alternate spellings and ensure we always get a string. */
            var rawColour = pv.colour_code || pv.color_code || pv.colour || pv.color || '';
            var colour = rawColour ? String(rawColour).trim() : '';
            return display ? { display: display, actual: actual, colour: colour } : null;
          }).filter(Boolean);
        }
        bprPicklistFields.push({
          api_name:    f.api_name    || '',
          field_label: f.field_label || '',
          options:     options
        });
      });
    } catch (e) {
      bprPicklistFields = [];
      bpDailyAllFields  = [];
    }
  }

  /**
   * Render the legends display strip (#legendsDisplay) dynamically.
   *
   * Flow:
   *   1. Accept the list of legend field API names (from beatplanner__Legends_Field_Api_Name).
   *   2. Ensure beatplanner__Daily_Beat_Plans field metadata is loaded (bprPicklistFields).
   *   3. For each legend API name that matches a picklist field in the metadata,
   *      build one legend group showing the field label as heading and its
   *      picklist values as colour-coded items.
   *   4. Inject the HTML into #legendsDisplay and show/hide the container.
   *
   * @param {string[]} legApiNames - Array of Daily Beat Plans field API names to render.
   */
  async function renderLegendsDisplay(legApiNames, mfModuleLabels) {
    var $container = $('#legendsDisplay');

    /* No legend fields configured → hide the strip and return */
    if (!legApiNames || !legApiNames.length) {
      $container.hide().empty();
      return;
    }

    /* Ensure Daily Beat Plans field metadata is available */
    if (bprPicklistFields === null) {
      try {
        await fetchBprPicklistFields();
      } catch (e) {
        bprPicklistFields = [];
      }
    }

    /* Build a lookup map: api_name → picklist field descriptor */
    var fieldMap = {};
    (bprPicklistFields || []).forEach(function (f) {
      fieldMap[f.api_name] = f;
    });

    /* Build a normalised set of selected module labels for Meetings For filtering */
    var mfLabelSet = {};
    if (mfModuleLabels && mfModuleLabels.length) {
      mfModuleLabels.forEach(function (l) {
        if (l) { mfLabelSet[l.trim().toLowerCase()] = true; }
      });
    }

    /* Build legend group HTML for each configured API name */
    var groupsHtml = '';
    legApiNames.forEach(function (apiName) {
      apiName = apiName.trim();
      if (!apiName) { return; }

      var field = fieldMap[apiName];
      if (!field || !field.options || !field.options.length) { return; }

      /* Determine if this is the Meetings For field so we can filter to selected modules */
      var isMeetingsForField = apiName.toLowerCase().indexOf('meetings_for') !== -1;

      /* Heading for this legend group */
      var titleHtml = '<span class="legends-group-title">' + escHtml(field.field_label || apiName) + '</span>';

      /* One item per picklist value */
      var itemsHtml = '';
      field.options.forEach(function (opt) {
        /* Skip the blank "-None-" placeholder — it is not a meaningful legend entry */
        if (opt.display === '-None-' || opt.actual === '-None-') { return; }

        /* For the Meetings For field, only show modules the user has actually selected */
        if (isMeetingsForField && Object.keys(mfLabelSet).length &&
            !mfLabelSet[opt.display.trim().toLowerCase()]) { return; }

        var colour = opt.colour || '#BDBDBD';
        /* Ensure colour starts with # for inline CSS */
        if (colour && colour.charAt(0) !== '#') { colour = '#' + colour; }
        itemsHtml +=
          '<span class="legend-item">' +
            '<span class="legend-dot" style="background:' + escHtml(colour) + ';border-color:' + escHtml(colour) + ';"></span>' +
            '<span class="legend-item-label">' + escHtml(opt.display) + '</span>' +
          '</span>';
      });

      if (!itemsHtml) { return; }

      groupsHtml +=
        '<div class="legends-group">' +
          titleHtml +
          '<span class="legends-group-sep" aria-hidden="true"></span>' +
          '<div class="legends-items-row">' + itemsHtml + '</div>' +
        '</div>';
    });

    if (!groupsHtml) {
      $container.hide().empty();
      return;
    }

    $container.html(groupsHtml).show();
  }

  /**
   * Fetch picklist fields for ALL modules in beatPlanModulesList and cache
   * them in modulePicklistMeta.  Called once after beatPlanModulesList is built.
   * Results are cached so subsequent filter-panel opens are instant.
   */
  function fetchAllModulePicklistMeta() {
    beatPlanModulesList.forEach(function (mod) {
      if (!mod.api) { return; }
      if (modulePicklistMeta.hasOwnProperty(mod.api)) { return; } /* already fetched */
      /* Mark as loading (null = pending) */
      modulePicklistMeta[mod.api] = null;
      zrc.get('/crm/v8/settings/fields?module=' + encodeURIComponent(mod.api) + '&type=all')
        .then(function (resp) {
          var allFields = (resp && resp.data && resp.data.fields) ? resp.data.fields : [];
          var picklistFields = [];
          allFields.forEach(function (f) {
            if (f.data_type !== 'picklist' && f.data_type !== 'pick_list') { return; }
            var options = [];
            if (f.pick_list_values && f.pick_list_values.length) {
              f.pick_list_values.forEach(function (pv) {
                var display = pv.display_value || pv.actual_value || '';
                if (display) { options.push(display); }
              });
            }
            if (options.length > 0) {
              picklistFields.push({
                api_name:    f.api_name    || '',
                field_label: f.field_label || '',
                options:     options
              });
            }
          });
          modulePicklistMeta[mod.api] = picklistFields;
        })
        .catch(function () {
          modulePicklistMeta[mod.api] = [];
        });
    });
  }

  /**
   * Pre-fetch all CRM records for every module in beatPlanModulesList and cache
   * them in moduleRecordsMap.  Called once after beatPlanModulesList is built so
   * the Meeting With dropdown can be populated instantly when the user selects a
   * Meetings For value.
   */
  function fetchAllModuleRecords() {
    beatPlanModulesList.forEach(function (mod) {
      if (!mod.api) { return; }
      if (moduleRecordsMap.hasOwnProperty(mod.api)) { return; } /* already fetched */
      ZOHO.CRM.API.getAllRecords({ Entity: mod.api })
        .then(function (data) {
          if (data && data.data) {
            moduleRecordsMap[mod.api] = data.data.map(function (rec) {
              return {
                id:       rec.id,
                name:     recordDisplayName(rec),
                photo_id: rec['$photo_id'] || ''
              };
            });
          } else {
            moduleRecordsMap[mod.api] = [];
          }
          refreshMeetingWithRows(mod.api);
        })
        .catch(function () {
          moduleRecordsMap[mod.api] = [];
        });
    });
  }

  /* ── Filter Panel helpers ── */

  /**
   * Build and render the calendar event filter bar (#bpCalFilterBar).
   * Uses the same reusable multi-select dropdown component as #bpFilterBody,
   * supporting search, multi-select, Select All, Clear All, and checkbox selection.
   */
  function buildCalFilterBar() {
    var $bar = $('#bpCalFilterBar');
    if (!$bar.length || !beatPlanHasRefs || !bprPicklistFields || !bprPicklistFields.length) {
      $bar.hide();
      return;
    }

    /* Fields to exclude from the filter bar (internal / low-value) */
    var EXCLUDED = ['record status', 'currency', 'unsubscribed mode'];

    var html = '';
    bprPicklistFields.forEach(function (f) {
      var lbl = (f.field_label || '').toLowerCase().trim();
      if (EXCLUDED.indexOf(lbl) !== -1) { return; }
      if (!f.options || !f.options.length) { return; }
      var selectedVals = calEventFilters[f.api_name] || [];
      html += '<div class="bp-cal-filter-item">' +
              '<span class="bp-cal-filter-lbl">' + escHtml(f.field_label) + '</span>' +
              buildCalFilterMultiSelect(f, selectedVals) +
              '</div>';
    });

    if (!html) {
      $bar.hide();
      return;
    }

    /* Add a "Clear filters" button at the right end */
    var hasActive = Object.keys(calEventFilters).some(function (k) {
      return calEventFilters[k] && calEventFilters[k].length > 0;
    });
    html += '<button class="bp-cal-filter-clear-btn" id="bpCalFilterClear" type="button"' +
            (hasActive ? '' : ' style="display:none;"') + '>Clear filters</button>';

    $bar.html(html).show();
  }

  /**
   * Build the HTML for one multi-select filter dropdown for the calendar filter bar.
   * Uses the same bpf-ms-* CSS classes as the filter panel component.
   * @param {Object} field       – {api_name, field_label, options}
   * @param {Array}  selectedVals – currently selected actual values
   */
  function buildCalFilterMultiSelect(field, selectedVals) {
    var chevSvg = '<svg class="bpf-ms-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor" ' +
                  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';
    var chipsHtml = '';
    selectedVals.forEach(function (v) {
      chipsHtml += '<span class="bpf-ms-chip cal-filter-chip" data-calfield="' + escHtml(field.api_name) +
                   '" data-value="' + escHtml(v) + '">' + escHtml(v) +
                   '<span class="bpf-ms-chip-rm" role="button" aria-label="Remove ' + escHtml(v) + '">\u00d7</span>' +
                   '</span>';
    });
    var placeholder = selectedVals.length === 0 ? '<span class="bpf-ms-placeholder">All</span>' : '';
    var optsHtml = '';
    field.options.forEach(function (opt) {
      var display = (typeof opt === 'object') ? (opt.display || opt.actual || '') : String(opt);
      var actual  = (typeof opt === 'object') ? (opt.actual  || opt.display || '') : String(opt);
      var checked = selectedVals.indexOf(actual) !== -1;
      optsHtml += '<li class="bpf-ms-opt cal-filter-opt" data-calfield="' + escHtml(field.api_name) +
                  '" data-value="' + escHtml(actual) + '">' +
                  '<input type="checkbox"' + (checked ? ' checked' : '') + ' tabindex="-1" />' +
                  escHtml(display) +
                  '</li>';
    });
    return '<div class="bpf-ms-wrap cal-filter-ms-wrap" data-calfield="' + escHtml(field.api_name) + '">' +
           '<div class="bpf-ms-trigger" tabindex="0">' + chipsHtml + placeholder + chevSvg + '</div>' +
           '<div class="bpf-ms-panel">' +
           '<div class="bpf-ms-panel-head">' +
           '<input class="bpf-ms-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
           '<button class="bpf-ms-panel-act cal-filter-sel-all" type="button" data-calfield="' + escHtml(field.api_name) + '">All</button>' +
           '<button class="bpf-ms-panel-act cal-filter-clr-all" type="button" data-calfield="' + escHtml(field.api_name) + '">Clear</button>' +
           '</div>' +
           '<ul class="bpf-ms-list">' + optsHtml + '</ul>' +
           '</div>' +
           '</div>';
  }

  /**
   * Refresh the chips and placeholder inside a .cal-filter-ms-wrap trigger
   * based on the current calEventFilters state for that wrap's field.
   */
  function refreshCalFilterTrigger($wrap) {
    var fieldApi     = String($wrap.data('calfield') || '');
    var selectedVals = calEventFilters[fieldApi] || [];
    var $trigger     = $wrap.find('.bpf-ms-trigger');
    $trigger.find('.cal-filter-chip, .bpf-ms-placeholder').remove();
    var $chev = $trigger.find('.bpf-ms-chev');
    if (selectedVals.length > 0) {
      var chipsHtml = '';
      selectedVals.forEach(function (v) {
        chipsHtml += '<span class="bpf-ms-chip cal-filter-chip" data-calfield="' + escHtml(fieldApi) +
                     '" data-value="' + escHtml(v) + '">' + escHtml(v) +
                     '<span class="bpf-ms-chip-rm" role="button" aria-label="Remove ' + escHtml(v) + '">\u00d7</span>' +
                     '</span>';
      });
      $chev.before(chipsHtml);
    } else {
      $chev.before('<span class="bpf-ms-placeholder">All</span>');
    }
  }


  function positionBpMsPanel($wrap) {
    var triggerEl = $wrap.find('.bpf-ms-trigger')[0];
    var $panel    = $wrap.find('.bpf-ms-panel');
    if (!triggerEl || !$panel.length) { return; }
    var rect  = triggerEl.getBoundingClientRect();
    var vpH   = window.innerHeight;
    var below = vpH - rect.bottom;
    var above = rect.top;

    /* Offset correction: if an ancestor .modal-box or .mass-actions-box has an active CSS
       transform it becomes the containing block for position:fixed descendants.
       Detect and compensate so the panel renders at the correct viewport position. */
    var offsetTop    = 0;
    var offsetLeft   = 0;
    var offsetBottom = vpH;
    var $box = $wrap.closest('.modal-box, .mass-actions-box');
    if ($box.length) {
      var cs = window.getComputedStyle($box[0]);
      if (cs.transform && cs.transform !== 'none') {
        var boxRect = $box[0].getBoundingClientRect();
        offsetTop    = boxRect.top    + (parseFloat(cs.borderTopWidth)    || 0);
        offsetLeft   = boxRect.left   + (parseFloat(cs.borderLeftWidth)   || 0);
        offsetBottom = boxRect.bottom - (parseFloat(cs.borderBottomWidth) || 0);
      }
    }

    var GAP = 3;
    var PAD = 8;

    var vpW2        = window.innerWidth;
    var panelW2     = rect.width;
    var rawLeft2    = rect.left - offsetLeft;
    var clampedLeft2 = Math.max(0, Math.min(rawLeft2, vpW2 - panelW2 - 4));

    $panel.css({
      position:  'fixed',
      width:     panelW2 + 'px',
      left:      clampedLeft2 + 'px',
      right:     'auto',
      'z-index': 10000
    });

    /* Open toward whichever side has more room; clamp list height to fit. */
    var availH;
    if (below >= above) {
      availH = below - GAP - PAD;
      $panel.css({ top: (rect.bottom - offsetTop + GAP) + 'px', bottom: 'auto' });
    } else {
      availH = above - GAP - PAD - offsetTop;
      $panel.css({ top: 'auto', bottom: (offsetBottom - rect.top + GAP) + 'px' });
    }
    var headH    = ($panel.find('.bpf-ms-panel-head').outerHeight(true) || 38);
    var maxListH = Math.max(60, availH - headH);
    $panel.find('.bpf-ms-list').css('max-height', maxListH + 'px');
  }

  /**
   * Update the per-module active filter count badges inside each .bpf-mod-name.
   * Counts the number of .bpf-ms-trigger elements that have at least one selection.
   */
  function updateModuleCountBadges() {
    $('#bpFilterBody .bpf-mod-group').each(function () {
      var $group  = $(this);
      var modApi  = String($group.data('module') || '');
      var $header = $group.find('.bpf-mod-name');
      if (!modApi || !$header.length) { return; }
      var count = $group.find('.bpf-ms-trigger').filter(function () {
        return $(this).find('.bpf-ms-chip').length > 0;
      }).length;
      var $badge = $header.find('.bpf-mod-count');
      if (count > 0) {
        if ($badge.length) {
          $badge.text(count);
        } else {
          $header.find('.bpf-acc-chev').before('<span class="bpf-mod-count">' + count + '</span>');
        }
      } else {
        $badge.remove();
      }
    });
  }

  /** Open the filter panel and render its current content. */
  function openFilterPanel() {
    renderFilterPanelContent();
    $('#bpFilterOverlay').addClass('bpf-open');
  }

  /** Close the filter panel and collapse any open multi-select inside it. */
  function closeFilterPanel() {
    $('#bpFilterOverlay').removeClass('bpf-open');
    $('#bpFilterBody .bpf-ms-wrap').each(function () {
      $(this).removeClass('bpf-ms-open');
      $(this).find('.bpf-ms-panel').css({ position: '', top: '', bottom: '', left: '', right: '', width: '' });
      $(this).find('.bpf-ms-list').css('max-height', '');
    });
  }

  /** Render the filter panel body from cached modulePicklistMeta. */
  function renderFilterPanelContent() {
    var $body = $('#bpFilterBody');
    if (!beatPlanModulesList || beatPlanModulesList.length === 0) {
      $body.html('<p class="bpf-loading">No modules configured.</p>');
      return;
    }
    var accChevSvg = '<svg class="bpf-acc-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor" ' +
                     'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                     '<path d="M1 1l4 4 4-4"/></svg>';
    var html = '';
    beatPlanModulesList.forEach(function (mod) {
      var fields = modulePicklistMeta.hasOwnProperty(mod.api) ? modulePicklistMeta[mod.api] : null;
      var modFilterCount = 0;
      if (activeModuleFilters[mod.api]) {
        Object.keys(activeModuleFilters[mod.api]).forEach(function (fieldApi) {
          var vals = activeModuleFilters[mod.api][fieldApi];
          if (vals && vals.length > 0) { modFilterCount += 1; }
        });
      }
      var countBadge = modFilterCount > 0
        ? '<span class="bpf-mod-count">' + modFilterCount + '</span>'
        : '';
      html += '<div class="bpf-mod-group" data-module="' + escHtml(mod.api) + '">';
      html += '<h4 class="bpf-mod-name" role="button" tabindex="0" aria-expanded="false">' +
              escHtml(mod.label) +
              '<span class="bpf-mod-header-right">' + countBadge + accChevSvg + '</span>' +
              '</h4>';
      html += '<div class="bpf-mod-fields">';
      if (fields === null) {
        html += '<p class="bpf-loading">Loading fields\u2026</p>';
      } else if (fields.length === 0) {
        html += '<p class="bpf-no-fields">No picklist fields available.</p>';
      } else {
        fields.forEach(function (f) {
          var selectedVals = (activeModuleFilters[mod.api] && activeModuleFilters[mod.api][f.api_name]) || [];
          html += buildFilterMultiSelect(mod.api, f, selectedVals);
        });
      }
      html += '</div>';
      html += '</div>';
    });
    $body.html(html);
  }

  /**
   * Build the HTML for one multi-select dropdown for a picklist field in the
   * filter panel.  Selected values are shown as removable chips in the trigger.
   */
  function buildFilterMultiSelect(modApi, field, selectedVals) {
    var chevSvg = '<svg class="bpf-ms-chev" viewBox="0 0 10 6" fill="none" stroke="currentColor" ' +
                  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                  '<path d="M1 1l4 4 4-4"/></svg>';
    var chipsHtml = '';
    selectedVals.forEach(function (v) {
      chipsHtml += '<span class="bpf-ms-chip" data-module="' + escHtml(modApi) +
                   '" data-field="' + escHtml(field.api_name) +
                   '" data-value="' + escHtml(v) + '">' +
                   escHtml(v) +
                   '<span class="bpf-ms-chip-rm" role="button" aria-label="Remove ' + escHtml(v) + '">\u00d7</span>' +
                   '</span>';
    });
    var placeholder = selectedVals.length === 0 ? '<span class="bpf-ms-placeholder">Select\u2026</span>' : '';
    var optsHtml = '';
    field.options.forEach(function (opt) {
      var checked = selectedVals.indexOf(opt) !== -1;
      optsHtml += '<li class="bpf-ms-opt" data-module="' + escHtml(modApi) +
                  '" data-field="' + escHtml(field.api_name) +
                  '" data-value="' + escHtml(opt) + '">' +
                  '<input type="checkbox"' + (checked ? ' checked' : '') + ' tabindex="-1" />' +
                  escHtml(opt) +
                  '</li>';
    });
    return '<div class="bpf-field-row">' +
           '<span class="bpf-field-label">' + escHtml(field.field_label) + '</span>' +
           '<div class="bpf-ms-wrap" data-module="' + escHtml(modApi) + '" data-field="' + escHtml(field.api_name) + '">' +
           '<div class="bpf-ms-trigger" tabindex="0">' +
           chipsHtml + placeholder + chevSvg +
           '</div>' +
           '<div class="bpf-ms-panel">' +
           '<div class="bpf-ms-panel-head">' +
           '<input class="bpf-ms-search" type="text" placeholder="Search\u2026" autocomplete="off" />' +
           '<button class="bpf-ms-panel-act bpf-ms-sel-all" type="button" ' +
           'data-module="' + escHtml(modApi) + '" data-field="' + escHtml(field.api_name) + '">All</button>' +
           '<button class="bpf-ms-panel-act bpf-ms-clr-all" type="button" ' +
           'data-module="' + escHtml(modApi) + '" data-field="' + escHtml(field.api_name) + '">Clear</button>' +
           '</div>' +
           '<ul class="bpf-ms-list">' + optsHtml + '</ul>' +
           '</div>' +
           '</div>' +
           '</div>';
  }

  /**
   * Refresh the chips and placeholder inside a .bpf-ms-trigger based on the
   * current activeModuleFilters state for that wrap's module/field.
   */
  function refreshMsWrapTrigger($wrap) {
    var modApi   = String($wrap.data('module')  || '');
    var fieldApi = String($wrap.data('field')   || '');
    var selectedVals = (activeModuleFilters[modApi] && activeModuleFilters[modApi][fieldApi]) || [];
    var $trigger = $wrap.find('.bpf-ms-trigger');
    /* Remove existing chips + placeholder (preserve chev) */
    $trigger.find('.bpf-ms-chip, .bpf-ms-placeholder').remove();
    var $chev = $trigger.find('.bpf-ms-chev');
    if (selectedVals.length > 0) {
      var chipsHtml = '';
      selectedVals.forEach(function (v) {
        chipsHtml += '<span class="bpf-ms-chip" data-module="' + escHtml(modApi) +
                     '" data-field="' + escHtml(fieldApi) +
                     '" data-value="' + escHtml(v) + '">' +
                     escHtml(v) +
                     '<span class="bpf-ms-chip-rm" role="button" aria-label="Remove ' + escHtml(v) + '">\u00d7</span>' +
                     '</span>';
      });
      $chev.before(chipsHtml);
    } else {
      $chev.before('<span class="bpf-ms-placeholder">Select\u2026</span>');
    }
    updateModuleCountBadges();
  }

  /** Remove a single value from activeModuleFilters, cleaning up empty objects. */
  function removeFromActiveFilter(modApi, fieldApi, value) {
    if (!activeModuleFilters[modApi] || !activeModuleFilters[modApi][fieldApi]) { return; }
    var arr = activeModuleFilters[modApi][fieldApi];
    var idx = arr.indexOf(value);
    if (idx !== -1) {
      arr.splice(idx, 1);
      if (arr.length === 0) { delete activeModuleFilters[modApi][fieldApi]; }
      if (Object.keys(activeModuleFilters[modApi]).length === 0) { delete activeModuleFilters[modApi]; }
    }
  }

  /** Update the badge count on the Filter button to reflect active filter count. */
  function updateFilterBadge() {
    var count = 0;
    Object.keys(activeModuleFilters).forEach(function (mod) {
      Object.keys(activeModuleFilters[mod]).forEach(function () { count++; });
    });
    var $btn = $('#bpFilterBtn');
    $btn.find('.bp-filter-btn-badge').remove();
    if (count > 0) {
      $btn.addClass('bp-filter-btn--active')
          .append('<span class="bp-filter-btn-badge">' + count + '</span>');
    } else {
      $btn.removeClass('bp-filter-btn--active');
    }
    updateModuleCountBadges();
  }

  /**
   * Rebuild the Meeting With dropdown list for every row in the slot grid
   * that currently has the given module selected in its "Meetings For" cell.
   * Preserves the current selection regardless of whether the selected record
   * appears in the filtered list.
   */
  function refreshMeetingWithRows(modApi) {
    var records = filteredModuleRecords.hasOwnProperty(modApi)
      ? filteredModuleRecords[modApi]
      : (moduleRecordsMap[modApi] || []);

    var mwOpts;
    if (records.length === 0) {
      mwOpts = '<li class="bp-dd-empty">No records found</li>';
    } else {
      mwOpts = records.map(function (rec) {
        return '<li class="bp-dd-opt" data-id="' + escHtml(rec.id) +
               '" data-label="' + escHtml(rec.name) +
               '" data-photo-id="' + escHtml(rec.photo_id || '') + '">' +
               escHtml(rec.name) + '</li>';
      }).join('');
    }

    $('#slotPickerGrid .bp-slot-row, #demBulkGrid .bp-slot-row, #massActionsBody .bp-slot-row').each(function () {
      var $row = $(this);
      var selectedApi = $row.find('.bp-mf-wrap .bp-dd-val').attr('data-selected-api');
      if (selectedApi !== modApi) { return; }

      var $mwWrap = $row.find('.bp-mw-wrap');
      $mwWrap.find('.bp-mw-list').html(mwOpts);
    });
  }

  /**
   * Apply the current activeModuleFilters: fetch filtered records for each
   * module that has filter values set; clear filteredModuleRecords for modules
   * whose filters were removed.
   */
  function applyActiveFilters() {
    updateFilterBadge();
    beatPlanModulesList.forEach(function (mod) {
      var modFilters = activeModuleFilters[mod.api];
      if (!modFilters || Object.keys(modFilters).length === 0) {
        /* No active filters for this module – revert to full unfiltered list */
        delete filteredModuleRecords[mod.api];
        refreshMeetingWithRows(mod.api);
        return;
      }
      /* Build a ZOHO CRM criteria string: ((field:equals:val1)or(field:equals:val2))and((...)) */
      var fieldParts = [];
      Object.keys(modFilters).forEach(function (fieldApi) {
        var vals = modFilters[fieldApi];
        if (!vals || vals.length === 0) { return; }
        var orParts = vals.map(function (v) {
          return '(' + fieldApi + ':equals:' + v + ')';
        }).join('or');
        fieldParts.push('(' + orParts + ')');
      });
      if (fieldParts.length === 0) {
        delete filteredModuleRecords[mod.api];
        return;
      }
      var criteria = fieldParts.join('and');
      ZOHO.CRM.API.searchRecord({
        Entity:   mod.api,
        Type:     'criteria',
        Query:    criteria,
        page:     1,
        per_page: 200
      }).then(function (data) {
        if (data && data.data) {
          filteredModuleRecords[mod.api] = data.data.map(function (rec) {
            return {
              id:       rec.id,
              name:     recordDisplayName(rec),
              photo_id: rec['$photo_id'] || ''
            };
          });
        } else {
          filteredModuleRecords[mod.api] = [];
        }
        refreshMeetingWithRows(mod.api);
      }).catch(function () {
        filteredModuleRecords[mod.api] = [];
        refreshMeetingWithRows(mod.api);
      });
    });
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
    var HIDDEN_FIELD_LABELS = ['record status', 'currency', 'unsubscribed mode', 'attendance', 'leave type'];
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
    $('.sye-slot[data-slot="' + syeActiveSlot + '"] .sye-slot-clear').show();

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

  /* Clear a slot assignment from within the slot button */
  $(document).on('click keydown', '.sye-slot-clear', function (e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') { return; }
    e.stopPropagation();
    var $slot = $(this).closest('.sye-slot');
    var slotKey = $slot.data('slot');
    if (!slotKey) { return; }
    delete syeSlotAssignments[slotKey];
    $slot.find('.sye-slot-field').text('Choose field…');
    $(this).hide();
    /* Re-render picker list if it is currently open for this slot */
    if (syeActiveSlot === slotKey) { renderSyeFieldList(); }
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
    /* ── Show full-widget loader immediately ── */
    $('#widgetLoaderOverlay').show();

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

    /* ── Re-initialize the calendar in place so all components are rebuilt using
       the latest configuration fetched fresh from the API, without a hard reload ── */
    await reinitializeCalendar();
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
    /* ── Slot assignments (all slots, including left-border from BPR record) ── */
    var SLOT_RESTORE = {
      'bg-colour':     { labelField: 'beatplanner__Background_Colour_Field_Label_Name', apiField: 'beatplanner__Background_Colour_Field_Api_Name' },
      'marker':        { labelField: 'beatplanner__Marker_Field_Name',                  apiField: 'beatplanner__Marker_Field_API_Name' },
      'top-border':    { labelField: 'beatplanner__Top_Border_Field_Name',              apiField: 'beatplanner__Top_Border_Field_Api_Name' },
      'bottom-border': { labelField: 'beatplanner__Bottom_Border_Field_Name',           apiField: 'beatplanner__BottomBorder_Field_Api_Name' },
      'left-border':   { labelField: 'beatplanner__Left_Border_Field_Name',             apiField: 'beatplanner__Left_Border_Field_Api_Name' },
      'right-border':  { labelField: 'beatplanner__Right_Border_Field_Name',            apiField: 'beatplanner__Right_Border_Field_Api_Name' }
    };

    $.each(SLOT_RESTORE, function (slotKey, fields) {
      var api   = rec[fields.apiField]   || '';
      var label = rec[fields.labelField] || api;
      if (api) {
        syeSlotAssignments[slotKey] = { api_name: api, field_label: label };
        $('.sye-slot[data-slot="' + slotKey + '"] .sye-slot-field').text(label);
        $('.sye-slot[data-slot="' + slotKey + '"] .sye-slot-clear').show();
      }
    });

    /* ── Populate bprStyleConfig: single source of truth for chip styling ── */
    bprStyleConfig = {};
    $.each(SLOT_RESTORE, function (slotKey, fields) {
      var api = rec[fields.apiField] || '';
      if (api) { bprStyleConfig[slotKey] = api; }
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

    /* ── Show loader on every initialization (initial load, hard refresh,
       or post-save reload) so users never see a partially rendered UI ── */
    $('#widgetLoaderOverlay').show();
    try { sessionStorage.removeItem('bp_post_save_reload'); } catch (e) { /* ignore */ }

    /* ── Step 1: Get the logged-in user and populate #userProfile immediately ── */
    var currentUserResp = await ZOHO.CRM.CONFIG.getCurrentUser();
    console.log('Current user response', currentUserResp);
    var cuData = currentUserResp && currentUserResp.users && currentUserResp.users[0];
    if (cuData) {
      var cuNorm = normalizeUser(cuData);
      loggedInUserId = cuNorm.id || null;
      activeUserId   = loggedInUserId;
      userMap[cuNorm.id] = cuNorm;
      /* Determine if the logged-in user is an Administrator (profile.name check) */
      loggedInIsAdmin = !!(cuData.profile && cuData.profile.name === 'Administrator');
      $('.user-name').text(cuNorm.full_name || cuNorm.email || '');
      $('.user-avatar').html(buildAvatarInnerHtml(cuNorm));
    }

    /* ── Show loading state while the full hierarchy is being fetched ── */
    $('#udList').html('<div class="ud-empty">Loading users\u2026</div>');

    /* ── Step 2: Fetch all active users ── */
    var usersResp = await zrc.get('/crm/v8/users?type=ActiveConfirmedUsers');
    if (usersResp && usersResp.data && usersResp.data.users) {
      allUsers = usersResp.data.users;
    }
    buildUserMaps(); /* builds userMap and childrenMap from allUsers using Reporting_To */

    /* Fallback: if the logged-in user id was not found in the users list, match by email */
    if (cuData && loggedInUserId && !userMap[loggedInUserId]) {
      var emailToMatch = cuData.email;
      if (emailToMatch) {
        var emailMatch = allUsers.find(function (u) { return u.email === emailToMatch; });
        if (emailMatch) {
          loggedInUserId = emailMatch.id;
          activeUserId   = loggedInUserId;
        }
      }
    }

    /* Refresh the header profile now that userMap has the full ActiveConfirmedUsers data */
    if (loggedInUserId && userMap[loggedInUserId]) {
      var loggedUser = userMap[loggedInUserId];
      activeUserId = loggedInUserId;
      $('.user-name').text(loggedUser.full_name);
      $('.user-avatar').html(buildAvatarInnerHtml(loggedUser));
      /* Seed the profile button with the logged-in user's ID so record creation uses it */
      $('#userProfile').attr('data-userid', loggedInUserId);
    }

    /* ── Step 3: childrenMap is already built from Reporting_To in buildUserMaps() ── */

    /* ── Step 4: Render the hierarchy (removes loading placeholder).
       All nodes start collapsed; users expand branches manually. ── */
    renderUserTree('');

    /* ── Step 5: Fetch missing profile pictures in the background ── */
    fetchHierarchyUserPhotos().catch(function () {});

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

    /* ── Store beat plan state for use in openSlotPicker ── */
    beatPlanHasRefs = hasRecords;
    if (hasRecords && savedRec) {
      var bpModLabels = (savedRec['beatplanner__Meetings_For_Modules'] || '').split(',').filter(Boolean);
      var bpModApis   = (savedRec['beatplanner__Meetings_For_Apis']    || '').split(',').filter(Boolean);
      beatPlanModulesList = bpModLabels.map(function (label, i) {
        return { label: label.trim(), api: (bpModApis[i] || '').trim() };
      });

      /* Fetch all picklist fields from beatplanner__Beat_Plan_References metadata in the
         background so they are ready before the user first opens the slot picker. */
      await fetchBprPicklistFields().catch(function () { bprPicklistFields = []; });

      /* Restore style-slot preferences and apply BPR-driven chip styles immediately
         after picklist metadata is loaded, so bprStyleConfig is always set before
         any user interaction can trigger event rendering. */
      restorePreferences(savedRec);
      updateBgColourClass();
      applyBprChipStyles();

      /* Build the calendar event filter bar now that picklist metadata is available. */
      buildCalFilterBar();

      /* Pre-fetch picklist metadata for ALL modules so the Filter panel opens instantly. */
      fetchAllModulePicklistMeta();

      /* Pre-fetch all CRM records for ALL modules so the Meeting With dropdown
         is populated as soon as the user selects a Meetings For value. */
      fetchAllModuleRecords();
    }

    var response = await zrc.get('/crm/v8/settings/modules');
    console.log(response);
    populateMfModules(response);

    /* ── Render legends display strip from saved configuration ── */
    if (hasRecords && savedRec) {
      var savedLegApiNames  = (savedRec['beatplanner__Legends_Field_Api_Name']  || '').split(',').filter(Boolean);
      var savedMfModLabels  = (savedRec['beatplanner__Meetings_For_Modules']    || '').split(',').filter(Boolean);
      renderLegendsDisplay(savedLegApiNames, savedMfModLabels).catch(function (e) {
        console.error('Legend render error:', e);
      });
    }

    /* ── Load existing Daily Beat Plans after all initialization is complete.
       Store the reference record first so loadBeatPlanEvents() can use it during
       navigation / user-change reloads as well. ── */
    if (hasRecords && savedRec) {
      bpSavedRec = savedRec;
      await loadBeatPlanEvents();
    }

    /* ── Hide the loader only after all events have been rendered and every
       avatar attempt has settled – the calendar is now fully ready for interaction ── */
    $('#widgetLoaderOverlay').hide();
  });
  ZOHO.embeddedApp.init();

});
