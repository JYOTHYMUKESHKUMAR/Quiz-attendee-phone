# ⚡ QuizLive — Complete Event Quiz System

A real-time live quiz system with QR code joining, live leaderboard, and winner announcement.
No frameworks needed — pure HTML/CSS/JS + Firebase.

\---

## 📁 Files

|File|Purpose|Who uses it|
|-|-|-|
|`host-display.html`|Big screen / projector display|Host / organizer|
|`attendee-phone.html`|Mobile page attendees open via QR scan|Every attendee|
|`admin-panel.html`|Manage questions, control quiz, export results|Host / organizer|

\---

## 🚀 Quick Start (Demo Mode — No Firebase)

1. Open `host-display.html` in a browser
2. Click **"Run in Demo Mode"**
3. Click **Start Quiz** — simulated participants will answer automatically

For `admin-panel.html`, also click **Demo Mode**.

\---

## 🔥 Full Setup with Firebase (Real Event)

### Step 1 — Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project** → give it a name
3. Go to **Build → Realtime Database** → Create Database → Start in **test mode**
4. Note your **Database URL** (looks like: `https://yourproject-default-rtdb.firebaseio.com`)

### Step 2 — Get Your API Key

1. In Firebase Console → Project Settings (gear icon)
2. Under **Your apps** → Add app → Web
3. Copy the `apiKey` and `projectId` values

// Import the functions you need from the SDKs you need

import { initializeApp } from "firebase/app";

import { getAnalytics } from "firebase/analytics";

// TODO: Add SDKs for Firebase products that you want to use

// https://firebase.google.com/docs/web/setup#available-libraries



// Your web app's Firebase configuration

// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {

&#x20; apiKey: "AIzaSyCUE5wZfbJ4S0dVWdQunELMcldBUwBR544",

&#x20; authDomain: "quiz-90492.firebaseapp.com",

&#x20; databaseURL: "https://quiz-90492-default-rtdb.firebaseio.com",

&#x20; projectId: "quiz-90492",

&#x20; storageBucket: "quiz-90492.firebasestorage.app",

&#x20; messagingSenderId: "732430544194",

&#x20; appId: "1:732430544194:web:4c9a8454a2e5a2aff72cdb",

&#x20; measurementId: "G-R5X81B5FYB"

};



// Initialize Firebase

const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);

### Step 3 — Update attendee-phone.html

Open `attendee-phone.html` and find this section near the bottom:

```javascript
const FIREBASE\\\\\\\_CONFIG = {
  apiKey: "YOUR\\\\\\\_API\\\\\\\_KEY",              // ← paste your key
  databaseURL: "https://YOUR\\\\\\\_PROJECT\\\\\\\_ID-default-rtdb.firebaseio.com",  // ← your DB URL
  projectId: "YOUR\\\\\\\_PROJECT\\\\\\\_ID"         // ← your project ID
};
```

Replace the placeholder values.

### Step 4 — Host the attendee page

Upload `attendee-phone.html` to any static hosting:

* **GitHub Pages** (free): push to a repo, enable Pages
* **Netlify** (free): drag-and-drop the file at netlify.com
* **Vercel** (free): `npx vercel` in the folder

Your attendee URL will be something like:
`https://yourname.github.io/quiz/attendee-phone.html?room=ROOM001`

### Step 5 — Generate Real QR Code

1. Open `host-display.html` → Connect Firebase
2. Enter your join URL in the "Quiz Join URL" field
3. The QR will auto-generate (uses a visual placeholder — for production, swap the `drawFakeQR` function with the `qrcode.js` library):

```html
<!-- Add before </head> in host-display.html -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
```

```javascript
// Replace drawFakeQR call with:
new QRCode(document.getElementById('qr-canvas'), {
  text: url + '?room=' + roomCode,
  width: 200, height: 200
});
```

### Step 6 — Firebase Security Rules (for production)

In Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        "participants": { ".write": true },
        "answers": { ".write": true },
        "questions": { ".write": "auth != null" },
        "status": { ".write": "auth != null" },
        "currentQuestion": { ".write": "auth != null" },
        "revealAnswer": { ".write": "auth != null" },
        "winner": { ".write": "auth != null" }
      }
    }
  }
}
```

\---

## 🎯 How to Run Your Event

1. **Before the event:** Open `admin-panel.html`, connect Firebase, add your questions
2. **At the event:** Open `host-display.html` on the projector/big screen
3. **Attendees join:** They scan the QR code with their phone → enter name \& email → wait
4. **Start:** Click "Start Quiz" on host display (or admin panel)
5. **Each question:** 20-second (or custom) countdown shows on screen. Attendees tap their answer on their phone. First correct answer appears on screen live.
6. **Between questions:** Leaderboard shows with name, email, correct count, avg speed, points
7. **End:** Click "Announce Winner" — winner displayed with full stats on big screen
8. **Export:** Go to admin panel → Results Export → Download CSV

\---

## ⚙️ Customization

### Change Questions

In `admin-panel.html`, use the form to add questions with custom text, options, correct answer, and time limit. Or edit the `QUESTIONS` array directly in `host-display.html`.

### Change Timer

Each question has its own time setting. Default is 20 seconds.

### Scoring Formula

Points per question = `max(100, 1000 - (responseTimeMs / 30))`

* Answer in 1 second → \~967 pts
* Answer in 10 seconds → \~667 pts
* Answer in 20 seconds → \~333 pts

### Room Codes

Use different room codes for different events/sessions. All data is isolated per room code.

\---

## 📊 Leaderboard Ranking Criteria

1. **Total points** (primary — more points = higher rank)
2. **Average response time** (tiebreaker — faster = higher rank)

\---

## 🛠 Tech Stack

* Pure HTML/CSS/JavaScript (no build tools needed)
* Firebase Realtime Database (free tier supports \~100 concurrent users)
* Google Fonts (Syne + DM Sans)

For larger events (500+ attendees), consider upgrading to Firebase Blaze plan.

