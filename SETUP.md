# Kochplan App — Einrichtungsanleitung

## Was du brauchst

- Einen Google-Account (hast du vermutlich)
- Einen GitHub-Account (hast du bestätigt)
- 10 Minuten Zeit

---

## Schritt 1: Firebase-Projekt erstellen

1. Gehe zu **[console.firebase.google.com](https://console.firebase.google.com/)**
2. Klicke **„Projekt erstellen"**
3. Nenne es z.B. `kochplan` (Name ist egal)
4. Google Analytics kannst du **deaktivieren** (brauchst du nicht)
5. Klicke **„Projekt erstellen"** → warte kurz → **„Weiter"**

---

## Schritt 2: Web-App hinzufügen

1. Im Firebase-Dashboard: klicke auf das **Web-Symbol** (`</>`) oben
2. App-Name: `kochplan-web`
3. **Firebase Hosting** kannst du überspringen (wir nutzen GitHub Pages)
4. Klicke **„App registrieren"**
5. Du siehst jetzt die **Firebase-Konfiguration** — kopiere diese Werte:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "kochplan-xyz.firebaseapp.com",
  projectId: "kochplan-xyz",
  storageBucket: "kochplan-xyz.appspot.com",
  messagingSenderId: "123...",
  appId: "1:123...:web:abc..."
};
```

6. Öffne `app.js` und ersetze den Block `FIREBASE_CONFIG` (Zeile ~8) mit deinen Werten.

---

## Schritt 3: Google-Login aktivieren

1. Im Firebase-Dashboard → Linkes Menü → **„Authentication"**
2. Klicke **„Erste Schritte"**
3. Tab **„Sign-in method"** → Klicke auf **„Google"**
4. **Aktivieren** (Schalter oben rechts)
5. Wähle eine **Support-E-Mail** (deine Google-E-Mail)
6. **Speichern**

---

## Schritt 4: Firestore-Datenbank erstellen

1. Im Firebase-Dashboard → Linkes Menü → **„Firestore Database"**
2. Klicke **„Datenbank erstellen"**
3. Standort: **`europe-west3` (Frankfurt)** — oder was dir am nächsten ist
4. Sicherheitsregeln: Starte mit **„Im Testmodus starten"**
5. Klicke **„Erstellen"**

### Sicherheitsregeln anpassen (wichtig!)

Nachdem die Datenbank erstellt ist:

1. Gehe zu **Firestore → Regeln**
2. Ersetze den Inhalt mit:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Klicke **„Veröffentlichen"**

> Diese Regel stellt sicher, dass nur DU deine eigenen Daten lesen/schreiben kannst.

---

## Schritt 5: Auf GitHub Pages deployen

### Option A: Neues Repository (empfohlen)

1. Erstelle ein neues **privates** Repository auf GitHub, z.B. `kochplan`
2. Lade diese 5 Dateien hoch:
   - `index.html`
   - `app.js` (mit deiner Firebase-Config!)
   - `data.js`
   - `style.css`
   - `manifest.json`
3. Gehe zu **Settings → Pages**
4. Source: **„Deploy from a branch"**
5. Branch: **`main`**, Ordner: **`/ (root)`**
6. **Save**
7. Nach 1–2 Minuten ist deine App live unter:
   `https://DEIN-USERNAME.github.io/kochplan/`

### Option B: Netlify (falls du das bevorzugst)

1. Gehe zu [app.netlify.com](https://app.netlify.com/)
2. **„Add new site" → „Deploy manually"**
3. Ziehe den Ordner mit allen 5 Dateien rein
4. Fertig — du bekommst eine URL wie `https://xyz.netlify.app`

---

## Schritt 6: Authorized Domain in Firebase eintragen

Firebase muss wissen, von welcher URL der Login kommen darf:

1. Firebase → **Authentication → Settings → Authorized domains**
2. Klicke **„Domain hinzufügen"**
3. Trage ein: `DEIN-USERNAME.github.io` (oder deine Netlify-URL)
4. **Hinzufügen**

---

## Schritt 7: Auf dem iPhone installieren

1. Öffne die URL in **Safari** auf dem iPhone
2. Tippe auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben)
3. Scrolle runter → **„Zum Home-Bildschirm"**
4. Bestätige mit **„Hinzufügen"**
5. Die App erscheint als Icon auf deinem Home Screen 🔪

---

## Fertig!

- **Automatische Speicherung**: Jede Änderung wird nach 0.8 Sekunden in Firestore gespeichert
- **Echtzeit-Sync**: Öffnest du die App auf dem Mac, siehst du sofort die iPhone-Änderungen
- **Offline**: Die App funktioniert auch ohne Internet (Änderungen werden beim nächsten Online-Gang synchronisiert)
- **Backup**: Jederzeit über „JSON-Backup exportieren" auf dem Home-Tab

---

## Dateien-Übersicht

| Datei | Inhalt |
|-------|--------|
| `index.html` | HTML-Shell, Meta-Tags, PWA-Setup |
| `app.js` | Firebase Auth + Firestore + gesamte App-Logik |
| `data.js` | Alle 208 Wochen, Phasen, Bewertungsskala |
| `style.css` | Mobile-first Dark-Theme-Styling |
| `manifest.json` | PWA-Manifest für „Add to Home Screen" |
| `SETUP.md` | Diese Anleitung |

---

## Troubleshooting

**Login funktioniert nicht?**
→ Prüfe ob deine Domain unter Firebase → Authentication → Authorized domains eingetragen ist.

**Daten werden nicht gespeichert?**
→ Prüfe die Firestore-Regeln (Schritt 4).
→ Öffne die Browser-Konsole (F12) und schaue nach Fehlern.

**App sieht auf dem iPhone komisch aus?**
→ Stelle sicher, dass du über HTTPS zugreifst (GitHub Pages macht das automatisch).
