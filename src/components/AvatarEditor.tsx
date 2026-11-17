import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import type { ApiUser } from '../sync/api';
import { Avatar } from './Avatar';

const PREVIEW = 176;
const OUT = 256;
const MAX_BYTES = 150 * 1024;

export const ACCEPTED_IMAGES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

/** Chọn vùng vuông của ảnh (kéo để dời, thanh để phóng) rồi xuất ra ảnh 256 × 256 nhỏ gọn */
export function AvatarEditor({ file, busy, onCancel, onSave }: { file: File; busy: boolean; onCancel: () => void; onSave: (dataUrl: string) => void }) {
  const t = useT();
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Tâm vùng cắt, tính theo điểm ảnh của ảnh gốc
  const [centre, setCentre] = useState({ x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    createImageBitmap(file)
      .then((b) => {
        if (!alive) return;
        setBmp(b);
        setCentre({ x: b.width / 2, y: b.height / 2 });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file]);

  const side = bmp ? Math.min(bmp.width, bmp.height) / zoom : 1;
  // Giữ vùng cắt nằm trong ảnh
  const clamp = (c: { x: number; y: number }) =>
    bmp ? { x: Math.max(side / 2, Math.min(bmp.width - side / 2, c.x)), y: Math.max(side / 2, Math.min(bmp.height - side / 2, c.y)) } : c;
  const at = clamp(centre);

  const draw = (cv: HTMLCanvasElement, size: number) => {
    const ctx = cv.getContext('2d');
    if (!ctx || !bmp) return;
    cv.width = size;
    cv.height = size;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, at.x - side / 2, at.y - side / 2, side, side, 0, 0, size, size);
  };

  useEffect(() => {
    if (canvas.current) draw(canvas.current, PREVIEW * 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bmp, zoom, centre.x, centre.y]);

  const onDown = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: at.x, cy: at.y };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const k = side / PREVIEW;
    setCentre({ x: d.cx - (e.clientX - d.x) * k, y: d.cy - (e.clientY - d.y) * k });
  };
  const onUp = () => {
    drag.current = null;
  };

  const save = () => {
    if (!bmp) return;
    const out = document.createElement('canvas');
    draw(out, OUT);
    // WebP nhỏ hơn; trình duyệt không mã hoá được WebP thì dùng JPEG
    let url = '';
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      url = out.toDataURL('image/webp', q);
      if (!url.startsWith('data:image/webp')) url = out.toDataURL('image/jpeg', q);
      if (url.length * 0.75 <= MAX_BYTES) break;
    }
    onSave(url);
  };

  if (failed) return <p className="avatar-edit-error">{t('profile.err.bad_image')}</p>;

  return (
    <div className="avatar-editor">
      <div className="avatar-crop" style={{ width: PREVIEW, height: PREVIEW }}>
        <canvas
          ref={canvas}
          style={{ width: PREVIEW, height: PREVIEW }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label={t('profile.avatarDrag')}
        />
      </div>
      <div className="avatar-edit-side">
        <p className="hint">{t('profile.avatarDrag')}</p>
        <label className="avatar-zoom">
          <span>{t('profile.avatarZoom')}</span>
          <input type="range" min={1} max={4} step={0.02} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label={t('profile.avatarZoom')} />
        </label>
        <div className="avatar-edit-actions">
          <button type="button" className="btn primary sm" disabled={!bmp || busy} onClick={save}>
            {t('profile.avatarSave')}
          </button>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onCancel}>
            {t('act.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

type AvatarUser = Pick<ApiUser, 'id' | 'name' | 'email' | 'avatarV'>;

/** Bấm vào ảnh đại diện: hiện menu Xem ảnh / Chọn ảnh / Gỡ ảnh */
export function AvatarMenu({
  user,
  size = 72,
  disabled,
  onView,
  onChoose,
  onRemove,
}: {
  user: AvatarUser;
  size?: number;
  disabled?: boolean;
  onView: () => void;
  onChoose: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const has = !!user.avatarV;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="avatar-menu-wrap" ref={ref}>
      <button type="button" className="avatar-trigger" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((v) => !v)} title={t('profile.avatar')} aria-label={t('profile.avatar')}>
        <Avatar user={user} size={size} title="" />
        <span className="avatar-cam" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 5.5h2l1-1.5h6l1 1.5h2V13H2zM8 11.2a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6z" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="avatar-menu" role="menu">
          {has && (
            <button type="button" role="menuitem" onClick={run(onView)}>
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="14" height="14" rx="3" />
                <circle cx="10" cy="8.3" r="2.2" />
                <path d="M5.5 15.2c.7-2.2 2.3-3.2 4.5-3.2s3.8 1 4.5 3.2" />
              </svg>
              {t('profile.avatarView')}
            </button>
          )}
          <button type="button" role="menuitem" onClick={run(onChoose)}>
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="14" height="14" rx="3" />
              <circle cx="7.5" cy="7.8" r="1.4" />
              <path d="M3.5 14.5l4-4 3 3 2-2 4 4" />
            </svg>
            {t('profile.avatarChoose')}
          </button>
          {has && (
            <button type="button" role="menuitem" className="danger" onClick={run(onRemove)}>
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6" />
              </svg>
              {t('profile.avatarRemove')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Xem ảnh đại diện cỡ lớn */
export function AvatarLightbox({ user, onClose }: { user: AvatarUser; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={t('profile.avatarView')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="icon-btn lightbox-x" onClick={onClose} aria-label={t('modal.close')}>
        ✕
      </button>
      <figure>
        <img src={`/api/avatars/${user.id}?v=${user.avatarV ?? 0}`} alt={user.name || user.email} />
        <figcaption>{user.name || user.email}</figcaption>
      </figure>
    </div>,
    document.body,
  );
}
