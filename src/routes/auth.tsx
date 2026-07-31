import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to Echo — private username messaging" },
      {
        name: "description",
        content:
          "Sign in or create your Echo account with an email or Google. No phone number required — just your @username.",
      },
      { property: "og:title", content: "Sign in to Echo" },
      {
        property: "og:description",
        content: "Private messaging with usernames instead of phone numbers.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const clean = username.trim().toLowerCase().replace(/^@/, "");
        if (!/^[a-z0-9_.]{3,24}$/.test(clean)) {
          toast.error("Usernames use 3–24 lowercase letters, numbers, dots or underscores");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: clean, display_name: displayName.trim() || clean },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          toast.success("Check your email to confirm your Echo account");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-in failed");
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="text-2xl font-bold tracking-tight">Echo</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private messaging with @usernames — never a phone number.
        </p>

        {sent ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-4 text-sm">
            We sent a confirmation link to <span className="font-semibold">{email}</span>. Open it to
            finish setting up Echo.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "signup" ? (
              <>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  maxLength={60}
                  className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@username"
                  maxLength={25}
                  required
                  className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                />
              </>
            ) : null}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              maxLength={255}
              placeholder="Email"
              className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={8}
              placeholder="Password"
              className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={google}
          className="h-11 w-full rounded-2xl border border-border bg-surface text-sm font-semibold transition-colors hover:bg-secondary"
        >
          Continue with Google
        </button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New to Echo?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setSent(false);
            }}
            className="font-semibold text-primary"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
