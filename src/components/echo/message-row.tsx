// A single chat bubble plus its actions: reply, edit, react, pin, bookmark and
// the two delete modes. Kept in its own file so the conversation view stays
// focused on layout and composing.

import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  CornerUpLeft,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { EchoAvatar } from "./avatar";
import { AttachmentView } from "./attachment-view";
import { VoiceMessage } from "./voice-message";
import { cn } from "@/lib/utils";
import { voiceMeta, type EchoMessage } from "@/lib/echo-data";

export const REACTION_CHOICES = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "🔥"];

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

export interface MessageRowProps {
  message: EchoMessage;
  mine: boolean;
  isGroup: boolean;
  canPin: boolean;
  delivered: boolean;
  read: boolean;
  highlighted: boolean;
  onReply: (message: EchoMessage) => void;
  onEdit: (message: EchoMessage, body: string) => void;
  onReact: (emoji: string, mine: boolean) => void;
  onTogglePin: () => void;
  onToggleBookmark: () => void;
  onDeleteForEveryone: () => void;
  onDeleteForMe: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  onOpenImage: (id: string) => void;
  onJumpToReply: (messageId: string) => void;
}

export function MessageRow({
  message: m,
  mine,
  isGroup,
  canPin,
  delivered,
  read,
  highlighted,
  onReply,
  onEdit,
  onReact,
  onTogglePin,
  onToggleBookmark,
  onDeleteForEveryone,
  onDeleteForMe,
  onRetry,
  onDiscard,
  onOpenImage,
  onJumpToReply,
}: MessageRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const wrapRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!menuOpen && !pickerOpen && !confirmDelete) return;
    const close = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setPickerOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen, pickerOpen, confirmDelete]);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const hasAttachment = !!m.attachmentUrl;
  const isVoice = (m.kind === "voice" || m.kind === "voicemail") && hasAttachment;
  const canEdit = mine && !m.deleted && m.status === "sent" && !hasAttachment && m.kind === "text";
  const actionable = m.status === "sent" && !m.deleted;

  const saveEdit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== m.body) onEdit(m, next);
    else setDraft(m.body);
  };

  return (
    <div
      id={`message-${m.id}`}
      ref={wrapRef}
      className={cn(
        "group/message flex gap-2.5 rounded-2xl transition-colors",
        mine && "flex-row-reverse",
        highlighted && "bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      {!mine ? (
        <EchoAvatar
          initials={m.authorInitials}
          color={m.authorColor}
          avatarUrl={m.authorAvatarUrl}
          size="sm"
        />
      ) : null}
      <div className={cn("relative max-w-[78%] min-w-0", mine && "items-end text-right")}>
        {isGroup && !mine ? (
          <p className="mb-0.5 text-[11px] font-semibold text-muted-foreground">{m.authorName}</p>
        ) : null}

        {m.replyTo ? (
          <button
            type="button"
            onClick={() => onJumpToReply(m.replyTo!.id)}
            className={cn(
              "mb-1 flex w-full max-w-full items-start gap-2 rounded-xl border-l-2 border-primary/60 bg-secondary/70 px-2.5 py-1.5 text-left",
              mine && "border-l-0 border-r-2",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold text-primary">
                {m.replyTo.authorName}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {m.replyTo.body}
              </span>
            </span>
          </button>
        ) : null}

        {editing ? (
          <div className="rounded-3xl border border-border bg-background p-2 text-left">
            <textarea
              ref={editRef}
              value={draft}
              rows={2}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(m.body);
                }
              }}
              className="w-full resize-none rounded-2xl bg-transparent px-2 py-1 text-sm outline-none"
            />
            <div className="flex justify-end gap-2 px-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(m.body);
                }}
                className="text-[11px] text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="text-[11px] font-semibold text-primary"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "animate-pop rounded-3xl text-sm break-words whitespace-pre-wrap",
              hasAttachment || isVoice ? "p-1.5" : "px-4 py-2.5",
              m.deleted
                ? "border border-dashed border-border bg-transparent px-4 py-2.5 text-muted-foreground italic"
                : mine
                  ? "rounded-br-lg bg-primary text-primary-foreground"
                  : "rounded-bl-lg bg-surface text-foreground",
              m.status === "failed" && "opacity-60",
            )}
          >
            {m.deleted ? (
              "This message was deleted"
            ) : isVoice ? (
              <VoiceMessage
                path={m.attachmentUrl!}
                peaks={voiceMeta(m.metadata).peaks}
                durationSeconds={voiceMeta(m.metadata).durationSeconds}
                mine={mine}
              />
            ) : hasAttachment ? (
              <div className="text-left">
                <AttachmentView message={m} onOpenImage={onOpenImage} />
                {m.body ? <p className="px-2.5 pt-2 pb-1">{m.body}</p> : null}
              </div>
            ) : (
              m.body
            )}
          </div>
        )}

        <div
          className={cn("mt-1 flex flex-wrap items-center gap-1.5", mine ? "justify-end" : "justify-start")}
        >
          <span className="text-[11px] text-muted-foreground">{m.time}</span>
          {m.edited ? (
            <span className="text-[11px] text-muted-foreground">edited</span>
          ) : null}
          {m.pinned ? (
            <Pin className="h-3 w-3 text-primary" aria-label="Pinned" />
          ) : null}
          {m.bookmarked ? (
            <BookmarkCheck className="h-3 w-3 text-primary" aria-label="Saved" />
          ) : null}
          {mine && !m.deleted ? (
            <DeliveryTick message={m} delivered={delivered} read={read} />
          ) : null}

          {m.status === "failed" ? (
            <>
              <button onClick={onRetry} className="text-[11px] font-semibold text-primary">
                Retry
              </button>
              <button onClick={onDiscard} className="text-[11px] text-muted-foreground">
                Discard
              </button>
            </>
          ) : null}

          {m.reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onReact(r.emoji, r.mine)}
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[11px]",
                r.mine
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-surface text-muted-foreground",
              )}
              aria-label={`${r.emoji} ${r.count} reaction${r.count > 1 ? "s" : ""}`}
            >
              {r.emoji} {r.count}
            </button>
          ))}

          {actionable ? (
            <>
              <button
                onClick={() => {
                  setPickerOpen((v) => !v);
                  setMenuOpen(false);
                }}
                className="text-muted-foreground/70 opacity-0 transition-opacity group-hover/message:opacity-100 focus:opacity-100 hover:text-primary"
                aria-label="Add reaction"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onReply(m)}
                className="text-muted-foreground/70 opacity-0 transition-opacity group-hover/message:opacity-100 focus:opacity-100 hover:text-primary"
                aria-label="Reply to message"
              >
                <CornerUpLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setMenuOpen((v) => !v);
                  setPickerOpen(false);
                }}
                className="text-muted-foreground/70 opacity-0 transition-opacity group-hover/message:opacity-100 focus:opacity-100 hover:text-foreground"
                aria-label="Message actions"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>

        {pickerOpen ? (
          <div
            className={cn(
              "absolute z-30 mt-1 flex gap-1 rounded-2xl border border-border bg-popover p-1.5 shadow-lg",
              mine ? "right-0" : "left-0",
            )}
          >
            {REACTION_CHOICES.map((emoji) => {
              const existing = m.reactions.find((r) => r.emoji === emoji);
              return (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji, !!existing?.mine);
                    setPickerOpen(false);
                  }}
                  className="rounded-lg px-1.5 py-1 text-base hover:bg-secondary"
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        ) : null}

        {menuOpen ? (
          <div
            className={cn(
              "absolute z-30 mt-1 w-48 overflow-hidden rounded-2xl border border-border bg-popover text-left text-sm shadow-lg",
              mine ? "right-0" : "left-0",
            )}
          >
            <MenuItem
              icon={<CornerUpLeft className="h-4 w-4" />}
              label="Reply"
              onClick={() => {
                onReply(m);
                setMenuOpen(false);
              }}
            />
            {canEdit ? (
              <MenuItem
                icon={<Pencil className="h-4 w-4" />}
                label="Edit"
                onClick={() => {
                  setEditing(true);
                  setMenuOpen(false);
                }}
              />
            ) : null}
            {canPin ? (
              <MenuItem
                icon={m.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                label={m.pinned ? "Unpin" : "Pin to conversation"}
                onClick={() => {
                  onTogglePin();
                  setMenuOpen(false);
                }}
              />
            ) : null}
            <MenuItem
              icon={
                m.bookmarked ? (
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )
              }
              label={m.bookmarked ? "Remove from saved" : "Save message"}
              onClick={() => {
                onToggleBookmark();
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<X className="h-4 w-4" />}
              label="Delete for me"
              destructive
              onClick={() => {
                onDeleteForMe();
                setMenuOpen(false);
              }}
            />
            {mine ? (
              confirmDelete ? (
                <div className="border-t border-border bg-destructive/10 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    Delete for everyone? This can't be undone.
                  </p>
                  <div className="mt-1.5 flex justify-end gap-2">
                    <button
                      className="text-[11px] text-muted-foreground"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="text-[11px] font-semibold text-destructive"
                      onClick={() => {
                        onDeleteForEveryone();
                        setConfirmDelete(false);
                        setMenuOpen(false);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <MenuItem
                  icon={<Trash2 className="h-4 w-4" />}
                  label="Delete for everyone"
                  destructive
                  onClick={() => setConfirmDelete(true)}
                />
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 hover:bg-secondary",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
