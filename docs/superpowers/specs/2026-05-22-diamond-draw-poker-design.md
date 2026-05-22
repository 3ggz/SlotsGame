# Diamond Draw Poker Design

## Goal

Add `diamondpoker.html`, a self-contained classic Jacks or Better video poker cabinet for Diamond Casino.

## Game Rules

- Single-player five-card draw poker.
- Player chooses a bet from the shared chip balance, deals five cards, holds any subset, then draws replacements.
- The first release is classic Jacks or Better only. Bonus Poker / Double Bonus are out of scope and can reuse the cabinet later.
- Payouts use the standard 9/6-style unit table:
  - Royal Flush: 800
  - Straight Flush: 50
  - Four of a Kind: 25
  - Full House: 9
  - Flush: 6
  - Straight: 4
  - Three of a Kind: 3
  - Two Pair: 2
  - Jacks or Better: 1
  - Everything else: 0
- Gross payout is `bet * payoutMultiplier`. Net recorded in history is `grossPayout - bet`.

## User Experience

- The page follows the casino house style: shared top chrome, dark purple background, gold rimmed cabinet, neon cyan/pink accents, Bungee/Bungee Shade/Outfit/Geist Mono typography.
- The first screen is the playable cabinet, not a landing page.
- The main loop is `BET -> DEAL -> HOLD -> DRAW -> PAY`.
- Cards are large touch targets. Held cards show a gold `HELD` marker and subtle lift.
- Controls include bet input, half/double/max shortcuts, `DEAL`, `DRAW`, and `NEW HAND`.
- A paytable stays visible on desktop and collapses into a dense grid on mobile.
- SFX reuse existing card/chip/win samples and fail silently if a file is missing.
- Music reuses an existing casino track via `Music.init(encodeURI(...))`.

## Integration

- Load shared scripts at the top of `<body>` in the established order:
  `casino-audio.js`, `casino-account.js`, `casino-jackpots.js`, `casino-bots.js`, `casino-chat.js`.
- Use the shared `casino.balance` key.
- Record completed hands with `History.record('diamondpoker', bet, net, note)`.
- Add a lobby card with a video poker preview and `data-game="diamondpoker"`.
- Add `diamondpoker.html` to the service worker precache and bump `CACHE_VERSION`.
- Add `diamondpoker` to casino presence/bot display maps.

## Test Plan

- Add a Node CJS test that extracts a `DiamondPokerCore` block from `diamondpoker.html`.
- Cover hand ranking, ace-low straight handling, Jacks-or-Better qualification, payout math, and draw replacement count.
- Verify existing relevant tests still pass.
