-- Mỗi dự án có thể có nhiều bảng. Dữ liệu của bảng dùng board_id = id của bảng (project_boards.id).
-- Bảng sẵn có của các dự án cũ (board_id = id dự án) trở thành bảng đầu tiên với cùng id, nên không mất dữ liệu.
create table project_boards (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index project_boards_project_idx on project_boards(project_id, position);

insert into project_boards (id, project_id, name, position)
select id, id, 'Bảng chính', 0 from projects;

-- Thông báo gửi tới người dùng (ví dụ: được thêm vào dự án)
create table notifications (
  id         bigserial primary key,
  user_id    uuid not null references users(id) on delete cascade,
  type       text not null,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on notifications(user_id, created_at desc);
