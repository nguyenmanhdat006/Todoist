/**
 * Trang Danh sách dạng bảng tính: mỗi việc một hàng, sửa nhanh giai đoạn (cột), mức ưu tiên và tiến độ ngay trên bảng.
 * Bấm tiêu đề cột để sắp xếp.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import { Avatar, AvatarStack } from './Avatar';
import { userDirectory, usePeople } from '../sync/people';
import { useScopedEntries, useOverviewUsers, type Entry } from '../sync/overview';
import { useSession } from '../sync/session';
import type { Priority, Task } from '../types';
import { PRIORITIES } from '../types';
import { useT, type T } from '../i18n';
import { canTrackProgress, dueInfo, parseISO, progressOf, tagStyle, ticketLabel, timeRange } from '../utils';

interface Props {
  matches: (t: Task, done?: boolean, colId?: string) => boolean;
  /** Giữ để tương thích; bảng luôn chỉ hiện việc khớp bộ lọc */
  filtering?: boolean;
  /** boardId: bảng chứa việc (khác bảng đang mở thì app chuyển sang bảng đó trước khi mở) */
  onOpenTask: (id: string, boardId?: string) => void;
}

type SortKey = 'order' | 'key' | 'title' | 'board' | 'stage' | 'priority' | 'created' | 'due' | 'finished' | 'progress';

interface Row extends Entry {
  pct: number;
}

const PRIO_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

function fmtDate(iso: string | null | undefined, t: T) {
  if (!iso) return '';
  const d = iso.length === 10 ? parseISO(iso) : new Date(iso);
  return new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function ListView({ matches, onOpenTask }: Props) {
  const t = useT();
  const columns = useBoard((s) => s.columns);
  const entries = useScopedEntries();
  const { toggleDone, moveTask, updateTask } = useBoard.getState();
  const me = useSession((s) => s.user);
  const people = usePeople();
  const otherUsers = useOverviewUsers();
  const dir = userDirectory(me, people);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 });
  // Thứ tự bảng: theo lần xuất hiện đầu tiên trong danh sách (bảng cá nhân trước)
  const boardRank = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (!m.has(e.boardId)) m.set(e.boardId, m.size);
    return m;
  }, [entries]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const e of entries) if (matches(e.task, e.col.isDone, e.col.id)) out.push({ ...e, pct: progressOf(e.task, e.col) });
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      order: (a, b) => (boardRank.get(a.boardId) ?? 0) - (boardRank.get(b.boardId) ?? 0) || a.colIndex - b.colIndex || a.position - b.position,
      key: (a, b) => a.projectKey.localeCompare(b.projectKey) || (a.task.number ?? 1e9) - (b.task.number ?? 1e9),
      title: (a, b) => a.task.title.localeCompare(b.task.title, t.locale),
      board: (a, b) => (boardRank.get(a.boardId) ?? 0) - (boardRank.get(b.boardId) ?? 0),
      stage: (a, b) => a.colIndex - b.colIndex,
      priority: (a, b) => PRIO_RANK[a.task.priority] - PRIO_RANK[b.task.priority],
      created: (a, b) => a.task.createdAt.localeCompare(b.task.createdAt),
      // Việc không có hạn / chưa xong luôn nằm cuối
      due: (a, b) => (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999') || (a.task.startTime ?? '').localeCompare(b.task.startTime ?? ''),
      finished: (a, b) => (a.task.completedAt ?? '9999').localeCompare(b.task.completedAt ?? '9999'),
      progress: (a, b) => a.pct - b.pct,
    };
    const base = cmp.order;
    return out.sort((a, b) => sort.dir * cmp[sort.key](a, b) || base(a, b));
  }, [entries, matches, sort, boardRank, t.locale]);

  // Người (avatar + tên) cho cột Phụ trách / Người tạo
  const person = (id: string | null | undefined) => {
    if (!id) return <span className="lt-none">—</span>;
    const u = dir.get(id) ?? otherUsers.get(id);
    if (!u) return <span className="lt-none">?</span>;
    return (
      <span className="lt-who" title={u.email}>
        <Avatar user={u} size={22} />
        <span>{u.name || u.email.split('@')[0]}</span>
      </span>
    );
  };

  const head = (key: SortKey, label: string, className = '') => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        className={`lt-sort${sort.key === key ? ' on' : ''}`}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))}
      >
        {label}
        <span className="lt-arrow" aria-hidden="true">
          {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );

  return (
    <div className="list-wrap">
      <div className="lt-scroll">
        <table className="lt">
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 96 }} />
            <col />
            <col style={{ width: 170 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 200 }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-label={t('list.done')} />
              {head('key', t('ticket.key'))}
              {head('title', t('list.task'), 'is-left')}
              {head('board', t('list.board'), 'is-left')}
              {head('stage', t('list.stage'))}
              {head('priority', t('list.priority'))}
              <th>{t('list.tags')}</th>
              <th>{t('ticket.assignee')}</th>
              <th>{t('list.assignees')}</th>
              <th>{t('ticket.reporter')}</th>
              {head('created', t('list.created'))}
              {head('due', t('list.due'))}
              {head('finished', t('list.finished'))}
              {head('progress', t('list.progress'), 'is-left')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="lt-empty">
                  {t('list.empty')}
                </td>
              </tr>
            ) : (
              rows.map(({ key, task, col, pct, boardId, boardName, projectName, projectKey, kind, foreign }) => {
                const done = col.isDone;
                const due = dueInfo(task.dueDate, done, t);
                // Việc ở bảng khác chỉ xem; muốn sửa nhanh thì mở bảng đó (bấm tên việc)
                const tracked = canTrackProgress(col) && !foreign;
                const lock = foreign ? t('list.otherBoard') : undefined;
                return (
                  <tr key={key} className={`${done ? 'is-done' : ''}${foreign ? ' is-foreign' : ''}`}>
                    <td className="lt-check">
                      <input
                        type="checkbox"
                        className="card-check"
                        checked={done}
                        aria-label={done ? t('card.uncheck') : t('card.check')}
                        disabled={foreign}
                        title={lock}
                        onChange={() => toggleDone(task.id)}
                      />
                    </td>
                    <td>
                      {ticketLabel(task, projectKey) ? <span className="ticket-key">{ticketLabel(task, projectKey)}</span> : <span className="ticket-key is-pending">{projectKey ? `${projectKey}-…` : '—'}</span>}
                    </td>
                    <td className="is-left">
                      <button type="button" className="lt-title" onClick={() => onOpenTask(task.id, boardId)} title={task.note || task.title}>
                        {task.title}
                      </button>
                    </td>
                    <td className="lt-board" title={`${projectName} · ${boardName}`}>
                      <span className={`lt-board-project${kind === 'personal' ? ' is-personal' : ''}`}>{projectName}</span>
                      <span className="lt-board-name">{boardName}</span>
                    </td>
                    <td>
                      <label className="lt-select" style={{ '--col': col.color } as CSSProperties}>
                        <select
                          aria-label={t('list.stage')}
                          value={col.id}
                          disabled={foreign}
                          title={lock}
                          onChange={(e) => {
                            const target = columns.find((c) => c.id === e.target.value);
                            if (target) moveTask(task.id, target.id, target.taskIds.length);
                          }}
                        >
                          {(foreign ? [col] : columns).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td className={`lt-prio prio-${task.priority}`}>
                      <select
                        aria-label={t('list.priority')}
                        value={task.priority}
                        disabled={foreign}
                        title={lock}
                        onChange={(e) => updateTask(task.id, { priority: e.target.value as Priority })}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {t(`prio.${p}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="lt-tags">
                      {task.tags.map((g) => (
                        <span key={g} className="tag" style={tagStyle(g)}>
                          {g}
                        </span>
                      ))}
                    </td>
                    <td className="lt-person">{person(task.assigneeId)}</td>
                    <td>
                      <AvatarStack users={(task.assignees ?? []).map((id) => dir.get(id) ?? otherUsers.get(id) ?? { id, name: '?', email: '?' })} max={3} size={22} />
                    </td>
                    <td className="lt-person">{person(task.creatorId)}</td>
                    <td className="lt-date">{fmtDate(task.createdAt, t)}</td>
                    <td className={`lt-date${due ? ` due-${due.tone}` : ''}`}>
                      {task.dueDate && (
                        <>
                          {fmtDate(task.dueDate, t)}
                          {task.startTime && <span className="lt-time">{timeRange(task)}</span>}
                        </>
                      )}
                    </td>
                    <td className="lt-date">{done && task.completedAt && <span className="lt-finished">{fmtDate(task.completedAt, t)}</span>}</td>
                    <td className="lt-progress">
                      <span className="lt-pct">{tracked || done ? `${pct}%` : '—'}</span>
                      {tracked ? (
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={pct}
                          aria-label={`${t('progress.label')}: ${task.title}`}
                          style={{ '--p': `${pct}%` } as CSSProperties}
                          onChange={(e) => updateTask(task.id, { progress: Number(e.target.value) })}
                        />
                      ) : (
                        <span className="lt-bar" aria-hidden="true">
                          <i style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
