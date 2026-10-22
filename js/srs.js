// Statuts, maîtrise et révisions espacées. Rien n'est planifié en arrière-plan :
// tout est recalculé à l'ouverture de l'app à partir des dates enregistrées.

export const DEFAULTS = {
  threshold: 85,        // score minimum pour qu'une répétition compte comme réussie
  successesNeeded: 3,   // nombre de répétitions réussies
  distinctDays: 2,      // sur au moins N jours différents
  intervals: [7, 30, 90], // révisions d'une phrase maîtrisée : J+7, puis J+30, puis J+90
};

export function today(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return today(new Date(y, m - 1, d + n));
}

export function status(rec) {
  if (!rec || !rec.attempts) return 'new';
  if (rec.flagged) return 'review';
  if (rec.mastered) return 'mastered';
  return 'learning';
}

export const STATUS_LABEL = { new: 'Nouvelle', learning: 'En cours', mastered: 'Maîtrisée', review: 'À revoir' };

export function isDue(rec, day = today()) {
  return !!rec && !!rec.due && rec.due <= day;
}

/** Enregistre un essai et renvoie le nouvel état de la phrase. */
export function recordAttempt(prev, score, settings, day = today()) {
  const s = { ...DEFAULTS, ...settings };
  const rec = { attempts: 0, successes: [], best: 0, stage: 0, ...prev };
  rec.successes = [...(rec.successes || [])];
  rec.attempts++;
  rec.last = score;
  rec.best = Math.max(rec.best || 0, score);
  rec.lastDate = day;
  const success = score >= s.threshold;

  if (rec.mastered) {
    if (success) {
      if (isDue(rec, day)) rec.stage = Math.min((rec.stage || 0) + 1, s.intervals.length - 1);
      rec.due = addDays(day, s.intervals[rec.stage]);
      rec.flagged = false;
    } else {
      // Oubli : la phrase redevient « à revoir » et revient dès demain.
      rec.mastered = false;
      rec.flagged = true;
      rec.lapses = (rec.lapses || 0) + 1;
      rec.successes = [];
      rec.stage = 0;
      rec.due = addDays(day, 1);
    }
    return rec;
  }

  if (success) {
    rec.successes.push(day);
    rec.successes = rec.successes.slice(-20);
    const days = new Set(rec.successes).size;
    // Après un oubli, 2 réussites sur 2 jours suffisent pour retrouver la maîtrise.
    const needed = rec.lapses ? Math.min(2, s.successesNeeded) : s.successesNeeded;
    const neededDays = rec.lapses ? Math.min(2, s.distinctDays) : s.distinctDays;
    if (rec.successes.length >= needed && days >= neededDays) {
      rec.mastered = true;
      rec.flagged = false;
      rec.stage = 0;
      rec.masteredOn = day;
      rec.due = addDays(day, s.intervals[0]);
    } else {
      rec.due = addDays(day, 1);
    }
  } else {
    rec.due = day; // ratée : reste due aujourd'hui (et donc aussi les jours suivants)
  }
  return rec;
}

/**
 * Construit la file d'exercices.
 * mode 'theme'   : révisions dues du thème, puis phrases nouvelles du thème dans l'ordre.
 * mode 'continue': toutes les révisions dues, puis les nouvelles du thème en cours.
 * mode 'session' : mélange ~2 révisions pour 1 nouvelle.
 */
export function buildQueue({ phrases, progress, mode, themeId, currentTheme, day = today() }) {
  const pool = mode === 'theme' ? phrases.filter(p => p.theme === themeId) : phrases;
  const rec = id => progress[id];
  const priority = p => {
    const r = rec(p.id);
    return (r.flagged ? 0 : 1) * 1e6 + (r.mastered ? 1 : 0) * 1e5 + (100 - (r.last || 0));
  };
  const due = pool.filter(p => isDue(rec(p.id), day)).sort((a, b) => priority(a) - priority(b));
  const learningNotDue = pool.filter(p => status(rec(p.id)) === 'learning' && !isDue(rec(p.id), day));

  let fresh = pool.filter(p => status(rec(p.id)) === 'new');
  if (mode !== 'theme') {
    // Nouvelles phrases : on termine le thème en cours avant de passer au suivant.
    const order = [...new Set(phrases.map(p => p.theme))];
    const start = Math.max(0, order.indexOf(currentTheme));
    const rotated = [...order.slice(start), ...order.slice(0, start)];
    fresh = rotated.flatMap(t => fresh.filter(p => p.theme === t));
  }

  if (mode === 'session') {
    const out = [];
    let i = 0, j = 0;
    while (i < due.length || j < fresh.length) {
      if (i < due.length) out.push(due[i++]);
      if (i < due.length) out.push(due[i++]);
      if (j < fresh.length) out.push(fresh[j++]);
    }
    return out;
  }
  return [...due, ...fresh, ...learningNotDue];
}

export function countByStatus(phrases, progress) {
  const c = { new: 0, learning: 0, mastered: 0, review: 0 };
  for (const p of phrases) c[status(progress[p.id])]++;
  return c;
}
