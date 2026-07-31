import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail as VoicemailIcon,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import { CallOverlay } from "@/components/echo/call-overlay";
import { calls } from "@/lib/echo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calls")({
  head: () => ({
    meta: [
      { title: "Calls — Echo" },
      {
        name: "description",
        content:
          "HD voice and video calls with call history, screen sharing and built-in voicemail so missed calls never become dead ends.",
      },
      { property: "og:title", content: "Calls — Echo" },
      {
        property: "og:description",
        content: "Incoming, outgoing and missed calls — plus voicemail delivered into the chat.",
      },
    ],
  }),
  component: CallsPage,
});

type Filter = "all" | "missed" | "voicemail";

function CallsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [active, setActive] = useState<null | { name: string; avatar: string; color: string; media: "voice" | "video" }>(null);

  const list = calls.filter((c) =>
    filter === "all" ? true : filter === "missed" ? c.direction === "missed" : !!c.voicemail,
  );

  return (
    <AppShell
      title="Calls"
      subtitle={`${calls.filter((c) => c.direction === "missed").length} missed · 1 new voicemail`}
      actions={
        <button
          onClick={() => toast("Choose someone to call")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          <Phone className="h-4 w-4" />
          <span className="hidden sm:inline">New call</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <div className="flex gap-1.5">
          {(
            [
              ["all", "All"],
              ["missed", "Missed"],
              ["voicemail", "Voicemail"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                filter === key
                  ? "border-primary/40 bg-primary/15 text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={Phone}
            title="No calls here"
            detail="Your call history will appear once you start talking."
          />
        ) : (
          <div className="mt-4 space-y-2.5">
            {list.map((call) => {
              const Icon =
                call.direction === "missed"
                  ? PhoneMissed
                  : call.direction === "incoming"
                    ? PhoneIncoming
                    : PhoneOutgoing;
              return (
                <article
                  key={call.id}
                  className="rounded-3xl border border-border bg-surface p-3.5 shadow-soft"
                >
                  <div className="flex items-center gap-3">
                    <EchoAvatar
                      initials={call.avatar}
                      color={call.color}
                      square={!!call.group}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{call.name}</p>
                      <p
                        className={cn(
                          "flex items-center gap-1.5 text-xs",
                          call.direction === "missed" ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {call.time}
                          {call.duration ? ` · ${call.duration}` : ""}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() =>
                          setActive({
                            name: call.name,
                            avatar: call.avatar,
                            color: call.color,
                            media: "voice",
                          })
                        }
                        className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Voice call"
                      >
                        <Phone className="h-[18px] w-[18px]" />
                      </button>
                      <button
                        onClick={() =>
                          setActive({
                            name: call.name,
                            avatar: call.avatar,
                            color: call.color,
                            media: "video",
                          })
                        }
                        className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Video call"
                      >
                        <Video className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                  </div>

                  {call.voicemail ? (
                    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary/70 p-3">
                      <button
                        onClick={() => toast("Playing voicemail", { description: call.voicemail?.duration })}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
                        aria-label="Play voicemail"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-xs font-medium">
                          <VoicemailIcon className="h-3.5 w-3.5" /> Voicemail ·{" "}
                          {call.voicemail.duration}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          “{call.voicemail.transcript}”
                        </p>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {active ? (
        <CallOverlay
          name={active.name}
          avatar={active.avatar}
          color={active.color}
          media={active.media}
          onClose={() => setActive(null)}
          onVoicemail={() => {
            setActive(null);
            toast("Voicemail delivered to the chat");
          }}
        />
      ) : null}
    </AppShell>
  );
}
