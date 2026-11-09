/**
 * Phần bên phải thanh đầu trang:
 *  - lời chào theo giờ trong ngày + một câu nói đổi mỗi ngày
 *  - thẻ "Tiếp theo": tự chuyển qua các việc sắp tới (đếm ngược với việc có giờ hôm nay)
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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

const QUEUE_MAX = 12;
const SLIDE_MS = 4000;

type SlideState = 'now' | 'soon' | 'today' | 'later';

function slideState(x: Task, today: string, nowMin: number): SlideState {
  if (x.dueDate! > today) return 'later';
  if (!x.startTime) return 'today';
  return span(x).start <= nowMin ? 'now' : 'soon';
}

/** Thẻ "Tiếp theo" tự chuyển qua từng việc sắp tới; rê chuột hoặc focus vào thì dừng */
function UpNext({
  queue,
  today,
  nowMin,
  t,
  onOpenTask,
}: {
  queue: Task[];
  today: string;
  nowMin: number;
  t: T;
  onOpenTask: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = queue.length;
  const i = index % n;

  useEffect(() => {
    if (n < 2 || paused) return;
    const id = setInterval(() => setIndex((v) => (v + 1) % n), SLIDE_MS);
    return () => clearInterval(id);
  }, [n, paused]);

  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(t.locale, { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(`${iso}T00:00`));

  return (
    <div
      className="hero-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hero-slides" style={{ transform: `translateY(-${i * 100}%)` }}>
        {queue.map((x, k) => {
          const state = slideState(x, today, nowMin);
          return (
            <button
              key={x.id}
              type="button"
              className={`hero-next is-${state}`}
              style={{ '--tag': colorOf(x) } as CSSProperties}
              tabIndex={k === i ? 0 : -1}
              aria-hidden={k !== i}
              onClick={() => onOpenTask(x.id)}
            >
              <span className="hero-next-top">
                <span className="hero-next-label">
                  {t('hero.next')}
                  {n > 1 && <span className="hero-next-pos">{` ${k + 1}/${n}`}</span>}
                </span>
                <span className="hero-badge">
                  {state === 'now' ? t('hero.now') : state === 'later' ? t('hero.later') : state === 'today' ? t('due.today') : t('hero.soon')}
                </span>
              </span>
              <span className="hero-next-title">{x.title}</span>
              <span className="hero-next-meta">
                {state === 'later' ? dateLabel(x.dueDate!) : t('due.today')}
                {' · '}
                {x.startTime ? timeRange(x) : t('rail.allDay')}
                {x.tags[0] && ` · ${x.tags[0]}`}
              </span>
              {(state === 'now' || state === 'soon') && (
                <span className="hero-next-count">
                  {state === 'now'
                    ? t('hero.endsIn', { n: duration(span(x).end - nowMin, t) })
                    : t('hero.startsIn', { n: duration(span(x).start - nowMin, t) })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {n > 1 && (
        <div className="hero-dots" role="tablist" aria-label={t('hero.next')}>
          {queue.map((x, k) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={k === i}
              aria-label={`${k + 1}/${n}: ${x.title}`}
              className={k === i ? 'on' : ''}
              onClick={() => setIndex(k)}
            />
          ))}
        </div>
      )}
    </div>
  );
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

  const { upcoming } = useMemo(() => {
    const done = new Set(columns.filter((c) => c.isDone).flatMap((c) => c.taskIds));
    const all = columns.flatMap((c) => c.taskIds).map((id) => tasks[id]).filter((x): x is Task => !!x);
    // Việc chưa xong từ hôm nay trở đi, theo thứ tự thời gian (việc cả ngày đứng đầu ngày đó)
    const upcoming = all
      .filter((x) => x.dueDate && !done.has(x.id) && x.dueDate >= today)
      .sort((a, b) => `${a.dueDate}${a.startTime ?? ''}`.localeCompare(`${b.dueDate}${b.startTime ?? ''}`));
    return { upcoming };
  }, [columns, tasks, today]);

  // Các việc sắp tới: chưa kết thúc (việc có giờ hôm nay đã qua giờ thì bỏ)
  const queue = upcoming
    .filter((x) => x.dueDate! > today || !x.startTime || span(x).end > nowMin)
    .slice(0, QUEUE_MAX);

  const name = user?.name || user?.email.split('@')[0] || '';
  const sayings = SAYINGS[t.lang];
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const saying = sayings[dayOfYear % sayings.length];

  return (
    <div className="hero-aside">
      <div className="hero-greet">
        <div className="hero-hello">
          <span className="hero-wave" aria-hidden="true">
            👋
          </span>
          <span>
            {t(greetingKey(now.getHours()))}
            {name && <strong>, {name}</strong>}
          </span>
        </div>
        <p className="hero-sub">{t('hero.welcome')}</p>
        <p className="hero-saying">“{saying}”</p>
      </div>

      <div className="hero-next-wrap">
        {queue.length > 0 ? (
          <UpNext queue={queue} today={today} nowMin={nowMin} t={t} onOpenTask={onOpenTask} />
        ) : (
          <div className="hero-next is-empty">
            <span className="hero-next-label">{t('hero.next')}</span>
            <span className="hero-next-meta">{t('hero.nothingNext')}</span>
          </div>
        )}

      </div>

    </div>
  );
}
