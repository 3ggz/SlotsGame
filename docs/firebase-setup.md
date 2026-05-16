# Diamond Casino — Firebase setup

Accounts and global stats run on Firebase (Auth + Firestore). Free tier
covers a tiny casino site indefinitely: 50k MAU on Auth, 50k reads /
20k writes / day on Firestore.

Until you paste a config, everything no-ops gracefully — the lobby
shows the LIVE FROM THE FLOOR panel with zeros and a small "paste
Firebase config" hint. Hook it up when you're ready.

## 5-minute setup

1. **Create the project.** https://console.firebase.google.com/ →
   *Add project* → name it "Diamond Casino". Skip Analytics if you
   don't want it.

2. **Add a Web app.** In the project overview, click the `</>` icon.
   Give it any nickname. *Don't* enable Hosting (we host static
   files separately).
   Firebase shows a `firebaseConfig` object — copy its keys.

3. **Paste the config.** Open `casino-account.js` and fill in:
   ```js
   const FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   The `projectId` line is what flips the kill switch from no-op
   mode to real mode.

4. **Enable Authentication.** In the console:
   - *Build → Authentication → Get started*
   - **Sign-in method** tab → enable:
     - **Anonymous** (required — every visitor gets an anon UID so
       per-user stats work without forcing a sign-in)
     - **Email/Password**
     - **Google** (you'll need to pick a project support email)
   - **Settings → Authorized domains** → `localhost` is added
     automatically. Add your prod domain (e.g. `diamondcasino.netlify.app`)
     when you deploy.

5. **Create Firestore.** *Build → Firestore Database → Create
   database* → **Production mode** → pick the region nearest you
   (us-east1 is fine).
   Then open the **Rules** tab → replace the default rules with the
   contents of `docs/firestore.rules` → *Publish*.

6. **Reload `index.html`.** The "OFFLINE" status pill in the LIVE
   panel should flip to "LIVE" and the counters start ticking up the
   moment anyone spins anything.

## What gets tracked

Every round (any game, any outcome) writes to:

- `globals/stats` — atomic counter increments for `totalSpins`,
  `totalWagered`, `totalWon`, `jackpotsHit`, `totalJackpotPaid`.
- `users/{uid}` — same counters scoped to the player, plus
  `netResult`. Anonymous users get this too.
- `recentJackpots/*` — one document per jackpot, capped feed (newest
  shows in the lobby ticker). Triggered by any `History.record` note
  containing `GRAND` / `MAJOR` / `MINOR` / `MINI` / `JACKPOT`.

Writes are fire-and-forget — if Firebase is unreachable, the game
plays normally and the events are simply dropped.

## Watching usage

Firebase Console → Usage tab shows reads/writes/auth in near-real-time.
If you ever brush the free tier (50k reads/day, 20k writes/day), the
fix is to batch writes client-side. Talk to me when that happens.
