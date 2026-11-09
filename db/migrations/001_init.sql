-- Tài khoản, phiên đăng nhập và dữ liệu bảng công việc theo từng người dùng.
-- gen_random_uuid() có sẵn từ PostgreSQL 13, không cần extension.
-- Id của cột/việc/bộ lọc/lời nhắc do app tạo (ví dụ t_abc123), nên khoá chính là (user_id, id).


create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,              -- luôn lưu chữ thường
  name          text not null default '',
  password_hash text not null,                     -- scrypt$N$r$p$salt$hash
  created_at    timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,                     -- sha256 của token trong cookie
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text not null default ''
);
create index sessions_user_idx on sessions(user_id);

-- Ghi lại lần đăng nhập để chặn dò mật khẩu
create table auth_attempts (
  id    bigserial primary key,
  email text not null,
  ip    text not null default '',
  ok    boolean not null,
  at    timestamptz not null default now()
);
create index auth_attempts_email_idx on auth_attempts(email, at);
create index auth_attempts_ip_idx on auth_attempts(ip, at);

-- Một bảng (board) cho mỗi người dùng; revision tăng mỗi lần lưu để phát hiện sửa đồng thời
create table boards (
  user_id    uuid primary key references users(id) on delete cascade,
  revision   integer not null default 0,
  timezone   text not null default 'UTC',
  updated_at timestamptz not null default now()
);

create table board_columns (
  user_id  uuid not null references users(id) on delete cascade,
  id       text not null,
  title    text not null,
  color    text not null,
  is_done  boolean not null default false,
  builtin  text check (builtin in ('overdue', 'todo', 'doing', 'review', 'done')),
  position integer not null,
  primary key (user_id, id)
);

create table tasks (
  user_id          uuid not null references users(id) on delete cascade,
  id               text not null,
  column_id        text not null,
  position         integer not null,
  title            text not null,
  note             text not null default '',
  priority         text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  due_date         date,
  start_time       time,
  end_time         time,
  tags             text[] not null default '{}',
  created_at       timestamptz not null,
  updated_at       timestamptz not null,
  completed_at     timestamptz,
  auto_overdue_for date,
  prev_column_id   text,
  primary key (user_id, id),
  foreign key (user_id, column_id) references board_columns(user_id, id) on delete cascade,
  check (end_time is null or (start_time is not null and end_time > start_time))
);
create index tasks_due_idx on tasks(user_id, due_date);
create index tasks_tags_idx on tasks using gin (tags);

create table saved_filters (
  user_id    uuid not null references users(id) on delete cascade,
  id         text not null,
  name       text,
  label_key  text,
  priorities text[] not null default '{}',
  tags       text[] not null default '{}',
  column_ids text[] not null default '{}',
  due        text not null default 'any',
  hide_done  boolean not null default false,
  position   integer not null,
  primary key (user_id, id)
);

create table reminders (
  user_id    uuid not null references users(id) on delete cascade,
  id         text not null,
  task_id    text not null,
  at_local   timestamp not null,                   -- giờ địa phương theo boards.timezone
  created_at timestamptz not null,
  read       boolean not null default false,
  primary key (user_id, id),
  foreign key (user_id, task_id) references tasks(user_id, id) on delete cascade
);
