// ─── QR CODE GENERATOR (real scannable QR) ────────────────────────────────
function drawFakeQR(canvas, url) {
  canvas.style.display = 'none';
  const existing = document.getElementById('real-qr');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'real-qr';
  canvas.parentNode.insertBefore(div, canvas);
  new QRCode(div, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.L });
}

// ─── APP STATE ────────────────────────────────────────────────────────────
const QUESTIONS = [
  { text: "Which is the largest ocean on Earth?", options: ["Atlantic","Indian","Pacific","Arctic"], correct: 2, time: 20 },
  { text: "What does 'HTTP' stand for?", options: ["HyperText Transfer Protocol","HighText Transfer Process","HyperTool Tech Platform","HyperText Tech Protocol"], correct: 0, time: 20 },
  { text: "How many planets are in our Solar System?", options: ["7","8","9","10"], correct: 1, time: 15 },
  { text: "What year did World War II end?", options: ["1943","1944","1945","1946"], correct: 2, time: 20 },
  { text: "Which element has the chemical symbol 'Au'?", options: ["Silver","Copper","Gold","Aluminum"], correct: 2, time: 15 },
];

let db = null;
let roomCode = 'ROOM001';
let currentQ = 0;
let timerInterval = null;
let timeLeft = 20;
let totalTime = 20;
let participants = {};
let answers = {};
let isDemo = false;
let demoInterval = null;

// ─── FIREBASE CONNECT ─────────────────────────────────────────────────────
function connectFirebase() {
  const apiKey = document.getElementById('fb-apikey').value.trim();
  const projectId = document.getElementById('fb-project').value.trim();
  const databaseURL = normalizeDatabaseURL('', projectId);
  const url = document.getElementById('quiz-url').value.trim();
  roomCode = document.getElementById('room-code').value.trim() || 'ROOM001';
  if (!apiKey || !projectId) { alert('Please enter Firebase API key and project ID'); return; }
  try {
    const app = firebase.initializeApp({ apiKey, databaseURL, projectId });
    db = firebase.database();
    document.getElementById('setup-overlay').style.display = 'none';
    document.getElementById('display-url').textContent = url;
    document.getElementById('display-room').textContent = roomCode;
    drawFakeQR(document.getElementById('qr-canvas'), url + '?room=' + encodeURIComponent(roomCode) + '&apiKey=' + encodeURIComponent(apiKey) + '&projectId=' + encodeURIComponent(projectId) + '&dbUrl=' + encodeURIComponent(databaseURL));
    listenForParticipants();
    listenForAnswers();
    initRoom();
  } catch(e) { alert('Firebase error: ' + e.message); }
}

function normalizeDatabaseURL(value, projectId) {
  const url = value || `https://${projectId}-default-rtdb.firebaseio.com`;
  return url.replace(/\/+$/, '');
}

function startDemo() {
  isDemo = true;
  document.getElementById('setup-overlay').style.display = 'none';
  roomCode = document.getElementById('room-code').value || 'DEMO01';
  document.getElementById('display-room').textContent = roomCode;
  drawFakeQR(document.getElementById('qr-canvas'), 'https://quiz.demo.com/join?room=' + roomCode);
  // Fake participants
  const names = ['Arjun Mehta','Priya Sharma','Karan Singh','Sneha Patel','Dev Raj','Nisha Joshi','Rahul Kumar'];
  names.forEach((n,i) => setTimeout(() => addParticipantBadge(n, n.toLowerCase().replace(' ','.')+'@demo.com'), i*400));
}

function initRoom() {
  if (!db) return;
  db.ref(`rooms/${roomCode}`).set({ status: 'lobby', currentQuestion: -1, startedAt: Date.now() });
}

// ─── PARTICIPANTS ─────────────────────────────────────────────────────────
function listenForParticipants() {
  if (!db) return;
  db.ref(`rooms/${roomCode}/participants`).on('child_added', snap => {
    const p = snap.val();
    participants[snap.key] = p;
    addParticipantBadge(p.name, p.email);
  });
}

function addParticipantBadge(name, email) {
  participants[name] = { name, email };
  const el = document.createElement('div');
  el.className = 'badge';
  el.textContent = name;
  document.getElementById('badges').appendChild(el);
  const count = Object.keys(participants).length;
  document.getElementById('join-count').textContent = `${count} participant${count > 1 ? 's' : ''} joined`;
}

// ─── ANSWERS LISTENER ─────────────────────────────────────────────────────
function listenForAnswers() {
  if (!db) return;
  db.ref(`rooms/${roomCode}/answers`).on('value', snap => {
    const data = snap.val() || {};
    answers = data;
    updateAnswerUI();
  });
}

function updateAnswerUI() {
  const qAnswers = answers[`q${currentQ}`] || {};
  const count = Object.keys(qAnswers).length;
  const total = Object.keys(participants).length;
  document.getElementById('answer-counter').textContent = `${count} answered`;
  document.getElementById('ans-label').textContent = `${count} / ${total} answered`;
  const pct = total > 0 ? (count / total * 100) : 0;
  document.getElementById('ans-fill').style.width = pct + '%';
  // Check first correct
  const correct = QUESTIONS[currentQ].correct;
  let firstCorrect = null;
  Object.entries(qAnswers).forEach(([uid, ans]) => {
    if (ans.choice === correct) {
      if (!firstCorrect || ans.ms < firstCorrect.ms) firstCorrect = { name: ans.name, ms: ans.ms };
    }
  });
  if (firstCorrect) showFirstCorrect(firstCorrect.name, firstCorrect.ms);
}

let toastShown = false;
function showFirstCorrect(name, ms) {
  if (toastShown) return;
  toastShown = true;
  const toast = document.getElementById('first-toast');
  toast.textContent = `First correct: ${name} — ${(ms/1000).toFixed(1)}s`;
  toast.style.display = 'block';
}

// ─── QUIZ FLOW ─────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function startQuiz() {
  currentQ = 0;
  if (db) {
    // Push all questions to Firebase so attendee phones can read them
    db.ref(`rooms/${roomCode}/questions`).set(QUESTIONS);
    db.ref(`rooms/${roomCode}/status`).set('playing');
    db.ref(`rooms/${roomCode}/currentQuestion`).set(0);
  }
  showQuestion();
}

function showQuestion() {
  showScreen('question-screen');
  toastShown = false;
  document.getElementById('first-toast').style.display = 'none';
  const q = QUESTIONS[currentQ];
  totalTime = q.time;
  timeLeft = totalTime;
  document.getElementById('q-badge').textContent = `Question ${currentQ+1} / ${QUESTIONS.length}`;
  document.getElementById('q-text').textContent = q.text;
  document.getElementById('answer-counter').textContent = '0 answered';
  document.getElementById('ans-fill').style.width = '0%';
  document.getElementById('ans-label').textContent = `0 / ${Object.keys(participants).length} answered`;
  // Render options
  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';
  q.options.forEach((opt, i) => {
    const card = document.createElement('div');
    card.className = 'opt-card';
    card.id = `opt-${i}`;
    card.innerHTML = `<div class="opt-letter">${['A','B','C','D'][i]}</div><span>${opt}</span>`;
    grid.appendChild(card);
  });
  // Push to Firebase
  if (db) db.ref(`rooms/${roomCode}/currentQuestion`).set(currentQ);
  // Demo: simulate answers
  if (isDemo) simulateDemoAnswers();
  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  updateTimerUI();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerUI();
    if (timeLeft <= 0) { clearInterval(timerInterval); revealAnswers(); }
  }, 1000);
}

function updateTimerUI() {
  document.getElementById('timer-val').textContent = timeLeft;
  const pct = timeLeft / totalTime;
  const circ = 213.6;
  document.getElementById('timer-arc').style.strokeDashoffset = circ * (1 - pct);
  const color = pct > 0.5 ? '#7c6af7' : pct > 0.25 ? '#f7c26a' : '#f76a6a';
  document.getElementById('timer-arc').style.stroke = color;
  document.getElementById('timer-val').style.color = color;
}

function revealAnswers() {
  clearInterval(timerInterval);
  clearInterval(demoInterval);
  const correct = QUESTIONS[currentQ].correct;
  QUESTIONS[currentQ].options.forEach((_, i) => {
    const card = document.getElementById(`opt-${i}`);
    if (!card) return;
    if (i === correct) card.classList.add('reveal-correct');
    else card.classList.add('reveal-wrong');
  });
  if (db) db.ref(`rooms/${roomCode}/revealAnswer`).set({ q: currentQ, correct, ts: Date.now() });
  setTimeout(() => showLeaderboard(), 3000);
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────
function computeScores() {
  const scores = {};
  Object.entries(participants).forEach(([key, p]) => {
    scores[key] = { name: p.name || key, email: p.email || '', pts: 0, correct: 0, totalMs: 0 };
  });
  for (let qi = 0; qi <= currentQ; qi++) {
    const qAnswers = (answers[`q${qi}`]) || {};
    const correctOpt = QUESTIONS[qi].correct;
    Object.entries(qAnswers).forEach(([uid, ans]) => {
      if (!scores[uid]) scores[uid] = { name: ans.name, email: ans.email || '', pts: 0, correct: 0, totalMs: 0 };
      if (ans.choice === correctOpt) {
        const pts = Math.max(100, 1000 - Math.floor(ans.ms / 30));
        scores[uid].pts += pts;
        scores[uid].correct++;
        scores[uid].totalMs += ans.ms;
      }
    });
  }
  return Object.values(scores).sort((a,b) => b.pts - a.pts || a.totalMs - b.totalMs);
}

function showLeaderboard() {
  showScreen('leaderboard-screen');
  document.getElementById('lb-header').textContent = `LEADERBOARD — AFTER Q${currentQ+1}`;
  const sorted = computeScores();
  const list = document.getElementById('lb-list');
  list.innerHTML = '';
  const medals = ['🥇','🥈','🥉'];
  sorted.slice(0, 7).forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    const initials = s.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const avgSpeed = s.correct > 0 ? (s.totalMs / s.correct / 1000).toFixed(1) + 's' : '—';
    row.innerHTML = `
      <span class="lb-rank">${medals[i] || (i+1)}</span>
      <div class="lb-avatar">${initials}</div>
      <div class="lb-info">
        <div class="lb-name">${s.name}</div>
        <div class="lb-meta">${s.email} · ${s.correct}/${currentQ+1} correct · avg ${avgSpeed}</div>
      </div>
      <div class="lb-right">
        <div class="lb-pts">${s.pts.toLocaleString()}</div>
        <div class="lb-detail">points</div>
      </div>`;
    list.appendChild(row);
  });
  // Progress dots
  const prog = document.getElementById('lb-progress');
  prog.innerHTML = '';
  QUESTIONS.forEach((_,i) => {
    const dot = document.createElement('div');
    dot.className = 'q-dot' + (i < currentQ ? ' done' : i === currentQ ? ' current' : '');
    prog.appendChild(dot);
  });
  const btn = document.getElementById('next-q-btn');
  if (currentQ + 1 >= QUESTIONS.length) {
    btn.textContent = 'Announce Winner';
  } else {
    btn.textContent = `Question ${currentQ+2} →`;
  }
}

function nextAction() {
  if (currentQ + 1 >= QUESTIONS.length) {
    announceWinner();
  } else {
    currentQ++;
    showQuestion();
  }
}

// ─── WINNER ───────────────────────────────────────────────────────────────
function announceWinner() {
  showScreen('winner-screen');
  const sorted = computeScores();
  const w = sorted[0];
  document.getElementById('w-name').textContent = w.name;
  document.getElementById('w-email').textContent = w.email;
  document.getElementById('w-correct').textContent = `${w.correct}/${QUESTIONS.length}`;
  document.getElementById('w-avg').textContent = w.correct > 0 ? (w.totalMs/w.correct/1000).toFixed(1)+'s' : '—';
  document.getElementById('w-pts').textContent = w.pts.toLocaleString();
  if (db) db.ref(`rooms/${roomCode}/winner`).set({ name: w.name, email: w.email, pts: w.pts });
  // Podium
  const podium = document.getElementById('podium');
  podium.innerHTML = '';
  [sorted[1], sorted[0], sorted[2]].forEach((s,i) => {
    if (!s) return;
    const p = document.createElement('div');
    p.className = 'pod';
    p.innerHTML = `<div class="pod-name">${s ? s.name.split(' ')[0] : ''}</div><div class="pod-pts">${s ? s.pts.toLocaleString() : ''}</div>`;
    podium.appendChild(p);
  });
}

// ─── DEMO SIMULATION ──────────────────────────────────────────────────────
function simulateDemoAnswers() {
  clearInterval(demoInterval);
  const demoNames = Object.keys(participants);
  let answered = new Set();
  demoInterval = setInterval(() => {
    const remaining = demoNames.filter(n => !answered.has(n));
    if (remaining.length === 0) { clearInterval(demoInterval); return; }
    const name = remaining[Math.floor(Math.random() * remaining.length)];
    answered.add(name);
    const ms = Math.floor(Math.random() * (totalTime * 800)) + 800;
    const isCorrect = Math.random() < 0.6;
    const choice = isCorrect ? QUESTIONS[currentQ].correct : (QUESTIONS[currentQ].correct + 1 + Math.floor(Math.random()*3)) % 4;
    const uid = name.replace(/\s+/g,'_');
    if (!answers[`q${currentQ}`]) answers[`q${currentQ}`] = {};
    answers[`q${currentQ}`][uid] = { name, email: uid+'@demo.com', choice, ms };
    const count = Object.keys(answers[`q${currentQ}`]).length;
    const total = demoNames.length;
    document.getElementById('answer-counter').textContent = `${count} answered`;
    document.getElementById('ans-label').textContent = `${count} / ${total} answered`;
    document.getElementById('ans-fill').style.width = (count/total*100) + '%';
    if (isCorrect && !toastShown) {
      const allCorrect = Object.entries(answers[`q${currentQ}`]).filter(([,a])=>a.choice===QUESTIONS[currentQ].correct);
      if (allCorrect.length === 1) showFirstCorrect(name, ms);
    }
  }, 900);
}

// ── PASSWORD TOGGLE ───────────────────────────────────────────────────────
const _EYE = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>`;
const _EYE_OFF = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24\"/><line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"/></svg>`;
function togglePw(id, btn) {
  const input = document.getElementById(id);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = show ? _EYE_OFF : _EYE;
}
