-- 1. Canonical DM pair key
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS dm_key text;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_dm_key_uidx ON public.conversations (dm_key) WHERE dm_key IS NOT NULL;

-- 2. Start-or-reuse a DM atomically
CREATE OR REPLACE FUNCTION public.start_dm(_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  key text;
  cid uuid;
  are_friends boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _other IS NULL OR _other = me THEN RAISE EXCEPTION 'invalid recipient'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _other) THEN
    RAISE EXCEPTION 'recipient not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'blocked'
      AND ((f.requester_id = me AND f.addressee_id = _other)
        OR (f.addressee_id = me AND f.requester_id = _other))
  ) THEN
    RAISE EXCEPTION 'conversation unavailable';
  END IF;

  key := least(me::text, _other::text) || ':' || greatest(me::text, _other::text);

  SELECT id INTO cid FROM public.conversations WHERE dm_key = key;
  IF cid IS NOT NULL THEN RETURN cid; END IF;

  are_friends := EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = me AND f.addressee_id = _other)
        OR (f.addressee_id = me AND f.requester_id = _other))
  );

  INSERT INTO public.conversations (kind, created_by, dm_key)
  VALUES ('dm', me, key)
  ON CONFLICT (dm_key) DO NOTHING
  RETURNING id INTO cid;

  IF cid IS NULL THEN
    SELECT id INTO cid FROM public.conversations WHERE dm_key = key;
    RETURN cid;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role, accepted)
  VALUES (cid, me, 'owner', true), (cid, _other, 'member', are_friends)
  ON CONFLICT DO NOTHING;

  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.start_dm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_dm(uuid) TO authenticated;

-- 3. Notify other members on new message
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
BEGIN
  SELECT coalesce(nullif(p.display_name, ''), p.username) INTO sender_name
  FROM public.profiles p WHERE p.id = new.sender_id;

  INSERT INTO public.notifications (user_id, type, title, detail, actor_id, conversation_id)
  SELECT m.user_id,
         'message',
         coalesce(sender_name, 'New message'),
         left(coalesce(nullif(new.body, ''), 'Sent an attachment'), 140),
         new.sender_id,
         new.conversation_id
  FROM public.conversation_members m
  WHERE m.conversation_id = new.conversation_id
    AND m.user_id <> new.sender_id
    AND m.muted = false;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_new_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_notify ON public.messages;
CREATE TRIGGER messages_notify
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- 4. Realtime for read receipts
ALTER TABLE public.message_read_receipts REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_read_receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts;
  END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS messages_convo_created_idx ON public.messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS read_receipts_message_idx ON public.message_read_receipts (message_id);
CREATE INDEX IF NOT EXISTS read_receipts_user_idx ON public.message_read_receipts (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);