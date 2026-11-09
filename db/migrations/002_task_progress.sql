-- Tiến độ hoàn thành của từng việc (0–100 %)
alter table tasks add column progress smallint not null default 0 check (progress between 0 and 100);
