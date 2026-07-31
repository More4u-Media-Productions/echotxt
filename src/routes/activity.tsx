import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, Trash2 } from "lucide-react";
import { AppShell, EmptyState } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import {
  useDeleteNotification,
  useMarkNotifications,
  useNotifications,
} from "@/lib/echo-queries";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Echo notifications" },
      {
        name: "description",
        content: "Mentions, friend requests, group invites and security alerts across your Echo account.",
      },
      { property: "og:title", content: "Activity — Echo" },
      { property: "og:description", content: "Every Echo notification in one calm feed." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const notifications = useNotifications();
  const markAll = useMarkNotifications();
  const remove = useDeleteNotification();
  const items = notifications.data ?? [];
  const unread = items.filter((i) => i.unread).length;

  return (
    <AppShell
      title="Activity"
      subtitle={unread ? `${unread} unread` : "You're all caught up"}
      actions={
        unread ? (
          <button
            onClick={() => markAll.mutate({ all: true })}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold"
          >
            <Check className="h-3.5 w-3.5" /> Mark all read
          </button>
        ) : null
      }
    >
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        {notifications.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading activity…</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nothing new"
            detail="Mentions, friend requests and invites will land here."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5"
              >
                <EchoAvatar
                  initials={item.actor?.avatar ?? "EC"}
                  color={item.actor?.color ?? "oklch(0.63 0.13 195)"}
                  avatarUrl={item.actor?.avatarUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {item.title}
                    {item.unread ? (
                      <span className="ml-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{item.detail}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.time}</p>
                </div>
                <button
                  onClick={() => remove.mutate(item.id)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
                  aria-label="Dismiss notification"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
