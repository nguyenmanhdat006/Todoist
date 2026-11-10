import type { Task } from '../types';

/** Việc mẫu mà các bản cũ từng nạp sẵn (tiêu đề + ghi chú, cả hai ngôn ngữ) */
const SAMPLE: [string, string][] = [
  ['Kéo thẻ này sang cột khác thử xem', 'Đây là dữ liệu mẫu. Bấm vào thẻ để sửa, tick ô vuông để đánh dấu xong.'],
  ['Nộp báo cáo tuần', ''],
  ['Đặt lịch khám răng', ''],
  ['Học 15 từ tiếng Nhật', 'Bài 12 – Minna no Nihongo'],
  ['Làm slide thuyết trình', ''],
  ['Sửa CV gửi HR', ''],
  ['Thanh toán tiền điện', ''],
  ['Try dragging this card to another column', 'This is sample data. Click a card to edit it, tick the box to mark it done.'],
  ['Send the weekly report', ''],
  ['Book a dentist appointment', ''],
  ['Learn 15 Japanese words', 'Lesson 12 – Minna no Nihongo'],
  ['Finish the presentation slides', ''],
  ['Update CV for HR', ''],
  ['Pay the electricity bill', ''],
];
const KEYS = new Set(SAMPLE.map(([t, n]) => `${t}\u0000${n}`));

/**
 * Id của các việc mẫu cũ còn nguyên (tiêu đề và ghi chú chưa sửa).
 * Chỉ coi là việc mẫu khi có từ 4 việc trở lên khớp, để không đụng tới việc thật trùng tên.
 */
export function findSampleTaskIds(tasks: Record<string, Task>): string[] {
  const hits = Object.values(tasks).filter((x) => KEYS.has(`${x.title}\u0000${x.note}`));
  return hits.length >= 4 ? hits.map((x) => x.id) : [];
}
