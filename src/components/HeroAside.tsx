/**
 * Phần bên phải thanh đầu trang:
 *  - lời chào theo giờ trong ngày + một câu nói đổi mỗi ngày
 *  - thẻ "Tiếp theo": việc có giờ sắp diễn ra (đếm ngược), tiến độ hôm nay
 *  - dải giờ hôm nay: các việc có giờ thành khối màu, vạch đỏ ở giờ hiện tại
 */
import { useMemo, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import { useSession } from '../sync/session';
import type { Task } from '../types';
import { tagColor } from '../types';
import { useT, type T } from '../i18n';
import { timeRange, toISODate, toMinutes } from '../utils';
import { useNow } from './Clock';
import '../hero.css';

interface Props {
  onOpenTask: (id: string) => void;
}

const NO_TAG = '#94a3b8';

/** Câu nói trong ngày (tự viết), chọn theo ngày trong năm */
const SAYINGS: Record<'vi' | 'en', string[]> = {
  vi: [
    'Làm xong một việc nhỏ còn hơn lên kế hoạch cho mười việc lớn.',
    'Bắt đầu từ việc khó nhất, phần còn lại sẽ nhẹ hơn.',
    'Mỗi ngày tiến một chút là đủ để đi rất xa.',
    'Tập trung vào một việc, làm cho xong, rồi mới sang việc khác.',
    'Nghỉ ngơi cũng là một phần của làm việc hiệu quả.',
    'Đừng chờ có hứng mới làm, cứ làm rồi hứng sẽ đến.',
    'Việc gì làm được trong hai phút thì làm ngay.',
    'Một danh sách gọn gàng giúp đầu óc nhẹ nhõm hơn.',
    'Hôm nay chăm chỉ, ngày mai nhẹ nhàng.',
    'Chia việc lớn thành các bước nhỏ, rồi đi từng bước.',
    'Đánh dấu hoàn thành là niềm vui nhỏ nhưng thật.',
    'Ưu tiên điều quan trọng, không phải điều gấp nhất.',
  ],
  en: [
    'Finishing one small task beats planning ten big ones.',
    'Start with the hardest thing; the rest gets lighter.',
    'A little progress every day adds up to a long way.',
    'Focus on one thing, finish it, then move on.',
    'Rest is part of doing good work.',
    "Don't wait for motivation; start, and it will follow.",
    'If it takes two minutes, do it now.',
    'A tidy list makes for a lighter mind.',
    'Work hard today so tomorrow feels easy.',
    'Break big work into small steps, then take them one by one.',
    'Ticking a box is a small joy, but a real one.',
    'Put the important before the urgent.',
  ],
};

function greetingKey(h: number) {
  if (h >= 5 && h < 11) return 'hero.morning' as const;
  if (h >= 11 && h < 13) return 'hero.noon' as const;
  if (h >= 13 && h < 18) return 'hero.afternoon' as const;
  if (h >= 18 && h < 23) return 'hero.evening' as const;
  return 'hero.night' as const;
}

/** "25 phút", "1 giờ 20 phút" */
function duration(min: number, t: T) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return t('time.min', { n: m });
  return m ? `${t('time.hour', { n: h })} ${t('time.min', { n: m })}` : t('time.hour', { n: h });
}

const colorOf = (task: Task) => (task.tags[0] ? tagColor(task.tags[0]) : NO_TAG);

function span(task: Task) {
  const start = toMinutes(task.startTime!);
  let end = task.endTime ? toMinutes(task.endTime) : start + 60;
  if (end <= start) end = start + 30;
  return { start, end: Math.min(end, 24 * 60) };
}

export function HeroAside({ onOpenTask }: Props) {
  const t = useT();
  const now = useNow();
  const user = useSession((s) => s.user);
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);

  const today = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const { todayTimed, todayAll, doneToday, done, upcoming } = useMemo(() => {
    const done = new Set(columns.filter((c) => c.isDone).flatMap((c) => c.taskIds));
    const all = columns.flatMap((c) => c.taskIds).map((id) => tasks[id]).filter((x): x is Task => !!x);
    const todayAll = all.filter((x) => x.dueDate === today);
    const todayTimed = todayAll.filter((x) => x.startTime).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
    // Việc có giờ chưa xong, sắp tới (kể cả các ngày sau), theo thứ tự thời gian
    const upcoming = all
      .filter((x) => x.dueDate && x.startTime && !done.has(x.id) && x.dueDate >= today)
      .sort((a, b) => `${a.dueDate}${a.startTime}`.localeCompare(`${b.dueDate}${b.startTime}`));
    return { todayTimed, todayAll, doneToday: todayAll.filter((x) => done.has(x.id)).length, done, upcoming };
  }, [columns, tasks, today]);

  // Việc tiếp theo: đang diễn ra, hoặc gần nhất chưa bắt đầu
  const next = upcoming.find((x) => x.dueDate! > today || span(x).end > nowMin);
  const nextState = !next
    ? null
    : next.dueDate! > today
      ? 'later'
      : span(next).start <= nowMin
        ? 'now'
        : 'soon';

  const name = user?.name || user?.email.split('@')[0] || '';
  const sayings = SAYINGS[t.lang];
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const saying = sayings[dayOfYear % sayings.length];

  // Khung giờ của dải: ít nhất 6h–22h, nới ra nếu có việc sớm/muộn hơn
  const range = useMemo(() => {
    let from = 6 * 60;
    let to = 22 * 60;
    for (const x of todayTimed) {
      const s = span(x);
      from = Math.min(from, Math.floor(s.start / 60) * 60);
      to = Math.max(to, Math.ceil(s.end / 60) * 60);
    }
    return { from, to };
  }, [todayTimed]);
  const pct = (m: number) => ((Math.min(Math.max(m, range.from), range.to) - range.from) / (range.to - range.from)) * 100;
  const hours: number[] = [];
  for (let h = range.from / 60; h <= range.to / 60; h += 3) hours.push(h);

  return (
    <div className="hero-aside">
      <div className="hero-greet">
        <div className="hero-hello">
          <svg className="hero-wave" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
            <path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v8" />
            <path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14" />
            <path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-2.5-4.3a1.5 1.5 0 0 1 2.6-1.5L8 14" />
          </svg>
          <span>
            {t(greetingKey(now.getHours()))}
            {name && <strong>, {name}</strong>}
          </span>
        </div>
        <p className="hero-sub">{t('hero.welcome')}</p>
        <p className="hero-saying">“{saying}”</p>
      </div>

      <div className="hero-next-wrap">
        {next ? (
          <button
            type="button"
            className={`hero-next is-${nextState}`}
            style={{ '--tag': colorOf(next) } as CSSProperties}
            onClick={() => onOpenTask(next.id)}
          >
            <span className="hero-next-top">
              <span className="hero-next-label">{t('hero.next')}</span>
              <span className="hero-badge">
                {nextState === 'now' ? t('hero.now') : nextState === 'soon' ? t('hero.soon') : t('hero.later')}
              </span>
            </span>
            <span className="hero-next-title">{next.title}</span>
            <span className="hero-next-meta">
              {nextState === 'later' &&
                new Intl.DateTimeFormat(t.locale, { weekday: 'short', day: 'numeric', month: 'numeric' }).format(
                  new Date(`${next.dueDate}T00:00`),
                ) + ' · '}
              {timeRange(next)}
              {next.tags[0] && ` · ${next.tags[0]}`}
            </span>
            {nextState !== 'later' && (
              <span className="hero-next-count">
                {nextState === 'now'
                  ? t('hero.endsIn', { n: duration(span(next).end - nowMin, t) })
                  : t('hero.startsIn', { n: duration(span(next).start - nowMin, t) })}
              </span>
            )}
          </button>
        ) : (
          <div className="hero-next is-empty">
            <span className="hero-next-label">{t('hero.next')}</span>
            <span className="hero-next-meta">{t('hero.nothingNext')}</span>
          </div>
        )}

        {todayAll.length > 0 && (
          <div className="hero-progress">
            <span>{t('hero.todayProgress', { done: doneToday, total: todayAll.length })}</span>
            <span className="hero-progress-bar" aria-hidden="true">
              <i style={{ width: `${(doneToday / todayAll.length) * 100}%` }} />
            </span>
          </div>
        )}
      </div>

      <div className="hero-timeline" aria-label={t('hero.timeline')}>
        <div className="hero-track">
          {todayTimed.map((x) => {
            const s = span(x);
            return (
              <button
                key={x.id}
                type="button"
                className={`hero-block${done.has(x.id) ? ' is-done' : ''}`}
                style={{ '--tag': colorOf(x), left: `${pct(s.start)}%`, width: `${Math.max(pct(s.end) - pct(s.start), 1.5)}%` } as CSSProperties}
                title={`${timeRange(x)} · ${x.title}`}
                aria-label={`${timeRange(x)} · ${x.title}`}
                onClick={() => onOpenTask(x.id)}
              />
            );
          })}
          {nowMin >= range.from && nowMin <= range.to && <span className="hero-now" style={{ left: `${pct(nowMin)}%` }} aria-hidden="true" />}
        </div>
        <div className="hero-hours" aria-hidden="true">
          {hours.map((h) => (
            <span key={h} style={{ left: `${pct(h * 60)}%` }}>
              {h}h
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
