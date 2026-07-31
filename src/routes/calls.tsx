import { createFileRoute } from "@tanstack/react-router";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react";
import { AppShell, EmptyState } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import { useCalls } from "@/lib/echo-queries";
import { formatDuration } from "@/lib/echo-data";

export const Route = createFileRoute("/calls")({
  head: () => ({
    meta: [
      { title: "Calls — Echo voice & video history" },
      {
        name: "description",
        content: "Your Echo voice and video call history, including missed calls and voicemail.",
      },
      { property: "og:title", content: "Calls — Echo" },
      { property: "og:description", content: "Voice, video and voicemail history on Echo." },
    ],
  }),
  component: CallsPage,
});

function CallsPage() {
  const calls = useCalls();
  const items = calls.data ?? [];

  return (
    <AppShell title="Calls" subtitle={`${items.length} recent`}>
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        {calls.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading calls…</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Phone}
            title="No calls yet"
            detail="Start a voice or video call from any conversation and it will show up here."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((call) => {
              const Icon =
                call.direction === "missed"
                  ? PhoneMissed
                  : call.direction === "outgoing"
                    ? PhoneOutgoing
                    : PhoneIncoming;
              return (
                <li
                  key={call.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
                >
                  <EchoAvatar initials={call.avatar} color={call.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{call.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon
                        className={
                          call.direction === "missed" ? "h-3.5 w-3.5 text-danger" : "h-3.5 w-3.5"
                        }
                      />
                      {call.status}
                      {call.durationSeconds ? ` · ${formatDuration(call.durationSeconds)}` : ""} ·{" "}
                      {call.time}
                    </p>
                    {call.voicemail ? (
                      <p className="mt-1 rounded-xl bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground">
                        Voicemail: {call.voicemail}
                      </p>
                    ) : null}
                  </div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                    {call.media === "video" ? (
                      <Video className="h-4 w-4" />
                    ) : (
                      <Phone className="h-4 w-4" />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
