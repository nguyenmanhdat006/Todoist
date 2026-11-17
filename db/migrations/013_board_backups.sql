-- Sao lưu bảng: mỗi bảng chỉ có MỘT file sao lưu, được ghi đè khi dữ liệu thay đổi.
-- data là file xuất JSON của bảng (cùng định dạng với nút Xuất dữ liệu), data_hash để biết dữ liệu có đổi không.
-- Khi dữ liệu hiện tại ít hơn hẳn bản sao lưu (nghi mất dữ liệu), bản cũ được giữ nguyên và đánh dấu flagged.

create table board_backups (
  board_id      uuid primary key references boards(board_id) on delete cascade,
  data          jsonb not null,
  data_hash     text not null,
  task_count    integer not null default 0,
  size_bytes    integer not null default 0,
  revision      integer not null default 0,
  reason        text not null default 'auto',
  created_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  -- khi flagged: bản sao lưu cũ được giữ lại vì dữ liệu hiện tại ít hơn hẳn
  flagged       boolean not null default false,
  flagged_tasks integer,
  flagged_at    timestamptz
);
