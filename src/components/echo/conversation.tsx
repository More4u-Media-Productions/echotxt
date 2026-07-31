import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  File as FileIcon,
  ImageIcon,
  Info,
  Mic,
  Paperclip,
  Phone,
  Pin,
  Play,
  Plus,
  Reply,
  Send,
  Smile,
  Video,
  Voicemail as VoicemailIcon,
  CalendarDays,
  MoreVertical,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EchoAvatar } from "./avatar";
import { authorOf, type EchoChat, type EchoMessage } from "@/lib/echo-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CallOverlay } from "./call-overlay";

const EMOJI = ["😀", "😅", "🥲", "😍", "🤔", "🙌", "🔥", "🎯", "❤️", "👀", "🎉", "☕"];

function Waveform({ active }: { active?: boolean }) {
  const bars = [6, 12, 18, 10, 22, 14, 8, 16, 24, 12, 7, 18, 11, 20, 9];
  return (
    <span className="flex h-6 items-end gap-[3px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full", active ? "bg-current" : "bg-current/45")}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

function Bubble({ message, group }: { message: EchoMessage; group: boolean }) {
  const author = authorOf(message.authorId);
  const mine = message.authorId === "me";
  const [reactions, setReactions] = useState(message.reactions ?? []);

  const react = (emoji: string) => {
    setReactions((prev) => {
      const found = prev.find((r) => r.emoji === emoji);
      if (found)
        return prev.map((r) =>
          r.emoji === emoji
            ? { ...r, mine: !r.mine, count: r.mine ? r.count - 1 : r.count + 1 }
            : r,
        );
      return [...prev, { emoji, count: 1, mine: true }];
    });
  };

  return (
    <div className={cn("flex w-full gap-2.5", mine ? "justify-end" : "justify-start")}>
      {!mine ? (
        <EchoAvatar initials={author.avatar} color={author.color} size="sm" className="mt-auto" />
      ) : null}
      <div className={cn("flex max-w-[78%] flex-col gap-1 sm:max-w-[62%]", mine && "items-end")}>
        {!mine && group ? (
          <span className="px-1 text-xs font-semibold" style={{ color: author.color }}>
            {author.displayName}
          </span>
        ) : null}

        <div
          className={cn(
            "animate-pop group relative rounded-3xl px-4 py-2.5 text-sm shadow-soft",
            mine
              ? "rounded-br-lg bg-bubble-out text-bubble-out-foreground"
              : "rounded-bl-lg bg-bubble-in text-bubble-in-foreground",
          )}
        >
          {message.pinned ? (
            <span className="mb-1.5 flex items-center gap-1 text-[11px] opacity-75">
              <Pin className="h-3 w-3" /> Pinned
            </span>
          ) : null}

          {message.replyTo ? (
            <span className="mb-2 block rounded-xl border-l-2 border-current/40 bg-current/10 px-2.5 py-1.5 text-[12px] opacity-80">
              <span className="block font-semibold">{message.replyTo.author}</span>
              <span className="line-clamp-1">{message.replyTo.body}</span>
            </span>
          ) : null}

          {message.kind === "text" ? <p className="leading-relaxed">{message.body}</p> : null}

          {message.kind === "image" ? (
            <div className="space-y-2">
              <div className="grid h-44 w-64 max-w-full place-items-center rounded-2xl bg-current/12">
                <ImageIcon className="h-7 w-7 opacity-60" />
              </div>
              <p className="text-[13px]">{message.body}</p>
            </div>
          ) : null}

          {message.kind === "file" ? (
            <div className="flex items-center gap-3 py-0.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-current/15">
                <FileIcon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{message.attachment?.name}</span>
                <span className="block text-[11px] opacity-75">{message.attachment?.meta}</span>
              </span>
            </div>
          ) : null}

          {message.kind === "event" ? (
            <div className="flex items-center gap-3 py-0.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-current/15">
                <CalendarDays className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{message.body}</span>
                <span className="block text-[11px] opacity-80">{message.attachment?.name}</span>
                <span className="block text-[11px] opacity-70">{message.attachment?.meta}</span>
              </span>
            </div>
          ) : null}

          {message.kind === "voice" || message.kind === "voicemail" ? (
            <div className="min-w-[220px] space-y-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toast("Playing audio", { description: message.duration })}
                  className="grid h-9 w-9 place-items-center rounded-full bg-current/18"
                  aria-label="Play"
                >
                  {message.kind === "voicemail" ? (
                    <VoicemailIcon className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
                <Waveform />
                <span className="text-[11px] opacity-80">{message.duration}</span>
              </div>
              {message.transcript ? (
                <p className="rounded-xl bg-current/10 px-2.5 py-1.5 text-[12px] opacity-90">
                  “{message.transcript}”
                </p>
              ) : null}
            </div>
          ) : null}

          {message.kind === "poll" && message.poll ? (
            <div className="min-w-[260px] space-y-2.5">
              <p className="font-semibold">{message.poll.question}</p>
              {message.poll.options.map((opt) => {
                const pct = Math.round((opt.votes / message.poll!.total) * 100);
                return (
                  <button
                    key={opt.label}
                    onClick={() => toast("Vote recorded", { description: opt.label })}
                    className="block w-full overflow-hidden rounded-xl bg-current/12 text-left"
                  >
                    <span className="relative block px-3 py-2">
                      <span
                        className="absolute inset-y-0 left-0 bg-current/15"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative flex justify-between text-[13px]">
                        <span>{opt.label}</span>
                        <span className="opacity-80">{pct}%</span>
                      </span>
                    </span>
                  </button>
                );
              })}
              <p className="text-[11px] opacity-75">{message.poll.total} votes · tap to vote</p>
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] opacity-75">
            {message.edited ? <span>edited</span> : null}
            <span>{message.time}</span>
            {mine && message.status ? (
              message.status === "read" ? (
                <CheckCheck className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )
            ) : null}
          </div>

          <div
            className={cn(
              "absolute -top-3 hidden gap-1 rounded-full border border-border bg-popover px-1.5 py-1 shadow-lift group-hover:flex",
              mine ? "right-2" : "left-2",
            )}
          >
            {["❤️", "😂", "🔥"].map((e) => (
              <button
                key={e}
                onClick={() => react(e)}
                className="text-[13px] transition-transform hover:scale-125"
              >
                {e}
              </button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align={mine ? "end" : "start"}>
                <DropdownMenuItem onClick={() => toast("Reply drafted")}>
                  <Reply className="h-4 w-4" /> Reply
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("Copied to clipboard")}>
                  Copy text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("Message forwarded")}>
                  Forward
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("Pinned to conversation")}>
                  <Pin className="h-4 w-4" /> Pin
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("Delivered 18:04 · Read 18:05")}>
                  <Info className="h-4 w-4" /> Message info
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => toast("Deleted for everyone")}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {reactions.length ? (
          <div className="flex gap-1 px-1">
            {reactions
              .filter((r) => r.count > 0)
              .map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => react(r.emoji)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                    r.mine
                      ? "border-primary/50 bg-primary/15 text-foreground"
                      : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {r.emoji} {r.count}
                </button>
              ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Conversation({ chat, onBack }: { chat: EchoChat; onBack?: () => void }) {
  const [messages, setMessages] = useState<EchoMessage[]>(chat.messages);
  const [text, setText] = useState(chat.draft ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [call, setCall] = useState<null | "voice" | "video">(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(chat.messages);
    setText(chat.draft ?? "");
  }, [chat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        authorId: "me",
        kind: "text",
        body: value,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: "sent",
      },
    ]);
    setText("");
  };

  const sendVoice = () => {
    setRecording(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `voice-${Date.now()}`,
        authorId: "me",
        kind: "voice",
        body: "Voice message",
        duration: "0:12",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: "sent",
        transcript: "Sent from the road — details tonight.",
      },
    ]);
    toast("Voice message sent");
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-border px-3 py-3 sm:px-5">
        {onBack ? (
          <button
            onClick={onBack}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-secondary lg:hidden"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <EchoAvatar
          initials={chat.avatar}
          color={chat.color}
          presence={chat.presence}
          square={chat.kind === "group"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{chat.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {chat.typing ? (
              <span className="inline-flex items-center gap-1 text-primary">
                typing
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="typing-dot h-1 w-1 rounded-full bg-primary"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              </span>
            ) : chat.kind === "group" ? (
              `${chat.members} members · ${chat.description ?? ""}`
            ) : chat.presence === "online" ? (
              "Online"
            ) : (
              `Last seen ${chat.lastActivity}`
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setCall("voice")}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Voice call"
          >
            <Phone className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={() => setCall("video")}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Video call"
          >
            <Video className="h-[18px] w-[18px]" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
              <MoreVertical className="h-[18px] w-[18px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => toast("Opened shared media")}>
                Shared media
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast("Opened shared files")}>
                Shared files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast("Poll composer opened")}>
                Create poll
              </DropdownMenuItem>
              {chat.kind === "group" ? (
                <>
                  <DropdownMenuItem onClick={() => toast("Invite link copied")}>
                    Copy invite link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast("QR invite ready")}>
                    Show QR invite
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast("Event composer opened")}>
                    Schedule event
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => toast(chat.muted ? "Unmuted" : "Muted")}>
                {chat.muted ? "Unmute" : "Mute"} notifications
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast("Conversation archived")}>
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => toast("Reported")}>
                Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-6">
        <p className="text-center text-[11px] font-medium text-muted-foreground">
          {chat.kind === "dm" ? "Messages are end-to-end encrypted" : "Group created · March 2026"}
        </p>
        {messages.map((m) => (
          <Bubble key={m.id} message={m} group={chat.kind === "group"} />
        ))}
        {chat.typing ? (
          <div className="flex items-center gap-2 pl-1">
            <EchoAvatar initials={chat.avatar} color={chat.color} size="sm" />
            <span className="flex gap-1 rounded-3xl rounded-bl-lg bg-bubble-in px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border bg-surface/70 px-3 py-3 sm:px-5">
        {emojiOpen ? (
          <div className="animate-pop mb-2 flex flex-wrap gap-1.5 rounded-2xl border border-border bg-popover p-2.5">
            {EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => setText((t) => t + e)}
                className="grid h-9 w-9 place-items-center rounded-xl text-lg hover:bg-secondary"
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}

        {recording ? (
          <div className="animate-pop flex items-center gap-3 rounded-3xl border border-destructive/40 bg-destructive/10 px-4 py-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
            <span className="text-sm font-medium">Recording… 0:12</span>
            <Waveform active />
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setRecording(false)}
                className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={sendVoice}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground">
                <Plus className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => toast("Photo library opened")}>
                  <ImageIcon className="h-4 w-4" /> Photos & video
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("File picker opened")}>
                  <Paperclip className="h-4 w-4" /> Document
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("Camera opened")}>
                  <Camera className="h-4 w-4" /> Camera
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("GIF search opened")}>GIF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("Sticker pack opened")}>
                  Sticker
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast("Poll composer opened")}>
                  Poll
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex min-w-0 flex-1 items-end gap-1 rounded-3xl border border-border bg-surface px-2 py-1.5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={`Message ${chat.name}`}
                className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => setEmojiOpen((o) => !o)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Emoji"
              >
                <Smile className="h-[18px] w-[18px]" />
              </button>
            </div>

            {text.trim() ? (
              <button
                onClick={send}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition-transform hover:scale-105"
                aria-label="Send"
              >
                <Send className="h-[18px] w-[18px]" />
              </button>
            ) : (
              <button
                onClick={() => setRecording(true)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
                aria-label="Record voice message"
              >
                <Mic className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        )}
      </div>

      {call ? (
        <CallOverlay
          name={chat.name}
          avatar={chat.avatar}
          color={chat.color}
          media={call}
          onClose={() => setCall(null)}
          onVoicemail={() => {
            setCall(null);
            setMessages((prev) => [
              ...prev,
              {
                id: `vm-${Date.now()}`,
                authorId: "me",
                kind: "voicemail",
                body: "Voicemail",
                duration: "0:18",
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                transcript: "Tried to reach you — call back when you can.",
                status: "sent",
              },
            ]);
            toast("Voicemail delivered to the chat");
          }}
        />
      ) : null}
    </section>
  );
}
