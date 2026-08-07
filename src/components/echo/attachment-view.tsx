import { useEffect, useRef, useState } from "react";
import {
  Download,
  File as FileIcon,
  FileText,
  Loader2,
  Pause,
  Play,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AskFileButton } from "./ai-assistant";
import type { EchoMessage } from "@/lib/echo-data";
import {
  attachmentKind,
  downloadAttachment,
  formatBytes,
  useSignedUrl,
} from "@/lib/attachments";

function DownloadButton({
  path,
  name,
  className,
}: {
  path: string;
  name: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Download ${name}`}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        void downloadAttachment(path, name)
          .catch(() => toast.error("Couldn't download that file"))
          .finally(() => setBusy(false));
      }}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background/70 text-foreground hover:bg-background",
        className,
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </button>
  );
}

function AudioPlayer({ path, name }: { path: string; name: string }) {
  const { url, loading } = useSignedUrl(path);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const fmt = (s: number) =>
    Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";

  return (
    <div className="flex w-[240px] max-w-full items-center gap-3 sm:w-[280px]">
      <button
        type="button"
        aria-label={playing ? "Pause audio" : "Play audio"}
        disabled={!url}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (playing) el.pause();
          else void el.play();
        }}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background/70 text-foreground disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{name}</p>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          aria-label="Audio progress"
          onChange={(e) => {
            const el = ref.current;
            if (el) el.currentTime = Number(e.target.value);
            setCurrent(Number(e.target.value));
          }}
          className="mt-1 h-1 w-full accent-current"
        />
        <p className="mt-0.5 text-[11px] opacity-70">
          {fmt(current)} / {fmt(duration)}
        </p>
      </div>
      {url ? (
        <audio
          ref={ref}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          className="hidden"
        />
      ) : null}
      <DownloadButton path={path} name={name} />
    </div>
  );
}

function VideoPlayer({ path, name }: { path: string; name: string }) {
  const { url, loading } = useSignedUrl(path);
  return (
    <div className="w-[260px] max-w-full sm:w-[320px]">
      {loading || !url ? (
        <div className="grid h-40 place-items-center rounded-2xl bg-background/40">
          <Loader2 className="h-5 w-5 animate-spin opacity-70" />
        </div>
      ) : (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-h-[320px] w-full rounded-2xl bg-black"
        />
      )}
      <div className="mt-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] opacity-80">{name}</span>
        <DownloadButton path={path} name={name} />
      </div>
    </div>
  );
}

function DocumentCard({
  path,
  name,
  size,
  isPdf,
}: {
  path: string;
  name: string;
  size: number | null;
  isPdf: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const { url } = useSignedUrl(preview ? path : null);
  return (
    <>
      <div className="flex w-[240px] max-w-full items-center gap-3 sm:w-[280px]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background/60">
          {isPdf ? <FileText className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}
        </span>
        <button
          type="button"
          onClick={() => isPdf && setPreview(true)}
          className={cn("min-w-0 flex-1 text-left", isPdf && "hover:underline")}
        >
          <span className="block truncate text-xs font-semibold">{name}</span>
          <span className="block text-[11px] opacity-70">
            {isPdf ? "PDF" : (name.split(".").pop() ?? "File").toUpperCase()}
            {size ? ` · ${formatBytes(size)}` : ""}
          </span>
        </button>
        <DownloadButton path={path} name={name} />
      </div>
      {preview ? (
        <div
          role="dialog"
          aria-label={name}
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3"
          onClick={() => setPreview(false)}
        >
          <div className="flex items-center gap-2 pb-2 text-white">
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            <DownloadButton path={path} name={name} />
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setPreview(false)}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/15"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {url ? (
            <iframe
              title={name}
              src={url}
              onClick={(e) => e.stopPropagation()}
              className="min-h-0 flex-1 rounded-2xl bg-white"
            />
          ) : (
            <div className="grid flex-1 place-items-center text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function ImageThumb({
  path,
  name,
  onOpen,
}: {
  path: string;
  name: string;
  onOpen: () => void;
}) {
  const { url, loading } = useSignedUrl(path);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open image ${name}`}
      className="block overflow-hidden rounded-2xl"
    >
      {loading || !url ? (
        <span className="grid h-40 w-[220px] place-items-center bg-background/40">
          <Loader2 className="h-5 w-5 animate-spin opacity-70" />
        </span>
      ) : (
        <img
          src={url}
          alt={name}
          loading="lazy"
          className="max-h-[320px] w-[220px] object-cover sm:w-[260px]"
        />
      )}
    </button>
  );
}

/** Renders the attachment on a message bubble. */
export function AttachmentView({
  message,
  onOpenImage,
}: {
  message: EchoMessage;
  onOpenImage?: (messageId: string) => void;
}) {
  const path = message.attachmentUrl;
  if (!path) return null;
  const name = message.attachmentName ?? "attachment";
  const kind = attachmentKind(message.attachmentType, name);

  const mimeType = message.attachmentType ?? (kind === "pdf" ? "application/pdf" : "application/octet-stream");

  if (kind === "image")
    return (
      <div>
        <ImageThumb path={path} name={name} onOpen={() => onOpenImage?.(message.id)} />
        <AskFileButton path={path} name={name} mimeType={mimeType} />
      </div>
    );
  if (kind === "video") return <VideoPlayer path={path} name={name} />;
  if (kind === "audio") return <AudioPlayer path={path} name={name} />;
  return (
    <div>
      <DocumentCard path={path} name={name} size={message.attachmentSize} isPdf={kind === "pdf"} />
      {kind === "pdf" || /\.(pdf|txt|md|csv|json)$/i.test(name) ? (
        <AskFileButton
          path={path}
          name={name}
          mimeType={kind === "pdf" ? "application/pdf" : mimeType}
        />
      ) : null}
    </div>
  );
}

/** Fullscreen viewer for every image in the conversation. */
export function ImageLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: { id: string; path: string; name: string }[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const active = items[index];
  const { url } = useSignedUrl(active?.path ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndexChange((index + 1) % items.length);
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!active) return null;

  return (
    <div
      role="dialog"
      aria-label="Image viewer"
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
    >
      <div className="flex items-center gap-2 p-3 text-white">
        <span className="min-w-0 flex-1 truncate text-sm">{active.name}</span>
        <span className="text-xs opacity-70">
          {index + 1}/{items.length}
        </span>
        <DownloadButton path={active.path} name={active.name} />
        <button
          type="button"
          aria-label="Close viewer"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        {items.length > 1 ? (
          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index - 1 + items.length) % items.length);
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        {url ? (
          <img
            src={url}
            alt={active.name}
            onClick={(e) => e.stopPropagation()}
            className="mx-2 max-h-full max-w-full rounded-xl object-contain"
          />
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        )}
        {items.length > 1 ? (
          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index + 1) % items.length);
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
