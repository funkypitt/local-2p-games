// Devine-moi — pure game logic, shared by the Devine-moi app and Funky's 2P Games.
// No DOM. Works as a browser global (window.DevineCore) and as a Node module (tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DevineCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Same rule as tools/build_words.py norm(): fold accents and ligatures, upper-case, A-Z only.
  function norm(s) {
    s = String(s).replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE');
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    return /^[A-Z]+$/.test(s) ? s : '';
  }

  // Two passes: greens first, then yellows counted against the letters still unused in the answer.
  // 'c' = correct (green), 'p' = present (yellow), 'a' = absent (grey).
  function evaluate(guess, answer) {
    const n = answer.length, res = new Array(n).fill('a'), left = {};
    for (let i = 0; i < n; i++) {
      if (guess[i] === answer[i]) res[i] = 'c';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (res[i] === 'c') continue;
      const ch = guess[i];
      if (left[ch] > 0) { res[i] = 'p'; left[ch]--; }
    }
    return res;
  }

  function isWin(evals) { return evals.length > 0 && evals.every(e => e === 'c'); }

  const RANK = { a: 0, p: 1, c: 2 };
  function keyboardStates(guesses, evals) {
    const st = {};
    guesses.forEach((g, r) => {
      for (let i = 0; i < g.length; i++) {
        const s = evals[r][i], prev = st[g[i]];
        if (prev === undefined || RANK[s] > RANK[prev]) st[g[i]] = s;
      }
    });
    return st;
  }

  // Hard mode: every green stays in place, every yellow is reused.
  function hardModeViolation(guess, guesses, evals) {
    for (let r = 0; r < guesses.length; r++) {
      for (let i = 0; i < guesses[r].length; i++) {
        if (evals[r][i] === 'c' && guess[i] !== guesses[r][i])
          return `La ${i === 0 ? '1re' : (i + 1) + 'e'} lettre doit être ${guesses[r][i]}`;
      }
    }
    for (let r = 0; r < guesses.length; r++) {
      const need = {};
      for (let i = 0; i < guesses[r].length; i++)
        if (evals[r][i] !== 'a') need[guesses[r][i]] = (need[guesses[r][i]] || 0) + 1;
      for (const ch in need) {
        let have = 0;
        for (const x of guess) if (x === ch) have++;
        if (have < need[ch]) return `Le mot doit contenir ${ch}`;
      }
    }
    return null;
  }

  // Whole days between local midnights; Math.round absorbs the 23 h / 25 h days of DST changes.
  function localMidnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
  function dayIndex(date, epochISO) {
    return Math.round((localMidnight(date) - parseISO(epochISO)) / 86400000);
  }
  function dateOfIndex(i, epochISO) { const d = parseISO(epochISO); d.setDate(d.getDate() + i); return d; }
  function nextMidnightMs(date) {
    const n = localMidnight(date); n.setDate(n.getDate() + 1);
    return n - date;
  }

  // words = window.DEVINE_WORDS; strings are split into arrays/sets once.
  function prepare(words) {
    if (words._ready) return words;
    for (const k of Object.keys(words)) {
      const w = words[k];
      if (!w || typeof w !== 'object' || typeof w.answers !== 'string') continue;
      w.answersArr = w.answers.split(' ');
      w.displayArr = w.display.split(' ');
      w.allowedSet = new Set(w.allowed.split(' '));
      for (const a of w.answersArr) w.allowedSet.add(a);
      w.displayOf = new Map(w.answersArr.map((a, i) => [a, w.displayArr[i]]));
    }
    Object.defineProperty(words, '_ready', { value: true });
    return words;
  }
  function mod(i, n) { return ((i % n) + n) % n; }
  function dailyAnswer(words, len, i) { const w = prepare(words)[len]; return w.answersArr[mod(i, w.answersArr.length)]; }
  function displayWord(words, len, ascii) { return prepare(words)[len].displayOf.get(ascii) || ascii; }
  function isAllowed(words, len, ascii) { return prepare(words)[len].allowedSet.has(ascii); }
  function randomAnswer(words, len, rng, avoid) {
    const arr = prepare(words)[len].answersArr;
    for (let t = 0; t < 50; t++) {
      const w = arr[Math.floor((rng || Math.random)() * arr.length)];
      if (!avoid || !avoid.has(w)) return w;
    }
    return arr[Math.floor((rng || Math.random)() * arr.length)];
  }

  const EMOJI = { c: '🟩', p: '🟨', a: '⬛' }, EMOJI_HC = { c: '🟧', p: '🟦', a: '⬛' };
  function shareText({ dayIndex, evals, won, hard, contrast, appName }) {
    const e = contrast ? EMOJI_HC : EMOJI;
    const score = (won ? evals.length : 'X') + '/6' + (hard ? '*' : '');
    const grid = evals.map(row => row.map(s => e[s]).join('')).join('\n');
    return `${appName || 'Devine-moi'} n°${dayIndex + 1} ${score}\n\n${grid}`;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 2-player duel: 2 points per position turned green for the first time, 1 point per letter
  // shown yellow for the first time (a letter never seen yellow or green before, in earlier rows
  // or earlier in this row). The +5 for finding the word is added by the caller (isWin).
  function scoreGuess(evals, prevEvals, guess, prevGuesses) {
    const greenPos = new Set(), seen = new Set();
    prevGuesses.forEach((g, r) => {
      for (let i = 0; i < g.length; i++) {
        if (prevEvals[r][i] === 'c') greenPos.add(i);
        if (prevEvals[r][i] !== 'a') seen.add(g[i]);
      }
    });
    let green = 0, yellow = 0;
    for (let i = 0; i < guess.length; i++) {
      if (evals[i] === 'c' && !greenPos.has(i)) green++;
      if (evals[i] !== 'a') {
        if (evals[i] === 'p' && !seen.has(guess[i])) yellow++;
        seen.add(guess[i]);
      }
    }
    const win = isWin(evals);
    return { green, yellow, win, points: 2 * green + yellow + (win ? 5 : 0) };
  }

  // Keyboard layout a phone shows for a locale. French-speaking Switzerland types on QWERTZ,
  // France and Belgium on AZERTY, Quebec on QWERTY.
  const QWERTZ_LANGS = new Set(['de', 'cs', 'sk', 'hu', 'sl', 'hr', 'bs', 'sq', 'lb', 'rm', 'gsw']);
  function keyboardLayoutFor(locale) {
    const parts = String(locale || '').replace('_', '-').toLowerCase().split('-');
    const lang = parts[0], region = parts.find((x, i) => i > 0 && x.length === 2) || '';
    if (region === 'ch' || region === 'li' || QWERTZ_LANGS.has(lang)) return 'qwertz';
    if (lang === 'fr' && region !== 'ca') return 'azerty';
    return 'qwerty';
  }

  return { keyboardLayoutFor, norm, evaluate, isWin, keyboardStates, hardModeViolation, dayIndex, dateOfIndex,
           nextMidnightMs, prepare, dailyAnswer, displayWord, isAllowed, randomAnswer, shareText,
           mulberry32, scoreGuess };
}));
