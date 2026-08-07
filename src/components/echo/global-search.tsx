// Global search across messages, files, people and groups, plus the user's
// saved messages. Opened from the header button or Cmd/Ctrl+K.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { EchoAvatar } from "./avatar";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/attachments";
import { aiErrorMessage, useAiSearchPlan } from "@/lib/ai";
import { relativeTime } from "@/lib/echo-data";
import {
  useBookmarks,
  useSearchGroups,
  useSearchMessages,
  useSearchProfiles,
  useStartDm,
  type MediaFilter,
} from "@/lib/echo-queries";

type Tab = "messages" | "files" | "people" | "groups" | "saved";

const TABS: { key: Tab; label: string }[] = [
  { key: "messages", label: "Messages" },
  { key: "files", label: "Files" },
  { key: "people", label: "People" },
  { key: "groups", label: "Groups" },
  { key: "saved", label: "Saved" },
];

const MEDIA: { key: MediaFilter; label: string }[] = [
  { key: "all", label: "All files" },
  { key: "image", label: "Photos" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Voice & audio" },
  { key: "file", label: "Documents" },
];

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("messages");
  const [term, setTerm] = useState("");
  const [media, setMedia] = useState<MediaFilter>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const startDm = useStartDm();
  const plan = useAiSearchPlan();
  const [smart, setSmart] = useState<{ senderId: string | null; from: string | null; note: string } | null>(
    null,
  );

  const askAi = () => {
    const q = term.trim();
    if (q.length < 2) {
      toast.error("Describe what you're looking for first.");
      return;
    }
    plan.mutate(q, {
      onSuccess: (result) => {
        setTab(result.media === "all" || result.media === "text" ? "messages" : "files");
        if (result.media !== "all" && result.media !== "text") setMedia(result.media);
        setTerm(result.terms || q);
        setSmart({ senderId: result.senderId, from: result.from, note: result.explanation });
      },
      onError: (e) => toast.error(aiErrorMessage(e)),
    });
  };

  const messageFilter = tab === "files" ? (media === "all" ? "all" : media) : "text";
  const messages = useSearchMessages(
    open && (tab === "messages" || tab === "files") ? term : "",
    {
      media: tab === "files" ? (media === "all" ? "image" : media) : "all",
      senderId: smart?.senderId ?? null,
      from: smart?.from ?? null,
    },
  );
  const people = useSearchProfiles(open && tab === "people" ? term : "");
  const groups = useSearchGroups(open && tab === "groups" ? term : "");
  const saved = useBookmarks();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const savedHits = useMemo(() => {
    const q = term.trim().toLowerCase();
    const rows = saved.data ?? [];
    return q ? rows.filter((m) => m.body.toLowerCase().includes(q)) : rows;
  }, [saved.data, term]);

  if (!open) return null;

  const openMessage = (conversationId: string, messageId: string) => {
    onClose();
    void navigate({ to: "/", search: { c: conversationId, m: messageId } });
  };

  const openDm = (profileId: string) => {
    startDm.mutate(profileId, {
      onSuccess: (id) => {
        onClose();
        void navigate({ to: "/", search: { c: id } });
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const needsTerm = term.trim().length < 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 px-4 py-[8vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-soft">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search messages, files, people and groups"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={askAi}
            disabled={plan.isPending}
            aria-label="Search with Echo AI"
            title="Search naturally with Echo AI"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-primary disabled:opacity-60"
          >
            {plan.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onClose}
            aria-label="Close search"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {smart ? (
          <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{smart.note}</p>
            <button
              onClick={() => setSmart(null)}
              className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        ) : null}

        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "files" ? (
          <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2">
            {MEDIA.map((m) => (
              <button
                key={m.key}
                onClick={() => setMedia(m.key)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  media === m.key
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {tab === "messages" || tab === "files" ? (
            messages.isLoading ? (
              <Busy />
            ) : messages.isError ? (
              <Note text="Search failed. Try again in a moment." />
            ) : !messages.active ? (
              <Note text="Type at least 2 characters to search." />
            ) : messages.hits.length === 0 ? (
              <Note text="No matching messages yet." />
            ) : (
              <>
                <p className="px-3 py-1 text-[11px] text-muted-foreground">
                  {messages.total} result{messages.total === 1 ? "" : "s"}
                  {messageFilter === "text" ? "" : ""}
                </p>
                <ul>
                  {messages.hits.map((hit) => (
                    <li key={hit.messageId}>
                      <button
                        onClick={() => openMessage(hit.conversationId, hit.messageId)}
                        className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-secondary/60"
                      >
                        <EchoAvatar
                          initials={initials(hit.senderName)}
                          color={hit.senderColor}
                          avatarUrl={hit.senderAvatarUrl}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {hit.senderName}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {relativeTime(hit.createdAt)}
                            </span>
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            in {hit.conversationName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs">
                            {hit.attachmentName
                              ? `📎 ${hit.attachmentName}${
                                  hit.attachmentSize ? ` · ${formatBytes(hit.attachmentSize)}` : ""
                                }`
                              : hit.kind === "voice" || hit.kind === "voicemail"
                                ? "🎙 Voice message"
                                : hit.body}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {messages.hasMore ? (
                  <div className="flex justify-center py-2">
                    <button
                      onClick={() => void messages.loadMore()}
                      disabled={messages.isLoadingMore}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground disabled:opacity-50"
                    >
                      {messages.isLoadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                ) : null}
              </>
            )
          ) : null}

          {tab === "people" ? (
            needsTerm ? (
              <Note text="Type at least 2 characters to find people." />
            ) : people.isLoading ? (
              <Busy />
            ) : (people.data ?? []).length === 0 ? (
              <Note text="No people matched that search." />
            ) : (
              <ul>
                {(people.data ?? []).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => openDm(p.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-secondary/60"
                    >
                      <EchoAvatar
                        initials={p.avatar}
                        color={p.color}
                        avatarUrl={p.avatarUrl}
                        presence={p.presence}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {p.displayName}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {p.username}
                          {p.statusText ? ` · ${p.statusEmoji ?? ""} ${p.statusText}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-primary">
                        Message
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === "groups" ? (
            needsTerm ? (
              <Note text="Type at least 2 characters to find groups." />
            ) : groups.isLoading ? (
              <Busy />
            ) : (groups.data ?? []).length === 0 ? (
              <Note text="No groups matched that search." />
            ) : (
              <ul>
                {(groups.data ?? []).map((g) => (
                  <li key={g.id}>
                    <button
                      onClick={() => {
                        onClose();
                        void navigate({ to: "/", search: { c: g.id } });
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-secondary/60"
                    >
                      <EchoAvatar
                        initials={initials(g.title)}
                        color={g.color}
                        avatarUrl={g.avatarUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{g.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {g.memberCount} members
                          {g.matchReason === "member" ? " · matched a member" : ""}
                          {g.description ? ` · ${g.description}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === "saved" ? (
            saved.isLoading ? (
              <Busy />
            ) : savedHits.length === 0 ? (
              <Note text="Messages you save will appear here." />
            ) : (
              <ul>
                {savedHits.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => openMessage(m.conversationId, m.id)}
                      className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-secondary/60"
                    >
                      <EchoAvatar
                        initials={m.authorInitials}
                        color={m.authorColor}
                        avatarUrl={m.authorAvatarUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {m.authorName}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          in {m.conversationName}
                        </span>
                        <span className="mt-0.5 block truncate text-xs">
                          {m.body || (m.attachmentName ? `📎 ${m.attachmentName}` : "Attachment")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

function Busy() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Searching…
    </div>
  );
}

function Note({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>;
}
