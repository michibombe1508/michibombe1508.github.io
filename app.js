// ===== STORE & SYNC =====
const Store = {
    data: { quizzes: [], decks: [], score: 0, bestStreak: 0 },
    async init() {
        try {
            const res = await fetch('api.php');
            if (res.ok) {
                const text = await res.text();
                if (text) {
                    this.data = JSON.parse(text);
                }
            }
        } catch (e) {
            console.warn('Backend nicht erreichbar, nutze lokalen Speicher.', e);
            this.data.quizzes = JSON.parse(localStorage.getItem('bl_quizzes')) || [];
            this.data.decks = JSON.parse(localStorage.getItem('bl_decks')) || [];
            this.data.score = parseInt(localStorage.getItem('bl_score')) || 0;
            this.data.bestStreak = parseInt(localStorage.getItem('bl_streak')) || 0;
        }
    },
    async save() {
        localStorage.setItem('bl_quizzes', JSON.stringify(this.data.quizzes));
        localStorage.setItem('bl_decks', JSON.stringify(this.data.decks));
        localStorage.setItem('bl_score', this.data.score);
        localStorage.setItem('bl_streak', this.data.bestStreak);
        try {
            await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.data)
            });
        } catch (e) { }
    },
    getQuizzes() { return this.data.quizzes || []; },
    setQuizzes(q) { this.data.quizzes = q; this.save(); },
    getDecks() { return this.data.decks || []; },
    setDecks(d) { this.data.decks = d; this.save(); },
    getScore() { return this.data.score || 0; },
    addScore(n) { this.data.score = this.getScore() + n; this.save(); return this.data.score; },
    getBestStreak() { return this.data.bestStreak || 0; },
    setBestStreak(n) { if (n > this.getBestStreak()) { this.data.bestStreak = n; this.save(); } }
};

// ===== LOGIN LOGIC =====
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('login-password').value;
    if (pass === 'Quali2026') {
        localStorage.setItem('bl_auth', 'true');
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('app-container').style.display = '';
        await Store.init();
        updateStats();
        if (typeof renderQuizzes === 'function') renderQuizzes();
        if (typeof renderDecks === 'function') renderDecks();
    } else {
        const err = document.getElementById('auth-error');
        err.textContent = 'Falsches Passwort!';
        err.style.display = 'block';
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('bl_auth') === 'true') {
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('app-container').style.display = '';
        await Store.init();
        updateStats();
        if (typeof renderQuizzes === 'function') renderQuizzes();
        if (typeof renderDecks === 'function') renderDecks();
    }
});

// ===== HELPERS =====
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function timeAgo(ds) {
    const m = Math.floor((Date.now() - new Date(ds).getTime()) / 60000);
    if (m < 1) return 'Gerade eben'; if (m < 60) return `vor ${m} Min.`;
    const h = Math.floor(m / 60); if (h < 24) return `vor ${h} Std.`;
    return `vor ${Math.floor(h / 24)} Tagen`;
}
function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container'), t = document.createElement('div');
    t.className = `toast ${type}`; t.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
    c.appendChild(t); setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 300); }, 2500);
}

// ===== THEME =====
function setTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('bl_theme', t); }
document.getElementById('theme-toggle').addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});
setTheme(localStorage.getItem('bl_theme') || 'dark');

// ===== NAV =====
function switchView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${name}`).classList.add('active');
    document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
    if (name === 'quizzes') renderQuizzes(); if (name === 'flashcards') renderDecks(); if (name === 'home') updateStats();
}
document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
document.getElementById('nav-brand').addEventListener('click', () => switchView('home'));
document.getElementById('hero-quiz-btn').addEventListener('click', () => switchView('quizzes'));
document.getElementById('hero-card-btn').addEventListener('click', () => switchView('flashcards'));

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); }));

function updateStats() {
    document.getElementById('stat-quizzes').textContent = Store.getQuizzes().length;
    document.getElementById('stat-cards').textContent = Store.getDecks().reduce((s, d) => s + d.cards.length, 0);
    document.getElementById('stat-score').textContent = Store.getScore();
    document.getElementById('stat-streak').textContent = Store.getBestStreak();
}

// ===== QUESTION TYPES =====
// single = Multiple Choice (1 richtig), multi = Multi-Select, truefalse = Ja/Nein, type = Schreiben, order = Reihenfolge
const QTYPES = { single: '🔘 Single Choice', multi: '☑️ Multi Select', truefalse: '✅ Ja / Nein', type: '⌨️ Schreibantwort', order: '🔢 Reihenfolge' };
let qCount = 0;

function buildQuestionForm(qid, qtype, ansCount) {
    if (qtype === 'truefalse') {
        return `<div class="answers-grid"><div class="answer-input-wrap"><input type="text" class="form-input a-text" value="Ja" data-idx="0" readonly><input type="radio" name="correct-${qid}" class="answer-radio" value="0" checked></div><div class="answer-input-wrap"><input type="text" class="form-input a-text" value="Nein" data-idx="1" readonly><input type="radio" name="correct-${qid}" class="answer-radio" value="1"></div></div>`;
    }
    if (qtype === 'type') {
        return `<div class="type-answer-input"><input type="text" class="form-input a-typed" placeholder="Richtige Antwort eingeben"></div>`;
    }
    if (qtype === 'order') {
        let html = '<div class="order-items-list">';
        for (let i = 0; i < ansCount; i++) html += `<div class="order-item-input"><span class="order-num">${i + 1}</span><input type="text" class="form-input o-text" placeholder="Position ${i + 1}" data-idx="${i}"></div>`;
        return html + '</div>';
    }
    // single or multi
    const isMulti = qtype === 'multi';
    let html = '<div class="answers-grid">';
    for (let i = 0; i < ansCount; i++) {
        const type = isMulti ? 'checkbox' : 'radio';
        const cls = isMulti ? 'answer-check' : 'answer-radio';
        html += `<div class="answer-input-wrap"><input type="text" class="form-input a-text" placeholder="Antwort ${i + 1}" data-idx="${i}"><input type="${type}" name="correct-${qid}" class="${cls}" value="${i}" ${(!isMulti && i === 0) ? 'checked' : ''}></div>`;
    }
    return html + '</div>';
}

function addQuestionToForm() {
    qCount++;
    const list = document.getElementById('quiz-questions-list');
    const div = document.createElement('div');
    div.className = 'question-item'; div.dataset.qid = qCount;
    div.innerHTML = `<button class="remove-item" onclick="this.parentElement.remove()" title="Entfernen">&times;</button>
        <div class="question-top-row">
            <select class="form-input form-select q-type" onchange="onQTypeChange(this)">
                ${Object.entries(QTYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
            <input type="number" class="form-input q-ans-count" value="4" min="2" max="8" title="Antwortanzahl" onchange="onQTypeChange(this.closest('.question-item').querySelector('.q-type'))">
        </div>
        <input type="text" class="form-input q-text" placeholder="Frage ${qCount}">
        <div class="q-answers-area">${buildQuestionForm(qCount, 'single', 4)}</div>`;
    list.appendChild(div);
}

function onQTypeChange(sel) {
    const item = sel.closest('.question-item');
    const qid = item.dataset.qid;
    const qtype = item.querySelector('.q-type').value;
    const countInput = item.querySelector('.q-ans-count');
    // Hide count for truefalse and type
    countInput.style.display = (qtype === 'truefalse' || qtype === 'type') ? 'none' : '';
    const count = parseInt(countInput.value) || 4;
    item.querySelector('.q-answers-area').innerHTML = buildQuestionForm(qid, qtype, count);
}

function openCreateQuiz() {
    qCount = 0;
    document.getElementById('quiz-title').value = '';
    document.getElementById('quiz-time').value = '15';
    document.getElementById('quiz-questions-list').innerHTML = '';
    addQuestionToForm();
    openModal('modal-create-quiz');
}

function saveQuiz() {
    const title = document.getElementById('quiz-title').value.trim();
    if (!title) return showToast('Titel fehlt', 'error');
    const timePerQ = parseInt(document.getElementById('quiz-time').value) || 15;
    const items = document.querySelectorAll('#quiz-questions-list .question-item');
    if (!items.length) return showToast('Mind. 1 Frage', 'error');

    const questions = [];
    for (const item of items) {
        const text = item.querySelector('.q-text').value.trim();
        if (!text) return showToast('Alle Fragen brauchen Text', 'error');
        const qtype = item.querySelector('.q-type').value;

        if (qtype === 'type') {
            const ans = item.querySelector('.a-typed')?.value.trim();
            if (!ans) return showToast('Richtige Antwort fehlt', 'error');
            questions.push({ text, qtype, correctText: ans });
        } else if (qtype === 'order') {
            const items2 = [...item.querySelectorAll('.o-text')].map(i => i.value.trim());
            if (items2.some(i => !i)) return showToast('Alle Positionen ausfüllen', 'error');
            questions.push({ text, qtype, orderItems: items2 });
        } else if (qtype === 'truefalse') {
            const r = item.querySelector('.answer-radio:checked');
            questions.push({ text, qtype, correct: [parseInt(r?.value || '0')], answers: ['Ja', 'Nein'] });
        } else {
            const answers = [...item.querySelectorAll('.a-text')].map(a => a.value.trim());
            if (answers.some(a => !a)) return showToast('Alle Antworten ausfüllen', 'error');
            let correct;
            if (qtype === 'multi') {
                correct = [...item.querySelectorAll('.answer-check:checked')].map(c => parseInt(c.value));
                if (!correct.length) return showToast('Mind. 1 richtige Antwort', 'error');
            } else {
                correct = [parseInt(item.querySelector('.answer-radio:checked')?.value || '0')];
            }
            questions.push({ text, qtype, answers, correct });
        }
    }

    const quizzes = Store.getQuizzes();
    const newQuiz = { id: Date.now(), title, questions, timePerQ, createdAt: new Date().toISOString() };
    quizzes.push(newQuiz);
    Store.setQuizzes(quizzes);
    closeModal('modal-create-quiz');
    showToast('Quiz gespeichert!');
    renderQuizzes(); updateStats();
}

document.getElementById('create-quiz-btn').addEventListener('click', openCreateQuiz);
document.getElementById('empty-create-quiz').addEventListener('click', openCreateQuiz);
document.getElementById('add-question-btn').addEventListener('click', addQuestionToForm);
document.getElementById('save-quiz').addEventListener('click', saveQuiz);
document.getElementById('cancel-quiz').addEventListener('click', () => closeModal('modal-create-quiz'));
document.getElementById('close-quiz-modal').addEventListener('click', () => closeModal('modal-create-quiz'));
