// Moteur A : Web Speech API (Safari → dictée Apple, Chrome → serveurs Google). En ligne uniquement.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const MESSAGES = {
  'not-allowed': 'Micro refusé. Autorise le micro pour ce site dans les réglages du navigateur.',
  'service-not-allowed': 'Reconnaissance refusée. Active la dictée : Réglages › Général › Clavier (iPhone) ou Réglages Système › Clavier (Mac).',
  'no-speech': "Je n'ai rien entendu. Rapproche-toi du micro et réessaie.",
  'audio-capture': 'Aucun micro disponible.',
  'network': 'Reconnaissance indisponible : connexion requise pour ce moteur.',
  'aborted': 'Écoute interrompue.',
  'language-not-supported': "L'anglais américain n'est pas disponible pour la reconnaissance sur cet appareil.",
  'no-audio': "Le micro ne s'est pas ouvert. Vérifie que la dictée est activée et que le navigateur a accès au micro, puis recharge la page.",
};

const MAX_LISTEN_MS = 15000;   // durée maximale d'une écoute
const AUDIO_START_MS = 4000;   // délai pour que le micro s'ouvre réellement
const STOP_GRACE_MS = 1200;    // délai laissé au navigateur pour terminer après stop()

export function createWebSpeech() {
  let session = null;
  return {
    id: 'webspeech',
    label: 'Web Speech (navigateur)',
    supported: () => !!SR,
    async start({ onInterim, onState } = {}) {
      if (!SR) throw new Error("Ce navigateur ne propose pas la reconnaissance vocale.");
      return new Promise((resolve, reject) => {
        const rec = new SR(); // nouvelle instance à chaque essai : plus fiable sur iOS
        rec.lang = 'en-US';
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 5;
        let finals = [], alternatives = [], interim = '', error = null, audioStarted = false, done = false;
        const timers = [];

        // Termine l'écoute une seule fois, que le navigateur ait signalé la fin ou non.
        const finish = () => {
          if (done) return;
          done = true;
          timers.forEach(clearTimeout);
          session = null;
          const text = (finals.join(' ') + ' ' + interim).trim();
          if (text) resolve({ transcript: text, alternatives: alternatives.length ? alternatives : [text] });
          else reject(new Error(MESSAGES[error] || MESSAGES[audioStarted ? 'no-speech' : 'no-audio']));
        };
        // Demande l'arrêt, puis force la fin si le navigateur ne répond pas (Safari reste parfois muet).
        const stop = () => {
          if (done) return;
          try { rec.stop(); } catch {}
          timers.push(setTimeout(() => { try { rec.abort(); } catch {} finish(); }, STOP_GRACE_MS));
        };
        session = { stop };

        rec.onaudiostart = () => { audioStarted = true; onState && onState('audio'); };
        rec.onspeechstart = () => onState && onState('speech');
        rec.onresult = e => {
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
        rec.onerror = e => { error = e.error; };
        rec.onend = finish;

        timers.push(setTimeout(() => {
          if (!audioStarted && !done) { error = error || 'no-audio'; try { rec.abort(); } catch {} finish(); }
        }, AUDIO_START_MS));
        timers.push(setTimeout(stop, MAX_LISTEN_MS));

        try { rec.start(); } catch (err) { done = true; timers.forEach(clearTimeout); session = null; reject(err); }
      });
    },
    stop() { session && session.stop(); },
  };
}
