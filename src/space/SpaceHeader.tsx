/** Đầu trang dự án kiểu Jira: đường dẫn, tên dự án và các tab (Tóm tắt, Danh sách, Bảng, Lịch, Dòng thời gian, Tài liệu, Báo cáo) */
import type { ReactNode } from 'react';
import { useT, type TKey } from '../i18n';
import { SPACE_TABS, type ViewMode } from '../types';

type Tab = (typeof SPACE_TABS)[number];

const TAB_LABEL: Record<Tab, TKey> = {
  summary: 'space.tab.summary',
  list: 'nav.list',
  kanban: 'nav.board',
  calendar: 'nav.calendar',
  timeline: 'space.tab.timeline',
  docs: 'space.tab.docs',
  reports: 'space.tab.reports',
  backup: 'space.tab.backup',
};

const ICON: Record<Tab, ReactNode> = {
  summary: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2.6 2.3 2.6 11.7 0 14M10 3c-2.6 2.3-2.6 11.7 0 14" />
    </>
  ),
  list: <path d="M3 4.5h14v11H3zM3 8.5h14M3 12h14M7.5 4.5v11" />,
  kanban: <path d="M3 3.5h4v13H3zM8 3.5h4v8H8zM13 3.5h4v10h-4z" />,
  calendar: <path d="M3 5h14v12H3zM3 8.5h14M7 3v3.5M13 3v3.5" />,
  timeline: <path d="M3 5h8M6 10h11M4 15h8" />,
  docs: <path d="M5 3h7l3 3v11H5zM12 3v3h3M7.5 10h5M7.5 13h5" />,
  reports: <path d="M3 3v14h14M6.5 12l3-3 2.5 2.5 4-5" />,
  backup: <path d="M6 15.5h8.2a3.3 3.3 0 00.6-6.5 4.6 4.6 0 00-8.9 1A2.8 2.8 0 006 15.5zM10 8.5v5M8 11.6l2 2 2-2" />,
};

export function SpaceHeader({
  title,
  projectKey,
  view,
  onView,
  crumb,
  actions,
}: {
  title: string;
  projectKey?: string;
  view: ViewMode;
  onView: (v: Tab) => void;
  crumb: string;
  actions?: ReactNode;
}) {
  const t = useT();
  const mark = (projectKey || title).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '·';
  return (
    <div className="sp-head">
      <div className="sp-crumb">
        {crumb} <span aria-hidden="true">/</span>
      </div>
      <div className="sp-title-row">
        <span className="sp-mark" aria-hidden="true">
          {mark}
        </span>
        <h1 className="sp-title" title={title}>
          {title}
        </h1>
        {actions && <div className="sp-actions">{actions}</div>}
      </div>
      <div className="sp-tabs" role="tablist" aria-label={t('space.tabs')}>
        {SPACE_TABS.map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={view === tab} className={`sp-tab${view === tab ? ' on' : ''}`} onClick={() => onView(tab)}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {ICON[tab]}
            </svg>
            {t(TAB_LABEL[tab])}
          </button>
        ))}
      </div>
    </div>
  );
}
