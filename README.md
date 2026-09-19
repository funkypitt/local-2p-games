![Funky's 2P Games](docs/banner.png)

# 2P Games

**FR** — 2P Games rassemble 16 mini-jeux multijoueurs tactiles pensés pour deux joueurs : partagez un même appareil (écran divisé en deux moitiés) ou jouez en ligne avec un ami via un code de salle ou un match rapide. Chaque jeu embarque un mode d'emploi et la revanche. Sans pub, sans compte, sans pistage.

**EN** — 16 touch-friendly multiplayer games for two players: share one device (split screen) or play online with a friend via room codes or quick match. Built-in instructions and rematch in every game. No ads, no accounts, no tracking.

Games: 4 in a Row, Caro, Awalé, Memory, Duck-Day Chess, Tank Wars, Word Clash, Reversi (online-capable), Tennis, Pool, Carrom, Air Hockey, Mini Golf, Star Clash, Hangman, Horse Jump.

## Build

Capacitor (Android) wrapping a vanilla HTML/JS web app. All the game logic lives in `app.js`.

```
npm install
mkdir -p www && cp index.html app.js felix.png www/
npx cap sync android
cd android && ./gradlew assembleRelease
```

## Install

Install the generated APK (`android/app/build/outputs/apk/release/`) on an Android device (min SDK 24), or grab it from the author's F-Droid repository.

## Crédits / Credits

© 2026 Pierre Gallaz. Développé avec [Claude Code](https://claude.com/claude-code) (Anthropic).
Licence MIT, voir `LICENSE`.

© 2026 Pierre Gallaz. Developed with [Claude Code](https://claude.com/claude-code) (Anthropic).
MIT licence, see `LICENSE`.

## Captures d'écran

<img src="docs/screenshot-1.png" width="30%"> <img src="docs/screenshot-2.png" width="30%">
