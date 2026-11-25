-- Keys for the JSON API at /api/v1, made and turned off by owners and admins in Settings. The
-- key itself is shown once; only its SHA-256 and its first ten characters (to recognise it in
-- the list) are kept.
create table api_keys (
  id serial primary key,
  label text not null,
  prefix text not null,
  hash text not null unique,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
