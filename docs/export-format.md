# Định dạng file xuất JSON (schemaVersion 2)

App lưu dữ liệu trong `localStorage`. Menu **Dữ liệu và sao lưu → Xuất file JSON** tạo ra một file
`task-management-YYYY-MM-DD-HHmm.json` chứa toàn bộ dữ liệu. File này dùng để:

- sao lưu / chuyển sang trình duyệt hoặc máy khác (nhập lại bằng **Nhập từ file JSON**);
- sau này đổ vào cơ sở dữ liệu khi có backend.

Dữ liệu được tổ chức thành các danh sách phẳng giống các bảng trong DB, mỗi dòng có `id` ổn định và
`position` (thứ tự), các quan hệ nối với nhau bằng id. JSON Schema đầy đủ: [`export.schema.json`](export.schema.json).

## Cấu trúc tổng

```jsonc
{
  "format": "task-management-export", // để nhận diện file
  "schemaVersion": 2,                 // tăng khi đổi cấu trúc; app không nhập file có số lớn hơn nó hiểu
  "exportedAt": "2026-11-09T03:10:00.000Z", // UTC
  "timezone": "Asia/Ho_Chi_Minh",     // múi giờ của dueDate/startTime/endTime
  "settings": { "lang": "vi", "theme": "dark", "view": "kanban", "calendarMode": "week", "calendarHiddenTags": [] },
  "counts": { "columns": 5, "tags": 11, "tasks": 9, "filters": 2, "reminders": 1 },
  "columns": [ ... ],
  "tags": [ ... ],
  "tasks": [ ... ],
  "filters": [ ... ],
  "reminders": [ ... ]
}
```

`settings` và `counts` chỉ để tham khảo, khi nhập app không áp dụng `settings` (giữ ngôn ngữ, giao diện
đang dùng).

## columns

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | ví dụ `c_k3j9x2ab12` |
| `title` | string | |
| `color` | string | `#rrggbb` |
| `isDone` | boolean | việc trong cột này tính là đã xong |
| `builtin` | `overdue` \| `todo` \| `doing` \| `review` \| `done` \| null | cột mặc định, không xoá được |
| `position` | integer | thứ tự từ trái sang phải, bắt đầu 0 |
| `cardColor` | `status` \| `none` \| `#rrggbb` | màu thẻ trong cột: theo hạn (mặc định), không tô, hoặc một màu cố định |

## tasks

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | ví dụ `t_m2p8q1cd34` |
| `columnId` | string | → `columns.id` |
| `position` | integer | thứ tự trong cột, bắt đầu 0 |
| `title` | string | không rỗng |
| `note` | string | có thể rỗng |
| `priority` | `high` \| `normal` \| `low` | |
| `dueDate` | `YYYY-MM-DD` \| null | ngày, theo `timezone` |
| `startTime` | `HH:MM` \| null | 24h; null = việc cả ngày (hoặc chưa có ngày) |
| `endTime` | `HH:MM` \| null | luôn sau `startTime` |
| `tags` | string[] | tên nhãn → `tags.name` |
| `createdAt` | ISO 8601 UTC | |
| `updatedAt` | ISO 8601 UTC | lần sửa nội dung / chuyển cột gần nhất; dùng để đồng bộ |
| `completedAt` | ISO 8601 UTC \| null | có giá trị khi việc nằm trong cột `isDone` |
| `autoOverdueFor` | `YYYY-MM-DD` \| null | nội bộ: hạn chót lúc app tự chuyển việc vào cột Quá hạn |
| `prevColumnId` | string \| null | nội bộ: cột trước khi bị chuyển vào Quá hạn |
| `progress` | integer 0–100 | tiến độ hoàn thành (%); thiếu thì coi là 0 |
| `assignees` | string[] (uuid) | người liên quan (id người dùng); khi lưu lên server chỉ giữ thành viên dự án / bạn bè |
| `assigneeId` | string \| null (uuid) | người phụ trách (một người); server chỉ giữ nếu là thành viên dự án |
| `number` | integer \| null | số thứ tự trong dự án, mã ticket = `KEY-số`. Server cấp khi lưu lần đầu, client gửi lên bị bỏ qua; số của việc đã xoá không dùng lại |
| `creatorId` | string \| null (uuid) | người tạo; server ghi theo người lưu lần đầu, client gửi lên bị bỏ qua |

Thời điểm bắt đầu tuyệt đối = `dueDate` + `startTime` theo `timezone`. Ví dụ trong PostgreSQL:
`(due_date + start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh'`.

## tags

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `name` | string | khoá tự nhiên, phân biệt hoa thường như khi hiển thị |
| `color` | `#rrggbb` | |
| `preset` | string \| null | khoá nhãn có sẵn (`work`, `personal`, `study`, `homework`, `exam`, `meeting`, `health`, `family`, `shopping`, `finance`, `other`) |
| `taskCount` | integer | để tham khảo |

## filters, reminders

- `filters`: bộ lọc đã lưu — `id`, `name` (null = tên mặc định theo `labelKey`), `priorities[]`, `tags[]`,
  `columnIds[]` (→ `columns.id`), `due` (`any|overdue|today|week|none`), `hideDone`.
- `reminders`: lời nhắc đã tạo — `id`, `taskId` (→ `tasks.id`), `at` (`YYYY-MM-DDTHH:MM`, giờ địa phương),
  `createdAt`, `read`.

## Khi nhập file

1. App đọc và kiểm tra file, hiện tóm tắt (số cột, việc, bộ lọc, lời nhắc) và danh sách chỗ đã tự sửa.
2. Người dùng bấm **Thay thế dữ liệu** thì mới ghi đè; có nút **Hoàn tác** ngay sau đó.

Quy tắc kiểm tra:

- Từ chối cả file nếu: không phải JSON object, không nhận ra định dạng, `schemaVersion` lớn hơn app hỗ trợ,
  thiếu `columns`/`tasks`, hoặc không có cột hợp lệ.
- Từng dòng hỏng thì sửa hoặc bỏ qua và báo lại: thiếu `id`/`title` → bỏ; trùng `id` → bỏ dòng sau;
  `columnId` không tồn tại → chuyển vào cột Cần làm; ngày/giờ/màu/priority sai → đặt về mặc định;
  `endTime` không sau `startTime` → bỏ `endTime`.
- Vẫn nhập được file định dạng cũ (`{ "app": "kanban-todo", "version": 1, "columns": [{ taskIds }], "tasks": { id: task } }`)
  và bản lưu `localStorage` (`{ "state": { ... } }`).
- Cột mặc định bị thiếu sẽ được thêm lại; tên mặc định được dịch theo ngôn ngữ đang dùng.

## Lưu vào PostgreSQL (Neon)

Bảng thật nằm ở [`db/migrations/001_init.sql`](../db/migrations/001_init.sql): `board_columns`, `tasks`
(nhãn là mảng `tags text[]`), `saved_filters`, `reminders`, cùng `users`, `sessions`, `boards`.
Khoá chính là `(user_id, id)` nên hai tài khoản nhập cùng một file vẫn không đụng nhau.

API `PUT /api/board` nhận đúng định dạng file này (`{ baseRevision, file }`), kiểm tra bằng cùng bộ `parseImport()`
rồi thay toàn bộ dữ liệu của người dùng trong một transaction (`jsonb_to_recordset` cho từng bảng).
`GET /api/board` trả lại dữ liệu theo đúng định dạng này.

## Đổi phiên bản

Khi cấu trúc thay đổi, tăng `EXPORT_VERSION` trong `src/data/exchange.ts`, thêm hàm đọc phiên bản cũ
(như `readV1`) và cập nhật file này cùng `export.schema.json`.
