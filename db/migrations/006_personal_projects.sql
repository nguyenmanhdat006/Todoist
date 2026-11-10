-- Dự án có hai loại:
--   personal: dự án riêng, chỉ có chủ dự án, không thêm được người khác
--   team:     dự án nhóm, có host và thành viên
alter table projects add column kind text not null default 'team' check (kind in ('personal', 'team'));

-- Bảng cá nhân cũ (board_id = id người dùng) trở thành bảng "Bảng của tôi" trong một dự án cá nhân "Cá nhân".
-- Giữ nguyên id bảng = id người dùng nên dữ liệu không phải chuyển.
with ins as (
  insert into projects (name, owner_id, kind)
  select 'Cá nhân', b.board_id, 'personal'
    from boards b join users u on u.id = b.board_id
  returning id, owner_id
), mem as (
  insert into project_members (project_id, user_id, role)
  select id, owner_id, 'host' from ins
)
insert into project_boards (id, project_id, name, position)
select owner_id, id, 'Bảng của tôi', 0 from ins;
