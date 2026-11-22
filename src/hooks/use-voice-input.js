import { useCallback, useEffect, useRef, useState } from 'react';
import { runAI } from '@/api/ai';

const MAX_SECONDS = 28; // keeps each clip inside the speech APIs' quick (synchronous) limit

// Convert whatever the browser recorded (webm/opus, mp4/aac...) into 16 kHz mono WAV,
// the one format every speech-to-text provider accepts.
async function toWavBase64(blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();

  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const pcm = (await offline.startRendering()).getChannelData(0);

  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const writeStr = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(new Blob([view], { type: 'audio/wav' }));
  });
}

/**
 * Record speech and turn it into text with the "transcribe" AI task.
 * status: 'idle' | 'recording' | 'transcribing'
 */
export function useVoiceInput({ lang, onText, onError }) {
  const [status, setStatus] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const callbacks = useRef({ onText, onError, lang });
  callbacks.current = { onText, onError, lang };

  const cleanupTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(() => {
    cleanupTimer();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      callbacks.current.onError?.(new Error('Voice input is not supported in this browser.'));
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      callbacks.current.onError?.(new Error('Please allow microphone access to use voice input.'));
      return;
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size < 1000) {
        setStatus('idle');
        return;
      }
      setStatus('transcribing');
      try {
        const audio = await toWavBase64(blob);
        const { text } = await runAI('transcribe', { audio, lang: callbacks.current.lang });
        if (text) callbacks.current.onText?.(text);
        else callbacks.current.onError?.(new Error("Didn't catch that. Please try again."));
      } catch (err) {
        callbacks.current.onError?.(err);
      } finally {
        setStatus('idle');
      }
    };

    recorder.start();
    setSeconds(0);
    setStatus('recording');
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
  }, [stop]);

  const toggle = useCallback(() => {
    if (status === 'recording') stop();
    else if (status === 'idle') start();
  }, [status, start, stop]);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => () => {
    cleanupTimer();
    const r = recorderRef.current;
    if (r?.state === 'recording') {
      r.onstop = () => r.stream.getTracks().forEach((t) => t.stop());
      r.stop();
    }
  }, []);

  return { status, seconds, maxSeconds: MAX_SECONDS, toggle, start, stop };
}
