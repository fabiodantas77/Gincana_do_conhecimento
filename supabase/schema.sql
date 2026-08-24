-- Execute este arquivo no SQL Editor do Supabase.
create table if not exists public.championship_data (
  id boolean primary key default true check (id),
  data jsonb not null default '{"teams": [], "events": [], "scores": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

alter table public.championship_data enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Public dashboard can read" on public.championship_data;
create policy "Public dashboard can read"
on public.championship_data for select
to anon, authenticated
using (true);

drop policy if exists "Admins manage championship" on public.championship_data;
create policy "Admins manage championship"
on public.championship_data for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.championship_data to anon, authenticated;
grant insert, update, delete on public.championship_data to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- Após criar o usuário administrador em Authentication > Users, execute:
-- insert into public.admin_users (user_id) values ('UUID_DO_USUARIO');
-- Para atualizações em tempo real, habilite Database > Replication para a tabela
-- public.championship_data (ou execute a linha abaixo uma única vez):
alter publication supabase_realtime add table public.championship_data;
