import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CornerUpLeft,
  Loader2,
  Paperclip,
  Phone,
  Pin,
  RotateCcw,
  Send,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EchoAvatar } from "./avatar";
import { GroupPanel } from "./group-panel";
import { ImageLightbox } from "./attachment-view";
import { MessageRow } from "./message-row";
import { AiPanel, WritingTools } from "./ai-assistant";
import { VoiceComposer } from "./voice-composer";
import { cn } from "@/lib/utils";
import { useCallEngine } from "@/lib/calls";
import { useUserId, useMyProfile } from "@/lib/session";
import type { EchoChat, EchoMessage, ReplyPreview } from "@/lib/echo-data";
import { useOnlineUsers, useTyping } from "@/lib/presence";
import {
  attachmentKind,
  formatBytes,
  MAX_FILE_BYTES,
  storagePath,
  uploadAttachment,
} from "@/lib/attachments";
import type { VoiceClip } from "@/lib/voice";
import { useUploads } from "@/lib/use-uploads";
import {
  useConversationRealtime,
  useDeleteMessage,
  useDiscardFailedMessage,
  useEditMessage,
  useHideMessage,
  useMarkRead,
  useMessages,
  usePinnedMessages,
  useReadReceipts,
  useSendMessage,
  useToggleBookmark,
  useToggleReaction,
  useTogglePin,
} from "@/lib/echo-queries";

const QUICK = ["👍", "❤️", "😂", "🎉", "🙏"];

function previewText(message: EchoMessage): string {
  if (message.kind === "voice" || message.kind === "voicemail") return "🎙 Voice message";
  if (message.attachmentUrl && !message.body) {
    return attachmentKind(message.attachmentType, message.attachmentName) === "image"
      ? "🖼 Photo"
      : `📎 ${message.attachmentName ?? "File"}`;
  }
  return message.body;
}

export function Conversation({
  chat,
  onBack,
  onCall,
  focusMessageId,
}: {
  chat: EchoChat;
  onBack?: (() => void) | undefined;
  onCall?: ((media: "voice" | "video") => void) | undefined;
  focusMessageId?: string | null;
}) {
  const userId = useUserId();
  const { startCall } = useCallEngine();
  const placeCall = (media: "voice" | "video") =>
    startCall({
      conversationId: chat.id,
      media,
      title: chat.name,
      avatar: chat.avatar,
      avatarUrl: chat.avatarUrl,
      color: chat.color,
      isGroup: chat.kind === "group",
    });
  const myProfile = useMyProfile();
  const messages = useMessages(chat.id);
  const receipts = useReadReceipts(chat.id);
  const pinned = usePinnedMessages(chat.id);
  const send = useSendMessage();
  const react = useToggleReaction();
  const markRead = useMarkRead();
  const discardFailed = useDiscardFailedMessage();
  const removeMessage = useDeleteMessage();
  const hideMessage = useHideMessage();
  const editMessage = useEditMessage();
  const togglePin = useTogglePin();
  const toggleBookmark = useToggleBookmark();
  const uploads = useUploads(chat.id, userId);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<EchoMessage | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useConversationRealtime(chat.id);
  const onlineIds = useOnlineUsers(userId);
  const me = useMemo(
    () => (userId ? { id: userId, name: myProfile.data?.displayName ?? "Someone" } : null),
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
  const canPinHere = !isGroup || chat.myRole === "owner" || chat.myRole === "admin";
  const pinnedList = pinned.data ?? [];

  // Boundary used by the AI "Catch me up" mode: the newest message the user
  // had already read before opening this conversation.
  const unreadOnOpen = useRef(chat.unread);
  const lastReadIso = useMemo(() => {
    const unread = unreadOnOpen.current;
    if (!unread || list.length === 0) return null;
    const boundary = list[Math.max(0, list.length - unread) - 1];
    return boundary?.createdAt ?? null;
  }, [list]);

  const gallery = useMemo(
    () =>
      list
        .filter(
          (m) => m.attachmentUrl && attachmentKind(m.attachmentType, m.attachmentName) === "image",
        )
        .map((m) => ({ id: m.id, path: m.attachmentUrl!, name: m.attachmentName ?? "image" })),
    [list],
  );

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

  /** Scrolls to a message, loading older pages until it exists in the list. */
  const jumpTo = useCallback(
    async (messageId: string) => {
      for (let i = 0; i < 12; i += 1) {
        const node = document.getElementById(`message-${messageId}`);
        if (node) {
          node.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightId(messageId);
          setTimeout(() => setHighlightId((c) => (c === messageId ? null : c)), 2200);
          return;
        }
        if (!messages.hasMore) break;
        await messages.loadMore();
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      toast.error("That message isn't loaded yet.");
    },
    [messages],
  );

  // Deep link from global search / notifications.
  const focusHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!focusMessageId || messages.isLoading) return;
    if (focusHandled.current === focusMessageId) return;
    focusHandled.current = focusMessageId;
    void jumpTo(focusMessageId);
  }, [focusMessageId, messages.isLoading, jumpTo]);

  const canSend = !!draft.trim() || uploads.ready.length > 0;

  const replyPayload = (): { replyToId?: string; replyTo?: ReplyPreview } =>
    replyTo
      ? {
          replyToId: replyTo.id,
          replyTo: {
            id: replyTo.id,
            authorName: replyTo.authorName,
            body: previewText(replyTo),
            kind: replyTo.kind,
            deleted: false,
          },
        }
      : {};

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    const body = draft.trim();
    const attachments = uploads.ready;
    const reply = replyPayload();
    setDraft("");
    setReplyTo(null);
    stopTyping();
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    if (attachments.length === 0) {
      send.mutate({ conversationId: chat.id, body, ...reply });
    } else {
      attachments.forEach((item, i) => {
        const kind = attachmentKind(item.file.type, item.file.name);
        send.mutate({
          conversationId: chat.id,
          body: i === 0 ? body : "",
          kind: kind === "image" ? "image" : "file",
          attachmentUrl: item.path,
          attachmentType: item.file.type || null,
          attachmentName: item.file.name,
          attachmentSize: item.file.size,
          ...(i === 0 ? reply : {}),
        });
      });
      uploads.clear();
    }
  };

  const sendVoice = async (clip: VoiceClip) => {
    if (!userId) return;
    setSendingVoice(true);
    const path = storagePath(chat.id, userId, clip.file);
    try {
      await uploadAttachment({ path, file: clip.file });
      const reply = replyPayload();
      setReplyTo(null);
      send.mutate({
        conversationId: chat.id,
        body: "",
        kind: "voice",
        metadata: {
          durationSeconds: Math.round(clip.seconds * 10) / 10,
          peaks: clip.peaks.map((p) => Math.round(p * 100) / 100),
        },
        attachmentUrl: path,
        attachmentType: clip.file.type || "audio/webm",
        attachmentName: clip.file.name,
        attachmentSize: clip.file.size,
        ...reply,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that voice message.");
    } finally {
      setSendingVoice(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && replyTo) setReplyTo(null);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      uploads.add(files);
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
    <section
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        if (postingLocked) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (postingLocked) return;
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) uploads.add(e.dataTransfer.files);
      }}
    >
      {dragging && !postingLocked ? (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-3xl border-2 border-dashed border-primary/60 bg-primary/10">
          <p className="text-sm font-semibold text-primary">
            Drop files to attach · up to {formatBytes(MAX_FILE_BYTES)} each
          </p>
        </div>
      ) : null}
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
          onClick={() => setAiOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-primary"
          aria-label="Echo AI assistant"
          title="Echo AI — summarise or catch up"
        >
          <Sparkles className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => (onCall ? onCall("voice") : void placeCall("voice"))}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Voice call"
        >
          <Phone className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => (onCall ? onCall("video") : void placeCall("video"))}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Video call"
        >
          <Video className="h-[18px] w-[18px]" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
              aria-label="Chat options"
            >
              <MoreVertical className="h-[18px] w-[18px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(event) => {
                event.preventDefault();
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {chat.kind === "group" ? "Leave & remove group" : "Delete chat"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {chat.kind === "group" ? "Leave this group?" : "Delete this chat?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {chat.kind === "group"
                ? "You'll be removed from the group and it will disappear from your chats."
                : "This permanently deletes the conversation and every message, attachment and call record in it — for both of you. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteChat.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteChat.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteChat.mutate(chat.id, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    toast.success(chat.kind === "group" ? "You left the group" : "Chat deleted");
                    onBack?.();
                  },
                  onError: (error: unknown) =>
                    toast.error(
                      error instanceof Error ? error.message : "Could not delete this chat",
                    ),
                });
              }}
            >
              {deleteChat.isPending ? "Deleting…" : chat.kind === "group" ? "Leave" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pinnedList.length ? (
        <div className="border-b border-border bg-surface/40 px-4 py-2">
          <button
            type="button"
            onClick={() => setPinnedOpen((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={pinnedOpen}
          >
            <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {pinnedList.length} pinned message{pinnedList.length > 1 ? "s" : ""}
              </span>
              {" · "}
              {previewText(pinnedList[0]!)}
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-primary">
              {pinnedOpen ? "Hide" : "View"}
            </span>
          </button>
          {pinnedOpen ? (
            <ul className="mt-2 space-y-1">
              {pinnedList.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void jumpTo(m.id)}
                    className="min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left text-xs hover:bg-secondary"
                  >
                    <span className="font-semibold">{m.authorName}: </span>
                    <span className="text-muted-foreground">{previewText(m)}</span>
                  </button>
                  {canPinHere ? (
                    <button
                      type="button"
                      onClick={() =>
                        togglePin.mutate(
                          { conversationId: chat.id, messageId: m.id, pinned: false },
                          { onError: (e) => toast.error(e.message) },
                        )
                      }
                      className="shrink-0 text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      Unpin
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
            <MessageRow
              key={m.id}
              message={m}
              mine={mine}
              isGroup={isGroup}
              canPin={canPinHere || mine}
              delivered={someoneOnline}
              read={read}
              highlighted={highlightId === m.id}
              onReply={(target) => {
                setReplyTo(target);
                textareaRef.current?.focus();
              }}
              onEdit={(target, body) =>
                editMessage.mutate(
                  { conversationId: chat.id, messageId: target.id, body },
                  { onError: (e) => toast.error(e.message) },
                )
              }
              onReact={(emoji, isMine) =>
                react.mutate({ messageId: m.id, emoji, mine: isMine })
              }
              onTogglePin={() =>
                togglePin.mutate(
                  { conversationId: chat.id, messageId: m.id, pinned: !m.pinned },
                  {
                    onError: (e) => toast.error(e.message),
                    onSuccess: () => toast.success(m.pinned ? "Unpinned" : "Pinned"),
                  },
                )
              }
              onToggleBookmark={() =>
                toggleBookmark.mutate(
                  { conversationId: chat.id, messageId: m.id, bookmarked: m.bookmarked },
                  {
                    onError: (e) => toast.error(e.message),
                    onSuccess: () =>
                      toast.success(m.bookmarked ? "Removed from saved" : "Saved"),
                  },
                )
              }
              onDeleteForEveryone={() =>
                removeMessage.mutate(
                  {
                    conversationId: chat.id,
                    messageId: m.id,
                    attachmentUrl: m.attachmentUrl,
                  },
                  { onError: (e) => toast.error(e.message) },
                )
              }
              onDeleteForMe={() =>
                hideMessage.mutate(
                  { conversationId: chat.id, messageId: m.id },
                  { onError: (e) => toast.error(e.message) },
                )
              }
              onRetry={() => {
                discardFailed(chat.id, m.id);
                send.mutate({
                  conversationId: chat.id,
                  body: m.body,
                  kind: m.kind,
                  metadata: m.metadata,
                  attachmentUrl: m.attachmentUrl,
                  attachmentType: m.attachmentType,
                  attachmentName: m.attachmentName,
                  attachmentSize: m.attachmentSize,
                  replyToId: m.replyToId,
                });
              }}
              onDiscard={() => discardFailed(chat.id, m.id)}
              onOpenImage={(id) => {
                const idx = gallery.findIndex((g) => g.id === id);
                if (idx >= 0) setLightbox(idx);
              }}
              onJumpToReply={(id) => void jumpTo(id)}
            />
          );
        })}
        <div ref={endRef} />
      </div>

      {postingLocked ? (
        <div className="border-t border-border bg-surface/60 px-4 py-4 text-center text-xs text-muted-foreground">
          Only admins can send messages in this group.
        </div>
      ) : (
        <form onSubmit={submit} className="border-t border-border bg-surface/60 px-4 py-3">
          {typing.length ? (
            <p className="mb-1 text-[11px] text-muted-foreground">
              {typing.join(", ")} {typing.length > 1 ? "are" : "is"} typing…
            </p>
          ) : null}

          {replyTo ? (
            <div className="mb-2 flex items-center gap-2 rounded-2xl border-l-2 border-primary bg-secondary/60 px-3 py-2">
              <CornerUpLeft className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-primary">
                  Replying to {replyTo.authorName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {previewText(replyTo)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {uploads.items.length ? (
            <ul className="mb-2 flex flex-wrap gap-2">
              {uploads.items.map((item) => (
                <li
                  key={item.id}
                  className="relative w-[132px] overflow-hidden rounded-2xl border border-border bg-background p-2"
                >
                  <div className="flex items-center gap-2">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="h-9 w-9 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-[10px] font-bold uppercase">
                        {(item.file.name.split(".").pop() ?? "file").slice(0, 4)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold">{item.file.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatBytes(item.file.size)}
                      </p>
                    </div>
                  </div>
                  {item.status === "uploading" ? (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  ) : null}
                  {item.status === "error" ? (
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className="truncate text-[10px] text-destructive">Failed</span>
                      <button
                        type="button"
                        onClick={() => uploads.retry(item.id)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-primary"
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                  ) : null}
                  {item.status === "uploading" ? (
                    <Loader2 className="absolute top-1.5 right-7 h-3 w-3 animate-spin text-muted-foreground" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => uploads.cancel(item.id)}
                    aria-label={`Remove ${item.file.name}`}
                    className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
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
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.rtf,.json,.zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) uploads.add(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border bg-background text-muted-foreground hover:text-foreground"
              aria-label="Attach files"
            >
              <Paperclip className="h-[18px] w-[18px]" />
            </button>
            <VoiceComposer onSend={(clip) => void sendVoice(clip)} disabled={sendingVoice} />
            <WritingTools draft={draft} onApply={setDraft} disabled={sendingVoice} />
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
              onPaste={onPaste}
              onBlur={stopTyping}
              placeholder={`Message ${chat.name}`}
              maxLength={4000}
              className="max-h-[140px] min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
            <button
              type="submit"
              disabled={!canSend || uploads.busy || sendingVoice}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
              aria-label="Send message"
            >
              {uploads.busy || sendingVoice ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <Send className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </form>
      )}

      <AiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        conversationId={chat.id}
        conversationName={chat.name}
        sinceIso={lastReadIso}
      />

      {lightbox !== null ? (
        <ImageLightbox
          items={gallery}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}

      {isGroup ? (
        <GroupPanel
          chat={chat}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          onLeft={onBack}
        />
      ) : null}
    </section>
  );
}
