// Echo AI assistant surfaces: conversation intelligence, writing tools and
// attachment Q&A. Styled with Echo's existing design language.
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X, Wand2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  aiErrorMessage,
  useAiFileAnswer,
  useAiRewrite,
  useAiSummary,
  type RewriteAction,
  type SummaryMode,
} from "@/lib/ai";

/** Lightweight renderer for the assistant's markdown-ish output. */
function AiText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line, i) => {
          const bullet = /^\s*([-*•]|\d+\.)\s+/.test(line);
          const clean = line.replace(/^\s*([-*•]|\d+\.)\s+/, "").replace(/\*\*/g, "");
          const heading = /^#{1,6}\s/.test(clean);
          return (
            <p
              key={i}
              className={cn(
                bullet && "relative pl-4 before:absolute before:left-1 before:content-['•']",
                heading && "text-sm font-semibold",
              )}
            >
              {clean.replace(/^#{1,6}\s/, "")}
            </p>
          );
        })}
    </div>
  );
}

const MODES: { key: SummaryMode; label: string; hint: string }[] = [
  { key: "catchup", label: "Catch me up", hint: "What you missed" },
  { key: "summary", label: "Summarise", hint: "The whole discussion" },
  { key: "actions", label: "Action items", hint: "Decisions & to-dos" },
];

export function AiPanel({
  open,
  onClose,
  conversationId,
  conversationName,
  sinceIso,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  conversationName: string;
  sinceIso?: string | null;
}) {
  const summary = useAiSummary();
  const [mode, setMode] = useState<SummaryMode>("catchup");
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    setResult(null);
  }, [conversationId]);

  if (!open) return null;

  const run = (next: SummaryMode) => {
    setMode(next);
    setResult(null);
    summary.mutate(
      { conversationId, mode: next, sinceIso: next === "catchup" ? (sinceIso ?? null) : null },
      {
        onSuccess: (data) => setResult(data.text),
        onError: (e) => toast.error(aiErrorMessage(e)),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-label="Echo AI assistant"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-soft sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight">Echo AI</p>
            <p className="truncate text-[11px] text-muted-foreground">{conversationName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close assistant"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => run(m.key)}
              disabled={summary.isPending}
              title={m.hint}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
                mode === m.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="min-h-[140px] flex-1 overflow-y-auto px-4 py-4">
          {summary.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the conversation…
            </p>
          ) : result ? (
            <AiText text={result} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick an option above and Echo AI will read this conversation for you. It only ever
              sees messages you can already read.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const TONES = ["friendly", "professional", "casual", "warm", "direct"];
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Hindi", "Arabic"];

export function WritingTools({
  draft,
  onApply,
  disabled,
}: {
  draft: string;
  onApply: (text: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rewrite = useAiRewrite();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const run = (action: RewriteAction, extra?: { tone?: string; language?: string }) => {
    const text = draft.trim();
    if (!text) {
      toast.error("Write something first.");
      return;
    }
    rewrite.mutate(
      { text, action, tone: extra?.tone ?? null, language: extra?.language ?? null },
      {
        onSuccess: (data) => {
          onApply(data.text);
          setOpen(false);
        },
        onError: (e) => toast.error(aiErrorMessage(e)),
      },
    );
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || rewrite.isPending}
        aria-label="AI writing tools"
        title="AI writing tools"
        className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-background text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
      >
        {rewrite.isPending ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
        ) : (
          <Wand2 className="h-[18px] w-[18px]" />
        )}
      </button>

      {open ? (
        <div className="absolute bottom-14 left-0 z-40 w-60 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-soft">
          <MenuButton label="Fix grammar" onClick={() => run("grammar")} />
          <MenuButton label="Make it shorter" onClick={() => run("shorten")} />
          <MenuButton label="Expand it" onClick={() => run("expand")} />
          <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Tone
          </p>
          <div className="flex flex-wrap gap-1 px-1 pb-1">
            {TONES.map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => run("tone", { tone })}
                className="rounded-full border border-border px-2 py-1 text-[11px] capitalize hover:bg-secondary"
              >
                {tone}
              </button>
            ))}
          </div>
          <p className="px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Translate
          </p>
          <div className="flex flex-wrap gap-1 px-1 pb-1">
            {LANGUAGES.map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => run("translate", { language })}
                className="rounded-full border border-border px-2 py-1 text-[11px] hover:bg-secondary"
              >
                {language}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center rounded-xl px-2.5 py-2 text-left text-xs font-medium hover:bg-secondary"
    >
      {label}
    </button>
  );
}

const FILE_PRESETS = [
  "Summarise this file",
  "Explain it simply",
  "Extract the key information",
];

/** "Ask AI" affordance rendered next to document and image attachments. */
export function AskFileButton({
  path,
  name,
  mimeType,
}: {
  path: string;
  name: string;
  mimeType: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <Sparkles className="h-3 w-3" /> Ask AI
      </button>
      {open ? (
        <AskFileDialog
          path={path}
          name={name}
          mimeType={mimeType}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function AskFileDialog({
  path,
  name,
  mimeType,
  onClose,
}: {
  path: string;
  name: string;
  mimeType: string;
  onClose: () => void;
}) {
  const ask = useAiFileAnswer();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setAnswer(null);
    ask.mutate(
      { path, name, mimeType, question: trimmed },
      {
        onSuccess: (data) => setAnswer(data.text),
        onError: (e) => toast.error(aiErrorMessage(e)),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-label={`Ask about ${name}`}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-soft sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight">Ask about this file</p>
            <p className="truncate text-[11px] text-muted-foreground">{name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
          {FILE_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => run(preset)}
              disabled={ask.isPending}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="min-h-[120px] flex-1 overflow-y-auto px-4 py-4">
          {ask.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading {name}…
            </p>
          ) : answer ? (
            <AiText text={answer} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask anything about this file — summaries, explanations or specific details.
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(question);
            setQuestion("");
          }}
          className="flex items-center gap-2 border-t border-border px-4 py-3"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about this file"
            className="h-11 min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
          <button
            type="submit"
            disabled={ask.isPending || !question.trim()}
            aria-label="Ask"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>
    </div>
  );
}
