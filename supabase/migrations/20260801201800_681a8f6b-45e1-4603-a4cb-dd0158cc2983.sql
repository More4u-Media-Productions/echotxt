-- ============ group settings & membership metadata ============
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS only_admins_post boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS only_admins_invite boolean NOT NULL DEFAULT false;

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.conversation_members DROP CONSTRAINT IF EXISTS conversation_members_role_check;
UPDATE public.conversation_members SET role = 'member' WHERE role NOT IN ('owner','admin','member');
ALTER TABLE public.conversation_members
  ADD CONSTRAINT conversation_members_role_check CHECK (role IN ('owner','admin','member'));

-- ============ role helpers ============
CREATE OR REPLACE FUNCTION public.conversation_role(_cid uuid, _uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role FROM public.conversation_members m
  WHERE m.conversation_id = _cid AND m.user_id = _uid LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_admin(_cid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = _cid AND m.user_id = _uid AND m.role IN ('owner','admin')
  );
$$;

-- ============ prevent self role escalation ============
CREATE OR REPLACE FUNCTION public.guard_member_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.role IS DISTINCT FROM old.role
     AND coalesce(current_setting('echo.role_change', true), '') <> '1' THEN
    RAISE EXCEPTION 'roles can only be changed by a group owner';
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS guard_member_role_update ON public.conversation_members;
CREATE TRIGGER guard_member_role_update
BEFORE UPDATE ON public.conversation_members
FOR EACH ROW EXECUTE FUNCTION public.guard_member_role();

-- ============ system message helper ============
CREATE OR REPLACE FUNCTION public.post_system_message(_cid uuid, _actor uuid, _body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.messages (conversation_id, sender_id, kind, body)
  VALUES (_cid, _actor, 'system', _body);
$$;

-- ============ tighten access rules ============
DROP POLICY IF EXISTS conversations_update_member ON public.conversations;
CREATE POLICY conversations_update_admin ON public.conversations
FOR UPDATE TO authenticated
USING (is_member(id, auth.uid()) AND (kind = 'dm' OR is_conversation_admin(id, auth.uid())))
WITH CHECK (is_member(id, auth.uid()) AND (kind = 'dm' OR is_conversation_admin(id, auth.uid())));

DROP POLICY IF EXISTS members_insert ON public.conversation_members;
CREATE POLICY members_insert ON public.conversation_members
FOR INSERT TO authenticated
WITH CHECK (
  is_conversation_admin(conversation_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND c.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS members_delete_own ON public.conversation_members;
CREATE POLICY members_delete ON public.conversation_members
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR (is_conversation_admin(conversation_id, auth.uid()) AND role <> 'owner')
);

DROP POLICY IF EXISTS messages_insert_member ON public.messages;
CREATE POLICY messages_insert_member ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND is_member(conversation_id, auth.uid())
  AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND c.kind = 'group'
      AND c.only_admins_post
      AND NOT is_conversation_admin(c.id, auth.uid())
  )
);

-- ============ group actions ============
CREATE OR REPLACE FUNCTION public.create_group(
  _title text,
  _description text DEFAULT NULL,
  _member_ids uuid[] DEFAULT '{}',
  _avatar_color text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  cid uuid;
  clean uuid[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF btrim(coalesce(_title,'')) = '' THEN RAISE EXCEPTION 'group name is required'; END IF;

  SELECT coalesce(array_agg(DISTINCT p.id), '{}') INTO clean
  FROM public.profiles p
  WHERE p.id = ANY(coalesce(_member_ids, '{}'))
    AND p.id <> me
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'blocked'
        AND ((f.requester_id = me AND f.addressee_id = p.id)
          OR (f.addressee_id = me AND f.requester_id = p.id))
    );

  INSERT INTO public.conversations (kind, title, description, created_by, avatar_color)
  VALUES ('group', left(btrim(_title), 80), nullif(btrim(coalesce(_description,'')), ''), me,
          coalesce(nullif(btrim(coalesce(_avatar_color,'')), ''), 'oklch(0.7 0.14 145)'))
  RETURNING id INTO cid;

  INSERT INTO public.conversation_members (conversation_id, user_id, role, accepted)
  VALUES (cid, me, 'owner', true);

  IF array_length(clean, 1) > 0 THEN
    INSERT INTO public.conversation_members (conversation_id, user_id, role, accepted, invited_by)
    SELECT cid, u, 'member', false, me FROM unnest(clean) u
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    INSERT INTO public.notifications (user_id, actor_id, conversation_id, type, title, detail)
    SELECT u, me, cid, 'group_invite', 'Group invitation', 'You were invited to ' || left(btrim(_title), 80)
    FROM unnest(clean) u;
  END IF;

  PERFORM public.post_system_message(cid, me, 'created the group');
  RETURN cid;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_group_members(_cid uuid, _ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  convo public.conversations;
  clean uuid[];
  added integer := 0;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO convo FROM public.conversations WHERE id = _cid;
  IF convo IS NULL OR convo.kind <> 'group' THEN RAISE EXCEPTION 'group not found'; END IF;
  IF NOT public.is_member(_cid, me) THEN RAISE EXCEPTION 'not a member'; END IF;
  IF convo.only_admins_invite AND NOT public.is_conversation_admin(_cid, me) THEN
    RAISE EXCEPTION 'only admins can invite members';
  END IF;

  SELECT coalesce(array_agg(DISTINCT p.id), '{}') INTO clean
  FROM public.profiles p
  WHERE p.id = ANY(coalesce(_ids, '{}'))
    AND p.id <> me
    AND NOT EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = _cid AND m.user_id = p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'blocked'
        AND ((f.requester_id = me AND f.addressee_id = p.id)
          OR (f.addressee_id = me AND f.requester_id = p.id))
    );

  IF coalesce(array_length(clean, 1), 0) = 0 THEN RETURN 0; END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role, accepted, invited_by)
  SELECT _cid, u, 'member', false, me FROM unnest(clean) u
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  added := array_length(clean, 1);

  INSERT INTO public.notifications (user_id, actor_id, conversation_id, type, title, detail)
  SELECT u, me, _cid, 'group_invite', 'Group invitation', 'You were invited to ' || coalesce(convo.title, 'a group')
  FROM unnest(clean) u;

  PERFORM public.post_system_message(_cid, me, 'invited ' || added::text || ' member' || CASE WHEN added = 1 THEN '' ELSE 's' END);
  RETURN added;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_group_invite(_cid uuid, _accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = _cid AND m.user_id = me) THEN
    RAISE EXCEPTION 'invitation not found';
  END IF;

  IF _accept THEN
    UPDATE public.conversation_members SET accepted = true
    WHERE conversation_id = _cid AND user_id = me AND accepted = false;
    PERFORM public.post_system_message(_cid, me, 'joined the group');
  ELSE
    DELETE FROM public.conversation_members WHERE conversation_id = _cid AND user_id = me;
  END IF;

  UPDATE public.notifications SET read = true
  WHERE user_id = me AND conversation_id = _cid AND type = 'group_invite' AND read = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_member(_cid uuid, _uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  target_role text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  target_role := public.conversation_role(_cid, _uid);
  IF target_role IS NULL THEN RETURN; END IF;
  IF _uid <> me THEN
    IF NOT public.is_conversation_admin(_cid, me) THEN RAISE EXCEPTION 'only admins can remove members'; END IF;
    IF target_role = 'owner' THEN RAISE EXCEPTION 'the group owner cannot be removed'; END IF;
    IF target_role = 'admin' AND public.conversation_role(_cid, me) <> 'owner' THEN
      RAISE EXCEPTION 'only the owner can remove an admin';
    END IF;
  END IF;

  DELETE FROM public.conversation_members WHERE conversation_id = _cid AND user_id = _uid;
  PERFORM public.post_system_message(
    _cid, me,
    CASE WHEN _uid = me THEN 'left the group' ELSE 'removed a member' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_group_role(_cid uuid, _uid uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  convo_title text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _role NOT IN ('owner','admin','member') THEN RAISE EXCEPTION 'invalid role'; END IF;
  IF public.conversation_role(_cid, me) <> 'owner' THEN RAISE EXCEPTION 'only the owner can change roles'; END IF;
  IF _uid = me THEN RAISE EXCEPTION 'you already own this group'; END IF;
  IF public.conversation_role(_cid, _uid) IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;

  PERFORM set_config('echo.role_change', '1', true);
  IF _role = 'owner' THEN
    UPDATE public.conversation_members SET role = 'owner' WHERE conversation_id = _cid AND user_id = _uid;
    UPDATE public.conversation_members SET role = 'admin' WHERE conversation_id = _cid AND user_id = me;
  ELSE
    UPDATE public.conversation_members SET role = _role WHERE conversation_id = _cid AND user_id = _uid;
  END IF;
  PERFORM set_config('echo.role_change', '0', true);

  SELECT title INTO convo_title FROM public.conversations WHERE id = _cid;
  INSERT INTO public.notifications (user_id, actor_id, conversation_id, type, title, detail)
  VALUES (_uid, me, _cid, 'group_role',
          'Role updated in ' || coalesce(convo_title, 'group'),
          'You are now ' || _role);

  PERFORM public.post_system_message(_cid, me, 'updated a member role to ' || _role);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_group(
  _cid uuid,
  _title text DEFAULT NULL,
  _description text DEFAULT NULL,
  _avatar_color text DEFAULT NULL,
  _only_admins_post boolean DEFAULT NULL,
  _only_admins_invite boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  old_title text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_conversation_admin(_cid, me) THEN RAISE EXCEPTION 'only admins can edit this group'; END IF;
  SELECT title INTO old_title FROM public.conversations WHERE id = _cid AND kind = 'group';
  IF NOT FOUND THEN RAISE EXCEPTION 'group not found'; END IF;

  UPDATE public.conversations SET
    title = coalesce(nullif(btrim(coalesce(_title,'')), ''), title),
    description = CASE WHEN _description IS NULL THEN description ELSE nullif(btrim(_description), '') END,
    avatar_color = coalesce(nullif(btrim(coalesce(_avatar_color,'')), ''), avatar_color),
    only_admins_post = coalesce(_only_admins_post, only_admins_post),
    only_admins_invite = coalesce(_only_admins_invite, only_admins_invite)
  WHERE id = _cid;

  IF _title IS NOT NULL AND btrim(_title) <> '' AND btrim(_title) <> coalesce(old_title,'') THEN
    PERFORM public.post_system_message(_cid, me, 'renamed the group to ' || btrim(_title));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_group(_cid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  heir uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF public.conversation_role(_cid, me) = 'owner' THEN
    SELECT m.user_id INTO heir FROM public.conversation_members m
    WHERE m.conversation_id = _cid AND m.user_id <> me AND m.accepted
    ORDER BY (m.role = 'admin') DESC, m.joined_at
    LIMIT 1;
    IF heir IS NOT NULL THEN
      PERFORM set_config('echo.role_change', '1', true);
      UPDATE public.conversation_members SET role = 'owner' WHERE conversation_id = _cid AND user_id = heir;
      PERFORM set_config('echo.role_change', '0', true);
    END IF;
  END IF;

  DELETE FROM public.conversation_members WHERE conversation_id = _cid AND user_id = me;
  PERFORM public.post_system_message(_cid, me, 'left the group');
END;
$$;

CREATE OR REPLACE FUNCTION public.group_members(_cid uuid)
RETURNS TABLE(
  user_id uuid, role text, accepted boolean, joined_at timestamptz, invited_by uuid,
  username text, display_name text, avatar_color text, avatar_url text, presence presence_state
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, m.role, m.accepted, m.joined_at, m.invited_by,
         p.username, p.display_name, p.avatar_color, p.avatar_url, p.presence
  FROM public.conversation_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.conversation_id = _cid
    AND public.is_member(_cid, auth.uid())
  ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, p.username;
$$;
