// Moteur A : Web Speech API (Safari → dictée Apple, Chrome → serveurs Google). En ligne uniquement.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const MESSAGES = {
  'not-allowed': 'Micro refusé. Autorise le micro pour cette app dans les réglages du navigateur.',
  'service-not-allowed': 'Reconnaissance refusée. Sur iPhone : Réglages › Général › Clavier › Activer la dictée.',
  'no-speech': "Je n'ai rien entendu. Rapproche-toi du micro et réessaie.",
  'audio-capture': 'Aucun micro disponible.',
  'network': 'Reconnaissance indisponible : connexion requise pour ce moteur.',
  'aborted': 'Écoute interrompue.',
  'language-not-supported': "L'anglais américain n'est pas disponible pour la reconnaissance sur cet appareil.",
};

export function createWebSpeech() {
  let rec = null;
  return {
    id: 'webspeech',
    label: 'Web Speech (navigateur)',
    supported: () => !!SR,
    async start({ onInterim } = {}) {
      if (!SR) throw new Error("Ce navigateur ne propose pas la reconnaissance vocale.");
      return new Promise((resolve, reject) => {
        rec = new SR(); // nouvelle instance à chaque essai : plus fiable sur iOS
        rec.lang = 'en-US';
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 5;
        let finals = [], alternatives = [], interim = '', error = null;
        const guard = setTimeout(() => { try { rec.stop(); } catch {} }, 20000);
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
        rec.onend = () => {
          clearTimeout(guard);
          const text = (finals.join(' ') + ' ' + interim).trim();
          if (text) resolve({ transcript: text, alternatives: alternatives.length ? alternatives : [text] });
          else reject(new Error(MESSAGES[error] || MESSAGES['no-speech']));
          rec = null;
        };
        try { rec.start(); } catch (err) { clearTimeout(guard); reject(err); }
      });
    },
    stop() { if (rec) try { rec.stop(); } catch {} },
  };
}
