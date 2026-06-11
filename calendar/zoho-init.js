/* ============================================================
   zoho-init.js – Zoho CRM Widget Initialization
   Handles: PageLoad event, Beat Plan References data check,
            Settings icon visibility, Meetings For multi-select
   ============================================================ */

(function ($) {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     STATE
  ────────────────────────────────────────────────────────── */
  var mfState = {
    allOptions:      [],   // { value, label } – populated from ZOHO modules
    selectedValues:  [],   // currently committed selection
    pendingValues:   [],   // selection in progress (before Done)
    filterQuery:     ''
  };

  /* ──────────────────────────────────────────────────────────
     DOM HELPERS
  ────────────────────────────────────────────────────────── */
  function $settingsBtn()   { return $('#settingsIconBtn'); }
  function $settingsPanel() { return $('#settingsPanel'); }
  function $mfField()       { return $('#mfField'); }
  function $mfDropdown()    { return $('#mfDropdown'); }
  function $mfList()        { return $('#mfList'); }
  function $mfSearch()      { return $('#mfSearch'); }
  function $mfSelectedText(){ return $('#mfSelectedText'); }

  /* ──────────────────────────────────────────────────────────
     SETTINGS PANEL – open / close
  ────────────────────────────────────────────────────────── */
  function openSettingsPanel() {
    $settingsPanel().show();
    $settingsBtn().addClass('settings-active').attr('aria-expanded', 'true');
    closeMfDropdown();  // ensure dropdown closed when panel opens
  }

  function closeSettingsPanel() {
    $settingsPanel().hide();
    $settingsBtn().removeClass('settings-active').attr('aria-expanded', 'false');
    closeMfDropdown();
  }

  function toggleSettingsPanel() {
    if ($settingsPanel().is(':visible')) {
      closeSettingsPanel();
    } else {
      openSettingsPanel();
    }
  }

  /* ──────────────────────────────────────────────────────────
     MEETINGS FOR – MULTI-SELECT DROPDOWN
  ────────────────────────────────────────────────────────── */

  /** Open the dropdown and sync pending values to current committed selection */
  function openMfDropdown() {
    mfState.pendingValues = mfState.selectedValues.slice();
    mfState.filterQuery   = '';
    $mfSearch().val('');
    renderMfOptions();
    $mfDropdown().addClass('mf-dropdown-open');
    $mfField().addClass('mf-open');
    $mfField().attr('aria-expanded', 'true');
    setTimeout(function () { $mfSearch().focus(); }, 60);
  }

  function closeMfDropdown() {
    $mfDropdown().removeClass('mf-dropdown-open');
    $mfField().removeClass('mf-open');
    $mfField().attr('aria-expanded', 'false');
  }

  /** Render the option list, respecting the current search filter */
  function renderMfOptions() {
    var q = mfState.filterQuery.toLowerCase().trim();
    var items = q
      ? mfState.allOptions.filter(function (o) {
          return o.label.toLowerCase().indexOf(q) !== -1;
        })
      : mfState.allOptions;

    if (items.length === 0) {
      $mfList().html('<div class="mf-list-empty">No modules found.</div>');
      return;
    }

    var html = '';
    items.forEach(function (opt) {
      var isSelected = mfState.pendingValues.indexOf(opt.value) !== -1;
      html += '<div class="mf-option' + (isSelected ? ' mf-option-selected' : '') + '" data-val="' + escHtml(opt.value) + '">' +
              '  <span class="mf-option-check"></span>' +
              '  <span class="mf-option-label">' + escHtml(opt.label) + '</span>' +
              '</div>';
    });
    $mfList().html(html);
  }

  /** Update the field trigger text to reflect committed selectedValues */
  function updateMfFieldText() {
    var $field = $mfField();
    var $text  = $mfSelectedText();
    if (mfState.selectedValues.length === 0) {
      $text.text('');
      $field.removeClass('mf-has-value');
    } else {
      var labels = mfState.selectedValues.map(function (v) {
        var opt = mfState.allOptions.find(function (o) { return o.value === v; });
        return opt ? opt.label : v;
      });
      $text.text(labels.join(', '));
      $field.addClass('mf-has-value');
    }
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Populate options from a list of Zoho module objects */
  function populateMfOptions(modules) {
    mfState.allOptions = (modules || []).map(function (m) {
      return {
        value: m.api_name || m.module_name || m.singular_label,
        label: m.plural_label || m.singular_label || m.api_name || m.module_name
      };
    }).filter(function (o) { return o.value && o.label; });
    updateMfFieldText();
  }

  /* ──────────────────────────────────────────────────────────
     EVENT BINDINGS (run once DOM is ready)
  ────────────────────────────────────────────────────────── */
  function bindEvents() {
    /* Settings icon click */
    $(document).on('click', '#settingsIconBtn', function (e) {
      e.stopPropagation();
      toggleSettingsPanel();
    });

    /* Close settings panel close button */
    $(document).on('click', '#settingsPanelClose', function () {
      closeSettingsPanel();
    });

    /* Close settings panel when clicking outside */
    $(document).on('click.settingsPanel', function (e) {
      if ($settingsPanel().is(':visible') &&
          !$(e.target).closest('#settingsPanel').length &&
          !$(e.target).closest('#settingsIconBtn').length) {
        closeSettingsPanel();
      }
    });

    /* Open / toggle the Meetings For dropdown when clicking the field */
    $(document).on('click', '#mfField', function (e) {
      e.stopPropagation();
      if ($mfDropdown().hasClass('mf-dropdown-open')) {
        closeMfDropdown();
      } else {
        openMfDropdown();
      }
    });

    /* Keyboard: open on Enter/Space */
    $(document).on('keydown', '#mfField', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!$mfDropdown().hasClass('mf-dropdown-open')) {
          openMfDropdown();
        }
      }
    });

    /* Stop click bubbling inside the dropdown (so panel stays open) */
    $(document).on('click', '#mfDropdown', function (e) {
      e.stopPropagation();
    });

    /* Live search */
    $(document).on('input', '#mfSearch', function () {
      mfState.filterQuery = $(this).val();
      renderMfOptions();
    });

    /* Toggle individual option */
    $(document).on('click', '#mfList .mf-option', function () {
      var val = $(this).data('val');
      var idx = mfState.pendingValues.indexOf(val);
      if (idx === -1) {
        mfState.pendingValues.push(val);
      } else {
        mfState.pendingValues.splice(idx, 1);
      }
      renderMfOptions();
    });

    /* Select All */
    $(document).on('click', '#mfSelectAll', function (e) {
      e.stopPropagation();
      var q = mfState.filterQuery.toLowerCase().trim();
      var visible = q
        ? mfState.allOptions.filter(function (o) {
            return o.label.toLowerCase().indexOf(q) !== -1;
          })
        : mfState.allOptions;
      visible.forEach(function (o) {
        if (mfState.pendingValues.indexOf(o.value) === -1) {
          mfState.pendingValues.push(o.value);
        }
      });
      renderMfOptions();
    });

    /* Clear All */
    $(document).on('click', '#mfClearAll', function (e) {
      e.stopPropagation();
      var q = mfState.filterQuery.toLowerCase().trim();
      if (q) {
        /* Only clear items visible in current search */
        var visibleValues = mfState.allOptions
          .filter(function (o) { return o.label.toLowerCase().indexOf(q) !== -1; })
          .map(function (o) { return o.value; });
        mfState.pendingValues = mfState.pendingValues.filter(function (v) {
          return visibleValues.indexOf(v) === -1;
        });
      } else {
        mfState.pendingValues = [];
      }
      renderMfOptions();
    });

    /* Done – commit pending selection */
    $(document).on('click', '#mfDone', function (e) {
      e.stopPropagation();
      mfState.selectedValues = mfState.pendingValues.slice();
      updateMfFieldText();
      closeMfDropdown();
    });

    /* Cancel – discard pending selection */
    $(document).on('click', '#mfCancel', function (e) {
      e.stopPropagation();
      mfState.pendingValues = mfState.selectedValues.slice();
      closeMfDropdown();
    });
  }

  /* ──────────────────────────────────────────────────────────
     ZOHO PAGELOAD INITIALIZATION
  ────────────────────────────────────────────────────────── */
  function initZohoWidget(pageData) {
    console.log('[CalWidget] PageLoad data:', pageData);

    ZOHO.CRM.API.getAllRecords({
      Entity:     'beatplanner__Beat_Plan_References',
      sort_order: 'asc',
      per_page:   2,
      page:       1
    }).then(function (data) {
      console.log('[CalWidget] Beat_Plan_References data:', data);

      var records = (data && data.data) ? data.data : [];

      if (!records || records.length === 0) {
        /* ── Scenario A: No data ── */
        $settingsBtn().hide();

        ZOHO.CRM.META.getModules().then(function (moduleData) {
          console.log('[CalWidget] Modules metadata:', moduleData);
          /* Modules loaded but settings icon stays hidden –
             Meetings For filter is not shown */
        });

      } else {
        /* ── Scenario B: Data exists ── */
        $settingsBtn().show();

        /* Pre-populate Meetings For dropdown with module metadata */
        ZOHO.CRM.META.getModules().then(function (moduleData) {
          console.log('[CalWidget] Modules metadata:', moduleData);
          var modules = (moduleData && moduleData.modules) ? moduleData.modules : [];
          populateMfOptions(modules);
        });
      }
    });
  }

  /* ──────────────────────────────────────────────────────────
     ENTRY POINT
  ────────────────────────────────────────────────────────── */
  $(function () {
    bindEvents();

    /* Guard: only run Zoho init when the SDK is available */
    if (typeof ZOHO !== 'undefined' && ZOHO.embeddedApp) {
      ZOHO.embeddedApp.on('PageLoad', function (data) {
        initZohoWidget(data);
      });
      ZOHO.embeddedApp.init();
    } else {
      /* Development / preview mode: SDK not loaded – keep settings icon hidden */
      console.warn('[CalWidget] ZOHO SDK not available. Running in preview mode.');
    }
  });

}(jQuery));
