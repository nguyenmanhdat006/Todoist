import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import { tagColor } from '../types';
import { useT } from '../i18n';
import { fold } from '../utils';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Chữ đang gõ dở, để nút Lưu cũng lấy được nhãn chưa nhấn Enter */
  draft: string;
  onDraftChange: (v: string) => void;
}

/** Thêm nhãn nếu chưa có (không phân biệt hoa thường), dùng lại cách viết của nhãn đã tồn tại */
export function addTag(list: string[], raw: string, known: string[]) {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return list;
  const key = fold(name);
  if (list.some((g) => fold(g) === key)) return list;
  const existing = known.find((g) => fold(g) === key);
  return [...list, existing ?? name];
}

export function TagPicker({ value, onChange, draft, onDraftChange }: Props) {
  const t = useT();
  const tasks = useBoard((s) => s.tasks);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const known = useMemo(() => {
    const set = new Set<string>();
    Object.values(tasks).forEach((x) => x.tags.forEach((g) => set.add(g)));
    return [...set].sort((a, b) => a.localeCompare(b, t.locale));
  }, [tasks, t.locale]);

  const q = fold(draft.trim());
  const suggestions = known.filter((g) => !value.includes(g) && (!q || fold(g).includes(q)));
  const isNew = !!q && !known.some((g) => fold(g) === q) && !value.some((g) => fold(g) === q);

  const commit = (raw: string) => {
    onChange(addTag(value, raw, known));
    onDraftChange('');
    inputRef.current?.focus();
  };

  return (
    <div className="tag-picker">
      <div
        className={`tag-input${focused ? ' is-focused' : ''}`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {value.map((g) => (
          <span key={g} className="tag tag-chip" style={{ '--tag': tagColor(g) } as CSSProperties}>
            {g}
            <button
              type="button"
              className="tag-remove"
              aria-label={t('modal.tagRemove', { tag: g })}
              onClick={() => onChange(value.filter((x) => x !== g))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id="task-tags"
          value={draft}
          placeholder={value.length ? '' : t('modal.tagsPh')}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',')) {
              const parts = v.split(',');
              let next = value;
              parts.slice(0, -1).forEach((p) => (next = addTag(next, p, known)));
              onChange(next);
              onDraftChange(parts[parts.length - 1]);
            } else onDraftChange(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (draft.trim()) commit(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>

      {(suggestions.length > 0 || isNew) && (
        <div className="tag-suggest">
          <span className="tag-suggest-label">{q ? t('modal.tagsMatch') : t('modal.tagsExisting')}</span>
          <div className="opts">
            {isNew && (
              <button type="button" className="opt opt-new" onClick={() => commit(draft)}>
                ＋ {t('modal.tagCreate', { tag: draft.trim() })}
              </button>
            )}
            {suggestions.map((g) => (
              <button key={g} type="button" className="opt" onClick={() => commit(g)}>
                <span className="opt-dot" style={{ '--c': tagColor(g) } as CSSProperties} />
                {g}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
