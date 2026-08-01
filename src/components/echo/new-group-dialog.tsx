import { useMemo, useState } from "react";
import { Check, Users, X } from "lucide-react";
import { EchoAvatar } from "./avatar";
import { cn } from "@/lib/utils";
import { useCreateGroup, useFriends } from "@/lib/echo-queries";

export function NewGroupDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: ((conversationId: string) => void) | undefined;
}) {
  const { friends, isLoading } = useFriends();
  const create = useCreateGroup();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    if (!q) return friends;
    return friends.filter((f) =>
      (f.profile.displayName + f.profile.username).toLowerCase().includes(q),
    );
  }, [friends, query]);

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setDescription("");
    setQuery("");
    setPicked([]);
    setError(null);
  };

  const submit = async () => {
    const name = title.trim();
    if (!name) {
      setError("Give your group a name.");
      return;
    }
    setError(null);
    try {
      const id = await create.mutateAsync({
        title: name,
        ...(description.trim() ? { description: description.trim() } : {}),
        memberIds: picked,
      });
      reset();
      onClose();
      onCreated?.(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the group.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-surface shadow-soft sm:rounded-3xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">New group</p>
            <p className="text-xs text-muted-foreground">
              {picked.length ? `${picked.length} invited` : "Invite friends by @username"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Group name"
            className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="What's this group about? (optional)"
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search friends"
            className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />

          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading friends…</p>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No friends to invite yet — add someone by @username first.
            </p>
          ) : (
            <ul className="space-y-1">
              {visible.map((f) => {
                const on = picked.includes(f.profile.id);
                return (
                  <li key={f.profile.id}>
                    <button
                      onClick={() =>
                        setPicked((p) =>
                          on ? p.filter((id) => id !== f.profile.id) : [...p, f.profile.id],
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors",
                        on ? "bg-secondary" : "hover:bg-secondary/60",
                      )}
                    >
                      <EchoAvatar
                        initials={f.profile.avatar}
                        color={f.profile.color}
                        avatarUrl={f.profile.avatarUrl}
                        presence={f.profile.presence}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {f.profile.displayName}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {f.profile.username}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "grid h-6 w-6 place-items-center rounded-full border",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-transparent",
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="space-y-2 border-t border-border px-5 py-4">
          {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
          <button
            onClick={() => void submit()}
            disabled={create.isPending || !title.trim()}
            className="h-11 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create group"}
          </button>
        </footer>
      </div>
    </div>
  );
}
