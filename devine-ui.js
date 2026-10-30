// Devine-moi — board, keyboard (AZERTY, QWERTZ or QWERTY) and toasts. Shared with Funky's 2P Games.
// No sound and no game rules here: the host passes callbacks and plays its own sounds.
(function (root) {
  'use strict';
  const STATE_LABEL = { c: 'bien placée', p: 'mal placée', a: 'absente' };
  const reduceMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // '_' is a half-key spacer that centres a shorter row, as on a phone keyboard.
  const LAYOUTS = {
    azerty: [['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
             ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
             ['ENTER', 'W', 'X', 'C', 'V', 'B', 'N', 'BACK']],
    qwertz: [['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
             ['_', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '_'],
             ['ENTER', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK']],
    qwerty: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
             ['_', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '_'],
             ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK']],
  };
  const AZERTY = LAYOUTS.azerty;
  const BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9L3 12l6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9l-6 6M11 9l6 6"/></svg>';

  function createBoard(container, opts) {
    opts = opts || {};
    let len = opts.len || 5, rows = opts.rows || 6, timers = [];
    const el = document.createElement('div');
    el.className = 'dm-board';
    el.setAttribute('role', 'grid');
    container.appendChild(el);
    let rowEls = [], tiles = [];

    function build() {
      el.innerHTML = ''; rowEls = []; tiles = [];
      for (let r = 0; r < rows; r++) {
        const row = document.createElement('div');
        row.className = 'dm-row'; row.setAttribute('role', 'row');
        const rt = [];
        for (let i = 0; i < len; i++) {
          const t = document.createElement('div');
          t.className = 'dm-tile'; t.dataset.state = 'empty'; t.setAttribute('role', 'gridcell');
          t.innerHTML = '<span></span>';
          t.setAttribute('aria-label', `ligne ${r + 1}, lettre ${i + 1} : vide`);
          row.appendChild(t); rt.push(t);
        }
        el.appendChild(row); rowEls.push(row); tiles.push(rt);
      }
    }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function label(r, i, ch, st) {
      tiles[r][i].setAttribute('aria-label', `ligne ${r + 1}, lettre ${i + 1} : ` + (ch ? ch + (st ? ', ' + STATE_LABEL[st] : '') : 'vide'));
    }
    function setRow(r, letters) {
      const prev = tiles[r].filter(t => t.dataset.state === 'filled').length;
      for (let i = 0; i < len; i++) {
        const t = tiles[r][i], ch = letters[i] || '';
        t.firstChild.textContent = ch;
        t.dataset.state = ch ? 'filled' : 'empty';
        label(r, i, ch);
      }
      if (letters.length > prev && letters.length > 0 && !reduceMotion()) {
        const t = tiles[r][letters.length - 1];
        t.classList.remove('dm-pop'); void t.offsetWidth; t.classList.add('dm-pop');
      }
    }
    // Show a finished row without animation (restoring a saved game).
    function paintRow(r, letters, evals) {
      for (let i = 0; i < len; i++) {
        const t = tiles[r][i];
        t.firstChild.textContent = letters[i]; t.dataset.state = evals[i]; label(r, i, letters[i], evals[i]);
      }
    }
    function revealRow(r, evals, cb) {
      cb = cb || {};
      const rm = reduceMotion(), step = rm ? 90 : 140, half = rm ? 0 : 210;
      for (let i = 0; i < len; i++) {
        const t = tiles[r][i];
        later(() => {
          if (cb.onTileStart) cb.onTileStart(i);
          if (!rm) { t.classList.remove('dm-flip-in'); t.classList.add('dm-flip-out'); }
          later(() => {
            t.classList.remove('dm-flip-out');
            t.dataset.state = evals[i]; label(r, i, t.textContent, evals[i]);
            if (!rm) t.classList.add('dm-flip-in');
            if (cb.onTile) cb.onTile(i, evals[i]);
          }, half);
        }, i * step);
      }
      later(() => { tiles[r].forEach(t => t.classList.remove('dm-flip-in')); if (cb.onDone) cb.onDone(); },
            (len - 1) * step + 2 * half + 30);
    }
    function shakeRow(r) {
      const row = rowEls[r]; if (!row) return;
      row.classList.remove('dm-shake'); void row.offsetWidth; row.classList.add('dm-shake');
      later(() => row.classList.remove('dm-shake'), 420);
    }
    function bounceRow(r, cb) {
      cb = cb || {};
      if (reduceMotion()) { later(() => cb.onDone && cb.onDone(), 300); return; }
      tiles[r].forEach((t, i) => later(() => { t.classList.add('dm-bounce'); later(() => t.classList.remove('dm-bounce'), 520); }, 250 + i * 80));
      later(() => cb.onDone && cb.onDone(), 250 + len * 80 + 520);
    }
    function markRow(r, color) {
      rowEls.forEach(x => x.classList.remove('dm-marked'));
      if (r == null || !rowEls[r]) return;
      rowEls[r].style.setProperty('--row-mark', color); rowEls[r].classList.add('dm-marked');
    }
    // 2-player duel: a lasting dot in the colour of the player who played the row
    function ownRow(r, color) { if (!rowEls[r]) return; rowEls[r].style.setProperty('--row-owner', color); rowEls[r].classList.add('dm-owned'); }
    function rowElement(r) { return rowEls[r]; }
    function fit(maxW, maxH, maxTile) {
      const g = 6;
      const t = Math.floor(Math.max(30, Math.min((maxW - g * (len - 1)) / len, (maxH - g * (rows - 1)) / rows, maxTile || 64)));
      el.style.setProperty('--tile', t + 'px');
      return t;
    }
    function reset(newLen, newRows) { clearTimers(); len = newLen || len; rows = newRows || rows; build(); }
    function destroy() { clearTimers(); el.remove(); }
    build();
    return { el, setRow, paintRow, revealRow, shakeRow, bounceRow, markRow, ownRow, rowElement, fit, reset, destroy,
             get len() { return len; }, get rows() { return rows; } };
  }

  function createKeyboard(container, opts) {
    const el = document.createElement('div');
    el.className = 'dm-kbd';
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Clavier');
    let keys = {}, states = {}, layout = LAYOUTS[opts.layout] ? opts.layout : 'azerty';
    function build() {
      el.innerHTML = ''; keys = {};
      LAYOUTS[layout].forEach(row => {
        const r = document.createElement('div'); r.className = 'dm-kbd-row';
        row.forEach(k => {
          if (k === '_') { const sp = document.createElement('span'); sp.className = 'dm-key-half'; r.appendChild(sp); return; }
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'dm-key'; b.dataset.key = k;
          if (k === 'ENTER') { b.classList.add('dm-wide'); b.textContent = opts.enterLabel || 'Entrée'; }
          else if (k === 'BACK') { b.classList.add('dm-wide'); b.innerHTML = BACK_SVG; b.setAttribute('aria-label', 'Effacer'); }
          else b.textContent = k;
          if (states[k]) b.dataset.state = states[k];
          r.appendChild(b); keys[k] = b;
        });
        el.appendChild(r);
      });
    }
    build();
    // pointerdown reacts faster than click; click still handles keyboard activation (Enter/Space on focus)
    let lastPointer = 0;
    function fire(k) {
      if (el.classList.contains('dm-off')) return;
      if (k === 'ENTER') opts.onEnter && opts.onEnter();
      else if (k === 'BACK') opts.onBackspace && opts.onBackspace();
      else opts.onKey && opts.onKey(k);
    }
    el.addEventListener('pointerdown', e => {
      const b = e.target.closest('.dm-key'); if (!b) return;
      e.preventDefault(); lastPointer = Date.now(); fire(b.dataset.key);
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('.dm-key'); if (!b || Date.now() - lastPointer < 600) return;
      fire(b.dataset.key);
    });
    container.appendChild(el);
    return {
      el,
      setStates(st) { states = Object.assign({}, st); for (const k in keys) { if (k.length === 1) { if (st[k]) keys[k].dataset.state = st[k]; else delete keys[k].dataset.state; } } },
      setLayout(name) { if (LAYOUTS[name] && name !== layout) { layout = name; build(); } },
      get layout() { return layout; },
      setEnabled(on) { el.classList.toggle('dm-off', !on); },
      setAccent(color) { if (color) el.style.setProperty('--dm-accent', color); else el.style.removeProperty('--dm-accent'); },
      flash(k) { const b = keys[k]; if (!b) return; b.classList.add('dm-down'); setTimeout(() => b.classList.remove('dm-down'), 90); },
      destroy() { el.remove(); },
    };
  }

  function toast(container, text, ms) {
    let host = container.querySelector(':scope > .dm-toasts');
    if (!host) {
      host = document.createElement('div'); host.className = 'dm-toasts';
      host.setAttribute('aria-live', 'polite'); host.setAttribute('role', 'status');
      container.appendChild(host);
    }
    // a new message replaces the previous ones at once
    [...host.children].forEach(c => { c.classList.add('dm-out'); setTimeout(() => c.remove(), 200); });
    const t = document.createElement('div'); t.className = 'dm-toast'; t.textContent = text;
    host.appendChild(t);
    setTimeout(() => { t.classList.add('dm-out'); setTimeout(() => t.remove(), 320); }, ms || 1400);
    return t;
  }

  root.DevineUI = { createBoard, createKeyboard, toast, LAYOUTS, AZERTY };
}(typeof self !== 'undefined' ? self : this));
