import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Copy,
  Trash2,
  Check,
  Download,
  Sparkles,
  Settings,
  Upload,
  Volume2,
  VolumeX,
  BookmarkPlus,
  History,
  FileText,
  Wand2,
  ListChecks,
  Cpu,
  Radio,
} from 'lucide-react';
import './index.css';

const LANGUAGES = [
  { code: 'fr-FR', whisper: 'french', label: '🇫🇷 Français' },
  { code: 'en-US', whisper: 'english', label: '🇬🇧 English' },
  { code: 'es-ES', whisper: 'spanish', label: '🇪🇸 Español' },
  { code: 'de-DE', whisper: 'german', label: '🇩🇪 Deutsch' },
  { code: 'it-IT', whisper: 'italian', label: '🇮🇹 Italiano' },
  { code: 'pt-PT', whisper: 'portuguese', label: '🇵🇹 Português' },
];

const VOICE_PUNCTUATION_MAP = [
  [/\bpoint d'interrogation\b/gi, '?'],
  [/\bpoint d'exclamation\b/gi, '!'],
  [/\bpoint-virgule\b/gi, ';'],
  [/\bdeux points\b/gi, ':'],
  [/\bpoints de suspension\b/gi, '...'],
  [/\bnouveau paragraphe\b/gi, '\n\n'],
  [/\b(à la ligne|retour à la ligne)\b/gi, '\n'],
  [/\bvirgule\b/gi, ','],
  [/\bpoint final\b/gi, '.'],
];

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSrtTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function applyVoicePunctuation(text, enabled) {
  if (!enabled || !text) return text;
  let out = text;
  for (const [regex, replacement] of VOICE_PUNCTUATION_MAP) {
    out = out.replace(regex, replacement);
  }
  return out.replace(/\s+([,.;!?])/g, '$1');
}

function applyGlossary(text, glossaryRaw) {
  if (!text || !glossaryRaw?.trim()) return text;
  let out = text;
  const entries = glossaryRaw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  entries.forEach((entry) => {
    if (entry.includes('=')) {
      const [from, to] = entry.split('=').map((s) => s.trim());
      if (from && to) {
        const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), to);
      }
    } else {
      const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), entry);
    }
  });
  return out;
}

function smartCleanText(text, glossaryRaw = '') {
  if (!text) return '';
  let cleaned = text
    // Suppression des hésitations orales courantes
    .replace(/\b(euh+|hum+|heu+|bah|ben)\b[,\s]*/gi, '')
    // Suppression des bégaiements de mots identiques consécutifs
    .replace(/\b(\w+)\s+\1\b/gi, '$1')
    // Normalisation des espaces autour de la ponctuation
    .replace(/\s+([,.])/g, '$1 ')
    .replace(/\s*([;!?])\s*/g, ' $1 ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Majuscule en début de texte et après . ! ? ou retour à la ligne
  cleaned = cleaned.replace(/(^\s*[a-zà-ÿ]|[.!?]\s+[a-zà-ÿ]|\n\s*[a-zà-ÿ])/g, (match) =>
    match.toUpperCase()
  );

  // Ajout d'un point final si absent
  if (cleaned && !/[.!?…]$/.test(cleaned)) {
    cleaned += '.';
  }

  return applyGlossary(cleaned, glossaryRaw);
}

function computeLocalSummary(text) {
  if (!text || !text.trim()) return { keyPoints: [], actions: [] };

  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const stopWords = new Set([
    'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'est', 'en', 'dans', 'pour',
    'sur', 'avec', 'plus', 'pas', 'par', 'que', 'qui', 'ce', 'cette', 'ces', 'mais', 'ou',
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'have', 'has',
  ]);

  const freq = {};
  const words = text.toLowerCase().match(/[a-zà-ÿ0-9]{4,}/g) || [];
  words.forEach((w) => {
    if (!stopWords.has(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  });

  const scored = sentences.map((s, index) => {
    const sWords = s.toLowerCase().match(/[a-zà-ÿ0-9]{4,}/g) || [];
    const score = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0) / Math.max(1, sWords.length);
    return { sentence: s, score, index };
  });

  scored.sort((a, b) => b.score - a.score);
  const topSentences = scored
    .slice(0, Math.min(4, Math.max(1, Math.ceil(sentences.length * 0.35))))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  const actionRegex =
    /\b(il faut|penser à|à faire|todo|urgent|envoyer|appeler|préparer|vérifier|planifier|demain|avant le|corriger|mettre à jour)\b/i;
  const actions = sentences.filter((s) => actionRegex.test(s));

  return {
    keyPoints: topSentences.length > 0 ? topSentences : sentences.slice(0, 3),
    actions,
  };
}

function App() {
  const hasWebSpeech =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Paramètres persistés (100% locaux, aucune clé API)
  const [engine, setEngine] = useState(
    () => localStorage.getItem('murmure_local_engine') || (hasWebSpeech ? 'browser' : 'whisper')
  );
  const [whisperModel, setWhisperModel] = useState(
    () => localStorage.getItem('murmure_whisper_model') || 'Xenova/whisper-tiny'
  );
  const [langCode, setLangCode] = useState(
    () => localStorage.getItem('murmure_lang') || 'fr-FR'
  );
  const [whisperTask, setWhisperTask] = useState(
    () => localStorage.getItem('murmure_whisper_task') || 'transcribe'
  );
  const [voicePunctuation, setVoicePunctuation] = useState(
    () => localStorage.getItem('murmure_voice_punct') !== 'false'
  );
  const [glossary, setGlossary] = useState(
    () => localStorage.getItem('murmure_glossary') || ''
  );

  // État principal
  const [status, setStatus] = useState('ready'); // ready, loading_model, recording, transcribing, error
  const [statusMsg, setStatusMsg] = useState('Prêt (100% Local • Sans API)');
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [transcription, setTranscription] = useState(
    () => localStorage.getItem('murmure_transcription') || ''
  );
  const [interimText, setInterimText] = useState('');
  const [segments, setSegments] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('murmure_segments') || '[]');
    } catch {
      return [];
    }
  });
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('murmure_history_v2') || '[]');
    } catch {
      return [];
    }
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [volumeBars, setVolumeBars] = useState(() => Array(16).fill(4));
  const [audioUrl, setAudioUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Références
  const workerRef = useRef(null);
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const timerRef = useRef(null);
  const recordStartRef = useRef(0);
  const fileInputRef = useRef(null);

  // Sauvegarde automatique locale
  useEffect(() => {
    localStorage.setItem('murmure_transcription', transcription);
  }, [transcription]);

  useEffect(() => {
    localStorage.setItem('murmure_segments', JSON.stringify(segments));
  }, [segments]);

  useEffect(() => {
    localStorage.setItem('murmure_history_v2', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('murmure_local_engine', engine);
    localStorage.setItem('murmure_whisper_model', whisperModel);
    localStorage.setItem('murmure_lang', langCode);
    localStorage.setItem('murmure_whisper_task', whisperTask);
    localStorage.setItem('murmure_voice_punct', String(voicePunctuation));
    localStorage.setItem('murmure_glossary', glossary);
  }, [engine, whisperModel, langCode, whisperTask, voicePunctuation, glossary]);

  // Initialisation du Web Worker Whisper local quand sélectionné
  useEffect(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./worker.js', import.meta.url), {
        type: 'module',
      });

      workerRef.current.onmessage = (event) => {
        const { status: wStatus, message, result, chunks, data } = event.data;

        if (wStatus === 'loading') {
          setStatus('loading_model');
          setStatusMsg(message || 'Chargement du modèle IA local...');
        } else if (wStatus === 'progress') {
          if (data && typeof data.progress === 'number') {
            setDownloadProgress(Math.round(data.progress));
            setStatusMsg(`Téléchargement IA locale (cache navigateur) : ${Math.round(data.progress)}%`);
          }
        } else if (wStatus === 'ready') {
          setDownloadProgress(null);
          setStatus('ready');
          setStatusMsg(message || 'Whisper Local Prêt (100% Hors-ligne)');
        } else if (wStatus === 'transcribing') {
          setStatus('transcribing');
          setStatusMsg(message || 'Transcription WebAssembly en cours...');
        } else if (wStatus === 'complete') {
          setDownloadProgress(null);
          const processed = applyGlossary(
            applyVoicePunctuation((result || '').trim(), voicePunctuation),
            glossary
          );
          if (processed) {
            setTranscription((prev) => (prev ? `${prev.trim()} ${processed}` : processed));
          }
          if (Array.isArray(chunks) && chunks.length > 0) {
            setSegments((prev) => [
              ...prev,
              ...chunks.map((c) => ({
                start: c.timestamp?.[0] ?? 0,
                end: c.timestamp?.[1] ?? (c.timestamp?.[0] || 0) + 3,
                text: (c.text || '').trim(),
              })),
            ]);
          }
          setStatus('ready');
          setStatusMsg('Transcription locale terminée ✓');
        } else if (wStatus === 'error') {
          setDownloadProgress(null);
          setStatus('error');
          setStatusMsg(`Erreur locale : ${message}`);
        }
      };
    }

    if (engine === 'whisper') {
      workerRef.current.postMessage({ type: 'load', model: whisperModel });
    } else {
      setStatus('ready');
      setStatusMsg('Dictée Temps Réel Prête (100% Sans API)');
    }
  }, [engine, whisperModel, voicePunctuation, glossary]);

  // Nettoyage complet des pistes audio et du micro
  const cleanupAudioResources = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    setVolumeBars(Array(16).fill(4));
  }, []);

  useEffect(() => {
    return () => {
      cleanupAudioResources();
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [cleanupAudioResources]);

  // Décodage & rééchantillonnage 16 kHz corrigé pour Whisper WebAssembly
  const decodeAndTranscribeBlob = async (blob) => {
    setStatus('transcribing');
    setStatusMsg('Décodage audio 16 kHz local...');
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const targetSampleCount = Math.max(1, Math.ceil(audioBuffer.duration * 16000));
      const offlineCtx = new OfflineAudioContext(1, targetSampleCount, 16000);
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start();

      const renderedBuffer = await offlineCtx.startRendering();
      const float32Array = renderedBuffer.getChannelData(0);
      await audioCtx.close().catch(() => {});

      const selectedLang = LANGUAGES.find((l) => l.code === langCode)?.whisper || 'french';

      workerRef.current?.postMessage({
        type: 'transcribe',
        audio: float32Array,
        model: whisperModel,
        language: selectedLang,
        task: whisperTask,
      });
    } catch (err) {
      console.error('Erreur décodage audio local:', err);
      setStatus('error');
      setStatusMsg('Impossible de décoder ce format audio.');
    }
  };

  // Démarrage du visualiseur spectral Web Audio + MediaRecorder
  const startAudioCapture = async (onStopCallback) => {
    audioChunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    });

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (audioBlob.size > 0) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(audioBlob));
      }
      if (onStopCallback) onStopCallback(audioBlob);
      cleanupAudioResources();
    };

    mediaRecorder.start(500);

    // Analyseur de spectre à 16 bandes
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const updateSpectrum = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(freqData);
      const bars = Array.from({ length: 16 }, (_, idx) => {
        const val = freqData[idx] || 0;
        return Math.max(4, Math.min(42, Math.round((val / 255) * 42)));
      });
      setVolumeBars(bars);
      animFrameRef.current = requestAnimationFrame(updateSpectrum);
    };
    updateSpectrum();
  };

  // Démarrage de l'enregistrement
  const startRecording = async () => {
    try {
      setRecordingSeconds(0);
      recordStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 1000);

      if (engine === 'browser' && hasWebSpeech) {
        await startAudioCapture(null);

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = langCode;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          let finalTranscriptChunk = '';
          let currentInterim = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              finalTranscriptChunk += res[0].transcript + ' ';
            } else {
              currentInterim += res[0].transcript;
            }
          }

          if (finalTranscriptChunk.trim()) {
            const elapsedSec = Math.max(0, (Date.now() - recordStartRef.current) / 1000);
            const formatted = applyGlossary(
              applyVoicePunctuation(finalTranscriptChunk.trim(), voicePunctuation),
              glossary
            );
            setTranscription((prev) => (prev ? `${prev.trim()} ${formatted}` : formatted));
            setSegments((prev) => [
              ...prev,
              {
                start: Math.max(0, elapsedSec - 3),
                end: elapsedSec,
                text: formatted,
              },
            ]);
          }
          setInterimText(currentInterim);
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed') {
            setStatus('error');
            setStatusMsg('Accès au microphone refusé.');
          }
        };

        recognition.onend = () => {
          setInterimText('');
          if (isRecordingRef.current) {
            try {
              recognition.start();
            } catch {
              // Ignore si déjà actif
            }
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } else {
        // Mode Whisper WebAssembly Local
        await startAudioCapture((audioBlob) => {
          if (audioBlob && audioBlob.size > 0) {
            decodeAndTranscribeBlob(audioBlob);
          }
        });
      }

      isRecordingRef.current = true;
      setIsRecording(true);
      setStatus('recording');
      setStatusMsg('Écoute locale en cours...');
    } catch (err) {
      console.error('Erreur microphone:', err);
      cleanupAudioResources();
      setStatus('error');
      setStatusMsg("Impossible d'accéder au microphone.");
    }
  };

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setInterimText('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupAudioResources();
    }

    if (engine === 'browser') {
      setStatus('ready');
      setStatusMsg('Dictée terminée ✓ (100% Local)');
    }
  }, [cleanupAudioResources, engine]);

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [stopRecording]);

  // Raccourci clavier Ctrl + Espace
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        toggleRecording();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleRecording]);

  // Import d'un fichier audio local (.mp3, .wav, .m4a, .webm, .ogg)
  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (engine !== 'whisper') {
      setEngine('whisper');
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    await decodeAndTranscribeBlob(file);
    e.target.value = '';
  };

  // Statistiques du texte en direct
  const textStats = useMemo(() => {
    const trimmed = transcription.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = transcription.length;
    const sentences = trimmed
      ? trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length
      : 0;
    const readingTimeSec = Math.ceil((words / 180) * 60);
    return { words, chars, sentences, readingTimeSec };
  }, [transcription]);

  // Résumé & Actions extraits localement
  const summaryData = useMemo(() => computeLocalSummary(transcription), [transcription]);

  // Actions d'édition et d'export
  const handleSmartClean = () => {
    setTranscription((prev) => smartCleanText(prev, glossary));
    setStatusMsg('Ponctuation et nettoyage appliqués ✓');
  };

  const copyToClipboard = async () => {
    if (!transcription) return;
    await navigator.clipboard.writeText(transcription);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveToHistory = () => {
    if (!transcription.trim()) return;
    const firstWords = transcription.trim().split(/\s+/).slice(0, 6).join(' ');
    const entry = {
      id: `note-${Date.now()}`,
      title: `${firstWords}${transcription.length > 40 ? '...' : ''}`,
      date: new Date().toLocaleString('fr-FR'),
      lang: langCode,
      words: textStats.words,
      text: transcription,
      segments,
    };
    setHistory((prev) => [entry, ...prev.slice(0, 49)]);
    setStatusMsg('Session sauvegardée dans votre historique local ✓');
  };

  const clearTranscription = () => {
    if (!transcription) return;
    setTranscription('');
    setInterimText('');
    setSegments([]);
    localStorage.removeItem('murmure_transcription');
    localStorage.removeItem('murmure_segments');
    setStatusMsg('Éditeur vidé');
  };

  const toggleSpeechSynthesis = () => {
    if (!window.speechSynthesis || !transcription.trim()) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(transcription);
    utterance.lang = langCode;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const downloadFile = (content, filename, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportTxt = () => {
    downloadFile(transcription, `murmure_transcription_${Date.now()}.txt`);
  };

  const exportMarkdown = () => {
    const { keyPoints, actions } = summaryData;
    const md = [
      `# Compte-rendu Vocal — Murmure Web`,
      `- **Date :** ${new Date().toLocaleString('fr-FR')}`,
      `- **Langue :** ${langCode}`,
      `- **Statistiques :** ${textStats.words} mots · ${textStats.chars} caractères`,
      ``,
      `## 📝 Points Clés`,
      ...(keyPoints.length > 0 ? keyPoints.map((p) => `- ${p}`) : ['- Aucun point clé extrait.']),
      ``,
      ...(actions.length > 0
        ? [`## ✅ Actions Détectées`, ...actions.map((a) => `- [ ] ${a}`), ``]
        : []),
      `## 💬 Transcription Complète`,
      transcription,
      ``,
    ].join('\n');
    downloadFile(md, `murmure_note_${Date.now()}.md`, 'text/markdown;charset=utf-8');
  };

  const exportSrt = () => {
    const list =
      segments.length > 0
        ? segments
        : transcription
            .split(/(?<=[.!?])\s+/)
            .filter(Boolean)
            .map((t, idx) => ({ start: idx * 4, end: (idx + 1) * 4, text: t }));

    const srt = list
      .map(
        (seg, idx) =>
          `${idx + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}\n`
      )
      .join('\n');
    downloadFile(srt, `murmure_soustitres_${Date.now()}.srt`);
  };

  return (
    <div className="container">
      {/* En-tête */}
      <header className="header">
        <div className="brand-group">
          <h1 className="title">
            <Sparkles size={26} />
            Murmure Studio
          </h1>
          <span className="privacy-pill">🔒 100% Local & Sans API</span>
        </div>

        <div className="header-actions">
          <div className={`status-badge ${status}`}>
            {status === 'recording' ? `🔴 Écoute ${formatDuration(recordingSeconds)}` : statusMsg}
          </div>

          <button
            type="button"
            className={`icon-btn ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory((v) => !v)}
            title="Historique des sessions"
          >
            <History size={20} />
            {history.length > 0 && <span className="mini-count">{history.length}</span>}
          </button>

          <button
            type="button"
            className={`icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings((v) => !v)}
            title="Paramètres du moteur local"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Sélecteur rapide de Moteur & Langue */}
      <div className="quick-bar">
        <div className="engine-tabs">
          <button
            type="button"
            className={`engine-tab ${engine === 'browser' ? 'active' : ''}`}
            onClick={() => setEngine('browser')}
            disabled={!hasWebSpeech}
            title={
              hasWebSpeech
                ? 'Reconnaissance vocale native instantanée du navigateur (0 Mo)'
                : 'Non supporté sur ce navigateur, utilisez Whisper WebAssembly'
            }
          >
            <Radio size={16} />
            Dictée Temps Réel (Natif)
          </button>
          <button
            type="button"
            className={`engine-tab ${engine === 'whisper' ? 'active' : ''}`}
            onClick={() => setEngine('whisper')}
            title="Modèle IA OpenAI Whisper exécuté localement en WebAssembly dans votre navigateur"
          >
            <Cpu size={16} />
            Whisper IA Locale (WASM)
          </button>
        </div>

        <div className="quick-selects">
          <select
            value={langCode}
            onChange={(e) => setLangCode(e.target.value)}
            className="compact-select"
            aria-label="Langue parlée"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileImport}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="action-btn secondary"
            onClick={() => fileInputRef.current?.click()}
            title="Importer un fichier audio/vidéo (.mp3, .wav, .m4a, .webm) pour le transcrire localement"
          >
            <Upload size={16} /> Importer Audio
          </button>
        </div>
      </div>

      {/* Barre de progression du téléchargement WebAssembly (1ère utilisation) */}
      {downloadProgress !== null && (
        <div className="progress-card">
          <div className="progress-label">
            <span>Initialisation du modèle Whisper WebAssembly en cache local...</span>
            <strong>{downloadProgress}%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${downloadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Panneau de Configuration Avancée (100% Local) */}
      {showSettings && (
        <section className="settings-panel">
          <div className="settings-grid">
            <div>
              <label>Modèle Whisper WebAssembly (Hors-ligne)</label>
              <select value={whisperModel} onChange={(e) => setWhisperModel(e.target.value)}>
                <option value="Xenova/whisper-tiny">Whisper Tiny (~40 Mo — Ultra Rapide)</option>
                <option value="Xenova/whisper-base">Whisper Base (~75 Mo — Plus Précis)</option>
              </select>
            </div>

            <div>
              <label>Mode de sortie Whisper</label>
              <select value={whisperTask} onChange={(e) => setWhisperTask(e.target.value)}>
                <option value="transcribe">Transcrire dans la langue d&apos;origine</option>
                <option value="translate">Traduire directement vers l&apos;Anglais</option>
              </select>
            </div>

            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={voicePunctuation}
                  onChange={(e) => setVoicePunctuation(e.target.checked)}
                />
                Activer les commandes vocales de ponctuation (« virgule », « point », « à la ligne »)
              </label>
            </div>

            <div>
              <label>Glossaire & Corrections Automatiques (ex: antigravity=Antigravity, ia=IA)</label>
              <input
                type="text"
                value={glossary}
                onChange={(e) => setGlossary(e.target.value)}
                placeholder="Ex: xgboost=XGBoost, st raphael=Saint-Raphaël"
              />
            </div>
          </div>
        </section>
      )}

      {/* Panneau Historique Local */}
      {showHistory && (
        <section className="history-panel">
          <div className="panel-header">
            <h3>📚 Historique des Notes Vocales ({history.length})</h3>
            {history.length > 0 && (
              <button
                type="button"
                className="text-danger-btn"
                onClick={() => setHistory([])}
              >
                Tout effacer
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="empty-hint">Aucune session sauvegardée pour le moment.</p>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <div key={item.id} className="history-item">
                  <div
                    className="history-info"
                    onClick={() => {
                      setTranscription(item.text);
                      setSegments(item.segments || []);
                      setShowHistory(false);
                    }}
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {item.date} • {item.words} mots • {item.lang}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="icon-btn small"
                    onClick={() => setHistory((prev) => prev.filter((h) => h.id !== item.id))}
                    title="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Carte Principale d'Édition & Enregistrement */}
      <main className="main-card">
        {/* Barre d'outils d'intelligence locale */}
        <div className="editor-toolbar">
          <div className="stats-pills">
            <span><strong>{textStats.words}</strong> mots</span>
            <span><strong>{textStats.chars}</strong> caract.</span>
            <span><strong>{textStats.sentences}</strong> phrases</span>
            <span>~<strong>{textStats.readingTimeSec}s</strong> de lecture</span>
          </div>

          <div className="smart-tools">
            <button
              type="button"
              className="tool-chip"
              onClick={handleSmartClean}
              disabled={!transcription}
              title="Supprimer les hésitations ('euh', 'hum'), corriger la ponctuation et les majuscules"
            >
              <Wand2 size={15} /> Nettoyer & Ponctuer
            </button>
            <button
              type="button"
              className={`tool-chip ${showSummary ? 'active' : ''}`}
              onClick={() => setShowSummary((v) => !v)}
              disabled={!transcription}
              title="Extraire automatiquement les points clés et actions (algorithme local)"
            >
              <ListChecks size={15} /> Résumé & Actions
            </button>
            <button
              type="button"
              className={`tool-chip ${isSpeaking ? 'active' : ''}`}
              onClick={toggleSpeechSynthesis}
              disabled={!transcription}
              title="Écouter le texte via la synthèse vocale du navigateur"
            >
              {isSpeaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
              {isSpeaking ? 'Arrêter' : 'Lire'}
            </button>
          </div>
        </div>

        {/* Zone de texte éditable */}
        <div className="editor-wrapper">
          <textarea
            className="transcription-textarea"
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            placeholder="Appuyez sur le bouton microphone (ou Ctrl + Espace) pour dicter en direct, ou importez un fichier audio. Vous pouvez également éditer le texte directement ici..."
            rows={9}
          />
          {interimText && (
            <div className="interim-banner">
              <span className="pulse-dot" /> <em>{interimText}...</em>
            </div>
          )}
        </div>

        {/* Résumé & Actions extraits localement */}
        {showSummary && transcription.trim() && (
          <div className="summary-box">
            <div className="summary-col">
              <h4>📝 Points Clés Extraits</h4>
              <ul>
                {summaryData.keyPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
            <div className="summary-col">
              <h4>✅ Actions / To-Do Détectées</h4>
              {summaryData.actions.length === 0 ? (
                <p className="empty-hint">Aucune phrase d&apos;action (« il faut », « à faire », « urgent »...) détectée.</p>
              ) : (
                <ul>
                  {summaryData.actions.map((act, i) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Visualiseur Spectral 16 bandes pendant l'enregistrement */}
        {isRecording && (
          <div className="spectrum-visualizer" aria-label="Niveau sonore du microphone">
            {volumeBars.map((height, idx) => (
              <div
                key={idx}
                className="spectrum-bar"
                style={{
                  height: `${height}px`,
                  backgroundColor: height > 8 ? 'var(--accent-color)' : '#3a3f4b',
                }}
              />
            ))}
          </div>
        )}

        {/* Lecteur Audio de la dernière prise */}
        {audioUrl && !isRecording && (
          <div className="audio-replay-bar">
            <span>🎧 Dernier enregistrement audio :</span>
            <audio controls src={audioUrl} className="audio-player" />
          </div>
        )}

        {/* Contrôles Principaux */}
        <div className="controls">
          <div className="controls-left">
            <button
              type="button"
              className="action-btn"
              onClick={clearTranscription}
              disabled={!transcription}
              title="Effacer le texte"
            >
              <Trash2 size={17} /> Effacer
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={saveToHistory}
              disabled={!transcription}
              title="Sauvegarder dans l'historique local"
            >
              <BookmarkPlus size={17} /> Sauver
            </button>
          </div>

          <button
            type="button"
            className={`record-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            disabled={status === 'transcribing'}
            title={
              isRecording
                ? "Arrêter l'enregistrement (Ctrl + Espace)"
                : "Démarrer l'enregistrement (Ctrl + Espace)"
            }
          >
            {isRecording ? <MicOff size={28} /> : <Mic size={28} />}
          </button>

          <div className="controls-right">
            <button
              type="button"
              className="action-btn"
              onClick={copyToClipboard}
              disabled={!transcription}
              title="Copier dans le presse-papier"
            >
              {copied ? <Check size={17} color="#00ff88" /> : <Copy size={17} />}
              {copied ? 'Copié' : 'Copier'}
            </button>

            <button
              type="button"
              className="action-btn"
              onClick={exportTxt}
              disabled={!transcription}
              title="Télécharger en .TXT"
            >
              <Download size={17} /> .TXT
            </button>

            <button
              type="button"
              className="action-btn"
              onClick={exportMarkdown}
              disabled={!transcription}
              title="Télécharger un compte-rendu complet en Markdown (.MD)"
            >
              <FileText size={17} /> .MD
            </button>

            <button
              type="button"
              className="action-btn"
              onClick={exportSrt}
              disabled={!transcription}
              title="Télécharger les sous-titres horodatés (.SRT)"
            >
              <Download size={17} /> .SRT
            </button>
          </div>
        </div>
      </main>

      <footer className="footer">
        100% Privé & Sans Clé API • Moteur <strong>{engine === 'browser' ? 'Web Speech Natif' : `Whisper Local (${whisperModel.replace('Xenova/', '')})`}</strong> • Raccourci <code>Ctrl + Espace</code>
      </footer>
    </div>
  );
}

export default App;
