-- Hoạt động của việc: lịch sử thay đổi (tự ghi khi lưu bảng) và bình luận.
-- board_id là id bảng (id người dùng với bảng cá nhân, id bảng với bảng dự án); task_id là id việc trong bảng đó.

create table task_events (
  id         bigserial primary key,
  board_id   text not null,
  task_id    text not null,
  actor_id   uuid references users(id) on delete set null,
  type       text not null,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index task_events_task_idx on task_events(board_id, task_id, id);

create table task_comments (
  id         bigserial primary key,
  board_id   text not null,
  task_id    text not null,
  author_id  uuid references users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index task_comments_task_idx on task_comments(board_id, task_id, id);
