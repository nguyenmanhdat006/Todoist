-- Vai trò người dùng (admin / user) và khoá tài khoản.
-- Admin đầu tiên: chủ dự án. Sau đó admin đổi vai trò người khác trong trang quản lý.

alter table users add column role text not null default 'user' check (role in ('admin', 'user'));
alter table users add column disabled boolean not null default false;

update users set role = 'admin' where email = 'manhdatvbhp@gmail.com';
