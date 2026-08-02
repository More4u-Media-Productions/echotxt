// Voice-message bubble: waveform scrubbing, playback speed and a single shared
// "one clip at a time" rule across the whole conversation.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSignedUrl } from "@/lib/attachments";

const SPEEDS = [1, 1.5, 2] as const;

/** Only one voice message plays at a time, app-wide. */
let currentAudio: HTMLAudioElement | null = null;
function claimPlayback(audio: HTMLAudioElement) {
  if (currentAudio && currentAudio !== audio) currentAudio.pause();
  currentAudio = audio;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceMessage({
  path,
  peaks,
  durationSeconds,
  mine,
}: {
  path: string;
  peaks: number[];
  durationSeconds: number;
  mine: boolean;
}) {
  const { url, loading } = useSignedUrl(path);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        if (currentAudio === audio) currentAudio = null;
      }
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      claimPlayback(audio);
      audio.playbackRate = speed;
      void audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }, [speed]);

  const seekTo = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    const next = Math.min(Math.max(ratio, 0), 1) * duration;
    audio.currentTime = next;
    setPosition(next);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  const bars = peaks.length ? peaks : Array.from({ length: 40 }, () => 0.3);

  return (
    <div className={cn("flex w-[248px] max-w-full items-center gap-2.5 px-2 py-1.5 sm:w-[280px]")}>
      <button
        type="button"
        onClick={toggle}
        disabled={!url || failed}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50",
          mine
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-primary/15 text-primary",
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 translate-x-[1px]" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek voice message"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seekTo(progress + 0.05);
            if (e.key === "ArrowLeft") seekTo(progress - 0.05);
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - rect.left) / rect.width);
          }}
          className="flex h-8 cursor-pointer items-center gap-[2px]"
        >
          {bars.map((peak, i) => {
            const active = i / bars.length <= progress;
            return (
              <span
                key={i}
                style={{ height: `${Math.max(12, Math.min(100, peak * 130))}%` }}
                className={cn(
                  "w-full min-w-[2px] rounded-full transition-colors",
                  mine
                    ? active
                      ? "bg-primary-foreground"
                      : "bg-primary-foreground/35"
                    : active
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
                )}
              />
            );
          })}
        </div>
        <div
          className={cn(
            "flex items-center justify-between text-[11px]",
            mine ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          <span>{fmt(playing || position > 0 ? position : duration)}</span>
          {failed ? <span>Playback failed</span> : null}
          <button
            type="button"
            onClick={cycleSpeed}
            className={cn(
              "rounded-full px-1.5 py-0.5 font-semibold transition-colors",
              mine ? "bg-primary-foreground/15" : "bg-secondary",
            )}
            aria-label="Change playback speed"
          >
            {speed}×
          </button>
        </div>
      </div>

      {url ? (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const value = e.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setDuration(value);
          }}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={(e) => {
            setPlaying(false);
            setPosition(0);
            e.currentTarget.currentTime = 0;
          }}
          onError={() => setFailed(true)}
          className="hidden"
        />
      ) : null}
    </div>
  );
}
