import type { CSSProperties } from 'react';
import type { ApiUser } from '../sync/api';

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#16a34a', '#ca8a04', '#475569'];

function colorOf(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function initials(u: Pick<ApiUser, 'name' | 'email'>) {
  const words = (u.name || u.email.split('@')[0]).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Ảnh đại diện vuông với chữ cái đầu, màu cố định theo người dùng */
export function Avatar({ user, size = 24, title }: { user: Pick<ApiUser, 'id' | 'name' | 'email'>; size?: number; title?: string }) {
  return (
    <span
      className="avatar"
      title={title ?? (user.name ? `${user.name} · ${user.email}` : user.email)}
      style={{ '--av': colorOf(user.id), width: size, height: size, fontSize: Math.round(size * 0.42) } as CSSProperties}
    >
      {initials(user)}
    </span>
  );
}

/** Dãy avatar chồng nhau, quá `max` thì hiện +N */
export function AvatarStack({
  users,
  max = 3,
  size = 24,
  leadId,
}: {
  users: Pick<ApiUser, 'id' | 'name' | 'email'>[];
  max?: number;
  size?: number;
  /** Người phụ trách: đứng đầu và có viền nổi bật */
  leadId?: string | null;
}) {
  if (users.length === 0) return null;
  const ordered = leadId ? [...users.filter((u) => u.id === leadId), ...users.filter((u) => u.id !== leadId)] : users;
  const shown = ordered.slice(0, max);
  const more = ordered.length - shown.length;
  return (
    <span className="avatar-stack" aria-label={users.map((u) => u.name || u.email).join(', ')}>
      {shown.map((u) => (
        <span key={u.id} className={u.id === leadId ? 'avatar-lead' : undefined}>
          <Avatar user={u} size={size} />
        </span>
      ))}
      {more > 0 && (
        <span className="avatar avatar-more" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
          +{more}
        </span>
      )}
    </span>
  );
}
