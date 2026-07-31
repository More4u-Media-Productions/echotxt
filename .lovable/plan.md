# Friends & Contacts System for Echo

Build the full friend request and contacts flow on the existing backend. No UI redesign — the current Echo design language (rounded surface cards, pill buttons, tab chips, EmptyState) stays exactly as it is; new screens reuse those same components.

## What I found in the current project

- The `friendships` table exists with `requester_id`, `addressee_id`, `status` (pending / accepted / blocked), `note`, a unique pair constraint and a no-self-friend check. Row Level Security is on and scoped correctly to the two participants.
- **Real-time is not actually enabled.** The app subscribes to changes on `friendships`, `messages` and `notifications`, but the database publication that feeds those subscriptions is empty, so no event is ever delivered. This is why nothing updates live today.
- The Friends screen has three tabs (Friends / Requests / Discover) but merges incoming and sent requests into one list, has no decline-vs-cancel distinction, no block, no user profile preview, and no loading or error states — only empty states.
- Profiles are readable by every signed-in user with no column restriction, so blocked users and private fields are still exposed.

## Database work

1. Turn on real-time delivery for `friendships`, `notifications`, `messages`, `message_reactions` and `conversation_members`, and set replica identity so update events carry the previous row.
2. Extend friend request states: add `declined` to the status type plus a `responded_at` column, so a decline is recorded (and can be re-requested) instead of silently deleted.
3. Add a `blocked_by` column so a block records who initiated it — required to show the right action to each side.
4. Add a security-definer helper `friendship_state(other_user_id)` returning the relationship between the current user and another user, so screens can render the correct button without leaking rows.
5. Add a public-safe profile search function that returns only avatar, display name, username, bio, pronouns and presence — never `privacy_settings`, `last_seen` or e-mail — and excludes anyone in a block relationship with the caller.
6. Tighten the profiles read policy to exclude profiles blocked in either direction, and keep private columns out of the client-readable path.
7. Keep grants explicit for every changed object.

## App logic (`src/lib/echo-queries.ts`)

Replace the current friend hooks with a complete set:

- `useFriends` — accepted relationships
- `useIncomingRequests` / `useSentRequests` — split by direction
- `useSearchProfiles` — username-first search through the safe search function, debounced, with a minimum length
- `useProfilePreview(userId)` — profile plus current relationship state
- Mutations: send, accept, decline, cancel, remove, block, unblock — each writing the matching notification row and invalidating the right caches

All hooks expose loading and error state so the screens can render them.

## Screens

Extend `src/routes/friends.tsx` to four tabs in the existing chip style: **Friends**, **Requests** (incoming), **Sent**, **Add friend** (search). Each row uses the existing card `Row` with actions appropriate to the state.

Add a user profile preview as a sheet opened from any row: avatar, display name, @username, bio, pronouns, presence, and the correct single primary action (Add / Accept / Cancel / Message / Remove / Block).

Every list gets four states in Echo's existing visual language: skeleton rows while loading, the existing `EmptyState` for no friends / no requests / no results, and an inline retry card on error.

## Real-time

Once the publication is enabled, incoming friend requests appear in the Requests tab and Activity feed without a refresh, and an acceptance flips both users to Friends instantly. The existing single `echo-stream` channel is reused — no extra subscriptions.

## Verification

I will run the full flow end to end against the real backend with two browser sessions: user A searches user B by username, sends a request, user B sees it arrive live, accepts, and both then appear in each other's Friends list. I will also check decline, cancel, remove and block, and confirm blocked users disappear from search.
