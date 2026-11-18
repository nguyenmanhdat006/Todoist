-- Nhóm (team): một nhóm gồm nhiều người, gắn nhóm vào dự án thay vì thêm từng người.
--
-- project_members vẫn là danh sách thành viên thật của dự án (mọi chỗ kiểm tra quyền dùng nó), nhưng
-- từ giờ các dòng role = 'member' do máy chủ tự đồng bộ từ các nhóm gắn vào dự án.

create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id   uuid not null references teams(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  role      text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on team_members(user_id);

create table project_teams (
  project_id uuid not null references projects(id) on delete cascade,
  team_id    uuid not null references teams(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (project_id, team_id)
);
create index project_teams_team_idx on project_teams(team_id);

-- Dự án nhóm đang có thành viên thêm lẻ: tạo một nhóm "<tên dự án> team" chứa đúng những người đó
-- và gắn vào dự án, nên không ai mất quyền truy cập.
do $$
declare
  p record;
  tid uuid;
begin
  for p in
    select pr.id, pr.name, pr.owner_id
      from projects pr
     where pr.kind = 'team'
       and exists (select 1 from project_members m where m.project_id = pr.id and m.role = 'member')
  loop
    insert into teams (name, owner_id) values (left(p.name || ' team', 80), p.owner_id) returning id into tid;
    insert into team_members (team_id, user_id, role) values (tid, p.owner_id, 'owner');
    insert into team_members (team_id, user_id, role)
      select tid, m.user_id, 'member' from project_members m
       where m.project_id = p.id and m.role = 'member' and m.user_id <> p.owner_id
      on conflict do nothing;
    insert into project_teams (project_id, team_id) values (p.id, tid);
  end loop;
end $$;
