import { useState } from 'react';
import { api } from '../api.js';
import { formatDate, formatDateTime, isOverdue } from '../format.js';

export default function TaskCard({ task, onChange, children }) {
  const [busy, setBusy] = useState(false);
  const overdue = isOverdue(task);

  async function close() {
    setBusy(true);
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: 'done' } });
      onChange();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`task ${task.status === 'done' ? 'task-done' : ''} ${overdue ? 'task-overdue' : ''}`}>
      <div className="task-head">
        <div>
          <div className="task-title">{task.title}</div>
          <div className="task-meta">
            Исполнитель: {task.assignee_name} · Поставлена {formatDateTime(task.created_at)} ·{' '}
            <span className={overdue ? 'text-red' : ''}>
              Крайний срок {formatDate(task.deadline)}
              {overdue && ' (просрочена)'}
            </span>
          </div>
        </div>
        {task.status === 'open' ? (
          <button className="btn btn-success" onClick={close} disabled={busy}>
            Завершить
          </button>
        ) : (
          <span className="badge badge-green">Завершена {formatDateTime(task.closed_at)}</span>
        )}
      </div>
      <pre className="task-description">{task.description}</pre>
      {children}
    </div>
  );
}
