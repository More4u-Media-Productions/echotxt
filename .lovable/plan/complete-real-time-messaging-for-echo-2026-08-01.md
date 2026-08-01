# Complete real-time messaging for Echo

One objective this session: direct messaging that works end-to-end between two real accounts, verified in the running app. No UI redesign, no mock data, no placeholders.

## What exists today (verified)

- Tables: `conversations`, `conversation_members`, `messages`, `message_reactions`, `message_read_receipts`, `notifications` — all with RLS policies for select/insert/update/delete.
- Realtime publication already covers `messages`, `message_reactions`, `conversation_members`, `friendships`, `notifications`.
- Chats list, conversation view, send box and reactions are wired to Supabase; a single realtime channel invalidates queries.
- Zero conversations and zero messages in the database — nothing has been exercised end-to-end yet.

## Gaps to close

1. **DM uniqueness is not enforced.** `useStartDm` looks for an existing DM in application code only; two simultaneous sends can create duplicate DMs. Nothing creates a conversation when a first message is sent.
2. **No read receipts in the UI.** The `message_read_receipts` table exists but is never written or read, and it is not in the realtime publication. Messages have no sending/sent/delivered/read state.
3. **No typing indicators.**
4. **No message notifications.** New messages don't create `notifications` rows, so Activity and the unread badge don't reflect them.
5. **No optimistic send, no failure handling, no pagination** (fixed 300-message fetch), and Enter/Shift+Enter isn't supported (the composer is a single-line input).
6. **Missing indexes** for message pagination ordering and read-receipt lookups.

## Plan

### 1. Database migration

- Add a canonical `dm_key` column on `conversations` (sorted pair of user ids) with a unique index, so a duplicate DM is impossible at the database level.
- Add a `start_dm(other_user_id)` security-definer function that returns the existing DM or creates one plus both member rows atomically.
- Add a `send_message` path guarantee: message insert stays a plain insert under RLS (sender must be a member), with a trigger that bumps `last_message_at` (already present) and inserts a `notifications` row for every other member.
- Add `message_read_receipts` to the realtime publication with replica identity full.
- Add indexes: `(conversation_id, created_at desc)` on messages, and receipt lookups by message.
- Re-verify all messaging policies: read only conversations you belong to, insert only as yourself into conversations you belong to, edit/delete only your own messages.

### 2. Data layer (`src/lib/echo-queries.ts`)

- `useStartDm` calls the new function instead of doing client-side dedupe.
- Sending into a chat that has no conversation yet creates it first via the same function.
- `useSendMessage` gets optimistic insertion with a temporary id and a `status` field (`sending` → `sent`), rollback plus an error toast on failure, and de-duplication against the realtime echo.
- `useMessages` becomes paginated (newest page first, load-older on scroll to top) with stable merge so realtime inserts don't duplicate rows.
- New hooks: `useReadReceipts` (per conversation), `useMarkRead` extended to write receipt rows for incoming messages, and `useTyping` built on a Supabase Realtime presence/broadcast channel per conversation (ephemeral, no table), auto-clearing after ~3s of inactivity.
- Realtime: keep one shared channel for list-level data, add one per-open-conversation channel for messages/edits/deletes/receipts/typing, torn down on unmount. No polling anywhere.

### 3. UI (existing components only, no redesign)

- `conversation.tsx`: textarea composer with Enter to send and Shift+Enter for newline, auto-grow, multiline rendering; per-message status ticks for own messages (sending / sent / delivered / read) in the existing metadata row; "Typing…" line above the composer; "Load earlier messages" at the top.
- `index.tsx` chats list: already shows avatar, name, last message, timestamp, unread and presence — add the username under the name for DMs and confirm live reorder by latest activity.
- `activity.tsx`: surface the new message notifications.
- Loading, empty, and error states for the message list and send failures.

### 4. Verification before reporting done

- Production build and TypeScript check clean.
- Two real accounts driven in parallel browser sessions: A sends → B receives instantly → B replies → A receives instantly → read receipts flip on both sides → unread counts and chat ordering update without refresh → refresh preserves everything → no duplicate conversations or messages, no console errors.

## Technical notes

- Typing indicators use Realtime broadcast rather than a database table, so they leave no persisted state and need no RLS.
- Delivered vs read: "delivered" is derived from a receipt row existing for the recipient's session; "read" from the receipt's read timestamp set when the conversation is open and focused.
- Pagination uses keyset paging on `(created_at, id)` rather than offset, so new inserts never shift pages.
