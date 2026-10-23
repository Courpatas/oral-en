"""Ajoute un lot à phrases.json (remplace les ids déjà présents), trié par id.

Usage : python3 tools/merge_batch.py data/phrases.json tools/batches/lot01.json
"""
import json
import sys
from pathlib import Path

target, batch = Path(sys.argv[1]), Path(sys.argv[2])
phrases = {p['id']: p for p in json.loads(target.read_text(encoding='utf-8'))}
added = json.loads(batch.read_text(encoding='utf-8'))
for p in added:
    phrases[p['id']] = p
ordered = sorted(phrases.values(), key=lambda p: p['id'])
target.write_text('[\n' + ',\n'.join('  ' + json.dumps(p, ensure_ascii=False) for p in ordered) + '\n]\n',
                  encoding='utf-8')
print(f'{len(added)} phrases ajoutées, {len(ordered)} au total')
