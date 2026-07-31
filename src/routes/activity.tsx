import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  UserPlus,
  AtSign,
  Voicemail as VoicemailIcon,
  PhoneMissed,
  BarChart3,
  ShieldAlert,
  Users,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import { activity, type ActivityItem } from "@/lib/echo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Echo" },
      {
        name: "description",
        content:
          "One feed for friend requests, mentions, group invites, missed calls, voicemails, poll results and security alerts.",
      },
      { property: "og:title", content: "Activity — Echo" },
      {
        property: "og:description",
        content: "Everything important on Echo, in one calm, filterable feed.",
      },
    ],
  }),
  component: ActivityPage,
});

const icons: Record<ActivityItem["type"], typeof Bell> = {
  friend_request: UserPlus,
  mention: AtSign,
  group_invite: Users,
  missed_call: PhoneMissed,
  voicemail: VoicemailIcon,
  poll: BarChart3,
  security: ShieldAlert,
};

type Filter = "all" | "unread" | "mentions" | "calls" | "security";

function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState(activity);

  const list = items.filter((i) => {
    if (filter === "all") return true;
    if (filter === "unread") return i.unread;
    if (filter === "mentions") return i.type === "mention";
    if (filter === "calls") return i.type === "missed_call" || i.type === "voicemail";
    return i.type === "security";
  });

  return (
    <AppShell
      title="Activity"
      subtitle={`${items.filter((i) => i.unread).length} new notifications`}
      actions={
        <button
          onClick={() => {
            setItems((p) => p.map((i) => ({ ...i, unread: false })));
            toast("All caught up");
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium"
        >
          <CheckCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Mark all read</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["mentions", "Mentions"],
              ["calls", "Calls & voicemail"],
              ["security", "Security"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
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
            icon={Bell}
            title="Nothing new"
            detail="Mentions, requests, voicemails and security alerts will land here."
          />
        ) : (
          <div className="mt-4 space-y-2.5">
            {list.map((item) => {
              const Icon = icons[item.type];
              return (
                <article
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 rounded-3xl border p-4 transition-colors",
                    item.unread
                      ? "border-primary/30 bg-primary/8 shadow-soft"
                      : "border-border bg-surface",
                  )}
                >
                  <EchoAvatar
                    initials={item.actor ?? "EC"}
                    color={item.color ?? "oklch(0.63 0.13 195)"}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                    {item.type === "friend_request" ? (
                      <div className="mt-2.5 flex gap-2">
                        <button
                          onClick={() => {
                            setItems((p) => p.filter((x) => x.id !== item.id));
                            toast("Friend request accepted");
                          }}
                          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => {
                            setItems((p) => p.filter((x) => x.id !== item.id));
                            toast("Request declined");
                          }}
                          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium"
                        >
                          Decline
                        </button>
                      </div>
                    ) : null}
                    {item.type === "group_invite" ? (
                      <div className="mt-2.5 flex gap-2">
                        <button
                          onClick={() => toast("Joined Darkroom Sundays")}
                          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          Join group
                        </button>
                        <button
                          onClick={() => toast("Invite dismissed")}
                          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium"
                        >
                          Ignore
                        </button>
                      </div>
                    ) : null}
                    {item.type === "voicemail" ? (
                      <button
                        onClick={() => toast("Playing voicemail")}
                        className="mt-2.5 rounded-full border border-border px-4 py-1.5 text-xs font-medium"
                      >
                        Play voicemail
                      </button>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{item.time}</span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
