// ===== RENDER QUIZZES =====
function renderQuizzes() {
    const quizzes = Store.getQuizzes();
    const grid = document.getElementById('quizzes-grid'), empty = document.getElementById('quizzes-empty');
    if (!quizzes.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    grid.innerHTML = quizzes.map(q => {
        const types = [...new Set(q.questions.map(x => x.qtype || 'single'))];
        const tags = types.map(t => `<span class="item-tag">${QTYPES[t] || t}</span>`).join('');
        return `<div class="item-card">
            <div class="item-card-title">${esc(q.title)}</div>
            <div class="item-card-meta">${q.questions.length} Frage${q.questions.length !== 1 ? 'n' : ''} • ⏱ ${q.timePerQ || 15}s • ${timeAgo(q.createdAt)}</div>
            <div class="item-card-tags">${tags}</div>
            <div class="item-card-actions">
                <button class="btn btn-primary btn-sm" onclick="startQuiz(${q.id})">▶ Spielen</button>
                <button class="btn btn-outline btn-sm" onclick="exportQuiz(${q.id})">📤</button>
                <button class="btn btn-danger btn-sm" onclick="deleteQuiz(${q.id})">🗑</button>
            </div>
        </div>`;
    }).join('');
}
function deleteQuiz(id) { Store.setQuizzes(Store.getQuizzes().filter(q => q.id !== id)); renderQuizzes(); updateStats(); showToast('Gelöscht'); }
function exportQuiz(id) {
    const q = Store.getQuizzes().find(x => x.id === id); if (!q) return;
    const data = JSON.stringify(q, null, 2);
    navigator.clipboard.writeText(data).then(() => showToast('Quiz in Zwischenablage kopiert! 📋')).catch(() => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        a.download = `${q.title}.json`; a.click();
    });
}

// Import
document.getElementById('import-quiz-btn').addEventListener('click', () => openModal('modal-import'));
document.getElementById('close-import-modal').addEventListener('click', () => closeModal('modal-import'));
document.getElementById('cancel-import').addEventListener('click', () => closeModal('modal-import'));
document.getElementById('do-import').addEventListener('click', () => {
    try {
        const data = JSON.parse(document.getElementById('import-json').value);
        data.id = Date.now(); data.createdAt = new Date().toISOString();
        const quizzes = Store.getQuizzes(); quizzes.push(data); Store.setQuizzes(quizzes);
        closeModal('modal-import'); document.getElementById('import-json').value = '';
        showToast('Quiz importiert!'); renderQuizzes(); updateStats();
    } catch { showToast('Ungültiges JSON', 'error'); }
});

// ===== QUIZ PLAY =====
let curQuiz = null, curQIdx = 0, qScore = 0, qTimer = null, streak = 0, bestStreak = 0, selectedAns = new Set(), orderPicked = [];

function startQuiz(id) {
    curQuiz = Store.getQuizzes().find(q => q.id === id); if (!curQuiz) return;
    curQIdx = 0; qScore = 0; streak = 0; bestStreak = 0;
    openModal('modal-play-quiz'); showQuestion();
}

function showQuestion() {
    const q = curQuiz.questions[curQIdx];
    const total = curQuiz.questions.length;
    document.getElementById('play-quiz-title').textContent = curQuiz.title;
    document.getElementById('play-quiz-progress').textContent = `Frage ${curQIdx + 1} / ${total}`;
    document.getElementById('quiz-progress-fill').style.width = `${((curQIdx) / total) * 100}%`;
    document.getElementById('play-question-text').textContent = q.text;
    document.getElementById('quiz-play-footer').style.display = 'none';
    document.getElementById('quiz-confirm-footer').style.display = 'none';
    const streakEl = document.getElementById('play-streak');
    streakEl.style.display = streak > 0 ? 'flex' : 'none';
    document.getElementById('streak-val').textContent = streak;

    const qtype = q.qtype || 'single';
    document.getElementById('play-type-badge').innerHTML = `<span>${QTYPES[qtype]}</span>`;

    const area = document.getElementById('play-answer-area');
    selectedAns.clear(); orderPicked = [];

    if (qtype === 'truefalse') {
        area.innerHTML = `<div class="tf-grid"><button class="tf-btn tf-true" data-val="0">✅ Ja</button><button class="tf-btn tf-false" data-val="1">❌ Nein</button></div>`;
        area.querySelectorAll('.tf-btn').forEach(btn => btn.addEventListener('click', () => handleTF(parseInt(btn.dataset.val), q)));
    } else if (qtype === 'type') {
        area.innerHTML = `<div class="type-answer-play"><input type="text" class="form-input" id="type-answer-input" placeholder="Deine Antwort..." autofocus><div id="type-result"></div></div>`;
        document.getElementById('quiz-confirm-footer').style.display = 'flex';
    } else if (qtype === 'order') {
        const shuffled = q.orderItems.map((t, i) => ({ t, i })).sort(() => Math.random() - 0.5);
        area.innerHTML = `<div class="order-play-list" id="order-source">${shuffled.map((item, idx) => `<div class="order-play-item" data-oidx="${item.i}" onclick="pickOrder(this)"><span class="order-badge">${idx + 1}</span> ${esc(item.t)}</div>`).join('')}</div><div class="order-placed-list" id="order-placed"></div>`;
        document.getElementById('quiz-confirm-footer').style.display = 'flex';
    } else if (qtype === 'multi') {
        area.innerHTML = `<div class="quiz-answers-grid">${q.answers.map((a, i) => `<button class="quiz-answer-btn" data-idx="${i}" onclick="toggleMulti(this)">${esc(a)}</button>`).join('')}</div>`;
        document.getElementById('quiz-confirm-footer').style.display = 'flex';
    } else {
        area.innerHTML = `<div class="quiz-answers-grid">${q.answers.map((a, i) => `<button class="quiz-answer-btn" data-idx="${i}" onclick="handleSingle(${i})">${esc(a)}</button>`).join('')}</div>`;
    }

    // Timer
    qTimerVal = curQuiz.timePerQ || 15;
    const timerEl = document.getElementById('timer-value'), timerW = document.getElementById('play-quiz-timer');
    timerEl.textContent = qTimerVal; timerW.classList.remove('urgent');
    clearInterval(qTimer);
    qTimer = setInterval(() => {
        qTimerVal--; timerEl.textContent = qTimerVal;
        if (qTimerVal <= 5) timerW.classList.add('urgent');
        if (qTimerVal <= 0) { clearInterval(qTimer); handleTimeout(); }
    }, 1000);
}

let qTimerVal = 0;

function handleTimeout() {
    const q = curQuiz.questions[curQIdx], qtype = q.qtype || 'single';
    streak = 0;
    if (qtype === 'multi') confirmMulti();
    else if (qtype === 'type') confirmType();
    else if (qtype === 'order') confirmOrder();
    else if (qtype === 'truefalse') handleTF(-1, q);
    else handleSingle(-1);
}

function showNext() {
    document.getElementById('quiz-play-footer').style.display = 'flex';
    document.getElementById('quiz-confirm-footer').style.display = 'none';
    document.getElementById('quiz-next-btn').textContent = curQIdx < curQuiz.questions.length - 1 ? 'Nächste Frage →' : '🏆 Ergebnis';
}

function markCorrect() { qScore++; streak++; if (streak > bestStreak) bestStreak = streak; }
function markWrong() { streak = 0; }

// Single Choice
function handleSingle(idx) {
    clearInterval(qTimer);
    const q = curQuiz.questions[curQIdx];
    document.querySelectorAll('.quiz-answer-btn').forEach(b => {
        b.classList.add('disabled'); b.onclick = null;
        const bi = parseInt(b.dataset.idx);
        if (q.correct.includes(bi)) b.classList.add('correct');
        if (bi === idx && !q.correct.includes(idx)) b.classList.add('wrong');
    });
    if (idx >= 0 && q.correct.includes(idx)) markCorrect(); else markWrong();
    showNext();
}

// True/False
function handleTF(val, q) {
    clearInterval(qTimer);
    document.querySelectorAll('.tf-btn').forEach(b => {
        b.classList.add('disabled');
        const bv = parseInt(b.dataset.val);
        if (q.correct.includes(bv)) b.classList.add('correct');
        if (bv === val && !q.correct.includes(val)) b.classList.add('wrong');
    });
    if (val >= 0 && q.correct.includes(val)) markCorrect(); else markWrong();
    showNext();
}

// Multi Select
function toggleMulti(btn) {
    const idx = parseInt(btn.dataset.idx);
    if (selectedAns.has(idx)) { selectedAns.delete(idx); btn.classList.remove('selected'); }
    else { selectedAns.add(idx); btn.classList.add('selected'); }
}

function confirmMulti() {
    clearInterval(qTimer);
    const q = curQuiz.questions[curQIdx];
    document.querySelectorAll('.quiz-answer-btn').forEach(b => {
        b.classList.add('disabled'); b.onclick = null; b.classList.remove('selected');
        const bi = parseInt(b.dataset.idx);
        if (q.correct.includes(bi)) b.classList.add('correct');
        if (selectedAns.has(bi) && !q.correct.includes(bi)) b.classList.add('wrong');
    });
    const isOk = q.correct.length === selectedAns.size && q.correct.every(c => selectedAns.has(c));
    if (isOk) markCorrect(); else markWrong();
    showNext();
}

// Type Answer
function confirmType() {
    clearInterval(qTimer);
    const q = curQuiz.questions[curQIdx];
    const input = document.getElementById('type-answer-input');
    const userAns = (input?.value || '').trim().toLowerCase();
    const correct = q.correctText.toLowerCase();
    const isOk = userAns === correct;
    if (input) input.disabled = true;
    const res = document.getElementById('type-result');
    if (isOk) { res.className = 'type-result correct'; res.textContent = '✅ Richtig!'; markCorrect(); }
    else { res.className = 'type-result wrong'; res.textContent = `❌ Richtig wäre: ${q.correctText}`; markWrong(); }
    showNext();
}

// Order
function pickOrder(el) {
    el.classList.add('placed');
    const idx = parseInt(el.dataset.oidx);
    orderPicked.push(idx);
    const placed = document.getElementById('order-placed');
    const q = curQuiz.questions[curQIdx];
    placed.innerHTML += `<div class="order-placed-item"><span class="order-num">${orderPicked.length}</span>${esc(q.orderItems[idx])}</div>`;
    if (orderPicked.length === q.orderItems.length) confirmOrder();
}

function confirmOrder() {
    clearInterval(qTimer);
    const q = curQuiz.questions[curQIdx];
    // Fill remaining if timeout
    if (orderPicked.length < q.orderItems.length) {
        const remaining = q.orderItems.map((_, i) => i).filter(i => !orderPicked.includes(i));
        orderPicked.push(...remaining);
    }
    const isOk = orderPicked.every((v, i) => v === i);
    const placed = document.getElementById('order-placed');
    placed.innerHTML = orderPicked.map((v, i) => {
        const ok = v === i;
        return `<div class="order-result-item ${ok ? 'correct' : 'wrong'}"><span class="order-num">${i + 1}</span>${esc(q.orderItems[v])} ${ok ? '✅' : '❌ → ' + esc(q.orderItems[i])}</div>`;
    }).join('');
    document.querySelectorAll('.order-play-item').forEach(el => { el.classList.add('placed'); el.onclick = null; });
    if (isOk) markCorrect(); else markWrong();
    showNext();
}

// Confirm button handler
document.getElementById('quiz-confirm-btn').addEventListener('click', () => {
    const q = curQuiz.questions[curQIdx], qt = q.qtype || 'single';
    if (qt === 'multi') confirmMulti();
    else if (qt === 'type') confirmType();
    else if (qt === 'order') confirmOrder();
});

// Next button
document.getElementById('quiz-next-btn').addEventListener('click', () => {
    curQIdx++;
    if (curQIdx < curQuiz.questions.length) showQuestion();
    else { closeModal('modal-play-quiz'); showQuizResult(); }
});

function showQuizResult() {
    const total = curQuiz.questions.length, pct = Math.round((qScore / total) * 100), pts = qScore * 100;
    Store.addScore(pts); Store.setBestStreak(bestStreak);
    let emoji = '😕', title = 'Nicht schlecht...';
    if (pct >= 90) { emoji = '🏆'; title = 'Perfekt!'; }
    else if (pct >= 70) { emoji = '🎉'; title = 'Super gemacht!'; }
    else if (pct >= 50) { emoji = '👍'; title = 'Gut gemacht!'; }
    document.getElementById('result-emoji').textContent = emoji;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-subtitle').textContent = curQuiz.title;
    document.getElementById('result-score-value').textContent = `${pct}%`;
    document.getElementById('result-details').textContent = `${qScore}/${total} richtig • +${pts} Punkte`;
    document.getElementById('result-streak').textContent = bestStreak > 1 ? `🔥 Bester Streak: ${bestStreak}` : '';
    document.getElementById('quiz-progress-fill').style.width = '100%';
    openModal('modal-quiz-result'); updateStats();
}

document.getElementById('result-close').addEventListener('click', () => closeModal('modal-quiz-result'));
document.getElementById('result-retry').addEventListener('click', () => { closeModal('modal-quiz-result'); startQuiz(curQuiz.id); });
document.getElementById('close-play-modal').addEventListener('click', () => { clearInterval(qTimer); closeModal('modal-play-quiz'); });

// ===== DECK =====
function addCardToForm() {
    const list = document.getElementById('deck-cards-list'), div = document.createElement('div');
    div.className = 'card-item';
    div.innerHTML = `<button class="remove-item" onclick="this.parentElement.remove()">&times;</button><div class="card-item-row"><input type="text" class="form-input c-front" placeholder="Vorderseite"><input type="text" class="form-input c-back" placeholder="Rückseite"></div>`;
    list.appendChild(div);
}
function openCreateDeck() {
    document.getElementById('deck-title').value = '';
    document.getElementById('deck-cards-list').innerHTML = '';
    addCardToForm(); openModal('modal-create-deck');
}
function saveDeck() {
    const title = document.getElementById('deck-title').value.trim();
    if (!title) return showToast('Titel fehlt', 'error');
    const items = document.querySelectorAll('#deck-cards-list .card-item');
    if (!items.length) return showToast('Mind. 1 Karte', 'error');
    const cards = [];
    for (const item of items) {
        const f = item.querySelector('.c-front').value.trim(), b = item.querySelector('.c-back').value.trim();
        if (!f || !b) return showToast('Alle Karten ausfüllen', 'error');
        cards.push({ front: f, back: b });
    }
    const decks = Store.getDecks();
    const newDeck = { id: Date.now(), title, cards, createdAt: new Date().toISOString() };
    decks.push(newDeck);
    Store.setDecks(decks);
    closeModal('modal-create-deck');
    showToast('Kartenset gespeichert!'); renderDecks(); updateStats();
}
document.getElementById('create-deck-btn').addEventListener('click', openCreateDeck);
document.getElementById('empty-create-deck').addEventListener('click', openCreateDeck);
document.getElementById('add-card-btn').addEventListener('click', addCardToForm);
document.getElementById('save-deck').addEventListener('click', saveDeck);
document.getElementById('cancel-deck').addEventListener('click', () => closeModal('modal-create-deck'));
document.getElementById('close-deck-modal').addEventListener('click', () => closeModal('modal-create-deck'));

function renderDecks() {
    const decks = Store.getDecks(), grid = document.getElementById('decks-grid'), empty = document.getElementById('decks-empty');
    if (!decks.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    grid.innerHTML = decks.map(d => `<div class="item-card"><div class="item-card-title">${esc(d.title)}</div><div class="item-card-meta">${d.cards.length} Karte${d.cards.length !== 1 ? 'n' : ''} • ${timeAgo(d.createdAt)}</div><div class="item-card-actions"><button class="btn btn-primary btn-sm" onclick="startStudy(${d.id})">📖 Lernen</button><button class="btn btn-danger btn-sm" onclick="deleteDeck(${d.id})">🗑</button></div></div>`).join('');
}
function deleteDeck(id) { Store.setDecks(Store.getDecks().filter(d => d.id !== id)); renderDecks(); updateStats(); showToast('Gelöscht'); }

// ===== FLASHCARD STUDY =====
let curDeck = null, sCards = [], sIdx = 0;
function startStudy(id) {
    curDeck = Store.getDecks().find(d => d.id === id); if (!curDeck) return;
    sCards = [...curDeck.cards]; sIdx = 0; openModal('modal-study-deck'); showFlashcard();
}
function showFlashcard() {
    document.getElementById('study-deck-title').textContent = curDeck.title;
    document.getElementById('study-progress').textContent = `${sIdx + 1} / ${sCards.length}`;
    document.getElementById('flashcard-front-text').textContent = sCards[sIdx].front;
    document.getElementById('flashcard-back-text').textContent = sCards[sIdx].back;
    document.getElementById('flashcard').classList.remove('flipped');
}
document.getElementById('flashcard').addEventListener('click', () => document.getElementById('flashcard').classList.toggle('flipped'));
document.getElementById('study-next').addEventListener('click', () => { sIdx = sIdx < sCards.length - 1 ? sIdx + 1 : 0; showFlashcard(); });
document.getElementById('study-prev').addEventListener('click', () => { if (sIdx > 0) { sIdx--; showFlashcard(); } });
document.getElementById('study-shuffle').addEventListener('click', () => {
    for (let i = sCards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sCards[i], sCards[j]] = [sCards[j], sCards[i]]; }
    sIdx = 0; showFlashcard(); showToast('Gemischt! 🔀');
});
document.getElementById('close-study-modal').addEventListener('click', () => closeModal('modal-study-deck'));

// ===== INIT =====
updateStats();
