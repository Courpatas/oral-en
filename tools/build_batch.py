"""Convertit un lot rédigé au format compact (.txt) en JSON pour phrases.json.

Une phrase par ligne, champs séparés par « | » :
  id | niveau | anglais | français | mots-clés (;) | prononciation (mot=respelling;...) | non notés (;)
Les deux derniers champs sont facultatifs. Le thème vient de l'id (« 14-03 » → 14).
Les termes de thèse sont détectés automatiquement avec les motifs de thesis_terms.json.
Les lignes vides et celles qui commencent par # sont ignorées.

Usage : python3 tools/build_batch.py tools/batches/lot04.txt  → écrit tools/batches/lot04.json
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
TERMS = json.loads((HERE / 'thesis_terms.json').read_text(encoding='utf-8'))
UK = {'behaviour': 'behavior', 'programme': 'program', 'organisation': 'organization', 'artefact': 'artifact'}


def norm(text):
    t = text.lower().replace('’', "'")
    for a, b in UK.items():
        t = t.replace(a, b)
    t = re.sub(r"[-–/]", ' ', t)
    t = re.sub(r"[^a-z0-9' ]", ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def split_list(field):
    return [x.strip() for x in field.split(';') if x.strip()]


src = Path(sys.argv[1])
out = []
for n, line in enumerate(src.read_text(encoding='utf-8').splitlines(), 1):
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    parts = [p.strip() for p in line.split('|')]
    if len(parts) < 5:
        sys.exit(f'{src.name}:{n} : il manque des champs → {line[:60]}')
    pid, level, en, fr, keys = parts[:5]
    pron = dict(kv.split('=', 1) for kv in split_list(parts[5])) if len(parts) > 5 else {}
    unscored = split_list(parts[6]) if len(parts) > 6 else []
    t = norm(en)
    thesis = [label for _, label, pattern in TERMS if re.search(r'\b(' + pattern + r')', t)]
    item = {
        'id': pid, 'theme': int(pid.split('-')[0]), 'level': level, 'text_en': en, 'text_fr': fr,
        'key_terms': split_list(keys), 'thesis_terms': thesis,
        'pronunciation_notes': {k.strip().lower(): v.strip() for k, v in pron.items()},
    }
    if unscored:
        item['unscored'] = unscored
    out.append(item)

dest = src.with_suffix('.json')
dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{len(out)} phrases → {dest.name}')
