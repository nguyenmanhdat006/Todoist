-- Bạn bè, dự án dùng chung và người liên quan của từng việc.
--
-- Dữ liệu bảng (cột, việc, bộ lọc, lời nhắc) trước đây gắn với user_id. Giờ mỗi bảng có board_id:
--   bảng cá nhân  → board_id = id người dùng
--   bảng dự án    → board_id = id dự án
-- nên đổi tên cột user_id → board_id và bỏ khoá ngoại tới users ở các bảng dữ liệu.

alter table boards rename column user_id to board_id;
alter table board_columns rename column user_id to board_id;
alter table tasks rename column user_id to board_id;
alter table saved_filters rename column user_id to board_id;
alter table reminders rename column user_id to board_id;

alter table boards drop constraint if exists boards_user_id_fkey;
alter table board_columns drop constraint if exists board_columns_user_id_fkey;
alter table tasks drop constraint if exists tasks_user_id_fkey;
alter table saved_filters drop constraint if exists saved_filters_user_id_fkey;
alter table reminders drop constraint if exists reminders_user_id_fkey;

-- Người liên quan của việc (id người dùng)
alter table tasks add column assignees uuid[] not null default '{}';

-- Lời mời kết bạn / bạn bè. Một cặp chỉ có một dòng (theo chiều người gửi → người nhận).
create table friendships (
  requester   uuid not null references users(id) on delete cascade,
  addressee   uuid not null references users(id) on delete cascade,
  status      text not null check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index friendships_addressee_idx on friendships(addressee, status);

-- Dự án: người tạo là host
create table projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('host', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members(user_id);
