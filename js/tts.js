// Synthèse vocale : voix américaine (en-US) en priorité, jamais britannique par défaut.

const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley)\b/i;
const PREFERRED = /(Premium|Enhanced|Siri|Samantha|Ava|Allison|Evan|Nathan|Zoe|Tom|Susan|Joelle|Noelle|Google US English|Microsoft (Aria|Jenny|Guy))/i;

let voices = [];
let current = null;
let keepAlive = null; // iOS : garder une référence évite que l'énoncé soit interrompu

const supported = () => 'speechSynthesis' in window;

function refresh() {
  voices = supported() ? speechSynthesis.getVoices().filter(v => !NOVELTY.test(v.name)) : [];
}

export function initTTS() {
  if (!supported()) return Promise.resolve();
  refresh();
  if (voices.length) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { refresh(); resolve(); };
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 2000);
  });
}

const isUS = v => /^en[-_]US$/i.test(v.lang);
const isNeutral = v => /^en[-_](CA|AU|NZ|IE|ZA|IN)?$/i.test(v.lang) || /^en$/i.test(v.lang);

/** Voix proposées dans les réglages : US d'abord, puis anglais neutre (jamais GB). */
export function englishVoices() {
  refresh();
  const us = voices.filter(isUS);
  const other = voices.filter(v => !isUS(v) && isNeutral(v));
  const rank = v => (PREFERRED.test(v.name) ? 0 : 1) + (v.localService ? 0 : 0.5);
  return [...us.sort((a, b) => rank(a) - rank(b)), ...other];
}

export function selectVoice(preferredURI) {
  const list = englishVoices();
  current = list.find(v => v.voiceURI === preferredURI) || list[0] || null;
  return current;
}

export const currentVoice = () => current;

export function speak(text, rate = 1) {
  if (!supported()) return Promise.resolve();
  return new Promise(resolve => {
    const go = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = current ? current.lang : 'en-US';
      if (current) u.voice = current;
      u.rate = rate;
      u.onend = u.onerror = () => resolve();
      keepAlive = u;
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      setTimeout(go, 80); // Safari ignore parfois un speak() juste après cancel()
    } else go();
  });
}

/** Lit un texte en français (traductions du mode écoute), avec la meilleure voix fr disponible. */
export function speakFrench(text, rate = 1) {
  if (!supported()) return Promise.resolve();
  const fr = speechSynthesis.getVoices().filter(v => /^fr[-_]FR$/i.test(v.lang) && !NOVELTY.test(v.name));
  const voice = fr.find(v => /(Premium|Enhanced|Amélie|Thomas|Audrey|Aurélie)/i.test(v.name)) || fr[0] || null;
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = u.onerror = () => resolve();
    keepAlive = u;
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (supported()) speechSynthesis.cancel();
}

export const ttsSupported = supported;
