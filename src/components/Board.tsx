import { useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useBoard } from '../store/board';
import type { BoardData, Task } from '../types';
import { COLUMN_COLORS } from '../types';
import { ColumnHeader, ColumnView } from './Column';
import { TaskCardBody } from './TaskCard';
import { useT } from '../i18n';

interface Props {
  matches: (t: Task) => boolean;
  onOpenTask: (id: string) => void;
  onDeleteColumn: (id: string) => void;
}

type Active = { type: 'task' | 'column'; id: string } | null;

/**
 * Khi kéo cột: chỉ xét các cột.
 * Khi kéo thẻ: tìm cột đang nằm dưới con trỏ, rồi chọn thẻ gần nhất trong cột đó;
 * nếu cột trống thì thả vào chính cột.
 */
const collision: CollisionDetection = (args) => {
  const type = args.active.data.current?.type;
  const columns = args.droppableContainers.filter((c) => c.data.current?.type === 'column');
  if (type === 'column') return closestCenter({ ...args, droppableContainers: columns });

  const hits = pointerWithin({ ...args, droppableContainers: columns });
  const colHit = hits[0] ?? rectIntersection({ ...args, droppableContainers: columns })[0];
  if (!colHit) return [];
  const colId = colHit.id;
  const cards = args.droppableContainers.filter(
    (c) => c.data.current?.type === 'task' && c.data.current?.columnId === colId,
  );
  if (cards.length === 0) return [colHit];
  const best = closestCenter({ ...args, droppableContainers: cards });
  return best.length ? best : [colHit];
};

export function Board({ matches, onOpenTask, onDeleteColumn }: Props) {
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const addColumn = useBoard((s) => s.addColumn);
  const t = useT();
  const [active, setActive] = useState<Active>(null);
  const before = useRef<BoardData | null>(null);
  const [newCol, setNewCol] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const columnOf = (taskId: string) => useBoard.getState().columns.find((c) => c.taskIds.includes(taskId));

  const onDragStart = ({ active }: DragStartEvent) => {
    before.current = useBoard.getState().snapshot();
    setActive({ type: active.data.current?.type === 'column' ? 'column' : 'task', id: String(active.id) });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || active.data.current?.type !== 'task') return;
    const taskId = String(active.id);
    const from = columnOf(taskId);
    const overType = over.data.current?.type;
    const toId = overType === 'column' ? String(over.id) : columnOf(String(over.id))?.id;
    if (!from || !toId || from.id === toId) return;
    const to = useBoard.getState().columns.find((c) => c.id === toId)!;
    let index = to.taskIds.length;
    if (overType === 'task') {
      const i = to.taskIds.indexOf(String(over.id));
      const rect = active.rect.current.translated;
      const below = rect ? rect.top > over.rect.top + over.rect.height / 2 : false;
      index = i + (below ? 1 : 0);
    }
    useBoard.getState().moveTask(taskId, toId, index);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActive(null);
    before.current = null;
    if (!over) return;
    const { columns, moveTask, moveColumn } = useBoard.getState();

    if (active.data.current?.type === 'column') {
      const from = columns.findIndex((c) => c.id === active.id);
      const overColId = over.data.current?.type === 'column' ? over.id : over.data.current?.columnId;
      const to = columns.findIndex((c) => c.id === overColId);
      if (from !== -1 && to !== -1 && from !== to) moveColumn(from, to);
      return;
    }

    const taskId = String(active.id);
    const col = columnOf(taskId);
    if (!col || over.data.current?.type !== 'task') return;
    const oldI = col.taskIds.indexOf(taskId);
    const newI = col.taskIds.indexOf(String(over.id));
    if (newI !== -1 && oldI !== newI) moveTask(taskId, col.id, newI);
  };

  const onDragCancel = () => {
    if (before.current) useBoard.getState().restore(before.current);
    before.current = null;
    setActive(null);
  };

  const activeTask = active?.type === 'task' ? tasks[active.id] : null;
  const activeColumn = active?.type === 'column' ? columns.find((c) => c.id === active.id) : null;
  const activeTaskCol = activeTask ? columnOf(activeTask.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="board">
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {columns.map((col) => (
            <ColumnView
              key={col.id}
              column={col}
              tasks={col.taskIds.map((id) => tasks[id]).filter((t): t is Task => !!t && matches(t))}
              onOpenTask={onOpenTask}
              onDeleteColumn={onDeleteColumn}
            />
          ))}
        </SortableContext>

        <div className="column add-column">
          {newCol === null ? (
            <button type="button" className="add-col-btn" onClick={() => setNewCol('')}>
              ＋ {t('col.add')}
            </button>
          ) : (
            <form
              className="quick-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCol.trim()) return;
                addColumn(newCol, COLUMN_COLORS[columns.length % COLUMN_COLORS.length].hex);
                setNewCol(null);
              }}
            >
              <input
                id="new-column-title"
                autoFocus
                placeholder={t('col.newName')}
                value={newCol}
                onChange={(e) => setNewCol(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setNewCol(null)}
                onBlur={() => !newCol.trim() && setNewCol(null)}
              />
            </form>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.3,1)' }}>
        {activeTask && (
          <TaskCardBody
            task={activeTask}
            done={!!activeTaskCol?.isDone}
            color={activeTaskCol?.color ?? '#94a3b8'}
            overlay
          />
        )}
        {activeColumn && (
          <div className="column column-overlay">
            <ColumnHeader column={activeColumn} count={activeColumn.taskIds.length} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
