/* ============================================================
   Multi-Select Dropdown Component  |  script.js
   ============================================================ */

(function () {
  'use strict';

  /* ── Configuration ───────────────────────────────────────────
     Add or remove items here when requirements are provided.
     ─────────────────────────────────────────────────────────── */
  const OPTIONS = [];   // options will be provided later

  /* ── DOM references ──────────────────────────────────────────*/
  const wrap      = document.getElementById('msWrap');
  const field     = document.getElementById('msDisplay');
  const chipsEl   = document.getElementById('msChips');
  const dropdown  = document.getElementById('msDropdown');
  const optionsEl = document.getElementById('msOptions');
  const selectAll = document.getElementById('msSelectAll');
  const clearAll  = document.getElementById('msClearAll');

  /* ── Build option elements ───────────────────────────────────*/
  OPTIONS.forEach(value => {
    const label = document.createElement('label');
    label.className = 'ms-option';

    const cb = document.createElement('input');
    cb.type  = 'checkbox';
    cb.value = value;
    cb.addEventListener('change', onCheckboxChange);

    label.appendChild(cb);
    label.appendChild(document.createTextNode(value));
    optionsEl.appendChild(label);
  });

  function allCheckboxes() {
    return Array.from(optionsEl.querySelectorAll('input[type="checkbox"]'));
  }

  /* ── State helpers ───────────────────────────────────────────*/
  function openDropdown() {
    dropdown.hidden = false;
    field.classList.add('is-open');
    field.setAttribute('aria-expanded', 'true');
    wrap.classList.add('is-focused');
  }

  function closeDropdown() {
    dropdown.hidden = true;
    field.classList.remove('is-open');
    field.setAttribute('aria-expanded', 'false');
    /* Only remove focus class if no value is selected */
    if (!hasSelection()) {
      wrap.classList.remove('is-focused');
    }
  }

  function isOpen() {
    return !dropdown.hidden;
  }

  function hasSelection() {
    return allCheckboxes().some(cb => cb.checked);
  }

  /* ── Chip rendering ──────────────────────────────────────────*/
  function refreshChips() {
    chipsEl.innerHTML = '';

    const selected = allCheckboxes().filter(cb => cb.checked);

    selected.forEach(cb => {
      const chip = document.createElement('span');
      chip.className = 'ms-chip';
      chip.textContent = cb.value;

      const removeBtn = document.createElement('button');
      removeBtn.type      = 'button';
      removeBtn.className = 'ms-chip-remove';
      removeBtn.setAttribute('aria-label', 'Remove ' + cb.value);
      removeBtn.textContent = '×';
      removeBtn.dataset.value = cb.value;
      chip.appendChild(removeBtn);

      chipsEl.appendChild(chip);
    });

    /* Toggle label float state */
    wrap.classList.toggle('has-value', selected.length > 0);
  }

  /* ── Chip remove via event delegation ────────────────────────*/
  chipsEl.addEventListener('click', e => {
    const btn = e.target.closest('.ms-chip-remove');
    if (!btn) return;
    e.stopPropagation();

    const cb = allCheckboxes().find(c => c.value === btn.dataset.value);
    if (cb) {
      cb.checked = false;
      refreshChips();
    }
  });

  /* ── Checkbox change ─────────────────────────────────────────*/
  function onCheckboxChange() {
    refreshChips();
  }

  /* ── Select All ──────────────────────────────────────────────*/
  selectAll.addEventListener('click', () => {
    allCheckboxes().forEach(cb => { cb.checked = true; });
    refreshChips();
  });

  /* ── Clear All ───────────────────────────────────────────────*/
  clearAll.addEventListener('click', () => {
    allCheckboxes().forEach(cb => { cb.checked = false; });
    refreshChips();
  });

  /* ── Toggle on field click ───────────────────────────────────*/
  field.addEventListener('click', e => {
    if (e.target.closest('.ms-chip-remove')) return;
    isOpen() ? closeDropdown() : openDropdown();
  });

  /* ── Focus: float the label ──────────────────────────────────*/
  field.addEventListener('focus', () => {
    wrap.classList.add('is-focused');
  });

  /* ── Blur: use relatedTarget to avoid closing when clicking
         inside the dropdown ────────────────────────────────────*/
  field.addEventListener('blur', e => {
    if (wrap.contains(e.relatedTarget)) return;
    closeDropdown();
  });

  /* ── Keyboard support ────────────────────────────────────────*/
  field.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      isOpen() ? closeDropdown() : openDropdown();
    }
    if (e.key === 'Escape') {
      closeDropdown();
      field.focus();
    }
  });

  /* ── Close when clicking outside the component ───────────────*/
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) {
      closeDropdown();
    }
  });

})();
