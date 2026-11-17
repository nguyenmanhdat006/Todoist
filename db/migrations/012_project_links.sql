-- Liên kết tài liệu / báo cáo gắn vào dự án (Google Drive, Docs, Sheets, Notion...).
-- kind = 'doc' (tab Tài liệu) hoặc 'report' (tab Báo cáo). Mọi thành viên dự án thêm được;
-- người thêm hoặc host xoá được.

create table project_links (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind       text not null check (kind in ('doc', 'report')),
  title      text not null,
  url        text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index project_links_project_idx on project_links(project_id, kind, created_at);
