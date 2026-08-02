import { createClient } from '@supabase/supabase-js';
const c = createClient('https://pwzlubjwzuxdpzvjyzoc.supabase.co','sb_publishable_JKxlr6ZTa-iXybBBxmBzjA_mPcqTek_',{auth:{persistSession:false}});
const { data } = await c.auth.signInWithPassword({ email: process.argv[2], password: 'Testpass!2345' });
console.log('signed in', !!data.session);
for (const cid of ['44b411bd-0362-454d-9566-ebeb31909783','c32872c1-ff74-479c-a133-6a73d551152b']) {
  const { data: files } = await c.storage.from('chat-media').list(`${cid}/${data.user.id}`);
  if (files?.length) await c.storage.from('chat-media').remove(files.map(f=>`${cid}/${data.user.id}/${f.name}`));
  await c.from('messages').delete().eq('conversation_id', cid).eq('sender_id', data.user.id);
  await c.from('conversation_members').delete().eq('conversation_id', cid).eq('user_id', data.user.id);
}
console.log('cleaned');
