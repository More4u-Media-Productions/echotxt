CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

/* ---------------- messages: delete-for-everyone + delete-for-me + bookmarks --------------- */

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.message_hides (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.message_hides TO authenticated;
GRANT ALL ON public.message_hides TO service_role;
ALTER TABLE public.message_hides ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_hides_select ON public.message_hides FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY message_hides_insert ON public.message_hides FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY message_hides_delete ON public.message_hides FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_bookmarks (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.message_bookmarks TO authenticated;
GRANT ALL ON public.message_bookmarks TO service_role;
ALTER TABLE public.message_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_bookmarks_select ON public.message_bookmarks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY message_bookmarks_insert ON public.message_bookmarks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.messages m WHERE m.id = message_bookmarks.message_id AND public.is_member(m.conversation_id, auth.uid())
  ));
CREATE POLICY message_bookmarks_delete ON public.message_bookmarks FOR DELETE TO authenticated USING (user_id = auth.uid());

/* delete for everyone: sender (or a group admin) tombstones the row */
CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(_mid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  msg public.messages;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO msg FROM public.messages WHERE id = _mid;
  IF msg IS NULL THEN RETURN; END IF;
  IF msg.sender_id <> me AND NOT public.is_conversation_admin(msg.conversation_id, me) THEN
    RAISE EXCEPTION 'you can only delete your own messages';
  END IF;

  IF msg.attachment_url IS NOT NULL AND msg.attachment_url <> '' THEN
    DELETE FROM storage.objects WHERE bucket_id = 'chat-media' AND name = msg.attachment_url;
  END IF;

  UPDATE public.messages SET
    deleted_at = now(),
    deleted_by = me,
    body = '',
    metadata = '{}'::jsonb,
    attachment_url = NULL,
    attachment_type = NULL,
    attachment_name = NULL,
    attachment_size = NULL
  WHERE id = _mid;

  DELETE FROM public.message_reactions WHERE message_id = _mid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_message_for_everyone(uuid) TO authenticated;

/* ------------------------------ profiles: status + privacy ------------------------------- */

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_emoji text,
  ADD COLUMN IF NOT EXISTS appear_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS presence_visibility text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS last_seen_visibility text NOT NULL DEFAULT 'everyone';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_presence_visibility_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_presence_visibility_check
  CHECK (presence_visibility IN ('everyone','friends','nobody'));
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_last_seen_visibility_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_last_seen_visibility_check
  CHECK (last_seen_visibility IN ('everyone','friends','nobody'));

CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = _a AND f.addressee_id = _b) OR (f.requester_id = _b AND f.addressee_id = _a))
  );
$$;

/* ------------------------------- notification preferences -------------------------------- */

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  messages_enabled boolean NOT NULL DEFAULT true,
  mentions_enabled boolean NOT NULL DEFAULT true,
  friends_enabled boolean NOT NULL DEFAULT true,
  groups_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_start smallint NOT NULL DEFAULT 22,
  quiet_end smallint NOT NULL DEFAULT 7,
  utc_offset_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_prefs_select ON public.notification_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notification_prefs_insert ON public.notification_prefs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY notification_prefs_update ON public.notification_prefs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notification_prefs_delete ON public.notification_prefs FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_notification_prefs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notification_prefs_touch ON public.notification_prefs;
CREATE TRIGGER notification_prefs_touch BEFORE UPDATE ON public.notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_notification_prefs();

/* --------------------------------- search: indexes --------------------------------------- */

CREATE INDEX IF NOT EXISTS messages_body_trgm_idx ON public.messages USING gin (body extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS messages_attachment_name_trgm_idx ON public.messages USING gin (coalesce(attachment_name,'') extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_kind_idx ON public.messages (kind);
CREATE INDEX IF NOT EXISTS conversations_title_trgm_idx ON public.conversations USING gin (coalesce(title,'') extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_username_trgm_idx ON public.profiles USING gin (username extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_display_name_trgm_idx ON public.profiles USING gin (display_name extensions.gin_trgm_ops);

/* --------------------------------- search: functions ------------------------------------- */

CREATE OR REPLACE FUNCTION public.search_messages(
  _term text,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0,
  _media text DEFAULT NULL,
  _conversation uuid DEFAULT NULL,
  _sender uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  message_id uuid, conversation_id uuid, conversation_kind conversation_kind, conversation_title text,
  conversation_color text, conversation_avatar_url text,
  sender_id uuid, sender_name text, sender_username text, sender_color text, sender_avatar_url text,
  kind message_kind, body text, attachment_url text, attachment_type text, attachment_name text,
  attachment_size bigint, created_at timestamptz, total_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT m.*, c.kind AS c_kind, c.title AS c_title, c.avatar_color AS c_color, c.avatar_url AS c_avatar,
           p.display_name, p.username, p.avatar_color, p.avatar_url AS p_avatar
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    JOIN public.profiles p ON p.id = m.sender_id
    WHERE auth.uid() IS NOT NULL
      AND public.is_member(m.conversation_id, auth.uid())
      AND m.deleted_at IS NULL
      AND m.kind <> 'system'
      AND NOT EXISTS (SELECT 1 FROM public.message_hides h WHERE h.message_id = m.id AND h.user_id = auth.uid())
      AND (_conversation IS NULL OR m.conversation_id = _conversation)
      AND (_sender IS NULL OR m.sender_id = _sender)
      AND (_from IS NULL OR m.created_at >= _from)
      AND (_to IS NULL OR m.created_at <= _to)
      AND (
        _media IS NULL OR _media = 'all'
        OR (_media = 'text' AND m.attachment_url IS NULL)
        OR (_media = 'image' AND coalesce(m.attachment_type,'') ILIKE 'image/%')
        OR (_media = 'video' AND coalesce(m.attachment_type,'') ILIKE 'video/%')
        OR (_media = 'audio' AND (coalesce(m.attachment_type,'') ILIKE 'audio/%' OR m.kind IN ('voice','voicemail')))
        OR (_media = 'file' AND m.attachment_url IS NOT NULL
            AND coalesce(m.attachment_type,'') NOT ILIKE 'image/%'
            AND coalesce(m.attachment_type,'') NOT ILIKE 'video/%'
            AND coalesce(m.attachment_type,'') NOT ILIKE 'audio/%')
      )
      AND (
        btrim(coalesce(_term,'')) = ''
        OR m.body ILIKE '%' || btrim(_term) || '%'
        OR coalesce(m.attachment_name,'') ILIKE '%' || btrim(_term) || '%'
      )
  ), counted AS (SELECT count(*) AS n FROM base)
  SELECT b.id, b.conversation_id, b.c_kind, b.c_title, b.c_color, b.c_avatar,
         b.sender_id, b.display_name, b.username, b.avatar_color, b.p_avatar,
         b.kind, b.body, b.attachment_url, b.attachment_type, b.attachment_name,
         b.attachment_size, b.created_at, counted.n
  FROM base b CROSS JOIN counted
  ORDER BY b.created_at DESC
  LIMIT LEAST(coalesce(_limit, 20), 50) OFFSET greatest(coalesce(_offset, 0), 0);
$$;
GRANT EXECUTE ON FUNCTION public.search_messages(text, integer, integer, text, uuid, uuid, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_conversations(_term text, _limit integer DEFAULT 20)
RETURNS TABLE(
  id uuid, kind conversation_kind, title text, description text, avatar_color text, avatar_url text,
  member_count bigint, last_message_at timestamptz, match_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.kind, c.title, c.description, c.avatar_color, c.avatar_url,
         (SELECT count(*) FROM public.conversation_members m2 WHERE m2.conversation_id = c.id),
         c.last_message_at,
         CASE WHEN coalesce(c.title,'') ILIKE '%' || btrim(coalesce(_term,'')) || '%' THEN 'name' ELSE 'member' END
  FROM public.conversations c
  WHERE auth.uid() IS NOT NULL
    AND c.kind = 'group'
    AND public.is_member(c.id, auth.uid())
    AND (
      btrim(coalesce(_term,'')) = ''
      OR coalesce(c.title,'') ILIKE '%' || btrim(_term) || '%'
      OR EXISTS (
        SELECT 1 FROM public.conversation_members m
        JOIN public.profiles p ON p.id = m.user_id
        WHERE m.conversation_id = c.id
          AND (p.username ILIKE '%' || btrim(_term) || '%' OR p.display_name ILIKE '%' || btrim(_term) || '%')
      )
    )
  ORDER BY c.last_message_at DESC
  LIMIT LEAST(coalesce(_limit, 20), 50);
$$;
GRANT EXECUTE ON FUNCTION public.search_conversations(text, integer) TO authenticated;

/* ------------------- profile RPCs: expose status + privacy-aware presence ---------------- */

DROP FUNCTION IF EXISTS public.public_profile(uuid);
CREATE FUNCTION public.public_profile(_id uuid)
RETURNS TABLE(
  id uuid, username text, display_name text, bio text, pronouns text, avatar_color text,
  avatar_url text, banner_url text, presence presence_state, status_text text, status_emoji text,
  last_seen timestamptz, friendship_id uuid, friendship_status text, incoming boolean, blocked_by uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.username, p.display_name, p.bio, p.pronouns, p.avatar_color,
         p.avatar_url, p.banner_url,
         CASE
           WHEN p.id = auth.uid() THEN p.presence
           WHEN p.appear_offline THEN 'offline'::presence_state
           WHEN p.presence_visibility = 'nobody' THEN 'offline'::presence_state
           WHEN p.presence_visibility = 'friends' AND NOT public.are_friends(auth.uid(), p.id) THEN 'offline'::presence_state
           ELSE p.presence
         END,
         p.status_text, p.status_emoji,
         CASE
           WHEN p.id = auth.uid() THEN p.last_seen
           WHEN p.last_seen_visibility = 'nobody' THEN NULL
           WHEN p.last_seen_visibility = 'friends' AND NOT public.are_friends(auth.uid(), p.id) THEN NULL
           ELSE p.last_seen
         END,
         f.id, f.status::text, f.addressee_id = auth.uid(), f.blocked_by
  FROM public.profiles p
  LEFT JOIN public.friendships f
    ON (f.requester_id = auth.uid() AND f.addressee_id = p.id)
    OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
  WHERE auth.uid() IS NOT NULL AND p.id = _id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.public_profile(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.search_profiles(text, integer);
CREATE FUNCTION public.search_profiles(_term text, _limit integer DEFAULT 20)
RETURNS TABLE(
  id uuid, username text, display_name text, bio text, pronouns text, avatar_color text,
  avatar_url text, banner_url text, presence presence_state, status_text text, status_emoji text,
  friendship_id uuid, friendship_status text, incoming boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.username, p.display_name, p.bio, p.pronouns, p.avatar_color,
         p.avatar_url, p.banner_url,
         CASE
           WHEN p.appear_offline THEN 'offline'::presence_state
           WHEN p.presence_visibility = 'nobody' THEN 'offline'::presence_state
           WHEN p.presence_visibility = 'friends' AND NOT public.are_friends(auth.uid(), p.id) THEN 'offline'::presence_state
           ELSE p.presence
         END,
         p.status_text, p.status_emoji,
         f.id, f.status::text, f.addressee_id = auth.uid()
  FROM public.profiles p
  LEFT JOIN public.friendships f
    ON (f.requester_id = auth.uid() AND f.addressee_id = p.id)
    OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (
      _term IS NULL OR btrim(_term) = ''
      OR p.username ILIKE '%' || btrim(regexp_replace(_term, '^@', '')) || '%'
      OR p.display_name ILIKE '%' || btrim(_term) || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships b
      WHERE b.status = 'blocked'
        AND ((b.requester_id = auth.uid() AND b.addressee_id = p.id)
          OR (b.addressee_id = auth.uid() AND b.requester_id = p.id))
    )
  ORDER BY (p.username ILIKE btrim(regexp_replace(coalesce(_term,''), '^@', '')) || '%') DESC, p.username
  LIMIT LEAST(coalesce(_limit, 20), 50);
$$;
GRANT EXECUTE ON FUNCTION public.search_profiles(text, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.group_members(uuid);
CREATE FUNCTION public.group_members(_cid uuid)
RETURNS TABLE(
  user_id uuid, role text, accepted boolean, joined_at timestamptz, invited_by uuid,
  username text, display_name text, avatar_color text, avatar_url text, presence presence_state,
  status_text text, status_emoji text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.user_id, m.role, m.accepted, m.joined_at, m.invited_by,
         p.username, p.display_name, p.avatar_color, p.avatar_url,
         CASE
           WHEN p.id = auth.uid() THEN p.presence
           WHEN p.appear_offline OR p.presence_visibility = 'nobody' THEN 'offline'::presence_state
           WHEN p.presence_visibility = 'friends' AND NOT public.are_friends(auth.uid(), p.id) THEN 'offline'::presence_state
           ELSE p.presence
         END,
         p.status_text, p.status_emoji
  FROM public.conversation_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.conversation_id = _cid
    AND public.is_member(_cid, auth.uid())
  ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, p.username;
$$;
GRANT EXECUTE ON FUNCTION public.group_members(uuid) TO authenticated;

/* realtime for the new tables so reactions/bookmarks/deletes stream live */
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_bookmarks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_hides;