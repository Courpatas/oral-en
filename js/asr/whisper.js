// Moteur B (plan B) : Whisper dans le navigateur via transformers.js (WebAssembly).
// Téléchargé une seule fois, puis mis en cache : fonctionne ensuite hors ligne.

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';
const MODELS = {
  'whisper-tiny': { repo: 'Xenova/whisper-tiny.en', size: '~40 Mo' },
  'whisper-base': { repo: 'Xenova/whisper-base.en', size: '~80 Mo' },
};

const pipes = {};

async function loadPipe(key, onProgress) {
  if (pipes[key]) return pipes[key];
  pipes[key] = (async () => {
    const { pipeline, env } = await import(/* webpackIgnore: true */ LIB);
    env.allowLocalModels = false;
    const files = {};
    return pipeline('automatic-speech-recognition', MODELS[key].repo, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: p => {
        if (!onProgress || p.status !== 'progress' || !p.total) return;
        files[p.file] = [p.loaded, p.total];
        const vals = Object.values(files);
        const loaded = vals.reduce((s, v) => s + v[0], 0), total = vals.reduce((s, v) => s + v[1], 0);
        onProgress(Math.round((loaded / total) * 100));
      },
    });
  })();
  try { return await pipes[key]; } catch (e) { delete pipes[key]; throw e; }
}

// Enregistre jusqu'au silence (ou jusqu'à stop()), puis renvoie l'audio mono 16 kHz.
function record({ onLevel, stopSignal }) {
  return new Promise(async (resolve, reject) => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch { return reject(new Error('Micro refusé ou indisponible.')); }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    let heard = false, silentSince = null, done = false;
    const started = Date.now();
    const finish = () => { if (done) return; done = true; clearInterval(timer); recorder.state !== 'inactive' && recorder.stop(); };
    stopSignal.stop = finish;
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
      onLevel && onLevel(rms);
      const now = Date.now();
      if (rms > 0.02) { heard = true; silentSince = null; }
      else if (heard) { silentSince ??= now; if (now - silentSince > 1300) finish(); }
      if ((!heard && now - started > 7000) || now - started > 15000) finish();
    }, 100);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      try {
        if (!heard) throw new Error("Je n'ai rien entendu. Rapproche-toi du micro et réessaie.");
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
        const node = off.createBufferSource();
        node.buffer = decoded; node.connect(off.destination); node.start();
        const rendered = await off.startRendering();
        resolve(rendered.getChannelData(0));
      } catch (e) { reject(e); }
      finally { ctx.close(); }
    };
    recorder.start();
  });
}

export function createWhisper(key = 'whisper-tiny') {
  const stopSignal = {};
  return {
    id: key,
    label: `Whisper ${key === 'whisper-tiny' ? 'tiny' : 'base'}.en (hors ligne, ${MODELS[key].size})`,
    supported: () => !!(window.MediaRecorder && navigator.mediaDevices && window.WebAssembly),
    preload: onProgress => loadPipe(key, onProgress),
    async start({ onState, onProgress } = {}) {
      const pipePromise = loadPipe(key, onProgress); // charge en parallèle de l'écoute
      const audio = await record({ stopSignal });
      onState && onState('processing');
      const pipe = await pipePromise;
      const out = await pipe(audio);
      const text = (out.text || '').replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
      if (!text) throw new Error("Je n'ai rien compris. Réessaie un peu plus fort.");
      return { transcript: text, alternatives: [text] };
    },
    stop() { stopSignal.stop && stopSignal.stop(); },
  };
}
