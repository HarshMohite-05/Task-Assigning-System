'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';

const MAX_SECONDS = 5 * 60;

interface VoiceRecorderProps {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  // Chrome/Android record webm; iOS Safari only supports mp4
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceRecorder({ value, onChange }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  // Release the microphone if the modal closes mid-recording
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  };

  useEffect(() => {
    if (isRecording && elapsed >= MAX_SECONDS) stopRecording();
  }, [isRecording, elapsed]);

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        onChange(blob.size > 0 ? blob : null);
      };

      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      setIsRecording(true);

      timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    } catch {
      setError('Microphone access was denied. Allow it in your browser settings to record.');
    }
  };

  if (value && previewUrl && !isRecording) {
    return (
      <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-2.5 py-1.5">
        <Mic className="w-4 h-4 text-violet-600 shrink-0" />
        <audio controls src={previewUrl} className="h-8 w-full min-w-0" />
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Discard voice note"
          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {isRecording ? (
        <button
          type="button"
          onClick={stopRecording}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>Recording {formatClock(elapsed)}</span>
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>Stop</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-xl border border-dashed border-violet-300 text-violet-700 bg-violet-50/50 hover:bg-violet-50 transition"
        >
          <Mic className="w-4 h-4" />
          <span>Record Voice Note</span>
        </button>
      )}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
