#!/usr/bin/env python3
"""Generate improved French word data for Word Clash and Wheel of Funktune
from the shared lexique.db (jeux-du-jour project).

Outputs JSON to stdout:
  {
    "wordClash": [ {anchor, words}, ... ],
    "wofWords": [ ... ]
  }
"""
import json
import sqlite3
import sys
from collections import Counter

LEXIQUE = "/home/freedomfighter/code/jeux-du-jour/app/src/main/assets/databases/lexique.db"

# Hand-picked anchors: 7-letter common French words with rich sub-anagram potential
# (letters that produce many short words, no rare letters like W/K/Z).
ANCHORS = [
    "PARTIES", "MARINES", "SARDINE", "ROUTINE", "CRAINTE", "PATINER",
    "DANSEUR", "TRAINEE", "POLICES", "SEMAINE", "TENDRES", "ETOILES",
    "RAISONS", "REGAINS", "RAMONES", "TARDIVE", "CHARMES", "MONTERA",
    "PRESENT", "ANCIENS",
]


def load_common_words(conn):
    """Return dict of upper-case word -> frequency for words 3-7 letters,
    excluding accented forms and conjugated verb stems we don't want.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT letters_ascii, frequency
        FROM words
        WHERE letter_count BETWEEN 3 AND 7
          AND ortho = letters_ascii
          AND is_common = 1
          AND letters_ascii GLOB '[a-z]*'
        """
    )
    out = {}
    for ortho, freq in cur:
        ortho = ortho.upper()
        if not ortho.isalpha():
            continue
        if any(c in ortho for c in "WKQZ" if c not in {"K", "W"}):
            pass
        prev = out.get(ortho, 0)
        if freq > prev:
            out[ortho] = freq
    return out


def is_subanagram(word, anchor_counter):
    c = Counter(word)
    for ch, n in c.items():
        if anchor_counter.get(ch, 0) < n:
            return False
    return True


def build_clash_puzzles(common):
    puzzles = []
    keys_by_len = {}
    for w in common:
        keys_by_len.setdefault(len(w), []).append(w)

    for anchor in ANCHORS:
        if anchor not in common:
            print(f"# anchor not common: {anchor}", file=sys.stderr)
        ac = Counter(anchor)
        words = []
        for L in range(3, 8):
            for w in keys_by_len.get(L, ()):
                if w == anchor:
                    continue
                if is_subanagram(w, ac):
                    words.append(w)
        # ensure anchor is always first
        words.sort(key=lambda w: (-len(w), w))
        words = [anchor] + words
        # dedupe while preserving order
        seen = set()
        uniq = []
        for w in words:
            if w not in seen:
                seen.add(w)
                uniq.append(w)
        # Cap to keep file size reasonable (anchor + up to 200 sub-words)
        uniq = uniq[:200]
        if len(uniq) >= 25:
            puzzles.append({"anchor": anchor, "words": uniq})
    return puzzles


STOPLIST = {
    "PUTAIN", "PUTAINS", "MERDES", "MERDE", "CONNES", "CONNARD",
    "CONNARDS", "CONNERIE", "CONNERIES",
    "DOCTORESSE", "AGENTE", "AVOCATES", "PARENTES", "PATRONNE",
}


def build_wof_words(conn):
    """Common French nouns 6-10 letters, no accents, top-frequency, deduped.
    Aim for ~120 words.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT letters_ascii, frequency, cgram
        FROM words
        WHERE letter_count BETWEEN 6 AND 10
          AND ortho = letters_ascii
          AND is_common = 1
          AND cgram = 'NOM'
          AND letters_ascii GLOB '[a-z]*'
        ORDER BY frequency DESC
        """
    )
    seen = set()
    out = []
    for ortho, freq, cgram in cur:
        u = ortho.upper()
        if not u.isalpha():
            continue
        if u in STOPLIST:
            continue
        if u in seen:
            continue
        # Skip plural if singular already in
        if u.endswith("S") and u[:-1] in seen:
            continue
        # Skip feminine if masculine already in (or vice versa)
        if u.endswith("E") and u[:-1] in seen:
            continue
        if u + "E" in seen:
            continue
        seen.add(u)
        out.append(u)
        if len(out) >= 130:
            break
    # Stable variety: ensure mix of lengths by interleaving by length buckets
    by_len = {}
    for w in out:
        by_len.setdefault(len(w), []).append(w)
    final = []
    while any(by_len.values()):
        for L in sorted(by_len):
            if by_len[L]:
                final.append(by_len[L].pop(0))
    return final


def main():
    conn = sqlite3.connect(LEXIQUE)
    common = load_common_words(conn)
    clash = build_clash_puzzles(common)
    wof = build_wof_words(conn)
    conn.close()

    sys.stderr.write(f"clash puzzles: {len(clash)}\n")
    for p in clash:
        sys.stderr.write(f"  {p['anchor']}: {len(p['words'])} words\n")
    sys.stderr.write(f"wof words: {len(wof)}\n")

    json.dump({"wordClash": clash, "wofWords": wof}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
