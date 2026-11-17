-- Ảnh đại diện: lưu ảnh đã thu nhỏ (vài chục KB) ngay trong bảng users.
-- avatar_v tăng mỗi lần đổi ảnh để trình duyệt tải ảnh mới (địa chỉ ảnh kèm ?v=).
alter table users add column avatar bytea;
alter table users add column avatar_type text;
alter table users add column avatar_v integer;
