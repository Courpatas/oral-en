import { compare, compareBest } from './compare.js';
import { initTTS, englishVoices, selectVoice, currentVoice, speak, speakFrench, stopSpeaking, ttsSupported } from './tts.js';
import { getRecognizer } from './asr/index.js';
import { micLog } from './asr/webspeech.js';
import * as store from './store.js';
import { DEFAULTS, today, status, STATUS_LABEL, recordAttempt, buildQueue, countByStatus, isDue } from './srs.js';

const VERSION = '1.0.2';
const TARGET = 1000;
const SESSION_MINUTES = 15;
const DIAG_SENTENCE = 'Hello, I am learning English and I live in Tahiti.';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SETTINGS_DEFAULTS = {
  ...DEFAULTS,
  engine: 'webspeech',
  voiceURI: null,
  slowRate: 0.7,
  autoplay: true,
  useAlternatives: true,
  // Mode écoute seule
  listenTheme: 'all',
  listenSpeed: 'normal',
  listenRepeat: 1,
  listenPause: 2,
  listenShowText: true,
  listenFrench: false,
  listenShuffle: false,
};

const state = {
  themes: [], phrases: [], byId: new Map(), pron: new Map(),
  progress: {}, settings: { ...SETTINGS_DEFAULTS }, days: {},
  queue: [], index: 0, mode: null, themeId: null, current: null,
  sessionEnd: null, sessionStats: null, requeued: new Map(),
  listening: false, lastInteraction: Date.now(), lastResult: null,
};

/* ---------- Navigation ---------- */

function go(name) {
  stopSpeaking();
  listenStop();
  if (state.listening) getRecognizer(state.settings.engine).stop();
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  window.scrollTo(0, 0);
  ({ home: renderHome, themes: renderThemes, progress: renderProgress, settings: renderSettings, diagnostic: renderDiagnostic, listen: renderListen }[name] || (() => {}))();
}
document.addEventListener('click', e => {
  state.lastInteraction = Date.now();
  const t = e.target.closest('[data-go]');
  if (t) go(t.dataset.go);
});

/* ---------- Données ---------- */

async function load() {
  const [themes, phrases] = await Promise.all([
    fetch('data/themes.json').then(r => r.json()),
    fetch('data/phrases.json').then(r => r.json()),
  ]);
  state.themes = themes;
  state.phrases = phrases;
  for (const p of phrases) {
    state.byId.set(p.id, p);
    for (const [w, pr] of Object.entries(p.pronunciation_notes || {})) state.pron.set(w.toLowerCase(), pr);
  }
  state.progress = await store.get('progress', {});
  state.settings = { ...SETTINGS_DEFAULTS, ...(await store.get('settings', {})) };
  state.days = await store.get('days', {});
}

const saveProgress = () => store.set('progress', state.progress);
const saveSettings = () => store.set('settings', state.settings);
const saveDays = () => store.set('days', state.days);

function dayLog(d = today()) {
  return (state.days[d] ??= { seconds: 0, attempts: 0, successes: 0 });
}

/* ---------- Accueil ---------- */

function themeStats(themeId) {
  const list = state.phrases.filter(p => p.theme === themeId);
  const c = countByStatus(list, state.progress);
  return { available: list.length, ...c };
}

function renderHome() {
  const c = countByStatus(state.phrases, state.progress);
  $('#home-mastered').textContent = c.mastered;
  $('#home-bar').style.width = (c.mastered / TARGET) * 100 + '%';
  $('#home-available').textContent = state.phrases.length < TARGET
    ? `${state.phrases.length} phrases disponibles pour l'instant (prototype).` : '';
  const due = state.phrases.filter(p => isDue(state.progress[p.id])).length;
  $('#home-chips').innerHTML = [
    due ? `<span class="chip st-learning">${due} à réviser aujourd'hui</span>` : '',
    c.review ? `<span class="chip st-review">${c.review} à revoir</span>` : '',
    c.learning ? `<span class="chip">${c.learning} en cours</span>` : '',
    `<span class="chip">🔥 ${streak()} j</span>`,
  ].join('');
}

/* ---------- Thèmes ---------- */

function renderThemes() {
  let html = '', group = null;
  for (const t of state.themes) {
    if (t.group !== group) { group = t.group; html += `<h2 class="group-title">${esc(group)}</h2>`; }
    const s = themeStats(t.id);
    const pct = s.available ? (s.mastered / 50) * 100 : 0;
    html += `<button class="item" data-theme="${t.id}" ${s.available ? '' : 'disabled'}>
      <div class="t"><b>${t.icon} ${esc(t.name)}</b><span>${s.available ? `${s.mastered} / 50` : 'bientôt'}</span></div>
      <div class="bar"><span style="width:${pct}%"></span></div>
    </button>`;
  }
  $('#themes-list').innerHTML = html;
}
$('#themes-list').addEventListener('click', e => {
  const b = e.target.closest('[data-theme]');
  if (b && !b.disabled) startRun('theme', +b.dataset.theme);
});

/* ---------- Exercice ---------- */

function currentThemeGuess() {
  let best = null;
  for (const [id, r] of Object.entries(state.progress)) {
    if (r.lastDate && (!best || r.lastDate > best.d)) best = { d: r.lastDate, theme: state.byId.get(id)?.theme };
  }
  return best?.theme ?? state.phrases[0]?.theme;
}

function startRun(mode, themeId = null) {
  state.mode = mode;
  state.themeId = themeId;
  state.queue = buildQueue({ phrases: state.phrases, progress: state.progress, mode, themeId, currentTheme: currentThemeGuess() });
  if (mode === 'theme' && !state.queue.length) {
    // Tout est maîtrisé et rien n'est dû : on propose quand même tout le thème.
    state.queue = state.phrases.filter(p => p.theme === themeId);
  }
  state.index = 0;
  state.requeued = new Map();
  state.sessionStats = { count: 0, total: 0, mastered: 0, start: Date.now() };
  state.sessionEnd = mode === 'session' ? Date.now() + SESSION_MINUTES * 60000 : null;
  if (!state.queue.length) { alert('Rien à travailler pour le moment.'); return; }
  go('exercise');
  showPhrase();
}

function showPhrase() {
  const p = state.queue[state.index];
  state.current = p;
  state.lastResult = null;
  const theme = state.themes.find(t => t.id === p.theme);
  $('#ex-theme').textContent = `${theme.icon} ${theme.name}`;
  $('#ex-count').textContent = state.mode === 'session'
    ? `${state.sessionStats.count} faites` : `${state.index + 1} / ${state.queue.length}`;
  const st = status(state.progress[p.id]);
  $('#ex-status').className = `chip st-${st}`;
  $('#ex-status').textContent = STATUS_LABEL[st];
  $('#ex-level').textContent = p.level;
  $('#ex-text').textContent = p.text_en;
  $('#ex-fr').textContent = p.text_fr;
  $('#ex-text').hidden = true;
  $('#ex-fr').hidden = true;
  $('#ex-show-fr').hidden = true;
  $('#ex-show').hidden = false;
  $('#ex-show').textContent = 'Voir la phrase';
  $('#ex-result').hidden = true;
  $('#ex-error').hidden = true;
  $('#ex-live').hidden = true;
  $('#ex-after').hidden = true;
  setMic('idle');
  updateFlag();
  if (state.settings.autoplay) speak(p.text_en, 1);
}

function updateFlag() {
  const flagged = !!state.progress[state.current.id]?.flagged;
  $('#ex-flag').textContent = flagged ? '★ À revoir' : '☆ À revoir';
}

$('#ex-play').onclick = () => speak(state.current.text_en, 1);
$('#ex-slow').onclick = () => speak(state.current.text_en, state.settings.slowRate);
$('#ex-show').onclick = () => {
  const hidden = $('#ex-text').hidden;
  $('#ex-text').hidden = !hidden;
  $('#ex-show-fr').hidden = !hidden;
  if (!hidden) $('#ex-fr').hidden = true;
  $('#ex-show').textContent = hidden ? 'Masquer la phrase' : 'Voir la phrase';
};
$('#ex-show-fr').onclick = () => { $('#ex-fr').hidden = !$('#ex-fr').hidden; };
$('#ex-back').onclick = () => { saveDays(); go(state.mode === 'theme' ? 'themes' : 'home'); };

function setMic(mode) {
  const b = $('#ex-mic');
  b.classList.toggle('listening', mode === 'listening');
  b.classList.toggle('processing', mode === 'processing');
  b.disabled = mode === 'processing';
  b.textContent = { idle: '🎙 Répéter', listening: '■ J\'écoute… (toucher pour arrêter)', processing: 'Analyse…' }[mode];
  state.listening = mode === 'listening';
}

// Texte affiché pendant l'écoute selon ce que signale le moteur.
const LIVE_STATE = {
  audio: '🎙 Micro ouvert : parle maintenant…',
  speech: '🎙 Je t\'entends…',
  processing: 'Analyse…',
};

$('#ex-mic').onclick = async () => {
  const rec = getRecognizer(state.settings.engine);
  if (state.listening) {
    $('#ex-mic').textContent = 'Arrêt…';
    rec.stop();
    return;
  }
  stopSpeaking();
  $('#ex-error').hidden = true;
  $('#ex-result').hidden = true;
  $('#ex-after').hidden = true;
  $('#ex-live').hidden = false;
  $('#ex-live').textContent = 'Ouverture du micro…';
  setMic('listening');
  // Dès que tous les mots attendus ont été entendus, on coupe l'écoute sans attendre le silence.
  const p = state.current;
  let autoStop = null;
  const onInterim = t => {
    if (!t) return;
    $('#ex-live').textContent = t;
    if (autoStop || compare(p.text_en, t, p.unscored || []).score < 100) return;
    autoStop = setTimeout(() => rec.stop(), 250);
  };
  try {
    const out = await rec.start({
      onInterim,
      onState: s => {
        if (s === 'processing') setMic('processing');
        if (LIVE_STATE[s]) $('#ex-live').textContent = LIVE_STATE[s];
      },
      onProgress: pct => { $('#ex-live').textContent = `Chargement du modèle : ${pct} %`; },
    });
    clearTimeout(autoStop);
    setMic('idle');
    $('#ex-live').hidden = true;
    handleResult(out);
  } catch (err) {
    clearTimeout(autoStop);
    setMic('idle');
    $('#ex-live').hidden = true;
    $('#ex-error').textContent = err.message || String(err);
    $('#ex-error').hidden = false;
  }
};

function handleResult({ transcript, alternatives }) {
  const p = state.current;
  const unscored = p.unscored || [];
  const r = state.settings.useAlternatives && alternatives?.length > 1
    ? compareBest(p.text_en, alternatives, unscored)
    : compare(p.text_en, transcript, unscored);
  state.lastResult = r;

  const before = state.progress[p.id];
  const wasMastered = !!before?.mastered;
  const rec = recordAttempt(before, r.score, state.settings);
  state.progress[p.id] = rec;
  saveProgress();

  const log = dayLog();
  log.attempts++;
  const success = r.score >= state.settings.threshold;
  if (success) log.successes++;
  saveDays();
  state.sessionStats.count++;
  state.sessionStats.total += r.score;
  if (rec.mastered && !wasMastered) state.sessionStats.mastered++;

  // Phrase ratée : elle revient quelques phrases plus loin (2 fois maximum par séance).
  if (!success) {
    const n = state.requeued.get(p.id) || 0;
    if (n < 2) {
      state.requeued.set(p.id, n + 1);
      state.queue.splice(Math.min(state.index + 5, state.queue.length), 0, p);
    }
  }
  renderResult(r, rec, wasMastered);
}

function renderResult(r, rec, wasMastered) {
  const sc = $('#ex-score').parentElement;
  $('#ex-score').textContent = r.score;
  sc.className = 'score ' + (r.score >= state.settings.threshold ? 'good' : r.score >= 60 ? 'mid' : 'low');

  let verdict;
  if (rec.mastered && !wasMastered) verdict = '🎉 Phrase maîtrisée ! Elle reviendra en révision dans 7 jours.';
  else if (r.score >= state.settings.threshold) {
    const days = new Set(rec.successes).size;
    verdict = rec.mastered ? 'Toujours maîtrisée. 👍'
      : `Réussie : ${rec.successes.length}/${state.settings.successesNeeded} répétitions, sur ${days}/${state.settings.distinctDays} jour(s).`;
  } else verdict = r.score >= 60 ? 'Presque ! Réécoute les mots en rouge.' : 'On réécoute et on recommence.';
  $('#ex-verdict').textContent = verdict;

  // Phrase colorée, avec les mots ajoutés signalés en exposant.
  $('#ex-words').innerHTML = r.words.map(w => `<span class="w-${w.state}">${esc(w.text)}</span>`).join(' ')
    + r.errors.filter(e => e.type === 'ins').map(e => ` <span class="w-extra">+${esc(e.heard)}</span>`).join('');

  $('#ex-fixes').innerHTML = r.errors.slice(0, 6).map(e => {
    const word = (e.expected || '').toLowerCase().replace(/[^a-z'-]/g, '');
    const pron = state.pron.get(word);
    const pronHtml = pron ? `<span class="pron">🗣 ${esc(pron)}</span>` : '';
    if (e.type === 'sub') return `<li><div>Tu as dit « <b>${esc(e.heard)}</b> », attendu « <b>${esc(e.expected)}</b> »${pronHtml}</div><button data-say="${esc(e.expected)}" aria-label="Écouter le mot">🔊</button></li>`;
    if (e.type === 'del') return `<li><div>Mot non reconnu : « <b>${esc(e.expected)}</b> »${pronHtml}</div><button data-say="${esc(e.expected)}" aria-label="Écouter le mot">🔊</button></li>`;
    return `<li><div>Mot en trop : « ${esc(e.heard)} »</div></li>`;
  }).join('');
  $('#ex-heard').textContent = r.transcript;

  $('#ex-text').hidden = true;
  $('#ex-show').hidden = true;
  $('#ex-show-fr').hidden = false;
  $('#ex-result').hidden = false;
  $('#ex-after').hidden = false;
  $('#ex-status').className = `chip st-${status(rec)}`;
  $('#ex-status').textContent = STATUS_LABEL[status(rec)];
  updateFlag();
}

$('#ex-fixes').addEventListener('click', e => {
  const b = e.target.closest('[data-say]');
  if (b) speak(b.dataset.say, state.settings.slowRate);
});
$('#ex-retry').onclick = () => {
  $('#ex-result').hidden = true;
  $('#ex-after').hidden = true;
  $('#ex-show').hidden = false;
  speak(state.current.text_en, 1);
};
$('#ex-flag').onclick = () => {
  const p = state.current;
  const rec = state.progress[p.id] || { attempts: 0, successes: [] };
  rec.flagged = !rec.flagged;
  if (rec.flagged) { rec.due = today(); rec.attempts ||= 0; }
  state.progress[p.id] = rec;
  saveProgress();
  updateFlag();
  $('#ex-status').className = `chip st-${status(rec)}`;
  $('#ex-status').textContent = rec.attempts ? STATUS_LABEL[status(rec)] : 'À revoir';
};
$('#ex-next').onclick = () => {
  if (state.sessionEnd && Date.now() >= state.sessionEnd) return finishRun();
  state.index++;
  if (state.index >= state.queue.length) return finishRun();
  showPhrase();
};

function finishRun() {
  saveDays();
  const s = state.sessionStats;
  const avg = s.count ? Math.round(s.total / s.count) : 0;
  const mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
  $('#done-summary').innerHTML = s.count
    ? `${s.count} phrase${s.count > 1 ? 's' : ''} travaillée${s.count > 1 ? 's' : ''} en ${mins} min.<br>Score moyen : <b>${avg} %</b>.`
      + (s.mastered ? `<br>Nouvelles phrases maîtrisées : <b>${s.mastered}</b>.` : '')
    : 'Séance terminée.';
  go('done');
}

/* ---------- Écoute seule ---------- */
// Lecture enchaînée, sans micro ni score. Un « jeton » permet d'interrompre proprement la boucle.

const listen = { list: [], index: 0, playing: false, token: 0, wakeLock: null };
const listenForm = $('#listen-form');

function listenList() {
  const t = state.settings.listenTheme;
  const list = t === 'all' ? [...state.phrases]
    : t === 'review' ? state.phrases.filter(p => ['learning', 'review'].includes(status(state.progress[p.id])))
    : state.phrases.filter(p => String(p.theme) === String(t));
  if (state.settings.listenShuffle) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  }
  return list;
}

function renderListen() {
  const s = state.settings;
  const themed = state.themes.filter(t => state.phrases.some(p => p.theme === t.id));
  $('#ls-theme').innerHTML = `<option value="all">Toutes les phrases</option>`
    + `<option value="review">Mes phrases en cours et à revoir</option>`
    + themed.map(t => `<option value="${t.id}">${t.icon} ${esc(t.name)}</option>`).join('');
  for (const el of listenForm.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') el.checked = !!s[el.name];
    else el.value = String(s[el.name]);
  }
  if (![...$('#ls-theme').options].some(o => o.value === $('#ls-theme').value)) $('#ls-theme').value = 'all';
  listen.list = listenList();
  listen.index = 0;
  showListenPhrase();
  setListenState('');
}

function showListenPhrase() {
  const p = listen.list[listen.index];
  $('#ls-count').textContent = listen.list.length ? `${listen.index + 1} / ${listen.list.length}` : 'Aucune phrase';
  $('#ls-text').textContent = p && state.settings.listenShowText ? p.text_en : '';
  $('#ls-fr').textContent = p && state.settings.listenShowText && state.settings.listenFrench ? p.text_fr : '';
}

function setListenState(text) {
  $('#ls-state').textContent = text;
  $('#ls-play').textContent = listen.playing ? '⏸ Pause' : '▶ Lancer';
}

const pause = ms => new Promise(r => setTimeout(r, ms));

async function listenLoop() {
  const my = ++listen.token;
  const alive = () => listen.playing && my === listen.token;
  const s = state.settings;
  const gap = s.listenPause * 1000;
  while (alive() && listen.index < listen.list.length) {
    const p = listen.list[listen.index];
    showListenPhrase();
    const rates = s.listenSpeed === 'both' ? [1, s.slowRate] : [s.listenSpeed === 'slow' ? s.slowRate : 1];
    for (let r = 0; r < s.listenRepeat && alive(); r++) {
      for (const rate of rates) {
        if (!alive()) return;
        setListenState(rate < 1 ? '🐢 Lecture lente' : '🔊 Lecture');
        await speak(p.text_en, rate);
        if (!alive()) return;
        setListenState('…');
        await pause(gap);
      }
    }
    if (s.listenFrench && alive()) {
      setListenState('🇫🇷 Traduction');
      await speakFrench(p.text_fr);
      if (alive()) await pause(gap);
    }
    if (!alive()) return;
    listen.index++;
  }
  if (my === listen.token) {
    listen.playing = false;
    listen.index = Math.max(0, listen.list.length - 1);
    releaseWakeLock();
    setListenState('Fin de la liste.');
  }
}

async function keepScreenOn() {
  try { listen.wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function releaseWakeLock() {
  try { listen.wakeLock?.release(); } catch {}
  listen.wakeLock = null;
}

function listenStart() {
  if (!listen.list.length) return;
  if (listen.index >= listen.list.length) listen.index = 0;
  listen.playing = true;
  keepScreenOn();
  setListenState('');
  listenLoop();
}

function listenStop() {
  if (!listen.playing) return;
  listen.playing = false;
  listen.token++;
  stopSpeaking();
  releaseWakeLock();
  setListenState('En pause.');
}

function listenJump(delta) {
  const wasPlaying = listen.playing;
  listenStop();
  listen.index = Math.max(0, Math.min(listen.list.length - 1, listen.index + delta));
  showListenPhrase();
  if (wasPlaying) listenStart();
  else setListenState('');
}

$('#ls-play').onclick = () => (listen.playing ? listenStop() : listenStart());
$('#ls-prev').onclick = () => listenJump(-1);
$('#ls-next').onclick = () => listenJump(1);

listenForm.addEventListener('change', e => {
  const el = e.target;
  if (!el.name) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (['listenRepeat', 'listenPause'].includes(el.name)) v = Number(v);
  state.settings[el.name] = v;
  saveSettings();
  if (['listenTheme', 'listenShuffle'].includes(el.name)) {
    listenStop();
    listen.list = listenList();
    listen.index = 0;
    setListenState('');
  }
  showListenPhrase();
});

// iOS coupe l'écran allumé quand l'app passe en arrière-plan : on le redemande au retour.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && listen.playing) keepScreenOn();
});

/* ---------- Temps de pratique et minuteur ---------- */

let tick = 0;
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  // L'écoute seule compte aussi comme temps de pratique, tant qu'elle joue.
  if (listen.playing) {
    dayLog().seconds++;
    if (++tick % 15 === 0) saveDays();
    return;
  }
  const onExercise = $('#screen-exercise').classList.contains('active');
  if (!onExercise) return;
  if (state.sessionEnd) {
    const left = Math.max(0, state.sessionEnd - Date.now());
    $('#ex-timer').textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
  } else $('#ex-timer').textContent = '';
  // On ne compte que le temps actif (une action dans les 90 dernières secondes).
  if (Date.now() - state.lastInteraction < 90000 || state.listening) {
    dayLog().seconds++;
    if (++tick % 15 === 0) saveDays();
  }
}, 1000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveDays());

function streak() {
  let n = 0, d = new Date();
  if (!state.days[today(d)]?.attempts) d.setDate(d.getDate() - 1); // la série tient jusqu'à ce soir
  while (state.days[today(d)]?.attempts) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- Progrès ---------- */

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

function renderProgress() {
  const c = countByStatus(state.phrases, state.progress);
  const total = Object.values(state.days).reduce((s, d) => s + (d.seconds || 0), 0);
  const todaySec = state.days[today()]?.seconds || 0;
  const attempts = Object.values(state.days).reduce((s, d) => s + (d.attempts || 0), 0);
  $('#progress-cards').innerHTML = `
    <div class="card wide"><b>${c.mastered} / ${TARGET}</b><span>phrases maîtrisées</span>
      <div class="bar big" style="margin-top:10px"><span style="width:${(c.mastered / TARGET) * 100}%"></span></div></div>
    <div class="card"><b>🔥 ${streak()}</b><span>jour(s) d'affilée</span></div>
    <div class="card"><b>${fmtDuration(todaySec)}</b><span>aujourd'hui</span></div>
    <div class="card"><b>${fmtDuration(total)}</b><span>de pratique au total</span></div>
    <div class="card"><b>${attempts}</b><span>répétitions</span></div>
    <div class="card"><b>${c.learning}</b><span>en cours</span></div>
    <div class="card"><b>${c.review}</b><span>à revoir</span></div>`;

  const weak = state.themes.map(t => {
    const list = state.phrases.filter(p => p.theme === t.id && state.progress[p.id]?.attempts);
    if (!list.length) return null;
    const avg = list.reduce((s, p) => s + (state.progress[p.id].last || 0), 0) / list.length;
    const review = list.filter(p => state.progress[p.id].flagged).length;
    return { t, avg, review, n: list.length };
  }).filter(Boolean).sort((a, b) => a.avg - b.avg).slice(0, 3);
  $('#progress-weak').innerHTML = weak.length ? weak.map(w => `
    <button class="item" data-theme-run="${w.t.id}"><div class="t"><b>${w.t.icon} ${esc(w.t.name)}</b>
    <span>${Math.round(w.avg)} % en moyenne</span></div>
    <div class="muted small">${w.n} phrase(s) travaillée(s)${w.review ? ` · ${w.review} à revoir` : ''}</div></button>`).join('')
    : '<p class="muted">Pas encore assez de données.</p>';

  $('#progress-themes').innerHTML = state.themes.map(t => {
    const s = themeStats(t.id);
    return `<div class="item" style="cursor:default"><div class="t"><b>${t.icon} ${esc(t.name)}</b>
      <span>${s.mastered} / 50${s.available && s.available < 50 ? ` (${s.available} dispo)` : ''}</span></div>
      <div class="bar"><span style="width:${(s.mastered / 50) * 100}%"></span></div></div>`;
  }).join('');
}
$('#progress-weak').addEventListener('click', e => {
  const b = e.target.closest('[data-theme-run]');
  if (b) startRun('theme', +b.dataset.themeRun);
});

/* ---------- Réglages ---------- */

const form = $('#settings-form');

function renderSettings() {
  const s = state.settings;
  for (const el of form.elements) {
    if (!el.name || !(el.name in s)) continue;
    if (el.type === 'checkbox') el.checked = !!s[el.name];
    else if (el.name !== 'voiceURI') el.value = s[el.name];
  }
  const voices = englishVoices();
  $('#voice-select').innerHTML = voices.length
    ? voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${v.lang})${v.localService ? '' : ' · en ligne'}</option>`).join('')
    : '<option value="">Aucune voix anglaise trouvée</option>';
  $('#voice-select').value = currentVoice()?.voiceURI || '';
  $('#out-threshold').textContent = s.threshold + ' %';
  $('#out-slowRate').textContent = s.slowRate + '×';
  $('#whisper-preload').hidden = !s.engine.startsWith('whisper');
  $('#app-version').textContent = VERSION;
  store.get('lastBackup', null).then(d => {
    $('#backup-info').textContent = d
      ? `Dernière sauvegarde : ${new Date(d).toLocaleDateString('fr-FR')}.`
      : 'Aucune sauvegarde pour le moment. Pense à exporter de temps en temps.';
  });
}

form.addEventListener('input', e => {
  const el = e.target;
  if (!el.name) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'range' || el.type === 'number') v = Number(v);
  if (el.type === 'number') v = Math.max(+el.min, Math.min(+el.max, v || +el.min));
  state.settings[el.name] = v;
  if (el.name === 'voiceURI') selectVoice(v);
  saveSettings();
  $('#out-threshold').textContent = state.settings.threshold + ' %';
  $('#out-slowRate').textContent = state.settings.slowRate + '×';
  $('#whisper-preload').hidden = !state.settings.engine.startsWith('whisper');
});

$('#voice-test').onclick = () => speak('The implementation of this policy took longer than expected.', 1);

$('#whisper-preload').onclick = async () => {
  const rec = getRecognizer(state.settings.engine);
  const out = $('#whisper-progress');
  out.textContent = 'Téléchargement…';
  try {
    await rec.preload(pct => { out.textContent = `Téléchargement : ${pct} %`; });
    out.textContent = 'Modèle prêt. Il fonctionnera aussi hors ligne.';
  } catch (e) { out.textContent = 'Échec du téléchargement : ' + e.message; }
};

$('#btn-export').onclick = async () => {
  const data = await store.exportAll();
  const name = `oral-en-progression-${today()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name }); // iPhone : « Enregistrer dans Fichiers »
    } else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    await store.set('lastBackup', data.exportedAt);
    renderSettings();
  } catch (e) {
    if (e.name !== 'AbortError') alert('Export impossible : ' + e.message);
  }
};

$('#file-import').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const n = Object.keys(data.progress || {}).length;
    if (!confirm(`Remplacer la progression actuelle par celle du fichier (${n} phrases suivies) ?`)) return;
    await store.importAll(data);
    await load();
    selectVoice(state.settings.voiceURI);
    alert('Progression importée.');
    renderSettings();
  } catch (err) { alert('Import impossible : ' + err.message); }
};

$('#btn-reset').onclick = async () => {
  if (!confirm('Effacer toute la progression ? Pense à exporter avant.')) return;
  if (!confirm('Vraiment ? Cette action est définitive.')) return;
  state.progress = {}; state.days = {};
  await saveProgress(); await saveDays();
  go('home');
};

/* ---------- Diagnostic ---------- */

async function diagnostics() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const v = currentVoice();
  let mic = 'inconnu';
  try { mic = (await navigator.permissions?.query({ name: 'microphone' }))?.state || 'inconnu'; } catch {}
  return [
    ['Version de l\'app', VERSION],
    ['Appareil', navigator.userAgent.replace(/^Mozilla\/5\.0 /, '')],
    ['Mode écran d\'accueil', standalone ? 'oui' : 'non (navigateur)'],
    ['Reconnaissance Web Speech', SR ? 'disponible' : 'absente'],
    ['Enregistrement audio (Whisper)', window.MediaRecorder ? 'disponible' : 'absent'],
    ['WebAssembly', window.WebAssembly ? 'oui' : 'non'],
    ['Synthèse vocale', ttsSupported() ? 'disponible' : 'absente'],
    ['Voix utilisée', v ? `${v.name} (${v.lang}${v.localService ? ', locale' : ', en ligne'})` : 'aucune'],
    ['Voix anglaises', String(englishVoices().length)],
    ['Permission micro', mic],
    ['Stockage persistant', (await store.isPersisted()) ? 'oui' : 'non'],
    ['Hors ligne (service worker)', navigator.serviceWorker?.controller ? 'actif' : 'inactif'],
    ['Moteur choisi', state.settings.engine],
  ];
}

async function renderDiagnostic() {
  const rows = await diagnostics();
  $('#diag-list').innerHTML = rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join('');
  $('#diag-log').textContent = micLog().join('\n') || 'Aucune écoute pour le moment.';
}

$('#diag-test').onclick = async () => {
  const out = $('#diag-out');
  const rec = getRecognizer(state.settings.engine);
  if (state.listening) { $('#diag-test').textContent = 'Arrêt…'; rec.stop(); return; }
  stopSpeaking();
  out.textContent = 'Ouverture du micro…';
  state.listening = true;
  $('#diag-test').textContent = '■ Arrêter';
  const t0 = performance.now();
  let firstSound = null, audioAt = null;
  try {
    const r = await rec.start({
      onInterim: t => { firstSound ??= performance.now(); out.textContent = 'J\'écoute… ' + t; },
      onProgress: pct => { out.textContent = `Chargement du modèle : ${pct} %`; },
      onState: s => {
        if (s === 'audio') audioAt ??= performance.now();
        if (LIVE_STATE[s]) out.textContent = LIVE_STATE[s];
      },
    });
    const total = Math.round(performance.now() - t0);
    const res = compare(DIAG_SENTENCE, r.transcript);
    out.textContent = `Compris : « ${r.transcript} »\nVariantes : ${r.alternatives.length}\nScore sur la phrase test : ${res.score} %\n`
      + `Durée totale : ${(total / 1000).toFixed(1)} s`
      + (audioAt ? ` · micro ouvert après ${((audioAt - t0) / 1000).toFixed(1)} s` : '')
      + (firstSound ? ` · premier mot après ${((firstSound - t0) / 1000).toFixed(1)} s` : '');
  } catch (e) {
    out.textContent = 'Erreur : ' + (e.message || e)
      + (audioAt ? `\nMicro ouvert après ${((audioAt - t0) / 1000).toFixed(1)} s.` : '\nLe micro ne s\'est jamais ouvert.');
  } finally {
    state.listening = false;
    $('#diag-test').textContent = '🎙 Tester le moteur choisi';
  }
};

$('#diag-copy').onclick = async () => {
  const rows = await diagnostics();
  const text = rows.map(([k, v]) => `${k} : ${v}`).join('\n') + '\n\n' + $('#diag-out').textContent
    + '\n\nJournal du micro :\n' + (micLog().join('\n') || '(vide)');
  try { await navigator.clipboard.writeText(text); alert('Rapport copié. Tu peux le coller dans la conversation.'); }
  catch { prompt('Copie ce rapport :', text); }
};

/* ---------- Démarrage ---------- */

$('#btn-continue').onclick = () => startRun('continue');
$('#btn-session').onclick = () => startRun('session');

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) $('#update-banner').hidden = false;
      });
    });
  }).catch(() => {});
  $('#update-reload').onclick = () => location.reload();
}

(async () => {
  await load();
  await initTTS();
  selectVoice(state.settings.voiceURI);
  store.requestPersistence();
  registerSW();
  renderHome();
})();
