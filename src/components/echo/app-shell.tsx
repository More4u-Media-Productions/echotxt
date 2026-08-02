import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  MessageCircle,
  Users,
  Phone,
  Bell,
  User,
  Search,
  Settings,
  Moon,
  Sun,
  AlertCircle,
  RefreshCw,
  LogIn,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { GlobalSearch } from "./global-search";
import { cn } from "@/lib/utils";
import { EchoAvatar } from "./avatar";
import { useMyProfile, useSession } from "@/lib/session";
import { linkPushUser, unlinkPushUser } from "@/lib/onesignal";

import { useChats, useEchoRealtime, useFriendships, useNotifications } from "@/lib/echo-queries";

function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
  contentClassName,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  contentClassName?: string | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const { session, loading, error, online, retry } = useSession();
  const profile = useMyProfile();
  const chats = useChats();
  const friends = useFriendships();
  const notifications = useNotifications();
  useEchoRealtime();

  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const sessionUserId = session?.user.id ?? null;
  useEffect(() => {
    if (sessionUserId) linkPushUser(sessionUserId);
    else unlinkPushUser();
  }, [sessionUserId]);

  useEffect(() => {
    if (!loading && !session && !error) void navigate({ to: "/auth", replace: true });
  }, [loading, session, error, navigate]);


  if (loading && !error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-10 w-10 animate-spin place-items-center rounded-2xl bg-primary/10 text-primary">
            <RefreshCw className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium">Loading Echo…</span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 text-center shadow-soft">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-destructive/10 text-destructive">
            {online ? <AlertCircle className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
          </span>
          <h1 className="mt-4 text-lg font-bold tracking-tight">
            {online ? "Couldn't start Echo" : "You're offline"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error?.message ?? "Your session couldn't be loaded. Try signing in again."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={retry}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
            <button
              onClick={() => void navigate({ to: "/auth", replace: true })}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <LogIn className="h-4 w-4" /> Go to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  const unreadChats = (chats.data ?? []).reduce((n, c) => n + (c.archived ? 0 : c.unread), 0);
  const pendingFriends = (friends.data ?? []).filter(
    (f) => f.status === "pending" && f.incoming,
  ).length;
  const unreadActivity = (notifications.data ?? []).filter((n) => n.unread).length;

  const tabs = [
    { to: "/", label: "Chats", icon: MessageCircle, badge: unreadChats },
    { to: "/friends", label: "Friends", icon: Users, badge: pendingFriends },
    { to: "/calls", label: "Calls", icon: Phone, badge: 0 },
    { to: "/activity", label: "Activity", icon: Bell, badge: unreadActivity },
    { to: "/profile", label: "Profile", icon: User, badge: 0 },
  ] as const;

  const me = profile.data;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-sidebar px-4 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <MessageCircle className="h-4.5 w-4.5" />
          </span>
          <span className="text-lg font-bold tracking-tight">Echo</span>
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {tabs.map((tab) => {
            const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                <tab.icon
                  className={cn("h-[18px] w-[18px] shrink-0", active && "text-sidebar-primary")}
                />
                <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                {tab.badge ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    {tab.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2">
          <button
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
          >
            {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          <Link
            to="/profile"
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5"
          >
            <EchoAvatar
              initials={me?.avatar ?? "…"}
              color={me?.color ?? "oklch(0.63 0.13 195)"}
              avatarUrl={me?.avatarUrl}
              presence={me?.presence ?? "online"}
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {me?.displayName ?? "Your profile"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {me?.username ?? ""}
              </span>
            </span>
            <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-[68px] lg:pb-0">
        <header className="glass sticky top-0 z-30 border-b border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
              {subtitle ? (
                <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {actions}
              <button
                onClick={() => setSearchOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Search Echo"
                title="Search (Ctrl/Cmd + K)"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={toggle}
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
                aria-label="Toggle theme"
              >
                {dark ? (
                  <Sun className="h-[18px] w-[18px]" />
                ) : (
                  <Moon className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
          </div>
        </header>

        <main className={cn("min-w-0 flex-1", contentClassName)}>{children}</main>
      </div>

      <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((tab) => {
            const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <tab.icon className="h-[21px] w-[21px]" />
                  {tab.badge ? (
                    <span className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {tab.badge}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-border bg-surface pr-4 pl-10 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/50"
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: typeof Search;
  title: string;
  detail: string;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-3xl bg-secondary text-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
