let db = null;
let roomCode = 'ROOM001';
let roomName = '';
let isDemo = false;
let questions = [];
let selectedCorrect = 0;
let currentQ = -1;
let timerInterval = null;
let participants = {};
let firebaseDatabaseURL = '';

// ── FIREBASE CONNECT ──────────────────────────────────────────────────────
let joinUrl = '';

function normalizeRoomCode(value, fallback = 'ROOM001') {
  return (value || '').trim().toUpperCase() || fallback;
}

function connectAdmin() {
  const apiKey = document.getElementById('s-apikey').value.trim();
  const projectId = document.getElementById('s-project').value.trim();
  const databaseURL = normalizeDatabaseURL('', projectId);
  firebaseDatabaseURL = databaseURL;
  roomCode = normalizeRoomCode(document.getElementById('s-room').value);
  roomName = document.getElementById('s-roomname').value.trim();
  if (!apiKey || !projectId) { alert('Enter API key and project ID'); return; }
  try {
    firebase.initializeApp({ apiKey, databaseURL, projectId });
    db = firebase.database();
    // Build join URL with Firebase config encoded so participants auto-connect
    const base = window.location.href.replace('admin-panel.html', 'index.html').split('?')[0];
    joinUrl = `${base}?room=${encodeURIComponent(roomCode)}&apiKey=${encodeURIComponent(apiKey)}&projectId=${encodeURIComponent(projectId)}&dbUrl=${encodeURIComponent(databaseURL)}`;
    // Only initialize room if it doesn't exist yet — preserve finished/live state
    db.ref(`rooms/${roomCode}`).once('value', snap => {
      if (!snap.exists()) {
        db.ref(`rooms/${roomCode}`).set({
          status: 'lobby',
          currentQuestion: -1,
          revealAnswer: null,
          winner: null,
          name: roomName || roomCode
        }).catch(showFirebaseWriteError);
      }
    });
    initAdmin();
    generateQR();
  } catch(e) { alert('Firebase error: ' + e.message); }
}

function normalizeDatabaseURL(value, projectId) {
  const url = value || `https://${projectId}-default-rtdb.firebaseio.com`;
  return url.replace(/\/+$/, '');
}

function generateQR() {
  const container = document.getElementById('qr-container');
  container.innerHTML = '';
  const div = document.createElement('div');
  div.style.display = 'inline-block';
  new QRCode(div, { text: joinUrl, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.L });
  container.appendChild(div);
  document.getElementById('join-url-display').textContent = joinUrl;
}

function copyJoinUrl() {
  if (!joinUrl) { alert('Connect Firebase first'); return; }
  navigator.clipboard.writeText(joinUrl).then(() => alert('Join link copied!')).catch(() => {
    prompt('Copy this link:', joinUrl);
  });
}

function runDemo() {
  isDemo = true;
  roomCode = normalizeRoomCode(document.getElementById('s-room').value, 'DEMO01');
  loadSampleQuestions();
  initAdmin();
  // Fake participants
  setTimeout(() => {
    ['Arjun Mehta','Priya S.','Karan Singh','Sneha Patel','Dev T.'].forEach((n,i) =>
      setTimeout(() => addParticipant(n.replace(/\s+/g,'_'), n, n.split(' ')[0].toLowerCase()+'@demo.com'), i * 500)
    );
  }, 600);
}

function initAdmin() {
  document.getElementById('setup').style.display = 'none';
  document.getElementById('main').style.display = 'block';
  document.getElementById('room-label').textContent = roomCode;
  const nameEl = document.getElementById('room-name-label');
  if (nameEl) nameEl.textContent = roomName ? `· ${roomName}` : '';
  if (db) {
    db.ref(`rooms/${roomCode}/participants`).on('child_added', snap => {
      const p = snap.val();
      addParticipant(snap.key, p.name, p.email);
    });
    db.ref(`rooms/${roomCode}/questions`).on('value', snap => {
      const data = snap.val();
      if (data) { questions = Object.values(data); renderQuestions(); }
    });
    db.ref(`rooms/${roomCode}/currentQuestion`).on('value', snap => {
      const q = snap.val();
      if (q !== null) { currentQ = q; updateStats(); }
    });
    db.ref(`rooms/${roomCode}/answers`).on('value', snap => {
      const data = snap.val() || {};
      const qAnswers = data[`q${currentQ}`] || {};
      document.getElementById('stat-answered').textContent = Object.keys(qAnswers).length;
    });
    db.ref(`rooms/${roomCode}/winner`).on('value', snap => {
      if (snap.val()) showExportResults();
    });
    loadPreviousRooms();
  }
}

function addParticipant(uid, name, email) {
  participants[uid] = { name, email };
  const list = document.getElementById('participants-list');
  if (list.querySelector('p')) list.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'p-row';
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  row.innerHTML = `<div class="p-avatar">${initials}</div><div class="p-info"><div class="p-name">${name}</div><div class="p-email">${email}</div></div><div class="p-dot"></div>`;
  list.appendChild(row);
  document.getElementById('stat-joined').textContent = Object.keys(participants).length;
}

// ── QUESTIONS ─────────────────────────────────────────────────────────────
function selectCorrect(i) {
  selectedCorrect = i;
  document.querySelectorAll('.correct-btn').forEach((b,j) => {
    b.classList.toggle('selected', j === i);
  });
}
selectCorrect(0);

function addQuestion() {
  const text = document.getElementById('f-text').value.trim();
  const opts = [
    document.getElementById('f-a').value.trim(),
    document.getElementById('f-b').value.trim(),
    document.getElementById('f-c').value.trim(),
    document.getElementById('f-d').value.trim(),
  ];
  const time = parseInt(document.getElementById('f-time').value) || 20;
  if (!text || opts.some(o => !o)) { alert('Fill in question and all 4 options'); return; }
  const q = { text, options: opts, correct: selectedCorrect, time };
  questions.push(q);
  if (db) db.ref(`rooms/${roomCode}/questions`).set(questions);
  renderQuestions();
  document.getElementById('f-text').value = '';
  ['f-a','f-b','f-c','f-d'].forEach(id => document.getElementById(id).value = '');
}

function loadSampleQuestions() {
  questions = [
    { text: "Which is the largest ocean on Earth?", options: ["Atlantic","Indian","Pacific","Arctic"], correct: 2, time: 20 },
    { text: "What does 'HTTP' stand for?", options: ["HyperText Transfer Protocol","HighText Transfer Process","HyperTool Tech Platform","HyperText Tech Protocol"], correct: 0, time: 20 },
    { text: "How many planets are in our Solar System?", options: ["7","8","9","10"], correct: 1, time: 15 },
    { text: "What year did World War II end?", options: ["1943","1944","1945","1946"], correct: 2, time: 20 },
    { text: "Which element has the chemical symbol 'Au'?", options: ["Silver","Copper","Gold","Aluminum"], correct: 2, time: 15 },
  ];
  if (db) db.ref(`rooms/${roomCode}/questions`).set(questions);
  renderQuestions();
}

function renderQuestions() {
  const list = document.getElementById('q-list');
  list.innerHTML = '';
  questions.forEach((q, i) => {
    const div = document.createElement('div');
    div.className = 'q-item';
    div.innerHTML = `
      <div class="q-item-num">${i+1}</div>
      <div class="q-item-body">
        <div class="q-item-text">${q.text}</div>
        <div class="q-item-opts">${q.options.map((o,j) => `<span class="q-opt-tag ${j===q.correct?'correct':''}">${['A','B','C','D'][j]}: ${o}</span>`).join('')}</div>
        <div class="q-item-time">⏱ ${q.time}s</div>
      </div>
      <button class="btn-danger" onclick="removeQuestion(${i})">✕</button>`;
    list.appendChild(div);
  });
  document.getElementById('stat-q').textContent = `0/${questions.length}`;
}

function removeQuestion(i) {
  questions.splice(i, 1);
  if (db) db.ref(`rooms/${roomCode}/questions`).set(questions);
  renderQuestions();
}

// ── CONTROLS ──────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-q').textContent = `${currentQ+1}/${questions.length}`;
}

function adminStartQuiz() {
  if (questions.length === 0) { alert('Add questions first!'); return; }
  currentQ = 0;
  document.getElementById('status-tag').className = 'tag-live';
  document.getElementById('status-tag').textContent = 'Live';
  if (db) {
    db.ref(`rooms/${roomCode}/questions`).set(questions)
      .then(() => db.ref(`rooms/${roomCode}`).update({
        status: 'playing',
        currentQuestion: 0,
        startedAt: Date.now(),
        revealAnswer: null,
        winner: null
      }))
      .then(() => startAdminTimer())
      .catch(showFirebaseWriteError);
  }
  updateStats();
}

function adminNextQuestion() {
  if (currentQ + 1 >= questions.length) { alert('No more questions! Announce the winner.'); return; }
  currentQ++;
  if (db) {
    db.ref(`rooms/${roomCode}`).update({
      status: 'playing',
      currentQuestion: currentQ,
      revealAnswer: null
    })
      .then(() => startAdminTimer())
      .catch(showFirebaseWriteError);
  }
  updateStats();
}

function showFirebaseWriteError(e) {
  alert(
    'Firebase rejected the room write: ' + e.message + '\n\n' +
    'Check that this exact Realtime Database URL has public test rules enabled:\n' +
    firebaseDatabaseURL
  );
}

function adminRevealNow() {
  clearInterval(timerInterval);
  document.getElementById('stat-time').textContent = '0';
  if (db) db.ref(`rooms/${roomCode}/revealAnswer`).set({ q: currentQ, correct: questions[currentQ].correct, ts: Date.now() });
}

let adminTimeLeft = 0;
function startAdminTimer() {
  clearInterval(timerInterval);
  adminTimeLeft = questions[currentQ].time;
  document.getElementById('stat-time').textContent = adminTimeLeft;
  timerInterval = setInterval(() => {
    adminTimeLeft--;
    document.getElementById('stat-time').textContent = adminTimeLeft;
    if (adminTimeLeft <= 0) {
      clearInterval(timerInterval);
      if (db) db.ref(`rooms/${roomCode}/revealAnswer`).set({ q: currentQ, correct: questions[currentQ].correct, ts: Date.now() });
    }
  }, 1000);
}

function adminAnnounceWinner() {
  if (!isDemo && !db) return;
  if (isDemo) {
    const winner = Object.values(participants)[0];
    if (db) db.ref(`rooms/${roomCode}/winner`).set({ name: winner.name, email: winner.email, pts: 2850 });
    showExportResults();
  } else if (db) {
    db.ref(`rooms/${roomCode}/answers`).once('value', snap => {
      const allScores = {};
      snap.forEach(qSnap => {
        const qi = parseInt(qSnap.key.slice(1));
        qSnap.forEach(aSnap => {
          const a = aSnap.val();
          if (!allScores[aSnap.key]) allScores[aSnap.key] = { name: a.name, email: a.email||'', pts: 0 };
          if (a.choice === questions[qi].correct) {
            allScores[aSnap.key].pts += Math.max(100, 1000 - Math.floor(a.ms/30));
          }
        });
      });
      const winner = Object.values(allScores).sort((a,b) => b.pts - a.pts)[0];
      if (winner) db.ref(`rooms/${roomCode}/winner`).set(winner);
      showExportResults();
    });
  }
}

function adminResetRoom() {
  if (!confirm('Reset the room? This clears all answers and participants.')) return;
  clearInterval(timerInterval);
  currentQ = -1; participants = {};
  document.getElementById('participants-list').innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0;">Waiting for participants...</p>';
  document.getElementById('stat-joined').textContent = '0';
  document.getElementById('stat-answered').textContent = '0';
  document.getElementById('stat-time').textContent = '—';
  document.getElementById('status-tag').className = 'tag-waiting';
  document.getElementById('status-tag').textContent = 'Lobby';
  if (db) db.ref(`rooms/${roomCode}`).set({ status: 'lobby', currentQuestion: -1, startedAt: Date.now() });
}

// ── EXPORT ────────────────────────────────────────────────────────────────
let exportData = [];
function showExportResults() {
  if (!db && !isDemo) return;
  document.getElementById('status-tag').className = 'tag-waiting';
  document.getElementById('status-tag').textContent = 'Finished';
  if (db) db.ref(`rooms/${roomCode}/status`).set('finished');
  if (isDemo) {
    exportData = Object.values(participants).map((p,i) => ({
      name: p.name, email: p.email,
      correct: Math.floor(Math.random()*questions.length+1),
      pts: Math.floor(Math.random()*3000+500),
      avgMs: (Math.random()*8+1).toFixed(1)
    })).sort((a,b)=>b.pts-a.pts);
    renderExportTable();
    return;
  }
  db.ref(`rooms/${roomCode}/answers`).once('value', snap => {
    const allScores = {};
    snap.forEach(qSnap => {
      const qi = parseInt(qSnap.key.slice(1));
      qSnap.forEach(aSnap => {
        const a = aSnap.val();
        if (!allScores[aSnap.key]) allScores[aSnap.key] = { name: a.name, company: a.company||'', email: a.email||'', pts: 0, correct: 0, totalMs: 0 };
        if (a.choice === questions[qi].correct) {
          allScores[aSnap.key].pts += Math.max(100, 1000 - Math.floor(a.ms/30));
          allScores[aSnap.key].correct++;
          allScores[aSnap.key].totalMs += a.ms;
        }
      });
    });
    exportData = Object.values(allScores).sort((a,b)=>b.pts-a.pts).map(s => ({
      ...s, avgMs: s.correct > 0 ? (s.totalMs/s.correct/1000).toFixed(1) : '—'
    }));
    renderExportTable();
  });
}

function renderExportTable() {
  const area = document.getElementById('export-area');
  if (!exportData.length) { area.innerHTML = '<p style="color:var(--muted);font-size:13px;">No data.</p>'; return; }
  area.innerHTML = `<table class="export-table"><thead><tr><th>#</th><th>Name</th><th>Company</th><th>Email</th><th>Correct</th><th>Avg Speed</th><th>Points</th></tr></thead><tbody>
    ${exportData.map((r,i) => `<tr><td>${i+1}</td><td>${r.name}</td><td>${r.company||'—'}</td><td>${r.email||'—'}</td><td>${r.correct}/${questions.length}</td><td>${r.avgMs}s</td><td style="color:var(--gold);font-weight:600;">${r.pts.toLocaleString()}</td></tr>`).join('')}
  </tbody></table>`;
}

function exportCSV() {
  if (!exportData.length) { alert('No results to export yet.'); return; }
  const rows = [['Rank','Name','Company','Email','Correct','Avg Speed (s)','Points']];
  exportData.forEach((r,i) => rows.push([i+1, r.name, r.company||'', r.email||'', r.correct, r.avgMs, r.pts]));
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `quiz_results_${roomCode}.csv`;
  a.click();
}

// ── PREVIOUS ROOMS ────────────────────────────────────────────────────────
function loadPreviousRooms() {
  const list = document.getElementById('rooms-list');
  if (!list) return;
  if (!db) {
    list.innerHTML = '<p class="rooms-empty">Connect Firebase first.</p>';
    return;
  }
  list.innerHTML = '<p class="rooms-empty">Loading...</p>';
  db.ref('rooms').once('value', snap => {
    const data = snap.val();
    if (!data) {
      list.innerHTML = '<p class="rooms-empty">No rooms found.</p>';
      return;
    }
    const codes = Object.keys(data).sort();
    list.innerHTML = '';
    codes.forEach(code => {
      const room = data[code];
      const participantCount = room.participants ? Object.keys(room.participants).length : 0;
      const questionCount = room.questions ? (Array.isArray(room.questions) ? room.questions.length : Object.keys(room.questions).length) : 0;
      const roomLabel = room.name && room.name !== code ? room.name : '';
      const started = room.startedAt ? new Date(room.startedAt).toLocaleString() : '—';
      const status = (room.winner || room.status === 'finished') ? 'Finished' : room.status === 'playing' ? 'Live' : 'Lobby';
      const statusColor = (room.winner || room.status === 'finished') ? 'var(--muted)' : room.status === 'playing' ? 'var(--green)' : 'var(--gold)';
      const isActive = code === roomCode;

      const row = document.createElement('div');
      row.className = 'room-row';
      row.id = `room-row-${code}`;
      row.innerHTML = `
        <div class="room-row-code">${code}</div>
        <div class="room-row-meta">
          ${roomLabel ? `<span style="font-size:14px;font-weight:700;color:var(--text);">${roomLabel}</span>` : ''}
          <span style="color:${statusColor};font-weight:600;">${status}</span>
          <span>${participantCount} participant${participantCount !== 1 ? 's' : ''} · ${questionCount} question${questionCount !== 1 ? 's' : ''}</span>
          <span>Created: ${started}</span>
        </div>
        ${isActive
          ? '<span style="font-size:11px;color:var(--accent);font-weight:700;">current</span>'
          : `<div style="display:flex;gap:8px;flex-shrink:0;">
               <button class="btn-outline" style="font-size:12px;padding:5px 12px;" onclick="loadRoom('${code}')">Load</button>
               <button class="btn-danger" onclick="deleteRoom('${code}')">Delete</button>
             </div>`}
      `;
      list.appendChild(row);
    });
  });
}

function loadRoom(code) {
  if (!db) { alert('Connect Firebase first'); return; }
  if (code === roomCode) return;

  // Detach existing listeners
  db.ref(`rooms/${roomCode}/participants`).off();
  db.ref(`rooms/${roomCode}/questions`).off();
  db.ref(`rooms/${roomCode}/currentQuestion`).off();
  db.ref(`rooms/${roomCode}/answers`).off();
  db.ref(`rooms/${roomCode}/winner`).off();

  // Reset state
  roomCode = code;
  currentQ = -1;
  participants = {};
  questions = [];

  // Reset UI
  document.getElementById('room-label').textContent = roomCode;
  db.ref(`rooms/${roomCode}/name`).once('value', snap => {
    roomName = snap.val() || '';
    const nameEl = document.getElementById('room-name-label');
    if (nameEl) nameEl.textContent = roomName ? `· ${roomName}` : '';
  });
  document.getElementById('stat-joined').textContent = '0';
  document.getElementById('stat-answered').textContent = '0';
  document.getElementById('stat-q').textContent = '0/0';
  document.getElementById('stat-time').textContent = '—';
  document.getElementById('status-tag').className = 'tag-waiting';
  document.getElementById('status-tag').textContent = 'Lobby';
  document.getElementById('participants-list').innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0;">Waiting for participants to scan and join...</p>';
  document.getElementById('q-list').innerHTML = '';
  document.getElementById('export-area').innerHTML = '<p style="color:var(--muted);font-size:13px;">Results will appear here after the quiz ends.</p>';

  // Re-attach listeners
  db.ref(`rooms/${roomCode}/participants`).on('child_added', snap => {
    const p = snap.val();
    addParticipant(snap.key, p.name, p.email);
  });
  db.ref(`rooms/${roomCode}/questions`).on('value', snap => {
    const data = snap.val();
    if (data) { questions = Object.values(data); renderQuestions(); }
  });
  db.ref(`rooms/${roomCode}/currentQuestion`).on('value', snap => {
    const q = snap.val();
    if (q !== null) { currentQ = q; updateStats(); }
  });
  db.ref(`rooms/${roomCode}/answers`).on('value', snap => {
    const data = snap.val() || {};
    const qAnswers = data[`q${currentQ}`] || {};
    document.getElementById('stat-answered').textContent = Object.keys(qAnswers).length;
  });
  db.ref(`rooms/${roomCode}/winner`).on('value', snap => {
    if (snap.val()) showExportResults();
  });

  loadPreviousRooms();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteRoom(code) {
  if (!db) return;
  if (!confirm(`Delete room "${code}"? This removes all participants, answers, and results.`)) return;
  db.ref(`rooms/${code}`).remove().then(() => {
    const row = document.getElementById(`room-row-${code}`);
    if (row) row.remove();
    const list = document.getElementById('rooms-list');
    if (list && !list.querySelector('.room-row')) {
      list.innerHTML = '<p class="rooms-empty">No rooms found.</p>';
    }
  }).catch(e => alert('Delete failed: ' + e.message));
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
