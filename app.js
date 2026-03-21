// ── app.js ── Firebase Auth + Firestore Sync + Full UI ────────────────
// VERSION: 2025-03-21-v5
console.log('[Kochplan] app.js v5 loaded');

// ─── LOAD DATA ──────────────────────────────────────────────────────────
// Dynamic import with error handling
let PHASES, RATING_LABELS, ARRIVAL_CRITERIA, WEEKS, BOOKS;

async function loadData() {
  try {
    const mod = await import('./data.js');
    PHASES = mod.PHASES;
    RATING_LABELS = mod.RATING_LABELS;
    ARRIVAL_CRITERIA = mod.ARRIVAL_CRITERIA;
    WEEKS = mod.WEEKS;
    BOOKS = mod.BOOKS || [];
    console.log('[Kochplan] data.js loaded:', WEEKS.length, 'weeks,', BOOKS.length, 'books');
  } catch (e) {
    console.error('[Kochplan] Failed to load data.js:', e);
    // Fallback: try loading from same origin with explicit path
    throw new Error('data.js konnte nicht geladen werden: ' + e.message);
  }
}

// ─── FIREBASE CONFIG ────────────────────────────────────────────────────
// !! ERSETZE DIESE WERTE mit deiner eigenen Firebase-Konfiguration !!
// Siehe SETUP.md für Anleitung
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAAXAi2P8Q0Batkz_zw9hbgWg6TjP4v_QA",
  authDomain: "michelin-ba03a.firebaseapp.com",
  projectId: "michelin-ba03a",
  storageBucket: "michelin-ba03a.firebasestorage.app",
  messagingSenderId: "718750457531",
  appId: "1:718750457531:web:b1e8efe030b9758843139e"
};

// ─── FIREBASE INIT ──────────────────────────────────────────────────────
let app, auth, db, currentUser = null;
let unsubscribeSnapshot = null;

async function initFirebase() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, GoogleAuthProvider, onAuthStateChanged } =
    await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const { getFirestore, doc, setDoc, onSnapshot } =
    await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);

  // Store references directly — no window._fb indirection
  initFirebase.ready = true;
  initFirebase.auth = auth;
  initFirebase.db = db;
  initFirebase.signInWithPopup = signInWithPopup;
  initFirebase.signInWithRedirect = signInWithRedirect;
  initFirebase.signOut = signOut;
  initFirebase.GoogleAuthProvider = GoogleAuthProvider;
  initFirebase.onAuthStateChanged = onAuthStateChanged;
  initFirebase.doc = doc;
  initFirebase.setDoc = setDoc;
  initFirebase.onSnapshot = onSnapshot;

  // Handle redirect result (fires after returning from Google login page)
  try {
    await getRedirectResult(auth);
  } catch (e) {
    console.error('Redirect result error:', e);
  }
}
initFirebase.ready = false;

// ─── STATE ──────────────────────────────────────────────────────────────
let state = {
  user: null,
  loading: true,
  bootError: null,
  tab: 'home',
  phaseFilter: 0,
  statusFilter: 'all',
  expanded: null,
  search: '',
  currentWeek: 1,
  userData: {},  // { [weekNum]: { rating, done, notes, repeat } }
  syncStatus: 'ok', // ok | saving | error
  authReady: false,
  demoMode: false,
  theme: localStorage.getItem('kp-theme') || 'auto', // day | night | auto
  typeSize: localStorage.getItem('kp-typesize') || 'small', // small | medium | large
};

let saveTimer = null;

function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ─── DEMO MODE ──────────────────────────────────────────────────────────
function startDemoMode() {
  const saved = localStorage.getItem('kochplan-demo');
  let data = {};
  if (saved) { try { data = JSON.parse(saved); } catch(e) {} }
  state.user = { displayName: 'Demo', photoURL: '', uid: 'demo' };
  state.userData = data.userData || {};
  state.currentWeek = data.currentWeek || 1;
  state.loading = false;
  state.demoMode = true;
  state.syncStatus = 'ok';
  currentUser = null; // no Firestore
  render();
}

function saveDemoData() {
  if (!state.demoMode) return;
  localStorage.setItem('kochplan-demo', JSON.stringify({
    userData: state.userData,
    currentWeek: state.currentWeek,
  }));
}

// ─── FIRESTORE SYNC ─────────────────────────────────────────────────────
function userDocRef() {
  return initFirebase.doc(initFirebase.db, 'users', currentUser.uid);
}

async function saveToFirestore() {
  if (!currentUser) return;
  state.syncStatus = 'saving';
  updateSyncBadge();
  try {
    await initFirebase.setDoc(userDocRef(), {
      userData: state.userData,
      currentWeek: state.currentWeek,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    state.syncStatus = 'ok';
    updateSyncBadge();
  } catch (e) {
    console.error('Save error:', e);
    state.syncStatus = 'error';
    updateSyncBadge();
  }
}

// Update sync badge without full re-render
function updateSyncBadge() {
  const el = document.querySelector('.sync-badge');
  if (!el) return;
  const labels = { ok:'Gespeichert', saving:'Speichert…', error:'Fehler!' };
  el.textContent = labels[state.syncStatus] || '';
  el.className = 'sync-badge sync-' + state.syncStatus;
}

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  if (state.demoMode) {
    saveTimer = setTimeout(saveDemoData, 400);
  } else {
    saveTimer = setTimeout(saveToFirestore, 800);
  }
}

function listenToFirestore() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  unsubscribeSnapshot = initFirebase.onSnapshot(userDocRef(), (snap) => {
    if (snap.exists()) {
      const d = snap.data();
      const incoming = JSON.stringify(d.userData || {});
      const current = JSON.stringify(state.userData);
      if (incoming !== current) {
        state.userData = d.userData || {};
        state.currentWeek = d.currentWeek || 1;
        state.syncStatus = 'ok';
        // Don't re-render if user is typing in a textarea
        const active = document.activeElement;
        if (active && active.tagName === 'TEXTAREA') {
          updateSyncBadge();
        } else {
          render();
        }
      }
    }
  }, (err) => {
    console.error('Snapshot error:', err);
    state.syncStatus = 'error';
    updateSyncBadge();
  });
}

// ─── DATA HELPERS ───────────────────────────────────────────────────────
function updateWeek(weekNum, field, value) {
  state.userData = {
    ...state.userData,
    [weekNum]: { ...(state.userData[weekNum] || {}), [field]: value }
  };
  render();
  debouncedSave();
}

function setCurrentWeek(w) {
  state.currentWeek = Math.max(1, Math.min(208, w));
  render();
  debouncedSave();
}

function getStats() {
  const doneCount = WEEKS.filter(w => state.userData[w.w]?.done).length;
  const ratedCount = WEEKS.filter(w => state.userData[w.w]?.rating > 0).length;
  const repeatCount = WEEKS.filter(w => state.userData[w.w]?.repeat).length;
  const pct = Math.round((doneCount / WEEKS.length) * 100);
  return { doneCount, ratedCount, repeatCount, pct };
}

function phaseAvg(phaseId) {
  const pw = WEEKS.filter(w => w.phase === phaseId && state.userData[w.w]?.rating > 0);
  if (!pw.length) return null;
  return (pw.reduce((s, w) => s + state.userData[w.w].rating, 0) / pw.length).toFixed(1);
}

function totalAvg() {
  const rated = WEEKS.filter(w => state.userData[w.w]?.rating > 0);
  if (!rated.length) return null;
  return (rated.reduce((s, w) => s + state.userData[w.w].rating, 0) / rated.length).toFixed(1);
}

function getFilteredWeeks() {
  return WEEKS.filter(w => {
    if (state.phaseFilter > 0 && w.phase !== state.phaseFilter) return false;
    const ud = state.userData[w.w] || {};
    if (state.statusFilter === 'done' && !ud.done) return false;
    if (state.statusFilter === 'todo' && ud.done) return false;
    if (state.statusFilter === 'repeat' && !ud.repeat) return false;
    if (state.search) {
      const s = state.search.toLowerCase();
      const fields = [w.theme, w.dish, w.source, w.technique, w.check, w.desc || '', w.details || '', w.resource || '', ud.notes || ''].join(' ').toLowerCase();
      if (!fields.includes(s)) return false;
    }
    return true;
  });
}

// ─── EXPORT / IMPORT ────────────────────────────────────────────────────
function exportJSON() {
  const data = { userData: state.userData, currentWeek: state.currentWeek, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `cooking-plan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.userData) {
        state.userData = data.userData;
        if (data.currentWeek) state.currentWeek = data.currentWeek;
        render();
        await saveToFirestore();
        alert('Import erfolgreich!');
      }
    } catch (err) {
      alert('Fehler beim Import: ' + err.message);
    }
  };
  input.click();
}

// ─── SVG ICONS ──────────────────────────────────────────────────────────
const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="6,9 12,15 18,9"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  google: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
};

// ─── THEME & TYPE SIZE ──────────────────────────────────────────────────
function applyTheme() {
  const root = document.documentElement;
  let mode = state.theme;
  if (mode === 'auto') {
    mode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
  }
  root.setAttribute('data-theme', mode);
  // Update meta theme-color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = mode === 'day' ? '#f5f5f7' : '#0c0e14';
}

function applyTypeSize() {
  document.documentElement.setAttribute('data-size', state.typeSize);
}

function setTheme(t) {
  state.theme = t;
  localStorage.setItem('kp-theme', t);
  applyTheme();
  render();
}

function setTypeSize(s) {
  state.typeSize = s;
  localStorage.setItem('kp-typesize', s);
  applyTypeSize();
  render();
}

// Apply on load
applyTheme();
applyTypeSize();
// Listen for system theme changes (for auto mode)
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (state.theme === 'auto') applyTheme();
});

// ─── RENDER ─────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('app');
  if (!root) return;

  // Loading
  if (state.loading) {
    root.innerHTML = '<div class="loading-screen">Laden…</div>';
    return;
  }

  // Login screen
  if (!state.user) {
    root.innerHTML = `
      <div class="login-screen">
        <div class="login-logo"><svg viewBox="0 -150 916 1000" width="72" height="72"><path fill="#D3072B" d="M624 69v-49q0 -74 -47 -122t-119 -48q-78 0 -122 49t-44 131v15q0 4 1 7l1 17q-74 -53 -133 -53q-46 0 -88 31q-40 29 -59 76q-14 33 -14 66q0 101 116 154l15 7q-131 60 -131 162q0 69 48 121t114 52q60 0 119 -43l13 -10q-2 20 -2 48q0 75 47 122.5t119 47.5q79 0 122.5 -49.5t43.5 -129.5v-39q74 53 132 53q65 0 112.5 -52.5t47.5 -120.5q0 -102 -116 -155l-15 -7q131 -60 131 -161q0 -65 -47 -119t-113.5 -54t-117.5 42zM540 238q116 -169 215 -169q41 0 74.5 37t33.5 83q0 124 -268 147v29q133 11 200.5 48t67.5 99q0 45 -32.5 82.5t-75.5 37.5q-101 0 -215 -170l-26 15q57 116 57 196q0 124 -113 124q-54 0 -84 -33q-29 -35 -29 -88q0 -80 57 -199l-26 -15q-114 170 -215 170q-41 0 -74.5 -35.5t-33.5 -84.5q0 -124 267 -147v-29q-267 -22 -267 -147q0 -44 32 -82t76 -38q99 0 215 169l26 -14q-57 -117 -57 -200q0 -53 29 -88q30 -33 84 -33q113 0 113 123q0 81 -57 198z"/></svg></div>
        <div class="login-title">Kochen auf<br><em>Michelin-Stern-Niveau</em></div>
        <p class="login-sub">208-Wochen-Studienplan. Anmelden, um deinen Fortschritt zu synchronisieren.</p>
        <button class="login-btn" id="login-btn">${icons.google} Mit Google anmelden</button>
        <button class="login-btn demo" id="demo-btn">🖥 Demo-Modus (lokal)</button>
        <div id="login-error" class="login-error">${state.bootError ? 'Firebase-Fehler: ' + esc(state.bootError) : ''}</div>
      </div>`;
    document.getElementById('login-btn')?.addEventListener('click', async () => {
      const errorEl = document.getElementById('login-error');

      // Check if Firebase loaded successfully
      if (!initFirebase.ready) {
        errorEl.textContent = 'Firebase konnte nicht geladen werden. Prüfe deine FIREBASE_CONFIG in app.js und lade die Seite neu.';
        return;
      }

      try {
        errorEl.textContent = 'Anmeldung läuft…';
        const provider = new initFirebase.GoogleAuthProvider();
        // Try popup first (works on desktop), fall back to redirect (works on mobile Safari)
        try {
          await initFirebase.signInWithPopup(initFirebase.auth, provider);
        } catch (popupErr) {
          if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/popup-closed-by-user' || popupErr.code === 'auth/cancelled-popup-request') {
            errorEl.textContent = 'Weiterleitung zu Google…';
            await initFirebase.signInWithRedirect(initFirebase.auth, provider);
          } else {
            throw popupErr;
          }
        }
      } catch (e) {
        console.error('Login error:', e);
        errorEl.textContent = 'Fehler: ' + (e.message || e.code || 'Unbekannter Fehler');
      }
    });
    document.getElementById('demo-btn')?.addEventListener('click', startDemoMode);
    return;
  }

  // Main app
  let html = '';

  // ── HOME TAB ──
  if (state.tab === 'home') {
    const { doneCount, ratedCount, repeatCount, pct } = getStats();
    const cw = WEEKS.find(w => w.w === state.currentWeek);

    html += `
      <div class="hdr">
        <div class="hdr-top">
          <div>
            <div class="hdr-label"><svg viewBox="0 -150 916 1000" width="14" height="14" style="vertical-align:-1px;margin-right:2px"><path fill="#D3072B" d="M624 69v-49q0 -74 -47 -122t-119 -48q-78 0 -122 49t-44 131v15q0 4 1 7l1 17q-74 -53 -133 -53q-46 0 -88 31q-40 29 -59 76q-14 33 -14 66q0 101 116 154l15 7q-131 60 -131 162q0 69 48 121t114 52q60 0 119 -43l13 -10q-2 20 -2 48q0 75 47 122.5t119 47.5q79 0 122.5 -49.5t43.5 -129.5v-39q74 53 132 53q65 0 112.5 -52.5t47.5 -120.5q0 -102 -116 -155l-15 -7q131 -60 131 -161q0 -65 -47 -119t-113.5 -54t-117.5 42zM540 238q116 -169 215 -169q41 0 74.5 37t33.5 83q0 124 -268 147v29q133 11 200.5 48t67.5 99q0 45 -32.5 82.5t-75.5 37.5q-101 0 -215 -170l-26 15q57 116 57 196q0 124 -113 124q-54 0 -84 -33q-29 -35 -29 -88q0 -80 57 -199l-26 -15q-114 170 -215 170q-41 0 -74.5 -35.5t-33.5 -84.5q0 -124 267 -147v-29q-267 -22 -267 -147q0 -44 32 -82t76 -38q99 0 215 169l26 -14q-57 -117 -57 -200q0 -53 29 -88q30 -33 84 -33q113 0 113 123q0 81 -57 198z"/></svg> 4-Jahres-Studienplan</div>
            <h1>Kochen auf<br><em>Michelin-Stern-Niveau</em></h1>
          </div>
          <div class="user-pill" id="user-pill" title="Abmelden">
            ${state.user.photoURL ? `<img src="${state.user.photoURL}" alt="" referrerpolicy="no-referrer">` : `<span class="user-avatar-fallback">${(state.user.displayName || 'D')[0]}</span>`}
            <span class="sync-dot ${state.syncStatus}"></span>
          </div>
        </div>
      </div>

      <div class="prog-bar">
        <div class="prog-top">
          <span class="prog-label">Gesamtfortschritt</span>
          <span class="prog-pct">${pct}%</span>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
        <div class="prog-stats">
          <span class="prog-stat"><span class="prog-dot" style="background:var(--green)"></span>${doneCount} erledigt</span>
          <span class="prog-stat"><span class="prog-dot" style="background:var(--blue)"></span>${ratedCount} bewertet</span>
          <span class="prog-stat"><span class="prog-dot" style="background:var(--red)"></span>${repeatCount} wiederholen</span>
          <span class="prog-stat"><span class="prog-dot" style="background:var(--text-d)"></span>${WEEKS.length - doneCount} offen</span>
        </div>
      </div>

      <div class="set-week-row">
        <span class="set-week-label">Aktuelle Woche:</span>
        <input class="set-week-input" type="number" min="1" max="208" value="${state.currentWeek}" id="cw-input">
        <span class="set-week-label" style="color:var(--text-d)">von 208</span>
      </div>`;

    if (cw) {
      html += `
        <div class="current-banner" id="goto-current">
          <div class="cb-label">▶ Diese Woche</div>
          <div class="cb-theme">${esc(cw.theme)}</div>
          ${cw.dish ? `<div class="cb-sub">${esc(cw.dish)}</div>` : ''}
        </div>`;
    }

    if (repeatCount > 0) {
      html += `
        <div class="current-banner repeat" id="goto-repeat">
          <div class="cb-label red">⟳ Wiederholung nötig</div>
          <div class="cb-theme" style="font-size:13px">${repeatCount} Woche${repeatCount > 1 ? 'n' : ''} markiert</div>
        </div>`;
    }

    html += `<div style="padding:16px 20px"><div class="avg-box">`;
    PHASES.forEach(p => {
      const a = phaseAvg(p.id);
      html += `<div class="avg-item"><div class="avg-num" style="color:${p.color}">${a || '–'}</div><div class="avg-label">Phase ${p.id}</div></div>`;
    });
    const ta = totalAvg();
    html += `<div class="avg-item"><div class="avg-num" style="color:var(--accent)">${ta || '–'}</div><div class="avg-label">Gesamt</div></div>`;
    html += `</div></div>`;

    // Export buttons
    html += `
      <div style="padding:0 20px 20px">
        <div class="export-row">
          <button class="export-btn" id="btn-export">📥 JSON-Backup exportieren</button>
          <button class="export-btn" id="btn-import">📤 Backup importieren</button>
        </div>
      </div>`;
  }

  // ── PLAN TAB ──
  if (state.tab === 'plan') {
    html += `
      <div class="search-wrap">
        <span class="search-icon">${icons.search}</span>
        <input class="search-input" placeholder="Suche (Gericht, Technik, Quelle…)" value="${esc(state.search)}" id="search-input">
      </div>
      <div class="phase-pills">
        <button class="phase-pill ${state.phaseFilter === 0 ? 'active' : ''}" data-phase="0">Alle</button>
        ${PHASES.map(p => `<button class="phase-pill ${state.phaseFilter === p.id ? 'active' : ''}" data-phase="${p.id}" ${state.phaseFilter === p.id ? `style="border-color:${p.color};color:${p.color};background:${p.color}15"` : ''}>${p.name}</button>`).join('')}
      </div>
      <div class="filter-row">
        ${[['all', 'Alle'], ['todo', 'Offen'], ['done', 'Erledigt'], ['repeat', '⟳ Wiederholen']].map(([k, l]) =>
      `<button class="filter-chip ${state.statusFilter === k ? 'active' : ''}" data-filter="${k}">${l}</button>`).join('')}
      </div>
      <div class="week-list">`;

    const filtered = getFilteredWeeks();
    if (filtered.length === 0) {
      html += '<div class="empty-state">Keine Wochen gefunden.</div>';
    } else {
      filtered.forEach(w => {
        const ud = state.userData[w.w] || {};
        const isOpen = state.expanded === w.w;
        const isCurrent = w.w === state.currentWeek;
        const pc = PHASES.find(p => p.id === w.phase)?.color || '#818cf8';
        const ri = RATING_LABELS[ud.rating || 0];

        let cls = 'week-card';
        if (isCurrent) cls += ' current';
        if (ud.repeat) cls += ' needs-repeat';
        if (ud.done && !isCurrent) cls += ' done';

        html += `<div class="${cls}"><div class="wc-top" data-toggle="${w.w}">`;
        html += `<span class="wc-week" style="color:${pc}">W${w.w}</span>`;
        html += `<span class="wc-theme">${esc(w.theme)}</span>`;
        if (ud.done) html += `<span class="wc-check-done" style="background:rgba(34,197,94,0.15);color:var(--green)">✓</span>`;
        if ((ud.rating || 0) > 0) html += `<span class="wc-rating" style="background:${ri.color}18;color:${ri.color}">${ud.rating}</span>`;
        html += `<span class="wc-chevron ${isOpen ? 'open' : ''}">${icons.chevron}</span>`;
        html += `</div>`;

        if (isOpen) {
          html += `<div class="wc-body">`;
          if (w.desc) html += `<div class="wc-desc">${esc(w.desc)}</div>`;
          if (w.dish) html += `<div class="wc-field"><div class="wc-field-label">Gericht</div><div class="wc-field-val dish">${esc(w.dish)}${w.ownBook ? '<span class="wc-own-book">📚 Eigenes Buch</span>' : ''}</div></div>`;
          if (w.source) html += `<div class="wc-field"><div class="wc-field-label">Quelle</div><div class="wc-field-val">${esc(w.source)}</div></div>`;
          if (w.technique) html += `<div class="wc-field"><div class="wc-field-label">Schlüsseltechnik</div><div class="wc-field-val">${esc(w.technique)}</div></div>`;
          if (w.details) html += `<div class="wc-field"><div class="wc-field-label">Technik-Details</div><div class="wc-field-val wc-details">${esc(w.details)}</div></div>`;
          if (w.links && w.links.length > 0) {
            html += `<div class="wc-field"><div class="wc-field-label">Ressourcen & Links</div><div class="wc-links">`;
            if (w.resource) html += `<div class="wc-resource">${esc(w.resource)}</div>`;
            w.links.forEach((link, i) => {
              const isYT = link.includes('youtube.com') || link.includes('youtu.be');
              const isSE = link.includes('seriouseats.com');
              const label = isYT ? `▶ Video ${w.links.filter((l,j) => j<=i && (l.includes('youtube') || l.includes('youtu.be'))).length}` : isSE ? '📖 Serious Eats' : '🔗 Link';
              html += `<a href="${esc(link)}" target="_blank" rel="noopener" class="wc-link ${isYT ? 'yt' : isSE ? 'se' : ''}">${label}</a>`;
            });
            html += `</div></div>`;
          } else if (w.resource) {
            html += `<div class="wc-field"><div class="wc-field-label">Ressource</div><div class="wc-field-val">${esc(w.resource)}</div></div>`;
          }
          if (w.check) html += `<div class="wc-field"><div class="wc-field-label">Selbstprüfung</div><div class="wc-field-val" style="color:var(--amber);font-style:italic">${esc(w.check)}</div></div>`;

          // Rating
          html += `<div class="wc-field"><div class="wc-field-label">Bewertung (1–5)</div><div class="rating-sel">`;
          for (let r = 1; r <= 5; r++) {
            const active = ud.rating === r;
            const style = active ? `border-color:${RATING_LABELS[r].color};color:${RATING_LABELS[r].color};background:${RATING_LABELS[r].color}20` : '';
            html += `<button class="rating-btn ${active ? 'active' : ''}" style="${style}" data-rate="${w.w}-${r}">${r}</button>`;
          }
          html += `</div>`;
          if ((ud.rating || 0) > 0) html += `<div class="rating-desc" style="color:${RATING_LABELS[ud.rating].color}">${RATING_LABELS[ud.rating].desc}</div>`;
          html += `</div>`;

          // Done toggle
          html += `<div class="toggle-row"><button class="toggle-btn green ${ud.done ? 'on' : ''}" data-done="${w.w}"></button><span class="toggle-label">${ud.done ? 'Erledigt ✓' : 'Als erledigt markieren'}</span></div>`;

          // Repeat toggle
          html += `<div class="toggle-row"><button class="toggle-btn red ${ud.repeat ? 'on' : ''}" data-repeat="${w.w}"></button><span class="toggle-label" style="color:${ud.repeat ? 'var(--red)' : 'var(--text-m)'}">${ud.repeat ? '⟳ Wiederholung nötig' : 'Wiederholung markieren'}</span></div>`;

          // Notes
          html += `<div class="wc-field" style="margin-top:10px"><div class="wc-field-label">Notizen</div><textarea class="notes-area" placeholder="Was lief gut? Was war schwierig?" data-notes="${w.w}" rows="3">${esc(ud.notes || '')}</textarea></div>`;

          html += `</div>`; // .wc-body
        }

        html += `</div>`; // .week-card
      });
    }
    html += `</div>`; // .week-list
  }

  // ── ASSESS TAB ──
  if (state.tab === 'assess') {
    html += `<div class="assess"><h2>Selbstbewertung</h2>`;

    html += `<div class="assess-card"><h3>Bewertungsskala</h3>`;
    for (let r = 1; r <= 5; r++) {
      html += `<div class="scale-row"><span class="scale-num" style="color:${RATING_LABELS[r].color}">${r}</span><span class="scale-desc"><strong>${RATING_LABELS[r].desc}</strong></span></div>`;
    }
    html += `</div>`;

    html += `<div class="assess-card"><h3>Phasen-Durchschnitte</h3><div class="avg-box">`;
    PHASES.forEach(p => {
      const a = phaseAvg(p.id);
      html += `<div class="avg-item"><div class="avg-num" style="color:${p.color}">${a || '–'}</div><div class="avg-label">Phase ${p.id}</div></div>`;
    });
    html += `</div><div class="phase-thresh">Phase 1→2: Ø ≥ 3,0 · Phase 2→3: Ø ≥ 3,5 · Phase 3→4: Ø ≥ 3,5 · „Ankunft": Ø ≥ 4,0</div></div>`;

    html += `<div class="assess-card"><h3>Finale „Ankunft"-Kriterien</h3>`;
    ARRIVAL_CRITERIA.forEach(c => { html += `<div class="milestone-item">${esc(c)}</div>`; });
    html += `</div>`;

    html += `
      <div class="export-row">
        <button class="export-btn" id="btn-export2">📥 JSON-Backup exportieren</button>
        <button class="export-btn" id="btn-import2">📤 Backup importieren</button>
      </div>`;

    html += `</div>`;
  }

  // ── SETTINGS TAB ──
  if (state.tab === 'settings') {
    const themeOpts = [
      { val:'day', label:'Hell', icon:'☀️' },
      { val:'night', label:'Dunkel', icon:'🌙' },
      { val:'auto', label:'Auto', icon:'💻' },
    ];
    const sizeOpts = [
      { val:'small', label:'Klein' },
      { val:'medium', label:'Mittel' },
      { val:'large', label:'Groß' },
    ];

    html += `<div class="settings"><h2>Einstellungen</h2>`;

    // Theme
    html += `<div class="settings-card"><div class="settings-label">Erscheinungsbild</div><div class="settings-row">`;
    themeOpts.forEach(o => {
      html += `<button class="settings-option ${state.theme === o.val ? 'active' : ''}" data-theme="${o.val}"><span class="settings-icon">${o.icon}</span>${o.label}</button>`;
    });
    html += `</div></div>`;

    // Type size
    html += `<div class="settings-card"><div class="settings-label">Schriftgröße</div><div class="settings-row">`;
    sizeOpts.forEach(o => {
      html += `<button class="settings-option ${state.typeSize === o.val ? 'active' : ''}" data-typesize="${o.val}"><span class="settings-size-preview size-${o.val}">Aa</span>${o.label}</button>`;
    });
    html += `</div></div>`;

    // Logout
    html += `<div class="settings-card">
      <button class="settings-logout" id="settings-logout">${icons.logout} Abmelden</button>
    </div>`;

    html += `</div>`;
  }

  // ── NAV ──
  html += `<nav class="nav">
    <button class="nav-btn ${state.tab === 'home' ? 'active' : ''}" data-tab="home">${icons.home}Home</button>
    <button class="nav-btn ${state.tab === 'plan' ? 'active' : ''}" data-tab="plan">${icons.list}Lehrplan</button>
    <button class="nav-btn ${state.tab === 'assess' ? 'active' : ''}" data-tab="assess">${icons.star}Bewertung</button>
    <button class="nav-btn ${state.tab === 'settings' ? 'active' : ''}" data-tab="settings">${icons.settings}Settings</button>
  </nav>`;

  root.innerHTML = html;
  bindEvents();
}

// ─── EVENT BINDING ──────────────────────────────────────────────────────
function bindEvents() {
  // Nav
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => setState({ tab: el.dataset.tab }));
  });

  // User pill (logout)
  document.getElementById('user-pill')?.addEventListener('click', async () => {
    if (confirm('Abmelden?')) {
      if (state.demoMode) {
        state.user = null; state.demoMode = false; state.userData = {}; state.currentWeek = 1;
        render(); return;
      }
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      await initFirebase.signOut(initFirebase.auth);
    }
  });

  // Current week input
  document.getElementById('cw-input')?.addEventListener('change', (e) => {
    setCurrentWeek(parseInt(e.target.value) || 1);
  });

  // Goto current week
  document.getElementById('goto-current')?.addEventListener('click', () => {
    setState({ tab: 'plan', expanded: state.currentWeek, phaseFilter: 0, statusFilter: 'all', search: '' });
  });

  // Goto repeat
  document.getElementById('goto-repeat')?.addEventListener('click', () => {
    setState({ tab: 'plan', statusFilter: 'repeat', phaseFilter: 0, search: '' });
  });

  // Export / Import
  document.getElementById('btn-export')?.addEventListener('click', exportJSON);
  document.getElementById('btn-export2')?.addEventListener('click', exportJSON);
  document.getElementById('btn-import')?.addEventListener('click', importJSON);
  document.getElementById('btn-import2')?.addEventListener('click', importJSON);

  // Search
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.search = e.target.value;
    render();
    // Re-focus search after render
    setTimeout(() => {
      const inp = document.getElementById('search-input');
      if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
    }, 0);
  });

  // Phase pills
  document.querySelectorAll('[data-phase]').forEach(el => {
    el.addEventListener('click', () => {
      const p = parseInt(el.dataset.phase);
      setState({ phaseFilter: state.phaseFilter === p ? 0 : p });
    });
  });

  // Filter chips
  document.querySelectorAll('[data-filter]').forEach(el => {
    el.addEventListener('click', () => {
      const f = el.dataset.filter;
      setState({ statusFilter: state.statusFilter === f ? 'all' : f });
    });
  });

  // Toggle week expand
  document.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const w = parseInt(el.dataset.toggle);
      setState({ expanded: state.expanded === w ? null : w });
    });
  });

  // Rating buttons
  document.querySelectorAll('[data-rate]').forEach(el => {
    el.addEventListener('click', () => {
      const [w, r] = el.dataset.rate.split('-').map(Number);
      const current = state.userData[w]?.rating;
      updateWeek(w, 'rating', current === r ? 0 : r);
    });
  });

  // Done toggles
  document.querySelectorAll('[data-done]').forEach(el => {
    el.addEventListener('click', () => {
      const w = parseInt(el.dataset.done);
      updateWeek(w, 'done', !state.userData[w]?.done);
    });
  });

  // Repeat toggles
  document.querySelectorAll('[data-repeat]').forEach(el => {
    el.addEventListener('click', () => {
      const w = parseInt(el.dataset.repeat);
      updateWeek(w, 'repeat', !state.userData[w]?.repeat);
    });
  });

  // Notes (debounced)
  document.querySelectorAll('[data-notes]').forEach(el => {
    el.addEventListener('input', (e) => {
      const w = parseInt(el.dataset.notes);
      state.userData = { ...state.userData, [w]: { ...(state.userData[w] || {}), notes: e.target.value } };
      debouncedSave();
    });
  });

  // Settings: theme
  document.querySelectorAll('[data-theme]').forEach(el => {
    el.addEventListener('click', () => setTheme(el.dataset.theme));
  });

  // Settings: type size
  document.querySelectorAll('[data-typesize]').forEach(el => {
    el.addEventListener('click', () => setTypeSize(el.dataset.typesize));
  });

  // Settings: logout
  document.getElementById('settings-logout')?.addEventListener('click', async () => {
    if (confirm('Abmelden?')) {
      if (state.demoMode) {
        state.user = null; state.demoMode = false; state.userData = {}; state.currentWeek = 1;
        render(); return;
      }
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      await initFirebase.signOut(initFirebase.auth);
    }
  });
}

// ─── HELPERS ────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── BOOT ───────────────────────────────────────────────────────────────
async function boot() {
  try {
    await loadData();
    await initFirebase();
    initFirebase.onAuthStateChanged(initFirebase.auth, (user) => {
      currentUser = user;
      state.user = user;
      state.loading = false;
      if (user) {
        listenToFirestore();
      } else {
        state.userData = {};
        state.currentWeek = 1;
        if (unsubscribeSnapshot) unsubscribeSnapshot();
      }
      render();
    });
  } catch (e) {
    console.error('Boot error:', e);
    state.loading = false;
    state.bootError = e.message || String(e);
    render();
  }
}

boot();

