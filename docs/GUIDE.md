# Oral EN — guide

## 1. Mettre l'app en ligne (gratuit)

Le micro ne fonctionne sur iPhone que sur une adresse **https**. Il faut donc héberger l'app. Les deux options ci-dessous sont gratuites et ne demandent pas de serveur.

> **Déjà en place :** l'app est hébergée sur GitHub Pages, dans le dépôt public `Courpatas/oral-en`, à l'adresse https://courpatas.github.io/oral-en/. Les étapes ci-dessous servent si tu dois tout refaire, ou héberger une copie ailleurs.

### Option A — GitHub Pages (recommandée)

1. Crée un compte sur github.com.
2. Crée un nouveau dépôt **public**, par exemple `oral-en`.
3. Dans le dépôt : *Add file › Upload files*. Glisse **le contenu** de ce dépôt (pas le dossier lui-même), de sorte que `index.html` soit à la racine. Valide avec *Commit changes*.
4. Ouvre *Settings › Pages*. Dans *Source*, choisis *Deploy from a branch*, puis la branche `main` et le dossier `/ (root)`. Enregistre.
5. Après environ une minute, l'app est disponible à l'adresse `https://<ton-pseudo>.github.io/oral-en/`.

Pour **mettre à jour** l'app, par exemple après un nouveau lot de phrases :

1. Envoie les fichiers modifiés sur le dépôt.
2. Change le numéro `VERSION` en haut de `sw.js` (et dans `js/app.js`).
3. À la prochaine ouverture, l'app affiche « Nouvelle version disponible › Recharger ».

### Option B — Netlify Drop

1. Crée un compte gratuit sur app.netlify.com.
2. Va sur app.netlify.com/drop et glisse le dossier du dépôt.
3. Netlify donne une adresse du type `https://xxx.netlify.app`.
4. Pour mettre à jour : *Deploys › Drag and drop* avec le dossier modifié, sans oublier de changer `VERSION` dans `sw.js`.

> Ta progression n'est **jamais** envoyée à l'hébergeur. Elle reste dans l'appareil (IndexedDB). L'hébergeur ne fournit que les fichiers de l'app.

## 2. Installer sur iPhone

1. Ouvre l'adresse dans **Safari** (pas Chrome).
2. Touche le bouton Partager, puis **« Sur l'écran d'accueil »**, puis *Ajouter*.
3. Lance l'app depuis l'icône **Oral EN**.
4. À la première utilisation du micro, accepte l'accès.

**Réglages iPhone conseillés :**
- **Dictée activée** : *Réglages › Général › Clavier › Activer la dictée*. C'est indispensable pour le moteur Web Speech.
- **Une voix américaine de qualité** : *Réglages › Accessibilité › Contenu énoncé › Voix › Anglais › Anglais (États-Unis)*. Télécharge une voix « Améliorée » ou « Premium », par exemple Ava, Evan ou Zoe, puis choisis-la dans *Réglages* de l'app.

## 3. Installer sur Mac

- **Safari (macOS 14 ou plus)** : ouvre l'adresse, puis *Fichier › Ajouter au Dock*.
- **Chrome** : ouvre l'adresse, puis l'icône d'installation dans la barre d'adresse (ou *⋮ › Caster, enregistrer et partager › Installer la page en tant qu'application*).
- Avec Chrome, le moteur Web Speech passe par les serveurs de Google et demande une connexion. La voix « Google US English » est aussi en ligne. Les voix macOS (Samantha, Ava…) fonctionnent hors ligne.

## 4. Premier test : l'écran Diagnostic

*Réglages › Diagnostic micro et voix*, puis **« Tester le moteur choisi »**, et dis la phrase proposée. Ensuite **« Copier le rapport »** et colle-le dans notre conversation.

À faire **deux fois** : dans Safari, puis depuis l'icône de l'écran d'accueil. C'est ce test qui dira s'il faut passer au plan B.

## 5. Reconnaissance vocale : les deux moteurs

| | Web Speech (par défaut) | Whisper tiny.en | Whisper base.en |
|---|---|---|---|
| Où tourne le calcul | Apple (Safari) ou Google (Chrome) | dans ton appareil | dans ton appareil |
| Connexion | requise | seulement pour le 1er téléchargement | idem |
| Téléchargement | aucun | ~40 Mo | ~80 Mo |
| Délai après la phrase | quasi instantané | ~1 à 3 s sur iPhone récent | ~3 à 8 s |
| Précision (accent français) | bonne | correcte | meilleure |
| Risques | arrêts prématurés, instable en mode écran d'accueil selon la version d'iOS | iOS peut fermer l'app si la mémoire manque ; chauffe sur de longues séances | idem, en plus marqué |

Pour changer de moteur : *Réglages › Reconnaissance vocale › Moteur*. Avec Whisper, le bouton « Télécharger le modèle maintenant » permet de le préparer en Wi-Fi.

**Limites honnêtes (valables pour les deux moteurs) :**
- Il n'y a **pas de score par phonème**. Le moteur renvoie seulement le texte qu'il a compris. Le score mesure si une machine te comprend, pas la qualité fine de ta prononciation.
- Un moteur « devine » à partir du contexte. Un mot mal prononcé dans une phrase prévisible peut quand même être reconnu (faux 100 %). À l'inverse, un mot rare bien prononcé peut être raté. Prends le score comme un indicateur.
- Les noms d'auteurs difficiles (thème 18) seront marqués « non notés » : ils sont lus mais ne comptent pas dans le score.

## 6. Comment fonctionne la maîtrise

- Une répétition est **réussie** si le score atteint le seuil (85 % par défaut).
- Une phrase est **maîtrisée** après 3 répétitions réussies sur au moins 2 jours différents. Les trois valeurs sont réglables.
- Une phrase maîtrisée revient en **révision** à J+7, puis J+30, puis J+90.
- Une révision ratée la fait repasser en **« à revoir »**. Elle revient dès le lendemain, et 2 réussites sur 2 jours suffisent pour qu'elle redevienne maîtrisée.
- Une phrase ratée pendant une séance revient environ 5 phrases plus loin.
- Rien ne se déclenche tout seul : pas de notification, pas de rappel. Les révisions dues apparaissent seulement quand tu ouvres l'app.

## 7. Sauvegarder et transférer ta progression

**Exporter** (*Réglages › Sauvegarde › Exporter*) :
- Sur iPhone, la feuille de partage s'ouvre : choisis *Enregistrer dans Fichiers*, par exemple dans iCloud Drive.
- Sur Mac, un fichier `oral-en-progression-AAAA-MM-JJ.json` est téléchargé.

**Importer** (*Réglages › Sauvegarde › Importer*) : choisis le fichier `.json`. L'app demande confirmation, puis **remplace** la progression actuelle.

**Passer de l'iPhone au Mac** : exporte sur l'iPhone dans iCloud Drive, puis importe ce fichier sur le Mac. Les deux appareils ne se synchronisent pas tout seuls : c'est le prix du « sans compte, sans serveur ».

**Conseil :** exporte une fois par semaine. iOS conserve bien les données des apps installées sur l'écran d'accueil, mais une sauvegarde reste la seule garantie (changement de téléphone, effacement des données Safari…).
