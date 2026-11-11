/** Khung xương của bảng khi đang mở bảng khác */
export function BoardSkeleton() {
  const cols = [3, 2, 2, 1, 2];
  return (
    <div className="skeleton-board" aria-busy="true" aria-live="polite">
      {cols.map((n, i) => (
        <div key={i} className="skeleton-col" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="skeleton-head">
            <span className="sk sk-dot" />
            <span className="sk sk-title" />
          </div>
          {Array.from({ length: n }, (_, j) => (
            <div key={j} className="skeleton-card">
              <span className="sk sk-line w80" />
              <span className="sk sk-line w50" />
              <span className="sk sk-tag" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
