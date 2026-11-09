import { useEffect, useState } from 'react';

/** Thời gian hiện tại, cập nhật đúng lúc sang giây mới */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      id = setTimeout(tick, 1000 - d.getMilliseconds() + 5);
    };
    id = setTimeout(tick, 1000 - new Date().getMilliseconds() + 5);
    return () => clearTimeout(id);
  }, []);
  return now;
}

const TICKS = Array.from({ length: 60 }, (_, i) => i);

/** Đồng hồ kim: kim giờ, kim phút, kim giây; 12 vạch giờ và 60 vạch phút */
export function AnalogClock({ now, label }: { now: Date; label: string }) {
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  return (
    <svg className="clock" viewBox="0 0 100 100" role="img" aria-label={label}>
      <defs>
        <linearGradient id="clock-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--blue)" />
          <stop offset="1" stopColor="var(--orange)" />
        </linearGradient>
      </defs>
      <circle className="clock-face" cx="50" cy="50" r="46" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="url(#clock-ring)" strokeWidth="2.5" />
      {TICKS.map((i) => {
        const hour = i % 5 === 0;
        return (
          <line
            key={i}
            className={hour ? 'clock-tick is-hour' : 'clock-tick'}
            x1="50"
            y1={hour ? 9 : 10}
            x2="50"
            y2={hour ? 16 : 12.5}
            transform={`rotate(${i * 6} 50 50)`}
          />
        );
      })}
      <line className="clock-hand is-hour" x1="50" y1="54" x2="50" y2="28" transform={`rotate(${h * 30} 50 50)`} />
      <line className="clock-hand is-minute" x1="50" y1="56" x2="50" y2="18" transform={`rotate(${m * 6} 50 50)`} />
      <g transform={`rotate(${s * 6} 50 50)`}>
        <line className="clock-hand is-second" x1="50" y1="60" x2="50" y2="14" />
        <circle className="clock-second-tip" cx="50" cy="20" r="2.4" />
      </g>
      <circle className="clock-pin" cx="50" cy="50" r="3.2" />
    </svg>
  );
}

/**
 * Khối tiêu đề trang: đồng hồ kim + ngày + giờ số + tên trang.
 * Tự cập nhật mỗi giây trong component riêng, để không vẽ lại cả bảng công việc.
 */
export function TitleClock({ locale, title, clockLabel }: { locale: string; title: string; clockLabel: string }) {
  const now = useNow();
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  return (
    <div className="toolbar-title has-clock">
      <AnalogClock now={now} label={`${clockLabel}: ${time}`} />
      <div className="toolbar-title-text">
        <span className="eyebrow">{date}</span>
        <h1>{title}</h1>
        <span className="hero-time" aria-hidden="true">
          {time.slice(0, 5)}
          <span className="hero-sec">{time.slice(5)}</span>
        </span>
      </div>
    </div>
  );
}
