# Quản lý công việc (Task management)

Ứng dụng quản lý công việc dạng Kanban + Lịch. Frontend React (Vite), backend Express chạy như Vercel Function,
dữ liệu lưu trên PostgreSQL (Neon). Mỗi người dùng có tài khoản riêng (email + mật khẩu).
Trình duyệt vẫn giữ một bản tạm trong `localStorage` để mở nhanh và dùng được khi mất mạng; có mạng lại thì tự đồng bộ.

## Chạy ở máy

1. Tạo file `.env.local` (không đưa lên git) theo mẫu `.env.example`, điền `DATABASE_URL` của Neon
   (nên dùng một branch riêng cho phát triển trong Neon).
2. Chạy:

```bash
npm install
npm run db:migrate   # tạo bảng (chạy lại bao nhiêu lần cũng được)
npm run dev:api      # API: http://localhost:3001/api/health
npm run dev          # web: http://localhost:5173 (tự chuyển /api sang cổng 3001)
```

## Deploy lên Vercel

1. Vercel → project → **Storage** → **Create** → **Neon** (hoặc tự tạo trên Neon rồi thêm biến `DATABASE_URL`
   trong Settings → Environment Variables).
2. Push lên nhánh `main`. Lệnh `npm run build` tự chạy migrate (tạo/cập nhật bảng) khi có `DATABASE_URL`, rồi build web.
3. Thư mục `api/` được Vercel chạy như Function; `vercel.json` chuyển mọi `/api/*` về `api/index.ts`.
4. Mở web, đăng ký tài khoản. Nếu trình duyệt đang có dữ liệu cũ (dùng trước khi có đăng nhập), app hỏi có lưu vào tài khoản không.
   Dữ liệu ở trình duyệt khác thì xuất file JSON ở đó rồi nhập vào sau khi đăng nhập.

Kiểm tra API: `GET /api/health` trả `{ "ok": true }` khi đã kết nối được database.

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password, name? }` → tạo tài khoản, đăng nhập |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/logout` | xoá phiên |
| GET | `/api/auth/me` | người dùng hiện tại (401 nếu chưa đăng nhập) |
| PATCH | `/api/projects/:id` | `{ name, key? }` → đổi tên và mã dự án (mã ticket `KEY-số`, 2–6 ký tự, duy nhất; chỉ host) |
| PATCH | `/api/me` | `{ name }` → sửa tên hiển thị |
| POST | `/api/me/password` | `{ current, password }` → đổi mật khẩu, đăng xuất các thiết bị khác |
| GET | `/api/admin/users` | danh sách tài khoản (chỉ admin) |
| PATCH | `/api/admin/users/:id` | `{ role?: 'admin' \| 'user', disabled?: boolean }` (chỉ admin, không đổi được chính mình) |
| GET | `/api/board` | `{ revision, file }` — `file` theo định dạng xuất JSON v2, `null` nếu chưa có dữ liệu |
| PUT | `/api/board` | `{ baseRevision, file, board? }` → lưu toàn bộ; 409 nếu thiết bị khác đã lưu trước |
| GET/POST/DELETE | `/api/friends…` | danh sách bạn bè, gửi lời mời qua email, đồng ý, huỷ |
| GET/POST/PATCH/DELETE | `/api/projects…` | dự án: tạo (người tạo là host), đổi tên, xoá, thêm/bớt thành viên |
| POST / PATCH / DELETE | `/api/projects/:id/boards`, `/api/boards/:id` | tạo bảng trong dự án (thành viên), đổi tên / xoá (host) |
| GET / POST | `/api/notifications`, `/api/notifications/read` | thông báo (ví dụ: được thêm vào dự án), đánh dấu đã đọc |

`GET /api/board?board=<id>` mở một bảng trong dự án; không có `board` là bảng cá nhân. Bảng cá nhân chỉ gắn được chính mình;
bảng dự án gắn được mọi thành viên.

Bảo mật: mật khẩu băm bằng scrypt; phiên là token ngẫu nhiên trong cookie `httpOnly`, `SameSite=Lax` (DB chỉ lưu sha256);
request ghi dữ liệu phải là JSON và cùng nguồn; khoá tạm sau 8 lần sai mật khẩu trong 15 phút.

## Tính năng

- Kanban kéo thả: kéo thẻ giữa các cột, đổi thứ tự trong cột, kéo tiêu đề cột để đổi chỗ cột (chuột, cảm ứng, bàn phím Space).
- 5 cột mặc định luôn có: Quá hạn, Cần làm, Đang làm, Chờ xem lại, Hoàn thành. Việc quá hạn tự chuyển vào cột Quá hạn, đổi hạn sang ngày sau thì tự trả về cột cũ.
- Thêm, sửa, xoá cột riêng; đổi màu cột.
- Tick ô vuông trên thẻ để chuyển việc sang cột Hoàn thành.
- Công việc: tiêu đề, ghi chú, ưu tiên (Gấp / Bình thường / Thấp), hạn chót, nhãn màu.
- Tìm kiếm không cần gõ dấu, lọc việc gấp và quá hạn.
- Tiến độ (%) cho mọi việc đã bắt đầu (ngoài cột Cần làm); việc ở cột Hoàn thành luôn 100%. Thẻ chưa cập nhật tiến độ có nhắc.
- Danh sách dạng bảng tính: sắp xếp theo cột, đổi giai đoạn/ưu tiên và kéo tiến độ ngay trên bảng.
- Hoàn tác khi xoá việc, xoá cột, nhập dữ liệu.
- Giao diện sáng và tối.
- Chuyển ngôn ngữ Tiếng Việt / English (nút VI | EN trên thanh trên cùng). Chuỗi giao diện nằm trong `src/i18n.ts`.
- Tài khoản riêng, dữ liệu lưu trên máy chủ và đồng bộ giữa các thiết bị; vẫn dùng được khi mất mạng.
- Kết bạn qua email; dự án dùng chung có host và thành viên, mỗi dự án có nhiều bảng; người được thêm vào dự án nhận thông báo.
- Thanh bên (nút góc trái): kiểu xem, Bảng của tôi, dự án và các bảng trong dự án.
- Gắn người liên quan vào việc (avatar tròn góc phải thẻ).
- Xuất/nhập file JSON để sao lưu hoặc chuyển dữ liệu. Khi nhập, app kiểm tra file và hiện tóm tắt trước khi thay dữ liệu. Định dạng file và gợi ý bảng PostgreSQL: [docs/export-format.md](docs/export-format.md).
- Phím tắt: `N` thêm việc, `/` tìm kiếm.

## Cấu trúc

- `api/`: backend Express (`index.ts`), `_lib/auth.ts` (mật khẩu, phiên), `_lib/board.ts` (đọc/ghi dữ liệu theo người dùng).
- `db/migrations/`: SQL tạo bảng; `scripts/migrate.ts` chạy các file chưa áp dụng.
- `src/sync/`: đăng nhập và đồng bộ với máy chủ (gửi thay đổi sau ~0,8 giây, xử lý mất mạng và sửa đồng thời).
- `src/data/exchange.ts`: định dạng file xuất JSON v2 và bộ kiểm tra dữ liệu, dùng chung cho trình duyệt và API.
- `src/store/board.ts`: dữ liệu và thao tác phía trình duyệt (Zustand + persist, key localStorage `sakura-kanban`).
- `src/components/Board.tsx`: logic kéo thả (dnd-kit).
- `src/styles.css`: màu sắc và theme.
