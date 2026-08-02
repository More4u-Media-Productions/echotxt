// Hold-to-record (or tap-to-record) voice composer for the conversation view.

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAX_VOICE_SECONDS, isVoiceSupported, useVoiceRecorder } from "@/lib/voice";
import type { VoiceClip } from "@/lib/voice";

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceComposer({
  onSend,
  disabled,
}: {
  onSend: (clip: VoiceClip) => void;
  disabled?: boolean;
}) {
  const recorder = useVoiceRecorder();
  const [slideCancel, setSlideCancel] = useState(false);
  const holdStart = useRef(0);
  const pointerStart = useRef(0);
  const lockedRef = useRef(false);
  const previewAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (recorder.error) toast.error(recorder.error);
  }, [recorder.error]);

  if (!isVoiceSupported()) return null;

  const beginHold = (clientX: number) => {
    if (disabled) return;
    holdStart.current = Date.now();
    pointerStart.current = clientX;
    lockedRef.current = false;
    setSlideCancel(false);
    void recorder.start();
  };

  const moveHold = (clientX: number) => {
    if (recorder.state !== "recording") return;
    setSlideCancel(pointerStart.current - clientX > 90);
  };

  const endHold = () => {
    if (recorder.state !== "recording") return;
    // Quick tap = latch into hands-free recording instead of stopping instantly.
    if (Date.now() - holdStart.current < 400 && !lockedRef.current) {
      lockedRef.current = true;
      return;
    }
    if (slideCancel) recorder.cancel();
    else recorder.stop();
    setSlideCancel(false);
  };

  if (recorder.state === "preview" && recorder.clip) {
    const clip = recorder.clip;
    return (
      <div className="flex w-full items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
        <button
          type="button"
          onClick={recorder.discard}
          aria-label="Delete recording"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-[18px] w-[18px]" />
        </button>
        <audio
          ref={previewAudio}
          src={clip.url}
          controls
          className="h-9 min-w-0 flex-1"
          aria-label="Preview recording"
        />
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
          {clock(clip.seconds)}
        </span>
        <button
          type="button"
          onClick={() => {
            onSend(clip);
            recorder.discard();
          }}
          aria-label="Send voice message"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </div>
    );
  }

  if (recorder.state === "recording") {
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
          <span className="absolute inset-0 animate-ping rounded-full bg-destructive/20" />
          <Mic className="relative h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tabular-nums">{clock(recorder.seconds)}</span>
        <div className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
          {Array.from({ length: 28 }).map((_, i) => (
            <span
              key={i}
              className="w-full rounded-full bg-primary/50"
              style={{
                height: `${Math.max(10, Math.min(100, recorder.level * 140 * (0.5 + ((i * 37) % 10) / 10)))}%`,
              }}
            />
          ))}
        </div>
        <span
          className={cn(
            "hidden shrink-0 text-[11px] sm:block",
            slideCancel ? "font-semibold text-destructive" : "text-muted-foreground",
          )}
        >
          {slideCancel ? "Release to cancel" : "Slide left to cancel"}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          / {clock(MAX_VOICE_SECONDS)}
        </span>
        <button
          type="button"
          onClick={recorder.cancel}
          aria-label="Cancel recording"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onPointerUp={endHold}
          onClick={() => recorder.stop()}
          aria-label="Stop recording"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Record a voice message"
      onPointerDown={(e) => beginHold(e.clientX)}
      onPointerMove={(e) => moveHold(e.clientX)}
      onPointerUp={endHold}
      onPointerCancel={() => recorder.cancel()}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      <Mic className="h-[18px] w-[18px]" />
    </button>
  );
}
