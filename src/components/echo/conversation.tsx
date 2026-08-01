import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock, Phone, Send, Smile, Video } from "lucide-react";
import { EchoAvatar } from "./avatar";
import { GroupPanel } from "./group-panel";
import { cn } from "@/lib/utils";
import { useUserId, useMyProfile } from "@/lib/session";
import type { EchoChat, EchoMessage } from "@/lib/echo-data";
import { useOnlineUsers, useTyping } from "@/lib/presence";
import {
  useConversationRealtime,
  useDiscardFailedMessage,
  useMarkRead,
  useMessages,
  useReadReceipts,
  useSendMessage,
  useToggleReaction,
} from "@/lib/echo-queries";

const QUICK = ["👍", "❤️", "😂", "🎉", "🙏"];

function DeliveryTick({
  message,
  delivered,
  read,
}: {
  message: EchoMessage;
  delivered: boolean;
  read: boolean;
}) {
  if (message.status === "sending")
    return <Clock className="h-3 w-3 text-muted-foreground" aria-label="Sending" />;
  if (message.status === "failed")
    return <AlertCircle className="h-3 w-3 text-destructive" aria-label="Failed to send" />;
  if (read) return <CheckCheck className="h-3 w-3 text-primary" aria-label="Read" />;
  if (delivered)
    return <CheckCheck className="h-3 w-3 text-muted-foreground" aria-label="Delivered" />;
  return <Check className="h-3 w-3 text-muted-foreground" aria-label="Sent" />;
}

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
  const myProfile = useMyProfile();
  const messages = useMessages(chat.id);
  const receipts = useReadReceipts(chat.id);
  const send = useSendMessage();
  const react = useToggleReaction();
  const markRead = useMarkRead();
  const discardFailed = useDiscardFailedMessage();
  const [draft, setDraft] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useConversationRealtime(chat.id);
  const onlineIds = useOnlineUsers(userId);
  const me = useMemo(
    () =>
      userId
        ? { id: userId, name: myProfile.data?.displayName ?? "Someone" }
        : null,
    [userId, myProfile.data?.displayName],
  );
  const { typing, notifyTyping, stopTyping } = useTyping(chat.id, me);

  const list = messages.data;
  const others = useMemo(
    () => chat.memberIds.filter((id) => id !== userId),
    [chat.memberIds, userId],
  );
  const someoneOnline = others.some((id) => onlineIds.includes(id));
  const receiptMap = receipts.data ?? {};
  const isGroup = chat.kind === "group";
  const postingLocked = isGroup && chat.onlyAdminsPost && chat.myRole === "member";

  const lastId = list.length ? list[list.length - 1]!.id : null;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  // Opening (or receiving into) an open conversation marks it read.
  const incomingCount = list.filter((m) => m.authorId !== userId).length;
  useEffect(() => {
    if (!userId) return;
    markRead.mutate(chat.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, incomingCount, userId]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    stopTyping();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    send.mutate({ conversationId: chat.id, body });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onLoadMore = () => {
    const el = scrollRef.current;
    const before = el?.scrollHeight ?? 0;
    void messages.loadMore().then(() => {
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    });
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
        {isGroup ? (
          <button
            onClick={() => setPanelOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1 text-left hover:bg-secondary/60"
            aria-label="Group details"
          >
            <EchoAvatar
              initials={chat.avatar}
              color={chat.color}
              avatarUrl={chat.avatarUrl}
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{chat.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {typing.length ? `${typing.join(", ")} is typing…` : `${chat.members} members`}
              </span>
            </span>
          </button>
        ) : (
          <>
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
                {typing.length
                  ? `${typing.join(", ")} is typing…`
                  : someoneOnline
                    ? "Online"
                    : chat.handle}
              </p>
            </div>
          </>
        )}
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

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {messages.isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Loading messages…</p>
        ) : messages.isError ? (
          <div className="mx-auto max-w-sm rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-center">
            <p className="text-sm font-semibold">Couldn't load messages</p>
            <button
              onClick={() => void messages.refetch()}
              className="mt-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
            >
              Try again
            </button>
          </div>
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — say hello to {chat.name}.
          </p>
        ) : null}

        {messages.hasMore ? (
          <div className="flex justify-center">
            <button
              onClick={onLoadMore}
              disabled={messages.isLoadingMore}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted-foreground disabled:opacity-50"
            >
              {messages.isLoadingMore ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        ) : null}

        {list.map((m) => {
          if (m.kind === "system") {
            return (
              <p
                key={m.id}
                className="mx-auto max-w-[85%] rounded-full bg-secondary/60 px-3 py-1 text-center text-[11px] text-muted-foreground"
              >
                {m.authorName} {m.body} · {m.time}
              </p>
            );
          }
          const mine = m.authorId === userId;
          const readers = (receiptMap[m.id] ?? []).filter((id) => id !== userId);
          const read = others.length > 0 && others.every((id) => readers.includes(id));
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
                    "animate-pop rounded-3xl px-4 py-2.5 text-sm break-words whitespace-pre-wrap",
                    mine
                      ? "rounded-br-lg bg-primary text-primary-foreground"
                      : "rounded-bl-lg bg-surface text-foreground",
                    m.status === "failed" && "opacity-60",
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
                  {mine ? (
                    <DeliveryTick message={m} delivered={someoneOnline} read={read} />
                  ) : null}
                  {mine && m.status === "failed" ? (
                    <>
                      <button
                        onClick={() => {
                          discardFailed(chat.id, m.id);
                          send.mutate({ conversationId: chat.id, body: m.body });
                        }}
                        className="text-[11px] font-semibold text-primary"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => discardFailed(chat.id, m.id)}
                        className="text-[11px] text-muted-foreground"
                      >
                        Discard
                      </button>
                    </>
                  ) : null}
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
        {typing.length ? (
          <p className="mb-1 text-[11px] text-muted-foreground">
            {typing.join(", ")} {typing.length > 1 ? "are" : "is"} typing…
          </p>
        ) : null}
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
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            onChange={(e) => {
              setDraft(e.target.value);
              notifyTyping();
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            }}
            onKeyDown={onKeyDown}
            onBlur={stopTyping}
            placeholder={`Message ${chat.name}`}
            maxLength={4000}
            className="max-h-[140px] min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
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
