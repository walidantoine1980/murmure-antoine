import { pipeline, env } from '@xenova/transformers';

// Exécution 100% dans le navigateur via WebAssembly + Cache du navigateur (aucune clé API)
env.allowLocalModels = false;
env.useBrowserCache = true;

class WhisperLocalPipeline {
  static instance = null;
  static currentModel = null;

  static async getInstance(modelName = 'Xenova/whisper-tiny', progressCallback = null) {
    if (this.instance === null || this.currentModel !== modelName) {
      this.currentModel = modelName;
      this.instance = await pipeline('automatic-speech-recognition', modelName, {
        progress_callback: progressCallback,
        quantized: true,
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  const { type, audio, model = 'Xenova/whisper-tiny', language = 'french', task = 'transcribe' } = event.data;

  if (type === 'load') {
    try {
      self.postMessage({
        status: 'loading',
        message: `Chargement du modèle local ${model.replace('Xenova/', '')} (WebAssembly)...`,
      });

      await WhisperLocalPipeline.getInstance(model, (progressData) => {
        self.postMessage({ status: 'progress', data: progressData });
      });

      self.postMessage({
        status: 'ready',
        message: `Modèle local ${model.replace('Xenova/', '')} prêt (100% Hors-ligne)`,
      });
    } catch (err) {
      self.postMessage({
        status: 'error',
        message: err?.message || 'Erreur lors du chargement du modèle WebAssembly.',
      });
    }
  } else if (type === 'transcribe') {
    try {
      self.postMessage({
        status: 'transcribing',
        message: 'Transcription IA locale en cours (WebAssembly)...',
      });

      const transcriber = await WhisperLocalPipeline.getInstance(model, (progressData) => {
        self.postMessage({ status: 'progress', data: progressData });
      });

      const output = await transcriber(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: language === 'auto' ? null : language,
        task,
        return_timestamps: true,
      });

      self.postMessage({
        status: 'complete',
        result: output?.text || '',
        chunks: output?.chunks || [],
      });
    } catch (err) {
      self.postMessage({
        status: 'error',
        message: err?.message || 'Erreur lors de la transcription locale.',
      });
    }
  }
});
