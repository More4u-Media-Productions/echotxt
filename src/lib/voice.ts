// Voice-message recording for the Echo composer. Uses MediaRecorder with an
// Opus/WebM (or MP4 on Safari) container, tracks live duration and captures a
// small waveform so the bubble can render peaks without decoding the file.

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_VOICE_SECONDS = 300; // 5 minutes
export const MIN_VOICE_SECONDS = 1;
export const VOICE_PEAKS = 40;

export type RecorderState = "idle" | "recording" | "preview";

export interface VoiceClip {
  blob: Blob;
  file: File;
  seconds: number;
  peaks: number[];
  url: string;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function isVoiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peaksRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    recorderRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(async () => {
    if (!isVoiceSupported()) {
      setError("Voice recording isn't supported in this browser.");
      return false;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      cancelledRef.current = false;
      chunksRef.current = [];
      peaksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const elapsed = Math.max(
          0,
          Math.round((Date.now() - startedAtRef.current) / 100) / 10,
        );
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        const collected = peaksRef.current;
        teardown();
        if (cancelledRef.current || blob.size === 0) {
          setState("idle");
          setSeconds(0);
          return;
        }
        const step = Math.max(1, Math.ceil(collected.length / VOICE_PEAKS));
        const peaks: number[] = [];
        for (let i = 0; i < collected.length; i += step) {
          const slice = collected.slice(i, i + step);
          peaks.push(Math.max(...slice, 0.02));
        }
        while (peaks.length < VOICE_PEAKS) peaks.push(0.02);
        const extension = extensionFor(mimeType || "audio/webm");
        const file = new File([blob], `voice-${Date.now()}.${extension}`, {
          type: blob.type || "audio/webm",
        });
        setClip({
          blob,
          file,
          seconds: Math.max(elapsed, 0.1),
          peaks: peaks.slice(0, VOICE_PEAKS),
          url: URL.createObjectURL(blob),
        });
        setState("preview");
      };

      // Live amplitude sampling for the recording waveform.
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (const value of buffer) peak = Math.max(peak, Math.abs(value - 128) / 128);
        peaksRef.current.push(peak);
        setLevel(peak);
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);

      startedAtRef.current = Date.now();
      setSeconds(0);
      recorder.start(200);
      setState("recording");
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_VOICE_SECONDS) recorderRef.current?.stop();
      }, 200);
      return true;
    } catch (err) {
      teardown();
      setState("idle");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings to send voice messages."
          : "Couldn't start recording.",
      );
      return false;
    }
  }, [teardown]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      teardown();
      setState("idle");
    }
    setSeconds(0);
  }, [teardown]);

  const discard = useCallback(() => {
    setClip((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setSeconds(0);
    setState("idle");
  }, []);

  return {
    state,
    seconds,
    level,
    clip,
    error,
    start,
    stop,
    cancel,
    discard,
    tooShort: state === "preview" && (clip?.seconds ?? 0) < MIN_VOICE_SECONDS,
  };
}
