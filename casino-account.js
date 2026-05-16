/* ============================================================
   casino-account.js — accounts + global live stats
   ============================================================
   Adds two globals to every page that includes this script:
     window.CasinoAccount  — sign-in / sign-out / current user
     window.CasinoStats    — global counters + recent-jackpot feed

   Until a Firebase config is pasted below (see SETUP), both
   surfaces are present but no-op. The lobby still renders the
   LIVE FROM THE FLOOR panel — it just sits at zero.

   ------------------------------------------------------------
   SETUP (about 5 minutes):

   1. https://console.firebase.google.com/ → Add project
      ("Diamond Casino"). Disable Analytics if you don't want it.

   2. In the project, click "</>" to add a Web app. Copy the
      firebaseConfig object it shows you and paste it into
      FIREBASE_CONFIG below.

   3. Build → Authentication → Get started.
        Sign-in method tab → enable:
          Anonymous          (required — every visitor needs this)
          Email/Password
          Google
        Settings tab → Authorized domains → add the prod domain
          if you have one (localhost is already there).

   4. Build → Firestore Database → Create database
        Production mode, any region near you.
        Then the Rules tab → paste the contents of
        docs/firestore.rules and Publish.

   5. Reload the lobby. LIVE FROM THE FLOOR should start ticking
      as soon as anyone spins anything anywhere.

   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPgB-qcgcapsW3zBZ2p-6h49q_ARyu47k",
  authDomain: "spin-diamonds.firebaseapp.com",
  projectId: "spin-diamonds",
  storageBucket: "spin-diamonds.firebasestorage.app",
  messagingSenderId: "982284265566",
  appId: "1:982284265566:web:0aabaaea5a54c17c07accf",
  measurementId: "G-3JRRYRJSDR"
};

const CONFIGURED = Boolean(FIREBASE_CONFIG.projectId);

/* ---------- no-op stubs (used until Firebase is wired) ---------- */
const ZERO_STATS = {
  totalSpins: 0, totalWagered: 0, totalWon: 0,
  jackpotsHit: 0, totalJackpotPaid: 0,
};

window.CasinoStats = {
  configured: false,
  recordRound() {},
  subscribe(fn) { try { fn(ZERO_STATS); } catch (e) {} return () => {}; },
  subscribeJackpots(fn) { try { fn([]); } catch (e) {} return () => {}; },
};

window.RocketLive = {
  configured: false,
  playerLabel: () => 'Player',
  syncClock() { return Promise.resolve(0); },
  subscribeCashouts(roundId, fn) { try { fn([]); } catch (e) {} return () => {}; },
  recordCashout() { return Promise.resolve(); },
};

window.CasinoAccount = {
  configured: false,
  onAuthChange(fn) { try { fn(null); } catch (e) {} },
  user: () => null,
  signInGoogle: () => Promise.reject(new Error('Firebase not configured')),
  signInEmail:  () => Promise.reject(new Error('Firebase not configured')),
  signUpEmail:  () => Promise.reject(new Error('Firebase not configured')),
  signOut:      () => Promise.resolve(),
};

if (!CONFIGURED) {
  queueMicrotask(() => {
    document.dispatchEvent(new CustomEvent('casino-account-ready'));
  });
} else {
  /* ---------- real implementation ---------- */
  (async () => {
    const FB = 'https://www.gstatic.com/firebasejs/10.13.2';
    let initFailed = null;
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`${FB}/firebase-app.js`),
        import(`${FB}/firebase-auth.js`),
        import(`${FB}/firebase-firestore.js`),
      ]);
      const { initializeApp } = appMod;
      const {
        getAuth, onAuthStateChanged, signInAnonymously,
        GoogleAuthProvider, signInWithPopup,
        createUserWithEmailAndPassword, signInWithEmailAndPassword,
        signOut, updateProfile,
      } = authMod;
      const {
        getFirestore, doc, setDoc, onSnapshot, increment, serverTimestamp,
        collection, query, orderBy, limit, addDoc,
      } = fsMod;

      const app  = initializeApp(FIREBASE_CONFIG);
      const auth = getAuth(app);
      const db   = getFirestore(app);

      // Every visitor gets an anonymous uid so per-user stats and
      // jackpot attribution work without forcing a sign-in.
      signInAnonymously(auth).catch(() => {});

      let currentUser = null;
      const authListeners = [];
      onAuthStateChanged(auth, u => {
        currentUser = u;
        if (u && !u.isAnonymous) {
          setDoc(doc(db, 'users', u.uid), {
            displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'Player'),
            photoURL: u.photoURL || null,
            lastSeen: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }
        authListeners.forEach(fn => { try { fn(u); } catch (e) {} });
      });

      const globalsRef = doc(db, 'globals', 'stats');

      function detectJackpot(note, gross) {
        if (!note || !gross) return null;
        const N = String(note).toUpperCase();
        if (N.includes('GRAND'))   return { kind: 'GRAND',   amount: gross };
        if (N.includes('MAJOR'))   return { kind: 'MAJOR',   amount: gross };
        if (N.includes('MINOR'))   return { kind: 'MINOR',   amount: gross };
        if (N.includes('MINI'))    return { kind: 'MINI',    amount: gross };
        if (N.includes('JACKPOT')) return { kind: 'JACKPOT', amount: gross };
        return null;
      }

      function playerLabel(u) {
        if (!u) return 'Anonymous';
        if (u.displayName) return u.displayName;
        if (u.email) return u.email.split('@')[0];
        return u.isAnonymous ? 'Anonymous' : 'Player';
      }

      function recordRound({ game, bet, win, note }) {
        bet = Number(bet) || 0;
        win = Number(win) || 0;
        if (bet <= 0 && win === 0) return;
        const gross   = Math.max(0, bet + win);
        const jackpot = detectJackpot(note, gross);

        const patch = {
          totalSpins:   increment(1),
          totalWagered: increment(bet),
          totalWon:     increment(gross),
          updatedAt:    serverTimestamp(),
        };
        if (jackpot) {
          patch.jackpotsHit      = increment(1);
          patch.totalJackpotPaid = increment(jackpot.amount);
        }
        setDoc(globalsRef, patch, { merge: true }).catch(() => {});

        if (currentUser) {
          const upatch = {
            totalSpins:   increment(1),
            totalWagered: increment(bet),
            totalWon:     increment(gross),
            netResult:    increment(win),
            lastSeen:     serverTimestamp(),
          };
          if (jackpot) upatch.jackpotsHit = increment(1);
          setDoc(doc(db, 'users', currentUser.uid), upatch, { merge: true }).catch(() => {});
        }

        if (jackpot) {
          addDoc(collection(db, 'recentJackpots'), {
            game:      String(game || 'unknown'),
            kind:      jackpot.kind,
            amount:    jackpot.amount,
            player:    playerLabel(currentUser),
            uid:       currentUser?.uid || null,
            anonymous: !!currentUser?.isAnonymous,
            ts:        serverTimestamp(),
          }).catch(() => {});
        }
      }

      function subscribe(fn) {
        return onSnapshot(globalsRef, snap => {
          const d = snap.data() || {};
          fn({
            totalSpins:       d.totalSpins       || 0,
            totalWagered:     d.totalWagered     || 0,
            totalWon:         d.totalWon         || 0,
            jackpotsHit:      d.jackpotsHit      || 0,
            totalJackpotPaid: d.totalJackpotPaid || 0,
          });
        }, () => {});
      }

      function subscribeJackpots(fn, n = 8) {
        const q = query(collection(db, 'recentJackpots'), orderBy('ts', 'desc'), limit(n));
        return onSnapshot(q, snap => {
          const list = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          fn(list);
        }, () => {});
      }

      function subscribeRocketCashouts(roundId, fn, n = 80) {
        const rid = String(roundId || '');
        if (!rid) { try { fn([]); } catch (e) {} return () => {}; }
        const q = query(collection(db, 'rocketRoundCashouts', rid, 'cashouts'), orderBy('ts', 'desc'), limit(n));
        return onSnapshot(q, snap => {
          const list = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          fn(list);
        }, () => {});
      }

      function waitForCurrentUser(timeout = 5000) {
        if (currentUser) return Promise.resolve(currentUser);
        return new Promise(resolve => {
          let done = false;
          const off = onAuthStateChanged(auth, u => {
            if (done || !u) return;
            done = true;
            try { off(); } catch (e) {}
            resolve(u);
          });
          setTimeout(() => {
            if (done) return;
            done = true;
            try { off(); } catch (e) {}
            resolve(null);
          }, timeout);
        });
      }

      async function syncRocketClock() {
        const u = await waitForCurrentUser();
        if (!u) return 0;
        const ref = doc(db, 'rocketClock', u.uid);
        const sentAt = Date.now();
        await setDoc(ref, { ts: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
        return new Promise(resolve => {
          let done = false;
          let off = () => {};
          const finish = (offset) => {
            if (done) return;
            done = true;
            try { off(); } catch (e) {}
            resolve(Number.isFinite(offset) ? offset : 0);
          };
          off = onSnapshot(ref, snap => {
            const d = snap.data() || {};
            if (!d.ts || typeof d.ts.toMillis !== 'function') return;
            const receivedAt = Date.now();
            const midpoint = sentAt + (receivedAt - sentAt) / 2;
            finish(d.ts.toMillis() - midpoint);
          }, () => finish(0));
          setTimeout(() => finish(0), 5000);
        });
      }

      function recordRocketCashout(data) {
        data = data || {};
        const roundId = String(data.roundId || '');
        if (!roundId) return Promise.resolve();
        const bet = Number(data.bet) || 0;
        const payout = Number(data.payout) || 0;
        const multiplier = Number(data.multiplier) || 0;
        if (bet <= 0 || payout <= 0 || multiplier <= 0) return Promise.resolve();
        if (!currentUser) {
          return waitForCurrentUser().then(u => u ? recordRocketCashout(data) : undefined);
        }
        return addDoc(collection(db, 'rocketRoundCashouts', roundId, 'cashouts'), {
          roundId,
          bet,
          payout,
          multiplier,
          player: playerLabel(currentUser),
          uid: currentUser?.uid || null,
          anonymous: !!currentUser?.isAnonymous,
          ts: serverTimestamp(),
        }).catch(() => {});
      }

      window.CasinoStats = {
        configured: true,
        recordRound,
        subscribe,
        subscribeJackpots,
      };

      window.RocketLive = {
        configured: true,
        playerLabel: () => playerLabel(currentUser),
        syncClock: syncRocketClock,
        subscribeCashouts: subscribeRocketCashouts,
        recordCashout: recordRocketCashout,
      };

      window.CasinoAccount = {
        configured: true,
        onAuthChange(fn) {
          authListeners.push(fn);
          try { fn(currentUser); } catch (e) {}
        },
        user: () => currentUser,
        signInGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),
        signInEmail:  (email, pw) => signInWithEmailAndPassword(auth, email, pw),
        signUpEmail:  async (email, pw, displayName) => {
          const cred = await createUserWithEmailAndPassword(auth, email, pw);
          if (displayName) await updateProfile(cred.user, { displayName });
          return cred;
        },
        signOut: () => signOut(auth),
      };
    } catch (e) {
      initFailed = e;
      console.warn('[casino-account] init failed; staying in offline/no-op mode:', e);
    } finally {
      document.dispatchEvent(new CustomEvent('casino-account-ready', { detail: { ok: !initFailed } }));
    }
  })();
}
