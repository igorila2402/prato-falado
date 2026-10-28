-- Tabela única de registros do Prato Falado (uma linha por chave: dia, metas, produtos...).
create table if not exists public.kv (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.kv enable row level security;
drop policy if exists "kv_own_rows" on public.kv;
create policy "kv_own_rows" on public.kv for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Permissões explícitas da API (idempotente). Em projetos novos o Supabase pode não conceder acesso
-- automático às tabelas criadas por SQL; sem isto a sincronização falha com "permission denied for table kv".
grant select, insert, update, delete on table public.kv to authenticated;
revoke all on table public.kv from anon;
