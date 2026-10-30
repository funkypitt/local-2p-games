#!/usr/bin/env python3
"""Rebuild the WORD_DATA block of app.js (Word Clash, English) from frequency-ranked word lists.
French lives in wordclash-fr.js since 1.42: tools/build_wordclash_fr.py.

Sources
  French  : Plume's inventory (~/code/plume/data/inventaire_fr.tsv.gz = Lexique383 +
            LanguageTool forms with part-of-speech tags) — only nouns, adjectives,
            adverbs, infinitives and participles are kept, never conjugated forms
            like "menais" or "nieras".
  English : /usr/share/dict/american-english (lower-case entries only).
  Both    : the `wordfreq` package gives a Zipf frequency; rare words are dropped.
  tools/word_blocklist.json is applied last.

Usage
  python3 tools/build_words.py            # rewrite WORD_DATA in app.js
  python3 tools/build_words.py --report   # print statistics and samples, touch nothing

Needs: pip install wordfreq  (any venv; run the script with that interpreter).
"""
import gzip
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

from wordfreq import zipf_frequency

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app.js")
BLOCKLIST = os.path.join(ROOT, "tools", "word_blocklist.json")
INVENTAIRE = os.path.expanduser("~/code/plume/data/inventaire_fr.tsv.gz")
EN_DICT = "/usr/share/dict/american-english"

MIN_LEN, MAX_LEN = 3, 7
ZIPF_MIN = {"fr": 3.4, "en": 3.3}      # words rarer than this are dropped
ANCHOR_ZIPF = {"fr": 4.0, "en": 4.0}   # anchors must be everyday words
ANCHORS_PER_LANG = 40
MAX_WORDS = 220                        # per puzzle, after the anchor
# Valid as bonus words, but not what a casual game should put on the wheel.
ANCHOR_EXCLUDE = {"RACISTE", "RACISME", "INSULTE", "INSULTES", "VIOLEUR", "VIOLENT", "MEURTRE", "SUICIDE",
                  "KILLERS", "KILLING", "RACISTS", "SEXIEST", "TORTURE", "FUNERAL", "DISEASE"}

# Anchors already in the game: kept first when they still qualify.
LEGACY = {
    "en": ["PLASTER", "PLANETS", "SALTIER", "DETAILS", "BLASTED", "THREADS", "STRANGE",
           "PAINTER", "STORAGE", "TRAILED", "WANDERS", "READING", "MONSTER", "CRASHED"],
    "fr": ["PARTIES", "MARINES", "SARDINE", "ROUTINE", "CRAINTE", "PATINER", "DANSEUR",
           "TRAINEE", "POLICES", "SEMAINE", "ETOILES", "RAISONS", "REGAINS", "RAMONES",
           "TARDIVE", "CHARMES", "MONTERA", "ANCIENS"],
}


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def french_words():
    """upper-case ASCII word -> best zipf among its accented spellings."""
    out = {}
    with gzip.open(INVENTAIRE, "rt", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            word, tags = parts[0], parts[2]
            if not word.isalpha() or not word.islower():
                continue
            if not (MIN_LEN <= len(word) <= MAX_LEN):
                continue
            tag = tags.split("/")[0]
            # :N: noun, :A: adjective, :W: adverb, :V…:Y infinitive, :V…:Q participle
            ok = False
            if re.search(r":(N|A|W):", tag + ":") or tag.endswith(":N") or tag.endswith(":A") or tag.endswith(":W"):
                ok = True
            elif re.match(r":V", tag) and re.search(r":(Y|Q)(:|$)", tag):
                ok = True
            if not ok:
                continue
            ascii_w = strip_accents(word).upper()
            if not re.fullmatch(r"[A-Z]+", ascii_w):
                continue
            z = zipf_frequency(word, "fr")
            if z > out.get(ascii_w, 0):
                out[ascii_w] = z
    return {w: z for w, z in out.items() if z >= ZIPF_MIN["fr"]}


def english_words():
    out = {}
    with open(EN_DICT, encoding="utf-8") as f:
        for line in f:
            w = line.strip()
            if not re.fullmatch(r"[a-z]+", w) or not (MIN_LEN <= len(w) <= MAX_LEN):
                continue
            z = zipf_frequency(w, "en")
            if z >= ZIPF_MIN["en"]:
                out[w.upper()] = z
    return out


def apply_blocklist(words, lang):
    with open(BLOCKLIST, encoding="utf-8") as f:
        block = {w.upper() for w in json.load(f)[lang]}
    return {w: z for w, z in words.items() if w not in block}


def sub_anagrams(anchor, words):
    ac = Counter(anchor)
    res = []
    for w, z in words.items():
        if w == anchor:
            continue
        c = Counter(w)
        if all(ac[ch] >= n for ch, n in c.items()):
            res.append((w, z))
    return res


def pick_anchors(words, lang):
    cands = []
    for w, z in words.items():
        if len(w) != 7 or z < ANCHOR_ZIPF[lang] or w in ANCHOR_EXCLUDE:
            continue
        subs = sub_anagrams(w, words)
        by_len = Counter(len(s) for s, _ in subs)
        # enough material for a 7-word grid with choice left for bonus words
        if len(subs) < 30 or by_len[3] < 8 or by_len[4] < 8 or by_len[5] + by_len[6] < 4:
            continue
        cands.append((w, z, subs))
    legacy = [w for w in LEGACY[lang] if w in {c[0] for c in cands}]
    # richest first, but spread letters: at most 3 anchors sharing the same sorted letters prefix
    cands.sort(key=lambda c: -len(c[2]))
    chosen, seen_sets = [], Counter()
    for w in legacy:
        chosen.append(w)
        seen_sets["".join(sorted(w))] += 1
    for w, z, subs in cands:
        if len(chosen) >= ANCHORS_PER_LANG:
            break
        key = "".join(sorted(w))
        if w in chosen or seen_sets[key] >= 1:
            continue
        chosen.append(w)
        seen_sets[key] += 1
    puzzles = []
    for a in chosen:
        subs = sub_anagrams(a, words)
        subs.sort(key=lambda s: (-len(s[0]), -s[1], s[0]))   # long first, then most frequent
        puzzles.append({"anchor": a, "words": [a] + [s for s, _ in subs[:MAX_WORDS]]})
    return puzzles


def render(data):
    lines = ["const WORD_DATA = {"]
    for lang in ("en",):
        lines.append(f"  {lang}: [")
        for p in data[lang]:
            ws = ",".join(f"'{w}'" for w in p["words"])
            lines.append(f"    {{anchor:'{p['anchor']}',words:[{ws}]}},")
        lines.append("  ],")
    lines.append("};")
    return "\n".join(lines)


def main():
    report = "--report" in sys.argv
    lists = {"en": apply_blocklist(english_words(), "en")}
    data = {lang: pick_anchors(lists[lang], lang) for lang in ("en",)}
    for lang in ("en",):
        words = lists[lang]
        print(f"[{lang}] {len(words)} words kept (zipf >= {ZIPF_MIN[lang]}), {len(data[lang])} anchors", file=sys.stderr)
        if report:
            rare = sorted(words.items(), key=lambda kv: kv[1])[:40]
            print("  rarest kept:", " ".join(w for w, _ in rare), file=sys.stderr)
            for p in data[lang]:
                print(f"  {p['anchor']:8} {len(p['words']):3}  {' '.join(p['words'][1:13])}", file=sys.stderr)
    if report:
        return
    src = open(APP, encoding="utf-8").read()
    m = re.search(r"const WORD_DATA = \{[\s\S]*?\n\};", src)
    if not m:
        sys.exit("WORD_DATA not found in app.js")
    new = src[:m.start()] + render(data) + src[m.end():]
    open(APP, "w", encoding="utf-8").write(new)
    print("app.js updated", file=sys.stderr)


if __name__ == "__main__":
    main()
