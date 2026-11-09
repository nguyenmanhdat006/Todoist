-- Màu thẻ trong từng cột: 'status' (theo hạn, mặc định), 'none' (không tô) hoặc mã màu #rrggbb
alter table board_columns add column card_color text not null default 'status'
  check (card_color in ('status', 'none') or card_color ~ '^#[0-9a-fA-F]{6}$');
