-- policies.example.sql — Plantilla de RLS 

create or replace function public.is_admin() returns boolean
language sql stable as $$ select coalesce(auth.jwt() ->> 'email','') = 'TU_CORREO_ADMIN_AQUI' $$;
alter table public.mensajes enable row level security;
alter table public.configuracion enable row level security;
alter table public.apps enable row level security;
drop policy if exists msg_insert on public.mensajes;
drop policy if exists msg_select on public.mensajes;
drop policy if exists msg_update on public.mensajes;
drop policy if exists msg_delete on public.mensajes;
create policy msg_insert on public.mensajes for insert to authenticated with check (user_id = auth.uid() and leido = false and respondido = false and coalesce(estado,'pendiente') = 'pendiente' and char_length(mensaje) between 1 and 4000);
create policy msg_select on public.mensajes for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy msg_update on public.mensajes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy msg_delete on public.mensajes for delete to authenticated using (public.is_admin());
drop policy if exists cfg_read on public.configuracion; drop policy if exists cfg_write on public.configuracion;
create policy cfg_read on public.configuracion for select using (true);
create policy cfg_write on public.configuracion for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists apps_read on public.apps; drop policy if exists apps_write on public.apps;
create policy apps_read on public.apps for select using (true);
create policy apps_write on public.apps for all to authenticated using (public.is_admin()) with check (public.is_admin());
