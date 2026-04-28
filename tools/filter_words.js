#!/usr/bin/env node
/**
 * filter_words.js — Remove blocked words from WORD_DATA in app.js
 *
 * Usage:  node tools/filter_words.js [--dry-run]
 *
 * Reads tools/word_blocklist.json and removes those words from the
 * WORD_DATA constant embedded in app.js. Also removes any word that
 * appears as an anchor (anchors are never blocked, only sub-words).
 *
 * --dry-run   Show what would be removed without modifying app.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app.js');
const BLOCKLIST = path.join(ROOT, 'tools', 'word_blocklist.json');
const dryRun = process.argv.includes('--dry-run');

// Load blocklist
const block = JSON.parse(fs.readFileSync(BLOCKLIST, 'utf8'));
const enBlock = new Set(block.en.map(w => w.toUpperCase()));
const frBlock = new Set(block.fr.map(w => w.toUpperCase()));

// Extract WORD_DATA from app.js
const src = fs.readFileSync(APP, 'utf8');
const dataMatch = src.match(/const WORD_DATA = \{[\s\S]*?\n\};/);
if (!dataMatch) { console.error('Could not find WORD_DATA in app.js'); process.exit(1); }

const fn = new Function(dataMatch[0] + '; return WORD_DATA;');
const WD = fn();

let totalRemoved = 0;

for (const lang of ['en', 'fr']) {
  const blockSet = lang === 'en' ? enBlock : frBlock;
  console.log(`\n=== ${lang.toUpperCase()} ===`);
  for (const entry of WD[lang]) {
    const before = entry.words.length;
    const removed = entry.words.filter(w => blockSet.has(w) && w !== entry.anchor);
    entry.words = entry.words.filter(w => !blockSet.has(w) || w === entry.anchor);
    if (removed.length > 0) {
      console.log(`  ${entry.anchor}: removed ${removed.length} words: ${removed.join(', ')}`);
      totalRemoved += removed.length;
    }
  }
}

console.log(`\nTotal removed: ${totalRemoved} words`);

if (dryRun) {
  console.log('\n(Dry run — no changes written)');
  process.exit(0);
}

// Rebuild the WORD_DATA string
let dataStr = 'const WORD_DATA = {\n';
for (const lang of ['en', 'fr']) {
  dataStr += `  ${lang}: [\n`;
  WD[lang].forEach((entry, idx) => {
    dataStr += `    {anchor:'${entry.anchor}',words:[${entry.words.map(w => "'" + w + "'").join(',')}]}`;
    dataStr += idx < WD[lang].length - 1 ? ',\n' : '\n';
  });
  dataStr += `  ]${lang === 'en' ? ',' : ''}\n`;
}
dataStr += '};';

// Replace in app.js
const newSrc = src.replace(dataMatch[0], dataStr);
fs.writeFileSync(APP, newSrc);
console.log('\napp.js updated successfully.');
console.log('Remember to: cp app.js www/app.js');
