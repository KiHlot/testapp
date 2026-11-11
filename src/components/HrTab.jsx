import { formatDateTime } from '../format.js';
import TaskCard from './TaskCard.jsx';

export default function HrTab({ hr, onChange }) {
  const { summary, tasks } = hr;
  return (
    <section>
      <h1>HR</h1>
      <div className="summary">
        <div className="summary-item">
          <b>{summary.total}</b>
          <span>новичков на испытательном</span>
        </div>
        <div className="summary-item">
          <b>{summary.pending}</b>
          <span>ждём ответа на опрос</span>
        </div>
        <div className="summary-item">
          <b className={summary.failed_last ? 'text-orange' : ''}>{summary.failed_last}</b>
          <span>провалили последний опрос</span>
        </div>
        <div className="summary-item">
          <b className={summary.at_risk ? 'text-red' : ''}>{summary.at_risk}</b>
          <span>в зоне риска (2+ провала)</span>
        </div>
      </div>

      <h2>Задачи HR</h2>
      <p className="muted">
        Создаются, когда у одного новичка 2 и больше проваленных опроса: проблема повторяется, и одного руководителя
        недостаточно.
      </p>
      {tasks.length === 0 && <div className="muted">Задач нет.</div>}
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} onChange={onChange}>
          <div className="task-extra">
            <div>
              <b>Проваленные опросы:</b>{' '}
              {t.failed_surveys.map((s) => `${formatDateTime(s.answered_at)} (${s.score}%)`).join(', ')}
            </div>
            <div>
              <b>Задачи руководителю ({t.manager_name}):</b>{' '}
              {t.manager_tasks
                .map((mt) => `от ${formatDateTime(mt.created_at)} ${mt.status === 'done' ? 'завершена' : 'открыта'}`)
                .join('; ')}
            </div>
          </div>
        </TaskCard>
      ))}
    </section>
  );
}
