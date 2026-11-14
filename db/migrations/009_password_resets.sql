-- Liên kết đặt lại mật khẩu: token ngẫu nhiên gửi qua email, DB chỉ lưu sha256, dùng một lần, hết hạn sau 1 giờ.
create table password_resets (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  ip         text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index password_resets_user_idx on password_resets(user_id, created_at desc);
create index password_resets_ip_idx on password_resets(ip, created_at desc);
