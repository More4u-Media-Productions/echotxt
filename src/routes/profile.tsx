import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/session";
import { useUpdateProfile } from "@/lib/echo-queries";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & settings — Echo" },
      {
        name: "description",
        content: "Manage your Echo @username, display name, bio, presence and account settings.",
      },
      { property: "og:title", content: "Profile & settings — Echo" },
      { property: "og:description", content: "Your Echo identity and privacy controls." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const profile = useMyProfile();
  const update = useUpdateProfile();
  const me = profile.data;
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName);
      setUsername(me.username.replace(/^@/, ""));
      setBio(me.bio ?? "");
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { display_name: displayName.trim(), username: username.trim().toLowerCase(), bio },
      {
        onSuccess: () => toast.success("Profile updated"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not save profile"),
      },
    );
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <AppShell title="Profile" subtitle={me?.username ?? ""}>
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-5">
          <EchoAvatar
            initials={me?.avatar ?? "…"}
            color={me?.color ?? "oklch(0.63 0.13 195)"}
            avatarUrl={me?.avatarUrl}
            presence={me?.presence ?? "online"}
            size="lg"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{me?.displayName ?? "Your profile"}</p>
            <p className="truncate text-sm text-muted-foreground">{me?.username}</p>
            {me?.bio ? <p className="mt-1 text-sm text-muted-foreground">{me.bio}</p> : null}
          </div>
        </div>

        <form onSubmit={save} className="space-y-3 rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Account</h2>
          <label className="block text-xs font-medium text-muted-foreground">
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              className="mt-1 h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/50"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
              className="mt-1 h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/50"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={3}
              className="mt-1 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/50"
            />
          </label>
          <button
            type="submit"
            disabled={update.isPending}
            className="h-11 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </form>

        <button
          onClick={signOut}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-sm font-semibold text-danger"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </AppShell>
  );
}
