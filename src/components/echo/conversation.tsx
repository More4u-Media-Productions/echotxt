import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Phone, Send, Smile, Video } from "lucide-react";
import { EchoAvatar } from "./avatar";
import { cn } from "@/lib/utils";
import { useUserId } from "@/lib/session";
import type { EchoChat } from "@/lib/echo-data";
import { useMarkRead, useMessages, useSendMessage, useToggleReaction } from "@/lib/echo-queries";

const QUICK = ["👍", "❤️", "😂", "🎉", "🙏"];

export function Conversation({
  chat,
  onBack,
  onCall,
}: {
  chat: EchoChat;
  onBack?: (() => void) | undefined;
  onCall?: ((media: "voice" | "video") => void) | undefined;
}) {
  const userId = useUserId();
  const messages = useMessages(chat.id);
  const send = useSendMessage();
  const react = useToggleReaction();
  const markRead = useMarkRead();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => messages.data ?? [], [messages.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [list.length]);

  useEffect(() => {
    if (chat.unread > 0) markRead.mutate(chat.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    send.mutate({ conversationId: chat.id, body });
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface/60 px-4 py-3">
        {onBack ? (
          <button
            onClick={onBack}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary lg:hidden"
            aria-label="Back to chats"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <EchoAvatar
          initials={chat.avatar}
          color={chat.color}
          avatarUrl={chat.avatarUrl}
          {...(chat.presence ? { presence: chat.presence } : {})}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{chat.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {chat.kind === "group" ? `${chat.members} members` : chat.handle}
          </p>
        </div>
        <button
          onClick={() => onCall?.("voice")}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Voice call"
        >
          <Phone className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => onCall?.("video")}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Video call"
        >
          <Video className="h-[18px] w-[18px]" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {messages.isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Loading messages…</p>
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — say hello to {chat.name}.
          </p>
        ) : null}

        {list.map((m) => {
          const mine = m.authorId === userId;
          return (
            <div key={m.id} className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
              {!mine ? (
                <EchoAvatar initials={m.authorInitials} color={m.authorColor} avatarUrl={m.authorAvatarUrl} size="sm" />
              ) : null}
              <div className={cn("max-w-[78%] min-w-0", mine && "items-end text-right")}>
                {chat.kind === "group" && !mine ? (
                  <p className="mb-0.5 text-[11px] font-semibold text-muted-foreground">
                    {m.authorName}
                  </p>
                ) : null}
                <div
                  className={cn(
                    "animate-pop rounded-3xl px-4 py-2.5 text-sm break-words",
                    mine
                      ? "rounded-br-lg bg-primary text-primary-foreground"
                      : "rounded-bl-lg bg-surface text-foreground",
                  )}
                >
                  {m.body}
                </div>
                <div
                  className={cn(
                    "mt-1 flex items-center gap-1.5",
                    mine ? "justify-end" : "justify-start",
                  )}
                >
                  <span className="text-[11px] text-muted-foreground">{m.time}</span>
                  {m.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      onClick={() =>
                        react.mutate({ messageId: m.id, emoji: r.emoji, mine: r.mine })
                      }
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[11px]",
                        r.mine
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border bg-surface text-muted-foreground",
                      )}
                    >
                      {r.emoji} {r.count}
                    </button>
                  ))}
                  {!mine ? (
                    <button
                      onClick={() => react.mutate({ messageId: m.id, emoji: "👍", mine: false })}
                      className="text-muted-foreground/70 transition-colors hover:text-primary"
                      aria-label="React with thumbs up"
                    >
                      <Smile className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-border bg-surface/60 px-4 py-3">
        <div className="mb-2 flex gap-1.5">
          {QUICK.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setDraft((d) => d + emoji)}
              className="rounded-full border border-border bg-surface px-2 py-1 text-sm"
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${chat.name}`}
            maxLength={4000}
            className="h-11 min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
            aria-label="Send message"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>
      </form>
    </section>
  );
}
