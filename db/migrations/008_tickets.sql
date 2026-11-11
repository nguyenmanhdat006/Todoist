-- Phiếu giao việc (ticket): mỗi việc có mã dạng KEY-12, người tạo và người phụ trách.
-- Mã dự án (KEY) duy nhất toàn hệ thống; số thứ tự tăng dần theo dự án (không dùng lại số của việc đã xoá).

alter table projects add column key text;
alter table projects add column ticket_seq integer not null default 0;

-- Mã dự án mặc định: tối đa 3 chữ cái đầu của tên (bỏ dấu), trùng thì thêm số.
-- Dự án cá nhân mặc định "Cá nhân" lấy chữ cái đầu của tên chủ tài khoản (Đạt Nguyễn → DN).
with base as (
  select p.id, p.created_at,
         case when p.kind = 'personal' and p.name = 'Cá nhân'
              then coalesce(nullif(left(regexp_replace(upper(regexp_replace(regexp_replace(translate(lower(coalesce(nullif(u.name, ''), split_part(u.email, '@', 1))), 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'), '[^a-z ]', '', 'g'), '(\w)\w*\s*', '\1', 'g')), '[^A-Z]', '', 'g'), 3), ''), 'PRJ')
              else coalesce(nullif(left(regexp_replace(upper(translate(lower(p.name), 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')), '[^A-Z]', '', 'g'), 3), ''), 'PRJ') end as src
    from projects p join users u on u.id = p.owner_id
), keyed as (
  select id, created_at, left(src || 'X', greatest(length(src), 2)) as k from base
), ranked as (
  select id, k, row_number() over (partition by k order by created_at, id) as rn from keyed
)
update projects p
   set key = case when r.rn = 1 then r.k else r.k || r.rn::text end
  from ranked r
 where r.id = p.id;

alter table projects alter column key set not null;
alter table projects add constraint projects_key_format check (key ~ '^[A-Z][A-Z0-9]{1,5}$');
create unique index projects_key_idx on projects(key);

alter table tasks add column number integer;
alter table tasks add column creator_id uuid;
alter table tasks add column assignee_id uuid;

-- Đánh số các việc đã có, theo thứ tự tạo trong từng dự án
with pt as (
  select t.board_id, t.id, row_number() over (partition by pb.project_id order by t.created_at, t.id) as n
    from tasks t join project_boards pb on pb.id = t.board_id
)
update tasks t set number = pt.n from pt where pt.board_id = t.board_id and pt.id = t.id;

update projects p
   set ticket_seq = coalesce((select max(t.number) from tasks t join project_boards pb on pb.id = t.board_id where pb.project_id = p.id), 0);

-- Việc cũ chưa biết ai tạo: coi chủ dự án là người tạo
update tasks t
   set creator_id = p.owner_id
  from project_boards pb join projects p on p.id = pb.project_id
 where pb.id = t.board_id;
