# Oral EN

PWA d'entraînement à l'oral en anglais. L'app lit une phrase, tu la répètes, et elle compare mot à mot.

En ligne : https://courpatas.github.io/oral-en/

## Contenu du dépôt

L'app est servie depuis la racine du dépôt par GitHub Pages. Elle est écrite en HTML, CSS et JS pur, sans dépendance ni serveur.

- `index.html`, `css/`, `manifest.json`, `sw.js` (hors ligne), `icons/`
- `js/compare.js` : normalisation, alignement mot à mot et score.
- `js/srs.js` : statuts, maîtrise et révisions espacées.
- `js/asr/` : reconnaissance vocale remplaçable (Web Speech, Whisper).
- `js/tts.js` : synthèse vocale en-US.
- `js/store.js` : IndexedDB, export et import.
- `data/phrases.json` : les 1000 phrases (20 thèmes × 50).
- `data/themes.json` : les 20 thèmes.

Outils et documentation (ils ne font pas partie de l'app ; le service worker ne les met pas en cache) :

- `tools/check_batch.py` : vérifie les phrases et produit le tableau de couverture.
- `tools/build_batch.py` : convertit un lot rédigé au format compact en JSON.
- `tools/merge_batch.py` : ajoute un lot à `data/phrases.json`.
- `tools/thesis_terms.json` : les 157 termes de thèse et leurs motifs de détection.
- `tools/tedx_terms.json` : le vocabulaire TEDx.
- `tools/batches/` : les lots sources (`.txt` compacts et `.json` générés).
- `tools/make_icons.py` : génère les icônes.
- `docs/GUIDE.md` : hébergement, installation iPhone et Mac, moteurs, sauvegarde.
- `docs/couverture.md` : couverture des 157 termes de thèse.

`.nojekyll` désactive le traitement Jekyll de GitHub Pages : les fichiers sont servis tels quels.

## Commandes

À lancer depuis la racine du dépôt.

Tester en local (le micro fonctionne sur `localhost`) :

```bash
python3 -m http.server 8765
```

Vérifier les phrases et mettre à jour le tableau de couverture :

```bash
python3 tools/check_batch.py data/phrases.json --coverage docs/couverture.md
```

Ajouter ou réécrire un lot (format compact décrit en tête de `tools/build_batch.py`) :

```bash
python3 tools/build_batch.py tools/batches/lot20.txt
```

```bash
python3 tools/merge_batch.py data/phrases.json tools/batches/lot20.json
```

Après une modification, change `VERSION` en haut de `sw.js` (et dans `js/app.js`) pour que les appareils récupèrent la nouvelle version.
