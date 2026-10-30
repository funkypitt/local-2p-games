#!/usr/bin/env python3
"""Build wordclash-fr.js (Word Clash, French) from Lexique 3.83 and the Plume inventory.

Same word rules as Devine-moi (devine-moi/tools/build_words.py):
  grid   : dictionary forms only (singular noun, masculine adjective, infinitive, adverb,
           irregular feminines and -x plurals), frequent enough for a casual game.
           So AMI and AMIS, PARTIE and PARTIES never share a grid.
  bonus  : every French form of 3 to 7 letters (Lexique + Dicollecte/LanguageTool forms of
           the Plume inventory, conjugations and plurals included), minus insults.
  wheel  : one 7-letter dictionary word per puzzle (the anchor); one puzzle per set of letters.

Usage
  python3 tools/build_wordclash_fr.py            # write wordclash-fr.js
  python3 tools/build_wordclash_fr.py --report   # statistics and 20 sample puzzles, touch nothing
Stdlib only. Sources: ~/code/devine-moi/data/{Lexique383.tsv,inventaire_fr.tsv.gz} (override with
WC_DATA=dir), blocklists: devine-moi/tools/blocklist_fr.json + tools/word_blocklist.json (fr).
"""
import csv, gzip, json, os, re, sys, unicodedata
from collections import Counter
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get("WC_DATA", os.path.expanduser("~/code/devine-moi/data"))
LEXIQUE = os.path.join(DATA, "Lexique383.tsv")
INVENTAIRE = os.path.join(DATA, "inventaire_fr.tsv.gz")
DEVINE_BLOCKLIST = os.path.expanduser("~/code/devine-moi/tools/blocklist_fr.json")
LOCAL_BLOCKLIST = os.path.join(ROOT, "tools", "word_blocklist.json")
OUT = os.path.join(ROOT, "wordclash-fr.js")

MIN_LEN, MAX_LEN = 3, 7
GRID_FREQ = {3: 6.0, 4: 4.0, 5: 3.0, 6: 3.0, 7: 3.0}   # max(freqfilms2, freqlivres) per million
ANCHOR_FREQ = 4.0
MAX_GRID = 40                     # grid candidates kept per puzzle, most frequent first
ANCHOR_EXCLUDE = {"RACISTE", "RACISME", "INSULTE", "VIOLEUR", "MEURTRE", "SUICIDE", "TORTURE",
                  "CADAVRE", "VIOLENT", "NAZISME", "FLINGUE", "PERVERS"}
# Valid as bonus words, never in a grid: abbreviations, anglicisms, slang, rude words.
GRID_EXCLUDE = set("""MME MLLE ETC BEN COM FAC PSY NAN REX TER AIS GUS BOY OUT KID MAC FAN JOB PUB TOP PRO
MIN SIR MAN CUL CON PIS GAY MEUF NAZE BATH BACK GIRL LADY BABY TEAM BOSS LOOK DEAL CASH COKE DOPE
HOMO SEXY SEXE NANA FIFI TITI DAYA LUTZ TRIP HAIR ROLL SOUL RING SIDA CAID PAPY COCO DELA MISS COOL
STAR STOP GANG ROCK FOOT CLUB HALL MEGA LABO PROF INFO SODA PULL GYM BIP""".split())
FUNCTION_CATS = {"PRE", "CON", "PRO:dem", "ADJ:dem", "ADJ:num", "ADJ:pos", "PRO:ind", "ADJ:ind"}
INTERJECTIONS = {"adieu", "bravo", "halte", "merci", "salut", "hélas", "mince", "basta"}
VOWELS = set("AEIOUY")


def norm(s):
    s = s.replace("œ", "oe").replace("Œ", "OE").replace("æ", "ae").replace("Æ", "AE")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = s.upper()
    return s if re.fullmatch(r"[A-Z]+", s) else ""


def fnum(x):
    try:
        return float(x or 0)
    except ValueError:
        return 0.0


def is_base_form(ortho, row):
    """Devine-moi's rule: what a curated word list keeps (see devine-moi/tools/build_words.py)."""
    cg, lem, g, n = row["cgram"], row["lemme"].strip(), row["genre"], row["nombre"]
    if cg == "ONO":
        return ortho in INTERJECTIONS
    if cg in FUNCTION_CATS:
        return ortho == lem and (cg == "ADJ:num" or not ortho.endswith("s"))
    if cg == "NOM" and n == "p" and ortho.endswith("x") and ortho not in (lem, lem + "s", lem + "x"):
        return True
    if cg == "ADJ" and g == "f" and n == "s" and ortho != lem + "e" and norm(ortho) != norm(lem + "e"):
        return True
    if ortho != lem:
        return False
    if cg == "VER":
        return "inf" in row["infover"]
    return cg in ("NOM", "ADJ", "ADV")


def blocklists():
    d = json.load(open(DEVINE_BLOCKLIST, encoding="utf-8"))
    insults = {norm(w) for w in d.get("insults", [])}
    ugly = {norm(w) for w in d.get("ugly", [])}
    local = {norm(w) for w in json.load(open(LOCAL_BLOCKLIST, encoding="utf-8")).get("fr", [])}
    return insults, insults | ugly | local


def read_words():
    insults, blocked = blocklists()
    allowed, base, display = set(), {}, {}
    with open(LEXIQUE, encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            o = row["ortho"].strip()
            if not o or not o.islower():
                continue
            a = norm(o)
            if not a or not (MIN_LEN <= len(a) <= MAX_LEN):
                continue
            allowed.add(a)
            if not is_base_form(o, row) or a in blocked or a in GRID_EXCLUDE or not set(a) & VOWELS:
                continue
            fr = max(fnum(row["freqfilms2"]), fnum(row["freqlivres"]))
            if fr > base.get(a, -1):
                base[a] = fr
                display[a] = o.upper()
    with gzip.open(INVENTAIRE, "rt", encoding="utf-8") as f:
        for line in f:
            w = line.split("\t", 1)[0]
            if w.islower():
                a = norm(w)
                if a and MIN_LEN <= len(a) <= MAX_LEN:
                    allowed.add(a)
    allowed -= insults
    grid = {w: fr for w, fr in base.items() if fr >= GRID_FREQ[len(w)] and w in allowed}
    return allowed, grid, display


def related(a, b):
    """AMI/AMIS, PARTI/PARTIE, CHEVAL/CHEVAUX-style pairs: one is the other plus S, X, E or ES."""
    if len(a) > len(b):
        a, b = b, a
    return b in (a + "S", a + "X", a + "E", a + "ES")


def puzzles(grid):
    out, seen = [], set()
    anchors = sorted((w for w, fr in grid.items() if len(w) == 7 and fr >= ANCHOR_FREQ and w not in ANCHOR_EXCLUDE),
                     key=lambda w: -grid[w])
    for a in anchors:
        key = "".join(sorted(a))
        if key in seen:
            continue
        ac = Counter(a)
        subs = [w for w in grid if w != a and all(ac[c] >= n for c, n in Counter(w).items())]
        by = Counter(len(w) for w in subs)
        if len(subs) < 12 or by[3] + by[4] < 6 or by[5] + by[6] < 2:
            continue
        seen.add(key)
        subs.sort(key=lambda w: -grid[w])
        kept = []
        for w in subs:          # keep the more frequent of two related forms only
            if not any(related(w, k) for k in kept) and not related(w, a):
                kept.append(w)
        out.append({"a": a, "g": " ".join(kept[:MAX_GRID])})
    return out


def main():
    allowed, grid, display = read_words()
    ps = puzzles(grid)
    shown = {}
    for p in ps:
        for w in [p["a"]] + p["g"].split():
            if display.get(w, w) != w:
                shown[w] = display[w]
    print(f"allowed {len(allowed)}  grid words {len(grid)}  puzzles {len(ps)}  accented {len(shown)}", file=sys.stderr)
    if "--report" in sys.argv:
        import random
        for p in random.Random(1).sample(ps, 20):
            print(f"  {p['a']}: {p['g']}", file=sys.stderr)
        return
    data = {"puzzles": ps, "display": shown, "allowed": " ".join(sorted(allowed))}
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(
        "// Word Clash, French words. Generated by tools/build_wordclash_fr.py on %s from Lexique 3.83\n"
        "// (CC BY-SA 4.0, lexique.org) and Dicollecte/LanguageTool forms (MPL 2.0). Do not edit by hand.\n"
        "window.WC_FR = %s;\n" % (date.today().isoformat(), js))
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
