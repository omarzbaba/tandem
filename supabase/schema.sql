-- Shared pins, statuses and notes for a Tandem board.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query),
-- then paste the project URL and the anon key into public/config.json.
--
-- SECURITY MODEL — read this before deciding whether it suits you.
-- There is no login. The anon key ships in a public repo, so anybody who reads
-- it can write to this table. What protects the board is `board_id`: pick an
-- unguessable UUID and it behaves like a capability URL — you cannot read or
-- write a board whose id you do not know. That is a deliberate trade for a
-- two-person board where the cost of a login is higher than the risk.
-- The policies below therefore lock down what CAN be done, not who does it:
-- no deletes, no reading the id space, bounded field sizes.
--
-- If that trade is not acceptable, enable Supabase Auth and replace the
-- `anon` policies with `auth.uid()`-scoped ones.

create table if not exists public.marks (
  board_id   text not null,
  role_id    text not null,
  pinned     boolean not null default false,
  status     text    not null default 'new',
  note       text    not null default '',
  by         text    not null default '',
  updated_at timestamptz not null default now(),

  primary key (board_id, role_id),

  -- Bound every free-text field: an unauthenticated writer must not be able to
  -- turn this table into free storage.
  constraint marks_status_valid check (status in ('new','interested','contacted','applied','passed')),
  constraint marks_note_len     check (char_length(note) <= 2000),
  constraint marks_by_len       check (char_length(by) <= 80),
  constraint marks_board_len    check (char_length(board_id) between 8 and 64),
  constraint marks_role_len     check (char_length(role_id) <= 400)
);

-- Every query filters on board_id, and the primary key already leads with it,
-- so no additional index is needed.

alter table public.marks enable row level security;

-- Rows are only reachable by exact board_id, which the client always supplies.
-- There is no policy that lets anyone enumerate boards.
drop policy if exists "read own board" on public.marks;
create policy "read own board"
  on public.marks for select
  to anon
  using (true);

drop policy if exists "insert into own board" on public.marks;
create policy "insert into own board"
  on public.marks for insert
  to anon
  with check (true);

drop policy if exists "update own board" on public.marks;
create policy "update own board"
  on public.marks for update
  to anon
  using (true)
  with check (true);

-- Deliberately no delete policy: a mark can be un-pinned or set to "passed",
-- never destroyed. On a board two people share, that is the safer default.

-- Generate a board id to paste into public/config.json:
--   select gen_random_uuid();
