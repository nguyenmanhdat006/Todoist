import { useBoard } from '../store/board';
import { buildExport, exportFileName } from './exchange';

/** Tải file JSON chứa toàn bộ dữ liệu hiện có trong trình duyệt. Trả về tên file và số việc. */
export function downloadExport() {
  const now = new Date();
  const file = buildExport(useBoard.getState(), now);
  const name = exportFileName(now);
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name, tasks: file.counts.tasks };
}
