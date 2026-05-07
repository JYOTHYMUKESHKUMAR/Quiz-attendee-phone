// ─── CONFIG ───────────────────────────────────────────────────────────────
// Get room from URL param (user can override in the input field)
const urlParams = new URLSearchParams(window.location.search);
let roomCode = urlParams.get('room') || 'ROOM001';
document.getElementById('inp-room').value = roomCode;

// Firebase config — read from URL params (set by host QR) or fall back to defaults
const fbApiKey = urlParams.get('apiKey') || '';
const fbProjectId = urlParams.get('projectId') || '';
const fbDatabaseURL = (urlParams.get('dbUrl') || `https://${fbProjectId}-default-rtdb.firebaseio.com`).replace(/\/+$/, '');
const FIREBASE_CONFIG = {
  apiKey: fbApiKey,
  databaseURL: fbDatabaseURL,
  projectId: fbProjectId
};

// ─── APP STATE ─────────────────────────────────────────────────────────────
let db = null;
let myName = '';
let myEmail = '';
let myCompany = '';
let myUID = '';
let myPts = 0;
let myCorrect = 0;
let myTotalMs = 0;
let currentQ = -1;
let questionStartTime = 0;
let answered = false;
let timerInterval = null;
let timeLeft = 20;
let totalQuestions = 5;

// ─── FIREBASE INIT ────────────────────────────────────────────────────────
try {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.database();
} catch(e) {
  console.warn('Firebase not configured — using demo mode');
}

// ─── JOIN ─────────────────────────────────────────────────────────────────
function joinQuiz() {
  const room = document.getElementById('inp-room').value.trim().toUpperCase();
  const name = document.getElementById('inp-name').value.trim();
  const company = document.getElementById('inp-company').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  if (!room) { alert('Please enter a room code'); return; }
  if (!name) { alert('Please enter your name'); return; }
  if (!company) { alert('Please enter your company name'); return; }
  if (email && !email.includes('@')) { alert('Please enter a valid email'); return; }
  roomCode = room;
  myName = name;
  myCompany = company;
  myEmail = email;
  myUID = name.replace(/\s+/g,'_') + '_' + Date.now();
  document.getElementById('wait-name').textContent = `Hey ${name.split(' ')[0]}! 👋`;
  document.getElementById('wait-room').textContent = roomCode;
  showPage('waiting-page');
  if (db) {
    db.ref(`rooms/${roomCode}/participants/${myUID}`).set({ name, company, email, joinedAt: Date.now() });
    db.ref(`rooms/${roomCode}/participants`).on('value', snap => {
      const count = snap.numChildren();
      document.getElementById('joined-count').textContent = count;
    });
    listenForQuiz();
  } else {
    // Demo: auto start after 3 seconds
    setTimeout(() => loadQuestion(0, 20), 3000);
  }
}

// ─── LISTEN FOR QUIZ STATE ────────────────────────────────────────────────
function listenForQuiz() {
  console.log("listenForQuiz");
  if (!db) {
    console.log("db not initialized");
    return;
  }

  // Listen to the room as one state object so phones recover from out-of-order
  // Firebase updates when the host starts or advances the quiz.
  db.ref(`rooms/${roomCode}`).on('value', snap => {
    const room = snap.val() || {};
    const qIdx = Number(room.currentQuestion);
    const questionVisible = document.getElementById('question-page').classList.contains('active');
    if (room.status === 'playing' && room.currentQuestion !== null && room.currentQuestion !== undefined && Number.isInteger(qIdx) && qIdx >= 0 && (qIdx !== currentQ || !questionVisible)) {
      loadQuestionFromState(qIdx, room.questions);
    }
    if (room.winner) showFinalResult();
  });

  // Listen for answer reveal from host
  db.ref(`rooms/${roomCode}/revealAnswer`).on('value', snap => {
    const data = snap.val();
    if (data && data.q === currentQ) revealAnswer(data.correct);
  });

  // Listen for winner (quiz ended)
  db.ref(`rooms/${roomCode}/winner`).on('value', snap => {
    if (snap.val()) showFinalResult();
  });
}

function normalizeQuestions(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : Object.values(data);
}

function loadQuestionFromState(qIdx, questionData) {
  const questionsArr = normalizeQuestions(questionData);
  if (questionsArr.length) {
    totalQuestions = questionsArr.length;
    const q = questionsArr[qIdx];
    if (q && q.text && Array.isArray(q.options)) {
      loadQuestion(qIdx, q.time || 20, q.text, q.options, q.correct);
      return;
    }
  }

  // Fallback keeps existing hosted demo rooms working if questions are missing.
  if (qIdx < DEMO_QUESTIONS.length) {
    totalQuestions = DEMO_QUESTIONS.length;
    const q = DEMO_QUESTIONS[qIdx];
    loadQuestion(qIdx, q.time || 20, q.text, q.options, q.correct);
  }
}
// ─── QUESTION ─────────────────────────────────────────────────────────────
const DEMO_QUESTIONS = [
  { text: "Which is the largest ocean on Earth?", options: ["Atlantic","Indian","Pacific","Arctic"], correct: 2, time: 20 },
  { text: "What does 'HTTP' stand for?", options: ["HyperText Transfer Protocol","HighText Transfer Process","HyperTool Tech Platform","HyperText Tech Protocol"], correct: 0, time: 20 },
  { text: "How many planets are in our Solar System?", options: ["7","8","9","10"], correct: 1, time: 15 },
  { text: "What year did World War II end?", options: ["1943","1944","1945","1946"], correct: 2, time: 20 },
  { text: "Which element has the chemical symbol 'Au'?", options: ["Silver","Copper","Gold","Aluminum"], correct: 2, time: 15 },
];

function loadQuestion(qIdx, time, text, options, correctOpt) {
  currentQ = qIdx;
  answered = false;
  questionStartTime = Date.now();
  timeLeft = time || 20;
  document.getElementById('result-msg').textContent = '';
  document.getElementById('result-msg').className = 'result-msg';

  const q = db ? { text, options, time } : DEMO_QUESTIONS[qIdx];
  document.getElementById('qp-num').textContent = `Q${qIdx+1} / ${totalQuestions}`;
  document.getElementById('qp-text').textContent = q.text;
  const optList = document.getElementById('qp-options');
  optList.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.id = `opt-${i}`;
    btn.innerHTML = `<div class="opt-ltr">${['A','B','C','D'][i]}</div><span>${opt}</span>`;
    btn.onclick = () => submitAnswer(i, correctOpt ?? q.correct);
    optList.appendChild(btn);
  });
  showPage('question-page');
  startTimer(time || 20, qIdx);
}

function startTimer(secs, qIdx) {
  clearInterval(timerInterval);
  timeLeft = secs;
  updateTimer();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimer();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (!answered) timeUp();
    }
  }, 1000);
}

function updateTimer() {
  const el = document.getElementById('qp-timer');
  el.textContent = timeLeft;
  el.style.background = timeLeft > 10 ? 'var(--accent)' : timeLeft > 5 ? '#e08c2a' : '#c0392b';
}

function submitAnswer(choice, correctOpt) {
  if (answered) return;
  answered = true;
  clearInterval(timerInterval);
  const ms = Date.now() - questionStartTime;
  // Highlight selection
  document.querySelectorAll('.opt-btn').forEach(b => b.classList.add('disabled'));
  document.getElementById(`opt-${choice}`).classList.add('selected');
  // Send to Firebase
  if (db) {
    db.ref(`rooms/${roomCode}/answers/q${currentQ}/${myUID}`).set({
      name: myName, company: myCompany, email: myEmail, choice, ms, ts: Date.now()
    });
    // Wait for host reveal
  } else {
    // Demo: reveal immediately after 1.5s
    setTimeout(() => revealAnswer(DEMO_QUESTIONS[currentQ].correct), 1500);
  }
  // Optimistic score preview
  const msg = document.getElementById('result-msg');
  msg.textContent = '✓ Answer submitted!';
  msg.style.color = 'var(--muted)';
}

function timeUp() {
  answered = true;
  const msg = document.getElementById('result-msg');
  msg.textContent = "⏱ Time's up!";
  msg.style.color = 'var(--red)';
  document.querySelectorAll('.opt-btn').forEach(b => b.classList.add('disabled'));
  if (!db) setTimeout(() => revealAnswer(DEMO_QUESTIONS[currentQ].correct), 1000);
}

function revealAnswer(correct) {
  document.querySelectorAll('.opt-btn').forEach((b, i) => {
    b.classList.add('disabled');
    if (i === correct) b.classList.add('correct');
  });
  // Check if I was right
  const myBtn = document.querySelector('.opt-btn.selected');
  const myChoice = myBtn ? [...document.querySelectorAll('.opt-btn')].indexOf(myBtn) : -1;
  const msg = document.getElementById('result-msg');
  if (myChoice === correct) {
    myBtn.classList.remove('selected');
    const ms = Date.now() - questionStartTime;
    const pts = Math.max(100, 1000 - Math.floor(ms / 30));
    myPts += pts;
    myCorrect++;
    myTotalMs += ms;
    msg.textContent = `✅ Correct! +${pts} pts`;
    msg.className = 'result-msg correct';
  } else if (myChoice >= 0) {
    myBtn.classList.remove('selected');
    myBtn.classList.add('wrong');
    msg.textContent = `❌ Wrong answer`;
    msg.className = 'result-msg wrong';
  }
  // Demo: go to next question
  if (!db) {
    const nextQ = currentQ + 1;
    if (nextQ < DEMO_QUESTIONS.length) {
      setTimeout(() => loadQuestion(nextQ, DEMO_QUESTIONS[nextQ].time), 3000);
    } else {
      setTimeout(() => showFinalResult(), 3000);
    }
  }
}

function showFinalResult() {
  showPage('result-page');
  document.getElementById('rs-correct').textContent = myCorrect;
  document.getElementById('rs-pts').textContent = myPts.toLocaleString();
  document.getElementById('rs-avg').textContent = myCorrect > 0 ? (myTotalMs/myCorrect/1000).toFixed(1)+'s' : '—';
  document.getElementById('rs-total').textContent = totalQuestions;
  // Rank from Firebase
  if (db) {
    db.ref(`rooms/${roomCode}/questions`).once('value', qSnap => {
      const allQ = qSnap.val();
      const fbQ = allQ ? (Array.isArray(allQ) ? allQ : Object.values(allQ)) : DEMO_QUESTIONS;
      db.ref(`rooms/${roomCode}/answers`).once('value', snap => {
        const allScores = {};
        snap.forEach(qSnap => {
          const qi = parseInt(qSnap.key.slice(1));
          const correct = (fbQ[qi] || DEMO_QUESTIONS[qi] || {}).correct;
          qSnap.forEach(aSnap => {
            const a = aSnap.val();
            if (!allScores[aSnap.key]) allScores[aSnap.key] = 0;
            if (a.choice === correct) allScores[aSnap.key] += Math.max(100, 1000 - Math.floor(a.ms/30));
          });
        });
        const sorted = Object.entries(allScores).sort(([,a],[,b])=>b-a);
        const rank = sorted.findIndex(([uid])=>uid===myUID) + 1;
        document.getElementById('rs-rank').textContent = '#' + (rank || '?');
      });
    });
  } else {
    document.getElementById('rs-rank').textContent = myPts > 1500 ? '#1' : myPts > 800 ? '#2' : '#3';
  }
  const emoji = myCorrect === totalQuestions ? '🏆' : myCorrect >= 3 ? '🎉' : myCorrect >= 2 ? '👏' : '💪';
  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-title').textContent = myCorrect >= 4 ? 'Amazing!' : myCorrect >= 2 ? 'Well done!' : 'Good try!';
  document.getElementById('result-sub').textContent = `You scored ${myPts.toLocaleString()} points`;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
