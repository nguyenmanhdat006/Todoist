# Kanban Todo

Ứng dụng quản lý công việc cá nhân dạng Kanban. Chỉ có frontend, dữ liệu lưu trong `localStorage` của trình duyệt.

## Chạy

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # xuất ra dist/
```

## Deploy lên Vercel

Import repo vào Vercel. Vercel tự nhận Vite: build command `npm run build`, output `dist`. Không cần biến môi trường.

## Tính năng

- Kanban kéo thả: kéo thẻ giữa các cột, đổi thứ tự trong cột, kéo tiêu đề cột để đổi chỗ cột (chuột, cảm ứng, bàn phím Space).
- 5 cột mặc định luôn có: Quá hạn, Cần làm, Đang làm, Chờ xem lại, Hoàn thành. Việc quá hạn tự chuyển vào cột Quá hạn, đổi hạn sang ngày sau thì tự trả về cột cũ.
- Thêm, sửa, xoá cột riêng; đổi màu cột.
- Tick ô vuông trên thẻ để chuyển việc sang cột Hoàn thành.
- Công việc: tiêu đề, ghi chú, ưu tiên (Gấp / Bình thường / Thấp), hạn chót, nhãn màu.
- Tìm kiếm không cần gõ dấu, lọc việc gấp và quá hạn.
- Xem dạng Danh sách, tick để chuyển việc sang cột Hoàn thành.
- Hoàn tác khi xoá việc, xoá cột, nhập dữ liệu.
- Giao diện sáng và tối.
- Chuyển ngôn ngữ Tiếng Việt / English (nút VI | EN trên thanh trên cùng). Chuỗi giao diện nằm trong `src/i18n.ts`.
- Xuất/nhập file JSON để sao lưu.
- Phím tắt: `N` thêm việc, `/` tìm kiếm.

## Cấu trúc

- `src/store/board.ts`: toàn bộ dữ liệu và thao tác (Zustand + persist, key localStorage `sakura-kanban`, giữ nguyên tên cũ để không mất dữ liệu). Muốn chuyển sang database (ví dụ Neon) thì chỉ cần thay phần này.
- `src/components/Board.tsx`: logic kéo thả (dnd-kit).
- `src/styles.css`: màu sắc và theme.
