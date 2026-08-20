-- Full purge of a conversation and everything hanging off it (storage included).
CREATE OR REPLACE FUNCTION public.purge_conversation(_cid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _cid IS NULL THEN RETURN; END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = 'chat-media'
    AND name IN (
      SELECT m.attachment_url FROM public.messages m
      WHERE m.conversation_id = _cid
        AND m.attachment_url IS NOT NULL AND m.attachment_url <> ''
    );

  DELETE FROM public.message_reactions r
  WHERE r.message_id IN (SELECT id FROM public.messages WHERE conversation_id = _cid);
  DELETE FROM public.message_hides h
  WHERE h.message_id IN (SELECT id FROM public.messages WHERE conversation_id = _cid);
  DELETE FROM public.message_bookmarks b
  WHERE b.message_id IN (SELECT id FROM public.messages WHERE conversation_id = _cid);
  DELETE FROM public.message_read_receipts rr
  WHERE rr.message_id IN (SELECT id FROM public.messages WHERE conversation_id = _cid);

  -- break self-referencing reply chains before deleting
  UPDATE public.messages SET reply_to = NULL WHERE conversation_id = _cid AND reply_to IS NOT NULL;
  DELETE FROM public.messages WHERE conversation_id = _cid;

  DELETE FROM public.call_signals s
  WHERE s.call_id IN (SELECT id FROM public.calls WHERE conversation_id = _cid);
  DELETE FROM public.call_participants p
  WHERE p.call_id IN (SELECT id FROM public.calls WHERE conversation_id = _cid);
  DELETE FROM public.calls WHERE conversation_id = _cid;

  DELETE FROM public.notifications WHERE conversation_id = _cid;
  DELETE FROM public.conversation_members WHERE conversation_id = _cid;
  DELETE FROM public.conversations WHERE id = _cid;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_conversation(uuid) FROM PUBLIC, anon, authenticated;

-- User-facing delete. DMs are removed entirely; groups just drop the caller.
CREATE OR REPLACE FUNCTION public.delete_conversation(_cid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  convo public.conversations;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO convo FROM public.conversations WHERE id = _cid;
  IF convo IS NULL THEN RETURN; END IF;
  IF NOT public.is_member(_cid, me) THEN RAISE EXCEPTION 'not a member'; END IF;

  IF convo.kind = 'dm' THEN
    PERFORM public.purge_conversation(_cid);
  ELSE
    PERFORM public.leave_group(_cid);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_conversation(uuid) TO authenticated;

-- Unfriending removes the pair's direct conversation automatically.
CREATE OR REPLACE FUNCTION public.cleanup_dm_on_unfriend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  key text;
  cid uuid;
BEGIN
  IF old.status <> 'accepted' THEN RETURN old; END IF;
  key := least(old.requester_id::text, old.addressee_id::text) || ':' ||
         greatest(old.requester_id::text, old.addressee_id::text);
  SELECT id INTO cid FROM public.conversations WHERE dm_key = key AND kind = 'dm';
  IF cid IS NOT NULL THEN
    PERFORM public.purge_conversation(cid);
  END IF;
  RETURN old;
END;
$$;

DROP TRIGGER IF EXISTS friendships_cleanup_dm ON public.friendships;
CREATE TRIGGER friendships_cleanup_dm
AFTER DELETE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.cleanup_dm_on_unfriend();

-- Blocking should also remove the shared direct chat.
CREATE OR REPLACE FUNCTION public.cleanup_dm_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  key text;
  cid uuid;
BEGIN
  IF new.status = 'blocked' AND old.status IS DISTINCT FROM 'blocked' THEN
    key := least(new.requester_id::text, new.addressee_id::text) || ':' ||
           greatest(new.requester_id::text, new.addressee_id::text);
    SELECT id INTO cid FROM public.conversations WHERE dm_key = key AND kind = 'dm';
    IF cid IS NOT NULL THEN
      PERFORM public.purge_conversation(cid);
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS friendships_cleanup_dm_block ON public.friendships;
CREATE TRIGGER friendships_cleanup_dm_block
AFTER UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.cleanup_dm_on_block();