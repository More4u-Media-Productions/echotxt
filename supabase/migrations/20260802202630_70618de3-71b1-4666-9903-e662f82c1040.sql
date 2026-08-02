CREATE OR REPLACE FUNCTION public.set_message_pinned(_mid uuid, _pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  msg public.messages;
  convo public.conversations;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO msg FROM public.messages WHERE id = _mid;
  IF msg IS NULL THEN RAISE EXCEPTION 'message not found'; END IF;
  IF NOT public.is_member(msg.conversation_id, me) THEN RAISE EXCEPTION 'not a member'; END IF;
  IF msg.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'message was deleted'; END IF;

  SELECT * INTO convo FROM public.conversations WHERE id = msg.conversation_id;
  IF convo.kind = 'group'
     AND NOT public.is_conversation_admin(msg.conversation_id, me)
     AND msg.sender_id <> me THEN
    RAISE EXCEPTION 'only admins can pin messages in this group';
  END IF;

  UPDATE public.messages SET pinned = _pinned WHERE id = _mid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_message_pinned(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_message_pinned(uuid, boolean) TO authenticated;