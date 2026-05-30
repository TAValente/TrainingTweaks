create table if not exists public.trainingtweaks_app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
