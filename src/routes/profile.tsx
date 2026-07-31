import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Camera,
  Pencil,
  ShieldCheck,
  Bell,
  Palette,
  HardDrive,
  Smartphone,
  Accessibility,
  LifeBuoy,
  LogOut,
  KeyRound,
  Lock,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import { Switch } from "@/components/ui/switch";
import { devices, me, storageBreakdown } from "@/lib/echo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & Settings — Echo" },
      {
        name: "description",
        content:
          "Your Echo account: avatar, banner, username, status, privacy controls, notifications, devices, storage, appearance and security.",
      },
      { property: "og:title", content: "Profile & Settings — Echo" },
      {
        property: "og:description",
        content: "Granular privacy, device management and account security for your Echo account.",
      },
    ],
  }),
  component: ProfilePage,
});

type Section =
  | "account"
  | "privacy"
  | "security"
  | "notifications"
  | "appearance"
  | "accessibility"
  | "storage"
  | "devices"
  | "help";

const sections: { key: Section; label: string; icon: typeof Bell }[] = [
  { key: "account", label: "Account", icon: Pencil },
  { key: "privacy", label: "Privacy", icon: Lock },
  { key: "security", label: "Security", icon: ShieldCheck },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "accessibility", label: "Accessibility", icon: Accessibility },
  { key: "storage", label: "Storage", icon: HardDrive },
  { key: "devices", label: "Devices", icon: Smartphone },
  { key: "help", label: "Help", icon: LifeBuoy },
];

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-4 py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Card({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-soft">
      <h2 className="border-b border-border px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Choice({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 rounded-full bg-secondary p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function ProfilePage() {
  const [section, setSection] = useState<Section>("account");
  const [privacy, setPrivacy] = useState({
    message: "Friends",
    call: "Friends",
    online: "Friends",
    groups: "Friends",
  });
  const [toggles, setToggles] = useState({
    read: true,
    typing: true,
    lastSeen: false,
    twofa: true,
    e2e: true,
    backups: false,
    msgNotif: true,
    groupNotif: true,
    callNotif: true,
    mentionNotif: true,
    reactionNotif: false,
    motion: false,
    largeText: false,
  });
  const set = (k: keyof typeof toggles) => (v: boolean) => setToggles((t) => ({ ...t, [k]: v }));
  const usedGb = storageBreakdown.reduce((n, s) => n + s.value, 0);

  return (
    <AppShell title="Profile" subtitle={`${me.username} · Echo v1.0`}>
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        <div className="overflow-hidden rounded-4xl border border-border bg-surface shadow-soft">
          <div
            className="relative h-32 sm:h-40"
            style={{
              background:
                "linear-gradient(120deg, oklch(0.63 0.13 195), oklch(0.62 0.13 250), oklch(0.7 0.14 145))",
            }}
          >
            <button
              onClick={() => toast("Banner picker opened")}
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium"
            >
              <Camera className="h-3.5 w-3.5" /> Change banner
            </button>
          </div>
          <div className="px-5 pb-5">
            <div className="-mt-12 flex items-end justify-between gap-3">
              <EchoAvatar
                initials={me.avatar}
                color={me.color}
                size="xl"
                presence={me.presence}
                className="rounded-full ring-4 ring-surface"
              />
              <button
                onClick={() => toast("Edit profile")}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium"
              >
                <Pencil className="h-4 w-4" /> Edit profile
              </button>
            </div>
            <div className="mt-3">
              <h2 className="text-xl font-bold tracking-tight">{me.displayName}</h2>
              <p className="text-sm text-muted-foreground">
                {me.username} · {me.pronouns} · joined {me.joined}
              </p>
              <p className="mt-2 max-w-lg text-sm">{me.bio}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full bg-success" /> Available
                </span>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                  ☕ Making tea
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
          <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors lg:w-full",
                  section === s.key
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <s.icon className="h-4 w-4" /> {s.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 space-y-4">
            {section === "account" && (
              <Card title="Account">
                <Row title="Username" detail="Your identity on Echo — no phone number needed">
                  <span className="text-sm text-muted-foreground">{me.username}</span>
                </Row>
                <Row title="Display name" detail="Shown in chats and calls">
                  <span className="text-sm text-muted-foreground">{me.displayName}</span>
                </Row>
                <Row title="Email" detail="Verified">
                  <span className="inline-flex items-center gap-1 text-sm text-success">
                    <Check className="h-3.5 w-3.5" /> sky@echo.app
                  </span>
                </Row>
                <Row title="Linked sign-in" detail="Google · Apple">
                  <button
                    onClick={() => toast("Manage sign-in methods")}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium"
                  >
                    Manage
                  </button>
                </Row>
                <Row title="Sign out" detail="You'll stay signed in on other devices">
                  <button
                    onClick={() => toast("Signed out")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-destructive"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </Row>
              </Card>
            )}

            {section === "privacy" && (
              <Card title="Privacy">
                <Row title="Who can message me">
                  <Choice
                    options={["Everyone", "Friends"]}
                    value={privacy.message}
                    onChange={(v) => setPrivacy((p) => ({ ...p, message: v }))}
                  />
                </Row>
                <Row title="Who can call me">
                  <Choice
                    options={["Everyone", "Friends"]}
                    value={privacy.call}
                    onChange={(v) => setPrivacy((p) => ({ ...p, call: v }))}
                  />
                </Row>
                <Row title="Who can see my online status">
                  <Choice
                    options={["Everyone", "Friends", "Nobody"]}
                    value={privacy.online}
                    onChange={(v) => setPrivacy((p) => ({ ...p, online: v }))}
                  />
                </Row>
                <Row title="Who can add me to groups">
                  <Choice
                    options={["Everyone", "Friends"]}
                    value={privacy.groups}
                    onChange={(v) => setPrivacy((p) => ({ ...p, groups: v }))}
                  />
                </Row>
                <Row title="Read receipts" detail="Others see when you've read a message">
                  <Switch checked={toggles.read} onCheckedChange={set("read")} />
                </Row>
                <Row title="Typing indicators">
                  <Switch checked={toggles.typing} onCheckedChange={set("typing")} />
                </Row>
                <Row title="Show last seen">
                  <Switch checked={toggles.lastSeen} onCheckedChange={set("lastSeen")} />
                </Row>
              </Card>
            )}

            {section === "security" && (
              <Card title="Security">
                <Row title="Two-factor authentication" detail="Authenticator app enabled">
                  <Switch checked={toggles.twofa} onCheckedChange={set("twofa")} />
                </Row>
                <Row title="End-to-end encryption for DMs" detail="On by default for new chats">
                  <Switch checked={toggles.e2e} onCheckedChange={set("e2e")} />
                </Row>
                <Row title="Encrypted backups" detail="Backups are unreadable without your key">
                  <Switch checked={toggles.backups} onCheckedChange={set("backups")} />
                </Row>
                <Row title="Login history" detail="Last sign-in: today, Lisbon PT">
                  <button
                    onClick={() => toast("Login history opened")}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium"
                  >
                    View
                  </button>
                </Row>
                <Row title="Change password">
                  <button
                    onClick={() => toast("Password reset email sent")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Update
                  </button>
                </Row>
              </Card>
            )}

            {section === "notifications" && (
              <Card title="Notifications">
                <Row title="Friend messages">
                  <Switch checked={toggles.msgNotif} onCheckedChange={set("msgNotif")} />
                </Row>
                <Row title="Group messages" detail="Only mentions when muted">
                  <Switch checked={toggles.groupNotif} onCheckedChange={set("groupNotif")} />
                </Row>
                <Row title="Calls & voicemail">
                  <Switch checked={toggles.callNotif} onCheckedChange={set("callNotif")} />
                </Row>
                <Row title="Mentions">
                  <Switch checked={toggles.mentionNotif} onCheckedChange={set("mentionNotif")} />
                </Row>
                <Row title="Reactions">
                  <Switch checked={toggles.reactionNotif} onCheckedChange={set("reactionNotif")} />
                </Row>
              </Card>
            )}

            {section === "appearance" && (
              <Card title="Appearance">
                <Row title="Theme" detail="Use the toggle in the sidebar to switch instantly">
                  <span className="text-sm text-muted-foreground">Light · Dark</span>
                </Row>
                <Row title="Chat bubble style">
                  <Choice options={["Rounded", "Compact"]} value="Rounded" onChange={() => toast("Style updated")} />
                </Row>
                <Row title="Accent color">
                  <div className="flex gap-1.5">
                    {["oklch(0.63 0.13 195)", "oklch(0.7 0.14 145)", "oklch(0.72 0.13 85)", "oklch(0.68 0.15 25)"].map(
                      (c) => (
                        <button
                          key={c}
                          onClick={() => toast("Accent updated")}
                          className="h-6 w-6 rounded-full ring-2 ring-transparent hover:ring-ring"
                          style={{ background: c }}
                          aria-label="Accent color"
                        />
                      ),
                    )}
                  </div>
                </Row>
              </Card>
            )}

            {section === "accessibility" && (
              <Card title="Accessibility">
                <Row title="Reduce motion">
                  <Switch checked={toggles.motion} onCheckedChange={set("motion")} />
                </Row>
                <Row title="Larger text">
                  <Switch checked={toggles.largeText} onCheckedChange={set("largeText")} />
                </Row>
                <Row title="Voice message transcripts" detail="Automatic, on-device">
                  <Switch checked onCheckedChange={() => toast("Transcripts stay on")} />
                </Row>
              </Card>
            )}

            {section === "storage" && (
              <Card title="Storage">
                <div className="px-4 py-4">
                  <p className="text-sm font-medium">{usedGb.toFixed(1)} GB used on this device</p>
                  <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-secondary">
                    {storageBreakdown.map((s) => (
                      <span
                        key={s.label}
                        style={{ width: `${(s.value / usedGb) * 100}%`, background: s.tone }}
                      />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {storageBreakdown.map((s) => (
                      <li key={s.label} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.tone }} />
                        <span className="flex-1">{s.label}</span>
                        <span className="text-muted-foreground">{s.value} GB</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Row title="Clear cached media" detail="Files stay available in the cloud">
                  <button
                    onClick={() => toast("Cache cleared")}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium"
                  >
                    Clear
                  </button>
                </Row>
              </Card>
            )}

            {section === "devices" && (
              <Card title="Devices">
                {devices.map((d) => (
                  <Row key={d.id} title={d.name} detail={`${d.detail} · ${d.last}`}>
                    {d.active ? (
                      <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <button
                        onClick={() => toast(`${d.name} signed out`)}
                        className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-destructive"
                      >
                        Sign out
                      </button>
                    )}
                  </Row>
                ))}
              </Card>
            )}

            {section === "help" && (
              <Card title="Help">
                <Row title="Help center" detail="Guides, troubleshooting and shortcuts">
                  <button
                    onClick={() => toast("Help center opened")}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium"
                  >
                    Open
                  </button>
                </Row>
                <Row title="Report a problem">
                  <button
                    onClick={() => toast("Report form opened")}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium"
                  >
                    Report
                  </button>
                </Row>
                <Row title="Echo v1.0" detail="Made for conversations, not feeds" />
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
