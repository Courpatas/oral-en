// Moteur A : Web Speech API (Safari → dictée Apple, Chrome → serveurs Google). En ligne uniquement.
//
// iOS ne libère pas toujours le micro tout de suite : juste après que la synthèse vocale a parlé,
// ou avec une nouvelle instance de reconnaissance, start() peut rester muet. On réutilise donc la
// même instance tant qu'elle se termine normalement, on attend un court instant seulement si la voix
// vient de parler, et on réessaie une fois avec une instance neuve si l'écoute ne démarre pas.

import { lastSpeechEnd } from '../tts.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const MESSAGES = {
  'not-allowed': 'Micro refusé. Autorise le micro pour ce site dans les réglages du navigateur.',
  'service-not-allowed': 'Reconnaissance refusée. Active la dictée : Réglages › Général › Clavier (iPhone) ou Réglages Système › Clavier (Mac).',
  'no-speech': "Je n'ai rien entendu. Rapproche-toi du micro et réessaie.",
  'audio-capture': 'Aucun micro disponible.',
  'network': 'Reconnaissance indisponible : connexion requise pour ce moteur.',
  'aborted': 'Écoute interrompue.',
  'language-not-supported': "L'anglais américain n'est pas disponible pour la reconnaissance sur cet appareil.",
  'no-audio': "Le micro ne s'est pas ouvert. Réessaie ; si ça persiste, ferme et rouvre l'app.",
};

const MAX_LISTEN_MS = 15000;   // durée maximale d'une écoute
const SERVICE_START_MS = 1500; // délai pour que l'écoute démarre (événement start)
const AUDIO_START_MS = 6000;   // délai pour que le micro donne signe de vie
const STOP_GRACE_MS = 800;     // délai laissé au navigateur pour terminer après stop()
const AUDIO_GAP_MS = 300;      // pause minimale entre la fin de la voix et l'ouverture du micro

// Journal des dernières écoutes, affiché dans l'écran Diagnostic.
const log = [];
let t0 = 0;
function note(event, detail = '') {
  log.push(`${((performance.now() - t0) / 1000).toFixed(1)}s ${event}${detail ? ' ' + detail : ''}`);
  if (log.length > 60) log.splice(0, log.length - 60);
}
export const micLog = () => log.slice();

const wait = ms => new Promise(r => setTimeout(r, ms));

// Coupe la synthèse vocale et, seulement si elle vient de parler, laisse à iOS le temps de rendre l'audio.
async function audioReady() {
  let since = performance.now() - lastSpeechEnd();
  if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) {
    speechSynthesis.cancel();
    note('voix interrompue');
    since = 0;
  }
  if (since < AUDIO_GAP_MS) {
    note('pause après la voix', `${Math.round(AUDIO_GAP_MS - since)} ms`);
    await wait(AUDIO_GAP_MS - since);
  }
}

// Instance réutilisée d'une écoute à l'autre : sur iPhone, c'est la première qui fonctionne le mieux.
let shared = null;

function listenOnce({ onInterim, onState }, attempt, session, fresh = false) {
  return new Promise((resolve, reject) => {
    if (fresh || !shared) {
      shared = new SR();
      shared.lang = 'en-US';
      shared.interimResults = true;
      shared.continuous = false;
      shared.maxAlternatives = 5;
      note('nouvelle instance');
    }
    const rec = shared;
    let finals = [], alternatives = [], interim = '', error = null, alive = false, started = false, done = false;
    let endedNormally = false;
    const timers = [];

    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      rec.onstart = rec.onaudiostart = rec.onsoundstart = rec.onspeechstart = rec.onresult = rec.onerror = rec.onend = null;
      // Écoute terminée proprement : on garde l'instance. Sinon on la libère et on en prendra une neuve.
      if (!endedNormally) {
        try { rec.abort(); } catch {}
        if (shared === rec) shared = null;
      }
      const text = (finals.join(' ') + ' ' + interim).trim();
      note('fin', text ? `« ${text.slice(0, 40)} »` : `(rien, ${error || (alive ? 'no-speech' : 'no-audio')})`);
      if (text) resolve({ transcript: text, alternatives: alternatives.length ? alternatives : [text] });
      else reject(Object.assign(new Error(MESSAGES[error] || MESSAGES[alive ? 'no-speech' : 'no-audio']), { code: error || (alive ? 'no-speech' : 'no-audio') }));
    };
    const stop = () => {
      session.stopped = true;
      if (done) return;
      note('arrêt demandé');
      try { rec.stop(); } catch {}
      timers.push(setTimeout(finish, STOP_GRACE_MS));
    };
    session.stop = stop;

    // Tout signe d'activité audio prouve que le micro fonctionne (iOS n'envoie pas toujours onaudiostart).
    const markAlive = name => () => {
      note(name);
      if (!alive) { alive = true; onState && onState('audio'); }
      if (name === 'speechstart') onState && onState('speech');
    };
    rec.onstart = () => { started = true; note('start'); };
    rec.onaudiostart = markAlive('audiostart');
    rec.onsoundstart = markAlive('soundstart');
    rec.onspeechstart = markAlive('speechstart');
    rec.onresult = e => {
      if (!alive) markAlive('result')();
      interim = '';
      finals = [];
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finals.push(r[0].transcript);
          if (e.results.length === 1) alternatives = Array.from(r, a => a.transcript);
        } else interim += r[0].transcript;
      }
      onInterim && onInterim((finals.join(' ') + ' ' + interim).trim());
    };
    rec.onerror = e => { error = e.error; note('erreur', e.error); };
    rec.onend = () => { note('end'); endedNormally = started; finish(); };

    // Écoute qui ne démarre même pas : on abandonne vite pour réessayer.
    timers.push(setTimeout(() => {
      if (!started && !alive && !done) { note('pas de start', `${SERVICE_START_MS / 1000}s`); finish(); }
    }, SERVICE_START_MS));
    timers.push(setTimeout(() => {
      if (!alive && !done) { note('micro muet', `${AUDIO_START_MS / 1000}s`); finish(); }
    }, AUDIO_START_MS));
    timers.push(setTimeout(stop, MAX_LISTEN_MS));

    note(`essai ${attempt}`);
    try { rec.start(); } catch (err) {
      note('start refusé', err.message);
      error = 'no-audio';
      finish();
    }
  });
}

export function createWebSpeech() {
  let session = null;
  return {
    id: 'webspeech',
    label: 'Web Speech (navigateur)',
    supported: () => !!SR,
    async start(callbacks = {}) {
      if (!SR) throw new Error("Ce navigateur ne propose pas la reconnaissance vocale.");
      t0 = performance.now();
      note('— nouvelle écoute', new Date().toLocaleTimeString('fr-FR'));
      session ={ stopped: false, stop() { this.stopped = true; } };
      const current = session;
      try {
        await audioReady();
        if (current.stopped) throw new Error(MESSAGES.aborted);
        try {
          return await listenOnce(callbacks, 1, current);
        } catch (err) {
          // Le micro n'a donné aucun signe de vie : on réessaie une fois avec une instance neuve.
          if (err.code !== 'no-audio' || current.stopped) throw err;
          await wait(150);
          return await listenOnce(callbacks, 2, current, true);
        }
      } finally {
        if (session === current) session = null;
      }
    },
    stop() { session && session.stop(); },
  };
}
