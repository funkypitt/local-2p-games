![Funky's 2P Games](docs/banner.png)

# 2P Games

**FR** — *Les jeux à deux de Pierre* : 16 jeux tactiles pour deux, sur un même téléphone : écran partagé en deux moitiés, ou chacun son tour. Les règles sont derrière un ? dans chaque jeu. Sans pub, sans compte, sans achat, sans connexion.

**EN** — 16 touch games for two, on one phone: the screen split in two halves, or turn by turn. Rules behind a ? in each game. No ads, no accounts, no purchases, no connection.

## Key points

- The games: Tennis, 4 in a Row, Pool, Memory, Word Clash, Air Hockey, Tank Wars, Carrom,
  Mini Golf, Star Clash, Caro, Awalé, Duck-Day Chess, Hangman, Reversi, Horse Jump.
- On a French phone, Hangman gives way to **Devine-moi**, a turn-by-turn duel on the French
  five-letter word game of the same name: shared grid, points for every new green or amber letter.
- **Word Clash**: a crossword duel on one wheel of seven letters, in French or English. Find a grid
  word and you play again; an unknown or already found word passes the turn. Three rounds.
- On a French phone the app is called *Les jeux à deux de Pierre* (*Jeux à deux* under the icon).
- Two players on one phone. The app needs no connection and asks for no permission.
- A game ends on a button to play again, except Pool and Mini Golf: reopen them from the menu.
- Recorded sounds and music loops, all CC0 (see credits). No tracking.

## Install


[<img src="docs/badge_obtainium.png" alt="Get it on Obtainium" height="48">](https://gallaz.ch/eink/#obtainium)

- **F-Droid** (recommended, updates arrive by themselves): add the repository from [gallaz.ch/eink](https://gallaz.ch/eink/#fdroid), or the address `https://funkypitt.github.io/fdroid-repo/repo` in F-Droid.
- **Obtainium**: tap the badge on the phone, or add `https://github.com/funkypitt/local-2p-games` in Obtainium.
- **APK**: attached to the [latest release](../../releases/latest). No automatic updates.

All three deliver the same file, with the same signature.

## Build

Capacitor (Android) wrapping a vanilla HTML/JS web app. All the game logic lives in `app.js`.

```
npm install
mkdir -p www && cp -r index.html app.js felix.png audio fonts devine-core.js devine-ui.js devine-ui.css devine-words.js wordclash-fr.js www/
npx cap sync android
cd android && ./gradlew assembleRelease
```

Devine-moi files (`devine-core.js`, `devine-ui.js`, `devine-ui.css`, `devine-words.js`, `fonts/`) are copied from the [Devine-moi](https://github.com/funkypitt/devine-moi) repo by its `tools/sync_to_2p.sh`; fix them there.

Word Clash words. French: `python3 tools/build_wordclash_fr.py` writes `wordclash-fr.js` from Lexique 3 and the Dicollecte forms in `~/code/devine-moi/data/`. The grid only takes dictionary forms, as Devine-moi does (singular, infinitive, no conjugation), so AMI and AMIS never share a grid; every other form counts as a bonus word. English: `tools/build_words.py` rebuilds the `WORD_DATA` block of `app.js` (system dictionary, `wordfreq`); plurals and -ed/-ing forms stay out of the grid at run time. `tools/word_blocklist.json` applies to both.

## Crédits / Credits

Sons : packs CC0 de [Kenney](https://kenney.nl) (interface, casino, sci-fi). Mots de Devine-moi et de Word Clash : Lexique 3 (CC BY-SA 4.0) et Dicollecte (MPL 2.0) ; police Fraunces (OFL). Musique : « Sherwood » de Chris Murphy (CC0) et « Lofi Hip Hop Loop » d'omfgdude (CC0), via OpenGameArt.
Sounds: CC0 packs by [Kenney](https://kenney.nl) (interface, casino, sci-fi). Devine-moi and Word Clash words: Lexique 3 (CC BY-SA 4.0) and Dicollecte (MPL 2.0); Fraunces font (OFL). Music: "Sherwood" by Chris Murphy (CC0) and "Lofi Hip Hop Loop" by omfgdude (CC0), via OpenGameArt.

© 2026 Pierre Gallaz. Développé avec [Claude Code](https://claude.com/claude-code) (Anthropic).
Licence MIT, voir `LICENSE`.

© 2026 Pierre Gallaz. Developed with [Claude Code](https://claude.com/claude-code) (Anthropic).
MIT licence, see `LICENSE`.

## Captures d'écran

<img src="docs/screenshot-1.png" width="30%"> <img src="docs/screenshot-2.png" width="30%">
