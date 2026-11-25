-- Proposals and quotes. Clients never sign in: each proposal has an unguessable token, and its
-- page at /p/<token> is the only way in. Staff are the business's own Whisk team.

-- One row of settings for the business.
create table settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Your business',
  accent text not null default '#2f5bea',
  logo_upload_id text,
  currency text not null default 'USD',
  tax_mode text not null default 'exclusive' check (tax_mode in ('exclusive', 'inclusive', 'none')),
  gst_rate_bp int not null default 0 check (gst_rate_bp between 0 and 10000),
  valid_days int not null default 30 check (valid_days between 1 and 365),
  notify_email text not null default '',
  email_from text not null default '',
  email_on boolean not null default true,
  webhook_url text not null default '',
  webhook_secret text not null default '',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

create table proposals (
  id serial primary key,
  token text not null unique,
  is_template boolean not null default false,
  title text not null,
  subtitle text not null default '',
  client_name text not null default '',
  client_company text not null default '',
  client_email text not null default '',
  cover_upload_id text,
  currency text not null default 'USD',
  tax_mode text not null default 'exclusive' check (tax_mode in ('exclusive', 'inclusive', 'none')),
  gst_rate_bp int not null default 0 check (gst_rate_bp between 0 and 10000),
  discount_bp int not null default 0 check (discount_bp between 0 and 10000),
  deposit_bp int not null default 0 check (deposit_bp between 0 and 10000),
  expires_on date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  -- The total with the starting choices, kept current on every save, for lists and sums.
  value_cents bigint not null default 0,
  owner_email text not null default '',
  owner_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0,
  followed_up_at timestamptz,
  decided_at timestamptz,
  decline_reason text not null default ''
);
create index proposals_status on proposals (is_template, status, updated_at desc);

create table sections (
  id serial primary key,
  proposal_id int not null references proposals (id) on delete cascade,
  position int not null default 0,
  kind text not null check (kind in ('text', 'pricing', 'image')),
  heading text not null default '',
  body text not null default '',
  image_upload_id text,
  pick_one boolean not null default false
);
create index sections_proposal on sections (proposal_id, position);

create table items (
  id serial primary key,
  section_id int not null references sections (id) on delete cascade,
  position int not null default 0,
  name text not null,
  description text not null default '',
  unit_price bigint not null default 0,
  quantity int not null default 1 check (quantity >= 0),
  unit text not null default '',
  mode text not null default 'fixed' check (mode in ('fixed', 'optional')),
  selected boolean not null default true,
  recommended boolean not null default false,
  qty_editable boolean not null default false,
  qty_min int not null default 1 check (qty_min >= 0),
  qty_max int not null default 10,
  recurring text not null default 'once' check (recurring in ('once', 'month'))
);
create index items_section on items (section_id, position);

-- Saved items to drop into any pricing section.
create table price_list (
  id serial primary key,
  name text not null,
  description text not null default '',
  unit_price bigint not null default 0,
  unit text not null default '',
  recurring text not null default 'once' check (recurring in ('once', 'month')),
  created_at timestamptz not null default now()
);

-- What the client agreed to, frozen: the whole proposal as they saw it, their choices, the
-- totals and their signature, with a SHA-256 fingerprint of all of it.
create table acceptances (
  proposal_id int primary key references proposals (id) on delete cascade,
  frozen jsonb not null,
  fingerprint text not null,
  created_at timestamptz not null default now()
);

create table questions (
  id serial primary key,
  proposal_id int not null references proposals (id) on delete cascade,
  asked_by text not null default '',
  asked_email text not null default '',
  body text not null,
  answer text not null default '',
  answered_by text not null default '',
  asked_at timestamptz not null default now(),
  answered_at timestamptz
);
create index questions_proposal on questions (proposal_id, asked_at);

-- The timeline on each proposal: created, sent, viewed, asked, answered, followed up, accepted.
create table activity (
  id bigserial primary key,
  proposal_id int not null references proposals (id) on delete cascade,
  kind text not null,
  actor text not null default '',
  detail text not null default '',
  at timestamptz not null default now()
);
create index activity_proposal on activity (proposal_id, at desc);

-- Every email is written down first, then sent by the queue.
create table emails (
  id serial primary key,
  kind text not null,
  to_email text not null,
  subject text not null,
  html text not null,
  text text not null,
  reply_to text not null default '',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped', 'demo')),
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index emails_recent on emails (created_at desc);

create table deliveries (
  id serial primary key,
  event text not null,
  url text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed', 'demo')),
  attempts int not null default 0,
  last_status int,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deliveries_recent on deliveries (created_at desc);
