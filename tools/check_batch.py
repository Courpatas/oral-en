"""Vérifie phrases.json après chaque lot et produit le tableau de couverture.

Usage : python3 tools/check_batch.py data/phrases.json [--coverage docs/couverture.md]

Contrôles : format, ids uniques, doublons (exacts et quasi-doublons), longueur 8-18 mots,
niveau B1/B2, chiffres, cohérence des thesis_terms déclarés avec le texte,
couverture des 157 termes (objectif : 2 phrases chacun) et des pièges de prononciation.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).parent
TERMS = json.loads((HERE / 'thesis_terms.json').read_text(encoding='utf-8'))
TRAPS = ['bureaucracy', 'implementation', 'ethnography', 'anthropology', 'methodology',
         'hypothesis', 'sedentary', 'stakeholder', 'paradigm']
UK = {'behaviour': 'behavior', 'programme': 'program', 'organisation': 'organization', 'artefact': 'artifact'}
REQUIRED = ['id', 'theme', 'level', 'text_en', 'text_fr', 'key_terms', 'thesis_terms']


def norm(text):
    t = text.lower().replace('’', "'")
    for a, b in UK.items():
        t = t.replace(a, b)
    t = re.sub(r"[-–/]", ' ', t)
    t = re.sub(r"[^a-z0-9' ]", ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def words(text):
    return [w for w in re.split(r'\s+', text.strip()) if w]


def main():
    path = Path(sys.argv[1])
    phrases = json.loads(path.read_text(encoding='utf-8'))
    problems, warnings = [], []

    ids = Counter(p.get('id') for p in phrases)
    for i, n in ids.items():
        if n > 1:
            problems.append(f'id en double : {i}')

    for p in phrases:
        pid = p.get('id', '?')
        for k in REQUIRED:
            if k not in p:
                problems.append(f'{pid} : champ manquant « {k} »')
        n = len(words(p['text_en']))
        if not 8 <= n <= 18:
            problems.append(f'{pid} : {n} mots (attendu 8-18)')
        if p.get('level') not in ('B1', 'B2'):
            problems.append(f'{pid} : niveau « {p.get("level")} »')
        if re.search(r'\d', p['text_en']):
            warnings.append(f'{pid} : contient des chiffres')
        if re.search(r"'d\b", p['text_en']):
            warnings.append(f"{pid} : contraction 'd ambiguë")
        if not p['text_en'].rstrip().endswith(('.', '?', '!')):
            warnings.append(f'{pid} : ponctuation finale manquante')
        if not re.match(r'^\d{2}-\d{2}$', pid):
            warnings.append(f'{pid} : format d\'id inattendu')
        # Les termes déclarés doivent être reconnus dans le texte.
        labels = {t[1]: t for t in TERMS}
        for tt in p.get('thesis_terms', []):
            if tt not in labels:
                problems.append(f'{pid} : terme de thèse inconnu « {tt} »')
            elif not re.search(labels[tt][2], norm(p['text_en'])):
                warnings.append(f'{pid} : « {tt} » déclaré mais absent du texte')

    # Doublons exacts et quasi-doublons.
    seen = {}
    normed = [(p['id'], norm(p['text_en'])) for p in phrases]
    for pid, t in normed:
        if t in seen:
            problems.append(f'doublon exact : {seen[t]} et {pid}')
        seen[t] = pid
    for i in range(len(normed)):
        for j in range(i + 1, len(normed)):
            r = SequenceMatcher(None, normed[i][1], normed[j][1]).ratio()
            if r > 0.8:
                warnings.append(f'phrases très proches ({r:.0%}) : {normed[i][0]} / {normed[j][0]}')

    # Couverture des termes de thèse (détectée dans le texte, pas seulement déclarée).
    coverage = defaultdict(list)
    for p in phrases:
        t = norm(p['text_en'])
        for tid, label, pattern in TERMS:
            if re.search(r'\b(' + pattern + r')', t):
                coverage[tid].append(p['id'])
    traps = {w: [p['id'] for p in phrases if w in norm(p['text_en'])] for w in TRAPS}

    by_theme = Counter(p['theme'] for p in phrases)
    levels = Counter(p['level'] for p in phrases)
    lengths = [len(words(p['text_en'])) for p in phrases]

    print(f'{len(phrases)} phrases · thèmes {dict(sorted(by_theme.items()))} · niveaux {dict(levels)}')
    print(f'longueur : min {min(lengths)}, moyenne {sum(lengths) / len(lengths):.1f}, max {max(lengths)}')
    print(f'termes de thèse couverts : {sum(1 for t in TERMS if coverage[t[0]])}/157 au moins 1 fois, '
          f'{sum(1 for t in TERMS if len(coverage[t[0]]) >= 2)}/157 au moins 2 fois')
    print('pièges de prononciation : ' + ', '.join(f'{w} {len(v)}' for w, v in traps.items()))
    print(f'\n{len(problems)} problème(s)')
    for x in problems:
        print('  ✗', x)
    print(f'{len(warnings)} avertissement(s)')
    for x in warnings:
        print('  ⚠', x)

    if '--coverage' in sys.argv:
        out = Path(sys.argv[sys.argv.index('--coverage') + 1])
        lines = ['# Couverture des 157 termes de thèse', '',
                 f'{len(phrases)} phrases analysées. Objectif : chaque terme dans au moins 2 phrases.', '',
                 '| # | Terme | Nb | Phrases |', '|---|---|---|---|']
        for tid, label, _ in TERMS:
            ids_ = coverage[tid]
            mark = '✅' if len(ids_) >= 2 else ('◐' if ids_ else '—')
            lines.append(f'| {tid} | {label} | {mark} {len(ids_)} | {", ".join(ids_)} |')
        lines += ['', '## Pièges de prononciation', '', '| Mot | Phrases |', '|---|---|']
        lines += [f'| {w} | {", ".join(v) or "—"} |' for w, v in traps.items()]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        print(f'\nTableau de couverture écrit dans {out}')

    sys.exit(1 if problems else 0)


main()
