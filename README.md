![Funky's 2P Games](docs/banner.png)

# 2P Games

**FR** — 16 jeux tactiles pour deux : sur un même téléphone, écran partagé en deux moitiés, ou en ligne pour 8 d'entre eux. Les règles sont derrière un ? dans chaque jeu. Sans pub, sans compte, sans achat.

**EN** — 16 touch games for two: on one phone, the screen split in two halves, or online for 8 of them. Rules behind a ? in each game. No ads, no accounts, no purchases.

## Key points

- Also online: 4 in a Row, Caro, Awalé, Memory, Duck-Day Chess, Tank Wars, Word Clash, Reversi.
- One phone only: Tennis, Pool, Carrom, Air Hockey, Mini Golf, Star Clash, Hangman, Horse Jump.
- Online: **Create Room** gives a code for the other player to enter under **Join Room**,
  or **Quick Match**. Moves go through a Firebase Realtime Database; no account.
- Every game ends on a **Rematch** button.
- Sounds are synthesised; there are no audio files. No tracking.

## Install

Install the generated APK (`android/app/build/outputs/apk/release/`) on an Android
device (min SDK 24), or grab it from the author's [F-Droid repository](https://funkypitt.github.io/fdroid-repo/).

## Build

Capacitor (Android) wrapping a vanilla HTML/JS web app. All the game logic lives in `app.js`.

```
npm install
mkdir -p www && cp index.html app.js felix.png www/
npx cap sync android
cd android && ./gradlew assembleRelease
```

## Crédits / Credits

© 2026 Pierre Gallaz. Développé avec [Claude Code](https://claude.com/claude-code) (Anthropic).
Licence MIT, voir `LICENSE`.

© 2026 Pierre Gallaz. Developed with [Claude Code](https://claude.com/claude-code) (Anthropic).
MIT licence, see `LICENSE`.

## Captures d'écran

<img src="docs/screenshot-1.png" width="30%"> <img src="docs/screenshot-2.png" width="30%">
