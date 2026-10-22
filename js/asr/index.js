// Point d'entrée unique : le reste de l'app ne connaît que start() / stop().
import { createWebSpeech } from './webspeech.js';
import { createWhisper } from './whisper.js';

export const ENGINES = {
  webspeech: () => createWebSpeech(),
  'whisper-tiny': () => createWhisper('whisper-tiny'),
  'whisper-base': () => createWhisper('whisper-base'),
};

const cache = {};
export function getRecognizer(id) {
  if (!ENGINES[id]) id = 'webspeech';
  return (cache[id] ??= ENGINES[id]());
}
