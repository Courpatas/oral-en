// Comparaison mot à mot entre la phrase attendue et la transcription du moteur.
// Normalisation : casse, ponctuation, contractions, orthographe UK→US, chiffres, homophones.

const APOS = /[’‘`´]/g;

// Contractions ambiguës : 's = is | has, 'd = would | had.
const CONTRACTIONS = [
  [/\bcan't\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/\bwon't\b/g, 'will not'],
  [/\bshan't\b/g, 'shall not'],
  [/\bain't\b/g, 'is not'],
  [/\b(\w+)n't\b/g, '$1 not'],
  [/\bi'm\b/g, 'i am'],
  [/\blet's\b/g, 'let us'],
  [/\b(\w+)'re\b/g, '$1 are'],
  [/\b(\w+)'ve\b/g, '$1 have'],
  [/\b(\w+)'ll\b/g, '$1 will'],
  [/\b(\w+)'d\b/g, '$1 §would'],
  [/\b(it|that|what|there|here|he|she|who|where|how|this|everything|nothing|someone|everyone)'s\b/g, '$1 §is'],
];
const AMBIGUOUS = { '§would': ['would', 'had'], '§is': ['is', 'has'] };

const UK_US = {
  behaviour: 'behavior', behaviours: 'behaviors', programme: 'program', programmes: 'programs',
  centre: 'center', centres: 'centers', colour: 'color', colours: 'colors', favourite: 'favorite',
  travelled: 'traveled', travelling: 'traveling', traveller: 'traveler', kilometre: 'kilometer',
  kilometres: 'kilometers', metre: 'meter', metres: 'meters', practise: 'practice', practised: 'practiced',
  licence: 'license', neighbour: 'neighbor', neighbours: 'neighbors', theatre: 'theater', grey: 'gray',
  defence: 'defense', labour: 'labor', modelling: 'modeling', artefact: 'artifact', artefacts: 'artifacts',
  analyse: 'analyze', analysed: 'analyzed', analysing: 'analyzing', enrol: 'enroll', fulfil: 'fulfill',
  cheque: 'check', tyre: 'tire', tyres: 'tires', mum: 'mom', aluminium: 'aluminum', jewellery: 'jewelry',
  ageing: 'aging', judgement: 'judgment', catalogue: 'catalog', counsellor: 'counselor', honour: 'honor',
  rumour: 'rumor', harbour: 'harbor', flavour: 'flavor', humour: 'humor', vigour: 'vigor', endeavour: 'endeavor',
};
const ISE = /\b(organ|real|recogn|minim|maxim|optim|priorit|emphas|summar|categor|special|standard|mobil|util|familiar|apolog|critic|random|personal|global|general|normal|visual|symbol|characteri|stabil|central|decentral|internation|institution|operation|conceptual|contextual|subsid|legal|final|civil|modern|harmon|memor|author|organis)is(e|es|ed|ing|ation|ations)\b/g;

const HOMOPHONE_GROUPS = [
  ['to', 'too', 'two'], ['there', 'their'], ['for', 'four', 'fore'], ['right', 'write', 'rite'],
  ['know', 'no'], ['knew', 'new'], ['hear', 'here'], ['by', 'buy', 'bye'], ['whole', 'hole'],
  ['weather', 'whether'], ['would', 'wood'], ['one', 'won'], ['sea', 'see'], ['meet', 'meat'],
  ['week', 'weak'], ['our', 'hour'], ['peace', 'piece'], ['eight', 'ate'], ['through', 'threw'],
  ['wear', 'where'], ['which', 'witch'], ['flour', 'flower'], ['pair', 'pear'], ['role', 'roll'],
  ['sale', 'sail'], ['site', 'sight', 'cite'], ['fair', 'fare'], ['aloud', 'allowed'],
  ['course', 'coarse'], ['principal', 'principle'], ['ok', 'okay'], ['wait', 'weight'],
  ['break', 'brake'], ['steal', 'steel'], ['plane', 'plain'], ['tail', 'tale'], ['made', 'maid'],
  ['mail', 'male'], ['waste', 'waist'], ['rain', 'reign', 'rein'], ['road', 'rode'], ['sun', 'son'],
  ['some', 'sum'], ['blue', 'blew'], ['red', 'read'], ['dear', 'deer'], ['heal', 'heel'],
  ['board', 'bored'], ['band', 'banned'], ['passed', 'past'], ['guessed', 'guest'], ['missed', 'mist'],
  ['allowed', 'aloud'], ['higher', 'hire'], ['knows', 'nose'], ['its', 'it\'s'], ['wellbeing', 'well-being'],
  ['email', 'e-mail'], ['online', 'on-line'], ['percent', 'per cent'],
];
const HOMO = new Map();
for (const g of HOMOPHONE_GROUPS) for (const w of g) HOMO.set(w.replace(/[-']/g, ''), g[0].replace(/[-']/g, ''));

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD = { first: 1, second: 2, third: 3 };
function numToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
  if (n < 1e6) return numToWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
  return String(n);
}
const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 5: 'fifth', 8: 'eighth', 9: 'ninth', 12: 'twelfth' };
function ordinal(n) {
  if (ORDINALS[n]) return ORDINALS[n];
  if (n < 20) return ONES[n] + 'th';
  if (n % 10 === 0 && n < 100) return TENS[n / 10].replace(/y$/, 'ieth');
  if (n < 100) return TENS[Math.floor(n / 10)] + ' ' + ordinal(n % 10);
  return numToWords(n) + 'th';
}

function normalizeString(s) {
  s = s.toLowerCase().replace(APOS, "'");
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  s = s.replace(/(\d),(\d{3})/g, '$1$2');
  s = s.replace(/(\d+)\s*%/g, '$1 percent');
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, (_, d) => ordinal(+d));
  s = s.replace(/\b\d+\b/g, d => numToWords(+d));
  s = s.replace(/[-–—/]/g, ' ');
  s = s.replace(/[^a-z0-9§'\s]/g, ' ');
  return s;
}

function toTokens(s, displayIndex = -1) {
  const out = [];
  for (let raw of normalizeString(s).split(/\s+/)) {
    raw = raw.replace(/'/g, '');
    if (!raw) continue;
    if (AMBIGUOUS[raw]) { out.push({ w: AMBIGUOUS[raw][0], alts: AMBIGUOUS[raw], d: displayIndex }); continue; }
    let w = UK_US[raw] || raw.replace(ISE, (m, a, b) => a + 'iz' + b);
    w = HOMO.get(w) || w;
    out.push({ w, d: displayIndex });
  }
  return out;
}

function same(a, b) {
  if (a.w === b.w) return true;
  if (a.alts && a.alts.includes(b.w)) return true;
  if (b.alts && b.alts.includes(a.w)) return true;
  return false;
}

// Gère « wellbeing » vs « well being », « workout » vs « work out », etc.
function reconcileCompounds(exp, hyp) {
  const expSet = new Set(exp.map(t => t.w));
  const pairs = new Map();
  for (let i = 0; i + 1 < exp.length; i++) pairs.set(exp[i].w + exp[i + 1].w, [exp[i].w, exp[i + 1].w]);
  const out = [];
  for (let i = 0; i < hyp.length; i++) {
    const t = hyp[i];
    if (!expSet.has(t.w) && pairs.has(t.w)) { for (const w of pairs.get(t.w)) out.push({ w }); continue; }
    const n = hyp[i + 1];
    if (n && !expSet.has(t.w) || n && !expSet.has(n.w)) {
      const joined = t.w + n.w;
      if (expSet.has(joined)) { out.push({ w: joined }); i++; continue; }
    }
    out.push(t);
  }
  return out;
}

function align(exp, hyp) {
  const n = exp.length, m = hyp.length;
  const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) D[i][0] = i;
  for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      D[i][j] = Math.min(
        D[i - 1][j - 1] + (same(exp[i - 1], hyp[j - 1]) ? 0 : 1),
        D[i - 1][j] + 1,
        D[i][j - 1] + 1);
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (same(exp[i - 1], hyp[j - 1]) ? 0 : 1)) {
      ops.push({ type: same(exp[i - 1], hyp[j - 1]) ? 'ok' : 'sub', e: exp[i - 1], h: hyp[j - 1] }); i--; j--;
    } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
      ops.push({ type: 'del', e: exp[i - 1] }); i--;
    } else {
      ops.push({ type: 'ins', h: hyp[j - 1] }); j--;
    }
  }
  return ops.reverse();
}

const stripPunct = w => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');

/**
 * @param {string} expectedText phrase attendue
 * @param {string} transcript ce que le moteur a compris
 * @param {string[]} unscored mots non notés (noms propres difficiles)
 */
export function compare(expectedText, transcript, unscored = []) {
  const displayWords = expectedText.split(/\s+/).filter(Boolean);
  const skip = new Set(unscored.flatMap(u => toTokens(u).map(t => t.w)));
  const exp = displayWords.flatMap((w, i) => toTokens(w, i)).map(t => ({ ...t, skip: skip.has(t.w) }));
  const hyp = reconcileCompounds(exp, toTokens(transcript || ''));
  const ops = align(exp, hyp);

  const wordState = displayWords.map(() => 'ok');
  const heardFor = displayWords.map(() => []);
  const errors = [];
  // Un nom non noté peut être entendu en plusieurs mots (« Lipsky » → « lip ski ») :
  // les mots en trop qui le touchent ne comptent pas non plus.
  const nearSkip = i => [ops[i - 1], ops[i + 1]].some(o => o && o.e && o.e.skip);
  let S = 0, Dl = 0, I = 0, prevOp = null;
  for (const [i, op] of ops.entries()) {
    const prevType = prevOp;
    prevOp = op.type;
    if (op.type === 'ok') continue;
    if (op.type === 'ins' && nearSkip(i)) continue;
    if (op.type === 'ins') {
      I++;
      const prev = errors[errors.length - 1];
      if (prevType === 'ins' && prev) prev.heard += ' ' + op.h.w; // mots en trop consécutifs
      else errors.push({ type: 'ins', heard: op.h.w });
      continue;
    }
    if (op.e.skip) continue;
    const d = op.e.d;
    if (op.type === 'sub') {
      S++; wordState[d] = 'wrong'; heardFor[d].push(op.h.w);
      errors.push({ type: 'sub', expected: stripPunct(displayWords[d]), heard: op.h.w, d });
    } else {
      Dl++; if (wordState[d] !== 'wrong') wordState[d] = 'miss';
      errors.push({ type: 'del', expected: stripPunct(displayWords[d]), d });
    }
  }
  // Regroupe les erreurs sur un même mot affiché (ex. « I'm » → « i am »).
  const merged = [];
  for (const e of errors) {
    const last = merged[merged.length - 1];
    if (last && e.d !== undefined && last.d === e.d) {
      if (e.heard) last.heard = last.heard ? last.heard + ' ' + e.heard : e.heard;
      if (last.type === 'del' && e.type === 'sub') last.type = 'sub';
      continue;
    }
    merged.push({ ...e });
  }
  const N = exp.filter(t => !t.skip).length || 1;
  const raw = (N - S - Dl - 0.5 * I) / N;
  const score = Math.max(0, Math.min(100, Math.round(raw * 100)));
  return {
    score,
    words: displayWords.map((text, i) => ({ text, state: wordState[i], heard: heardFor[i].join(' ') })),
    errors: merged,
    transcript: transcript || '',
  };
}

/** Choisit, parmi les alternatives du moteur, celle qui colle le mieux. */
export function compareBest(expectedText, alternatives, unscored) {
  let best = null;
  for (const alt of alternatives.filter(Boolean)) {
    const r = compare(expectedText, alt, unscored);
    if (!best || r.score > best.score) best = r;
  }
  return best || compare(expectedText, '', unscored);
}

export const _internals = { toTokens, normalizeString, numToWords };
