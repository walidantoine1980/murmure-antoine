import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Copy, Trash2, Check, Download, Sparkles, Settings } from 'lucide-react';
import './index.css';

function App() {
  const [status, setStatus] = useState('ready'); // ready, recording, transcribing, error
  const [loadingMsg, setLoadingMsg] = useState('');
  const [transcription, setTranscription] = useState(localStorage.getItem('murmure_transcription') || '');

  // Auto-sauvegarde de la transcription
  useEffect(() => {
    localStorage.setItem('murmure_transcription', transcription);
  }, [transcription]);
  const [isRecording, setIsRecording] = useState(false);
  const [copied, setCopied] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  
  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [engine, setEngine] = useState(localStorage.getItem('murmure_engine') || 'gemini');
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [groqApiKey, setGroqApiKey] = useState(localStorage.getItem('groq_api_key') || '');
  const [modelName, setModelName] = useState(localStorage.getItem('gemini_model') || 'gemini-2.5-flash');
  const [outputMode, setOutputMode] = useState(localStorage.getItem('gemini_output_mode') || 'original');
  const [context, setContext] = useState(localStorage.getItem('murmure_context') || '');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (engine === 'gemini' && !apiKey) {
      setShowSettings(true);
      setStatus('missing_key');
      setLoadingMsg('Veuillez configurer votre clé API Gemini');
    } else if (engine === 'groq' && !groqApiKey) {
      setShowSettings(true);
      setStatus('missing_key');
      setLoadingMsg('Veuillez configurer votre clé API Groq');
    } else {
      setStatus('ready');
    }
  }, [apiKey, groqApiKey, engine]);

  const saveSettings = () => {
    localStorage.setItem('murmure_engine', engine);
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('groq_api_key', groqApiKey);
    localStorage.setItem('gemini_model', modelName);
    localStorage.setItem('gemini_output_mode', outputMode);
    localStorage.setItem('murmure_context', context);
    setShowSettings(false);
    if ((engine === 'gemini' && apiKey) || (engine === 'groq' && groqApiKey)) setStatus('ready');
  };

  const handleDataAvailable = (event) => {
    if (event.data.size > 0) {
      audioChunksRef.current.push(event.data);
    }
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processAudio = async () => {
    if (audioChunksRef.current.length === 0) return;
    
    setStatus('transcribing');
    
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      if (engine === 'gemini') {
        setLoadingMsg('Transcription Gemini en cours...');
        const base64Audio = await blobToBase64(audioBlob);
        
        let promptText = "Agis comme un transcripteur professionnel. 1. Détecte automatiquement la langue parlée dans l'audio. 2. Retranscris fidèlement l'audio dans cette langue détectée, avec la ponctuation correcte. 3. Formate ta réponse exactement comme ceci sans aucun autre texte conversationnel : '[Langue : NomDeLaLangue] La transcription commence ici...'";
        
        if (outputMode === 'fr') {
          promptText = "Agis comme un traducteur et transcripteur professionnel. 1. Écoute l'audio et détecte la langue parlée. 2. Traduis fidèlement tout le contenu de cet audio vers le Français (indépendamment de la langue d'origine). 3. Formate ta réponse exactement comme ceci sans aucun texte conversationnel : '[Traduit en Français] La traduction commence ici...'";
        } else if (outputMode === 'en') {
          promptText = "Act as a professional translator. 1. Listen to the audio and detect the spoken language. 2. Faithfully translate the entire content into English (regardless of the original language). 3. Format your response exactly like this without any conversational text: '[Translated to English] The translation starts here...'";
        }

        if (context.trim()) {
          promptText += `\n\nCONTEXTE ET VOCABULAIRE : Le locuteur utilise probablement les termes suivants ou aborde ce sujet : "${context}". Assure-toi de bien orthographier ce jargon technique dans la transcription.`;
        }

        const payload = {
          contents: [{
            parts: [
              { text: promptText },
              { inlineData: { mimeType: 'audio/webm', data: base64Audio } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            topP: 0.95
          }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        const resultText = data.candidates[0].content.parts[0].text;
        setTranscription(prev => (prev + ' ' + resultText).trim());
        
      } else if (engine === 'groq') {
        setLoadingMsg('Transcription Groq (Whisper) en cours...');
        
        let endpoint = 'transcriptions';
        if (outputMode === 'en') {
           endpoint = 'translations'; // Native translate to english
        }
        
        const formData = new FormData();
        const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
        formData.append('file', file);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');
        if (context.trim()) formData.append('prompt', context);
        
        const response = await fetch(`https://api.groq.com/openai/v1/audio/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`
            },
            body: formData
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        let resultText = data.text;
        
        // Traduction FR via Llama 3 si demandée
        if (outputMode === 'fr') {
            setLoadingMsg('Traduction FR (Groq Llama-3) en cours...');
            let promptText = "Traduis fidèlement le texte suivant en Français. Ne réponds QUE par la traduction, sans aucun autre texte introductif. Si le texte est déjà en français, corrige simplement les fautes. Texte : ";
            if (context.trim()) {
                promptText += `\nContexte métier : ${context}\n`;
            }
            
            const chatRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'user', content: promptText + resultText }
                    ],
                    temperature: 0.1
                })
            });
            const chatData = await chatRes.json();
            if (chatData.error) throw new Error(chatData.error.message);
            resultText = chatData.choices[0].message.content;
            resultText = `[Traduit en Français] ${resultText}`;
        }
        
        setTranscription(prev => (prev + ' ' + resultText).trim());
      }
      
      setStatus('ready');
      
    } catch (err) {
      console.error('API Error:', err);
      setStatus('error');
      setLoadingMsg(`Erreur API: ${err.message}`);
    } finally {
      audioChunksRef.current = [];
    }
  };

  const handleStop = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    analyserRef.current = null;
    setVolumeLevel(0);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = processAudio;
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const startRecording = async () => {
    if ((engine === 'gemini' && !apiKey) || (engine === 'groq' && !groqApiKey)) {
      setShowSettings(true);
      return;
    }

    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true
        } 
      });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.addEventListener('dataavailable', handleDataAvailable);
      mediaRecorder.start(1000); // chunk every 1 sec
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setVolumeLevel(sum / dataArray.length);
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      alert("L'accès au microphone est nécessaire.");
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      handleStop();
    } else {
      startRecording();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcription);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearTranscription = () => {
    if(window.confirm("Effacer la transcription actuelle ?")) {
      setTranscription('');
      localStorage.removeItem('murmure_transcription');
    }
  };

  const downloadText = () => {
    const element = document.createElement("a");
    const file = new Blob([transcription], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "murmure_gemini_transcription.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getStatusBadge = () => {
    if (status === 'missing_key') {
      return <div className="status-badge loading">Configuration requise</div>;
    }
    if (status === 'ready') {
      return <div className="status-badge ready">{engine === 'gemini' ? 'Gemini Prêt' : 'Groq Prêt'}</div>;
    }
    if (status === 'recording') {
      return <div className="status-badge" style={{color: '#ff3366', borderColor: '#ff3366'}}>Enregistrement en cours...</div>;
    }
    if (status === 'transcribing') {
      return <div className="status-badge loading">{loadingMsg}</div>;
    }
    if (status === 'error') {
      return <div className="status-badge" style={{color: 'red', borderColor: 'red', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={loadingMsg}>{loadingMsg}</div>;
    }
    return null;
  };

  const isModelReady = status === 'ready' || status === 'recording' || status === 'transcribing';

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">
          <Sparkles size={28} />
          Murmure {engine === 'gemini' ? 'Gemini' : 'Groq'}
        </h1>
        <div className="header-actions">
          {getStatusBadge()}
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)} title="Configuration API">
            <Settings size={24} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <div>
            <label>Moteur d'Intelligence Artificielle</label>
            <select value={engine} onChange={e => setEngine(e.target.value)} style={{fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.1)'}}>
              <option value="gemini">Google Gemini (Expertise & Précision)</option>
              <option value="groq">Groq LPU Whisper (Vitesse & Gratuité)</option>
            </select>
          </div>
          
          {engine === 'gemini' ? (
            <>
              <div>
                <label>Clé API Google Gemini</label>
                <input 
                  type="password" 
                  value={apiKey} 
                  onChange={e => setApiKey(e.target.value)} 
                  placeholder="AIzaSy..." 
                />
              </div>
              <div>
                <label>Modèle IA Cible</label>
                <select value={modelName} onChange={e => setModelName(e.target.value)}>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fulgurant - Recommandé)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Ultra Rapide)</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Précis mais Lent)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Précis)</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label>Clé API Groq Cloud</label>
                <input 
                  type="password" 
                  value={groqApiKey} 
                  onChange={e => setGroqApiKey(e.target.value)} 
                  placeholder="gsk_..." 
                />
                <small style={{color: '#aaa', marginTop: '5px', display: 'block'}}>Modèle utilisé : whisper-large-v3-turbo</small>
              </div>
            </>
          )}

          <div>
            <label>Mode de Sortie (Traduction)</label>
            <select value={outputMode} onChange={e => setOutputMode(e.target.value)}>
              <option value="original">Transcription Originale (Langue Détectée)</option>
              <option value="fr">Traduire vers le Français</option>
              <option value="en">Traduire vers l'Anglais</option>
            </select>
          </div>
          <div>
            <label>Contexte / Jargon (Optionnel)</label>
            <input 
              type="text" 
              value={context} 
              onChange={e => setContext(e.target.value)} 
              placeholder="Ex: Trading, XGBoost, Finance, Options..." 
            />
          </div>
          <button className="action-btn" onClick={saveSettings} style={{width: 'fit-content', backgroundColor: 'var(--accent-color)', color: 'black', fontWeight: 'bold'}}>
            Sauvegarder
          </button>
        </div>
      )}

      <div className="main-card">
        <div className={`transcription-box ${!transcription ? 'empty' : ''}`}>
          {transcription || `Appuyez sur le micro et commencez à parler. L'IA ${engine === 'gemini' ? 'Gemini' : 'Groq (Whisper)'} retranscrira fidèlement vos paroles...`}
        </div>

        {isRecording && (
          <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', height: '40px', marginTop: '-10px'}}>
            {[...Array(7)].map((_, i) => (
              <div key={i} style={{
                width: '6px', 
                backgroundColor: volumeLevel > 10 ? 'var(--accent-color)' : '#555', 
                borderRadius: '3px',
                height: `${Math.max(4, (volumeLevel / 255) * 40 * (0.5 + Math.random() * 0.5))}px`,
                transition: 'height 0.05s ease, background-color 0.2s ease'
              }} />
            ))}
          </div>
        )}

        <div className="controls">
          <button 
            className="action-btn" 
            onClick={clearTranscription}
            disabled={!transcription}
            title="Effacer"
          >
            <Trash2 size={18} /> Effacer
          </button>
          
          <button 
            className={`record-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            disabled={(!apiKey && engine === 'gemini') || (!groqApiKey && engine === 'groq') || (!isModelReady && !isRecording)}
            title={isRecording ? "Arrêter l'enregistrement" : "Commencer l'enregistrement"}
          >
            {isRecording ? <MicOff size={28} /> : <Mic size={28} />}
          </button>

          <button 
            className="action-btn" 
            onClick={copyToClipboard}
            disabled={!transcription}
            title="Copier"
          >
            {copied ? <Check size={18} color="#00ff88" /> : <Copy size={18} />} Copier
          </button>
          
          <button 
            className="action-btn" 
            onClick={downloadText}
            disabled={!transcription}
            title="Télécharger"
          >
            <Download size={18} /> .TXT
          </button>
        </div>
      </div>
      
      <div className="footer">
        Transcription propulsée par <strong>{engine === 'gemini' ? 'Google Gemini API' : 'Groq LPU (Whisper)'}</strong>
      </div>
    </div>
  );
}

export default App;
