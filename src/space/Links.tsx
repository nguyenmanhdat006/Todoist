/** Tab Tài liệu và Báo cáo: danh sách liên kết (Google Drive, Docs, Sheets, Notion...) gắn vào dự án */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { askConfirm } from '../confirm';
import { useT, type TKey } from '../i18n';
import { ApiError, type ProjectLink } from '../sync/api';
import { addLink, loadLinks, removeLink, updateLink, useLinks } from '../sync/links';
import { projectOfBoard, usePeople, userDirectory } from '../sync/people';
import { useSession } from '../sync/session';
import { showToast } from '../toast';
import { Dialog } from '../components/Social';

type Kind = ProjectLink['kind'];

interface Provider {
  name: string;
  color: string;
  glyph: string;
}

/** Nhận ra nơi lưu tài liệu từ địa chỉ, để hiện đúng biểu tượng và tên */
function providerOf(raw: string): Provider {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { name: 'Link', color: '#64748b', glyph: '↗' };
  }
  const h = u.hostname.replace(/^www\./, '');
  const p = u.pathname;
  if (h === 'docs.google.com') {
    if (p.startsWith('/spreadsheets')) return { name: 'Google Sheets', color: '#0f9d58', glyph: 'S' };
    if (p.startsWith('/presentation')) return { name: 'Google Slides', color: '#f4b400', glyph: 'P' };
    if (p.startsWith('/forms')) return { name: 'Google Forms', color: '#7248b9', glyph: 'F' };
    return { name: 'Google Docs', color: '#4285f4', glyph: 'D' };
  }
  if (h === 'drive.google.com') return { name: 'Google Drive', color: '#1fa463', glyph: '▲' };
  if (h === 'lookerstudio.google.com' || h === 'datastudio.google.com') return { name: 'Looker Studio', color: '#4285f4', glyph: 'L' };
  if (h.endsWith('notion.so') || h.endsWith('notion.site')) return { name: 'Notion', color: '#222222', glyph: 'N' };
  if (h.endsWith('figma.com')) return { name: 'Figma', color: '#f24e1e', glyph: 'F' };
  if (h.endsWith('github.com')) return { name: 'GitHub', color: '#24292f', glyph: 'G' };
  if (h.endsWith('dropbox.com')) return { name: 'Dropbox', color: '#0061ff', glyph: 'D' };
  if (h.endsWith('sharepoint.com') || h.endsWith('onedrive.live.com') || h.endsWith('1drv.ms') || h.endsWith('office.com')) return { name: 'Microsoft 365', color: '#0078d4', glyph: 'M' };
  if (h.endsWith('canva.com')) return { name: 'Canva', color: '#00c4cc', glyph: 'C' };
  if (h.endsWith('miro.com')) return { name: 'Miro', color: '#f5b400', glyph: 'M' };
  if (h.endsWith('atlassian.net')) return { name: 'Atlassian', color: '#0c66e4', glyph: 'A' };
  return { name: h, color: '#64748b', glyph: (h[0] ?? '↗').toUpperCase() };
}

const KNOWN = ['invalid_url', 'invalid_name', 'too_many_links', 'forbidden', 'link_not_found', 'project_not_found', 'network'] as const;
function errText(e: unknown, t: (k: TKey) => string) {
  const code = e instanceof ApiError ? e.code : 'network';
  return (KNOWN as readonly string[]).includes(code) ? t(`space.link.err.${code}` as TKey) : t('err.server_error');
}

function LinkDialog({ projectId, kind, link, onClose }: { projectId: string; kind: Kind; link?: ProjectLink; onClose: () => void }) {
  const t = useT();
  const [url, setUrl] = useState(link?.url ?? '');
  const [title, setTitle] = useState(link?.title ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    if (!url.trim()) {
      setError(t('space.link.err.invalid_url'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (link) await updateLink(projectId, link.id, url, title);
      else await addLink(projectId, kind, url, title);
      onClose();
    } catch (e) {
      setError(errText(e, t));
      setBusy(false);
    }
  };

  return (
    <Dialog title={t(link ? 'space.link.edit' : kind === 'doc' ? 'space.docs.add' : 'space.reports.add')} onClose={onClose}>
      <form className="project-form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>{t('space.link.url')}</span>
          <input ref={first} type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/…" maxLength={2000} autoComplete="off" spellCheck={false} />
        </label>
        <label className="field">
          <span>{t('space.link.title')}</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('space.link.titlePh')} maxLength={120} />
        </label>
        <p className="hint">{t('space.link.hint')}</p>
        {error && <small className="error">{error}</small>}
        <footer className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('modal.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {t(link ? 'space.link.save' : 'space.link.add')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export function LinksView({ kind }: { kind: Kind }) {
  const t = useT();
  const board = useSession((s) => s.board);
  const me = useSession((s) => s.user);
  const people = usePeople();
  const project = projectOfBoard(board ?? me?.id ?? null, people.projects);
  const dir = userDirectory(me, people);
  const { links, loading, failed, projectId } = useLinks();
  const [dialog, setDialog] = useState<{ link?: ProjectLink } | null>(null);
  const pid = project?.id ?? null;

  useEffect(() => {
    void loadLinks(pid);
  }, [pid]);

  const mine = projectId === pid ? links.filter((l) => l.kind === kind) : [];
  const canManage = (l: ProjectLink) => project?.role === 'host' || l.createdBy === me?.id;

  const remove = async (l: ProjectLink) => {
    if (!pid) return;
    const ok = await askConfirm({ message: t('space.link.removeConfirm', { title: l.title }), danger: true });
    if (!ok) return;
    try {
      await removeLink(pid, l.id);
    } catch (e) {
      showToast(errText(e, t), { kind: 'error' });
    }
  };

  const fmt = (iso: string) => new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  const title = t(kind === 'doc' ? 'space.tab.docs' : 'space.tab.reports');

  return (
    <div className="lk">
      <div className="lk-head">
        <div>
          <h2>{title}</h2>
          <p>{t(kind === 'doc' ? 'space.docs.desc' : 'space.reports.desc')}</p>
        </div>
        {pid && (
          <button type="button" className="btn primary" onClick={() => setDialog({})}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t(kind === 'doc' ? 'space.docs.add' : 'space.reports.add')}
          </button>
        )}
      </div>

      {failed && <p className="lk-note is-error">{t('space.link.loadFailed')}</p>}

      {mine.length === 0 ? (
        <div className="lk-empty">
          <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {kind === 'doc' ? <path d="M12 5h17l8 8v30H12zM29 5v8h8M18 22h14M18 29h14M18 36h9" /> : <path d="M7 7v34h34M15 31l9-9 7 7 11-13" />}
          </svg>
          <b>{loading ? t('space.loading') : t(kind === 'doc' ? 'space.docs.empty' : 'space.reports.empty')}</b>
          {!loading && <span>{t('space.link.emptyHint')}</span>}
        </div>
      ) : (
        <ul className="lk-grid">
          {mine.map((l) => {
            const p = providerOf(l.url);
            const by = l.createdBy ? dir.get(l.createdBy) : undefined;
            return (
              <li key={l.id} className="lk-card">
                <a className="lk-main" href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
                  <span className="lk-ico" style={{ background: p.color }} aria-hidden="true">
                    {p.glyph}
                  </span>
                  <span className="lk-text">
                    <b>{l.title}</b>
                    <small>{p.name}</small>
                  </span>
                  <svg className="lk-out" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 3h4v4M13 3L7.5 8.5M6 4H3.5v8.5H12V10" />
                  </svg>
                </a>
                <div className="lk-foot">
                  <span>
                    {by ? `${by.name || by.email.split('@')[0]} · ` : ''}
                    {fmt(l.createdAt)}
                  </span>
                  {canManage(l) && (
                    <span className="lk-actions">
                      <button type="button" onClick={() => setDialog({ link: l })}>
                        {t('act.edit')}
                      </button>
                      <button type="button" className="is-danger" onClick={() => void remove(l)}>
                        {t('act.delete')}
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && pid && <LinkDialog key={dialog.link?.id ?? 'new'} projectId={pid} kind={kind} link={dialog.link} onClose={() => setDialog(null)} />}
    </div>
  );
}
