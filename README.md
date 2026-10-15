# 🎙️ Murmure Studio v2.0 — Transcription & Dictée Vocale 100% Locale (Sans API)

Application web de dictée vocale, transcription audio et prise de notes intelligente fonctionnant **100% dans le navigateur sans aucune clé API externe** (ni Gemini, ni OpenAI, ni Groq).

---

## ✨ Architecture Double Moteur 100% Locale

1. **⚡ Moteur 1 — Dictée Temps Réel Native (`Web Speech API`)** :
   - Démarrage instantané (**0 Mo à télécharger**).
   - Transcription en continu mot à mot avec prévisualisation en direct pendant que vous parlez.
   - **Commandes vocales de ponctuation** : dites *« virgule »*, *« point »*, *« point d'interrogation »*, *« point d'exclamation »*, *« deux points »*, *« à la ligne »* ou *« nouveau paragraphe »*.

2. **🧠 Moteur 2 — Whisper IA Locale (`WebAssembly` via `@xenova/transformers`)** :
   - Exécute les modèles **Whisper Tiny (~40 Mo)** ou **Whisper Base (~75 Mo)** directement dans un Web Worker ([`src/worker.js`](file:///G:/Mon%20Drive/Antoine-Drive/Antigravity/Murmure_Web_Github_Package/src/worker.js)) avec mise en cache navigateur (`Cache API`).
   - Permet de transcrire le microphone **ou d'importer des fichiers audio/vidéo locaux** (`.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`).
   - Supporte la transcription multilingue (🇫🇷, 🇬🇧, 🇪🇸, 🇩🇪, 🇮🇹, 🇵🇹) ainsi que la **traduction locale directe vers l'Anglais** (`task: 'translate'`).

---

## 🛠️ Outils Studio & Post-Traitement Local

- **🪄 Nettoyer & Ponctuer** : supprime automatiquement les hésitations orales (*« euh »*, *« hum »*, *« ben »*), les mots doublons consécutifs, corrige la typographie française et applique les majuscules.
- **📖 Glossaire Métier Personnalisé** : règles de remplacement automatique (ex: `xgboost=XGBoost`).
- **📝 Résumé & Extraction d'Actions (Algorithme TF local)** : extrait les points clés et détecte automatiquement les phrases d'action (*« il faut »*, *« à faire »*, *« penser à »*, *« urgent »*...).
- **🔊 Synthèse Vocale (`SpeechSynthesis`)** : relit le texte transcrit à haute voix.
- **🎧 Réécoute Audio Intégrée** : lecteur audio permettant de réécouter la dernière prise micro ou le fichier importé.
- **📚 Historique des Sessions** : sauvegarde et restauration locale de vos notes vocales.
- **📥 Exports Multi-Formats** : **`.TXT`**, **`.MD` (Compte-rendu Markdown structuré)**, **`.SRT` (Sous-titres horodatés)** et **Copie Presse-Papier**.
- **⌨️ Raccourci Clavier** : `Ctrl + Espace` pour démarrer/arrêter l'enregistrement.

---

## 🚀 Installation & Démarrage

```bash
npm install
npm run dev
```

### Build de Production / Docker (Dokploy)
```bash
npm run build
```
Un [`Dockerfile`](file:///G:/Mon%20Drive/Antoine-Drive/Antigravity/Murmure_Web_Github_Package/Dockerfile) multi-stage (`node:20-alpine` -> `nginx:alpine`) est inclus pour un déploiement direct sur **Dokploy**, **Coolify** ou **Render**.
