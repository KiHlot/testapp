import TaskCard from './TaskCard.jsx';

export default function ManagersTab({ managers, onChange }) {
  return (
    <section>
      <h1>Руководители</h1>
      <p className="muted">
        Проваленный опрос (хотя бы один ответ «Нет» или итог ниже 80%) создаёт задачу руководителю новичка со сроком
        2 рабочих дня.
      </p>
      <div className="cards">
        {managers.map((m) => (
          <div key={m.id} className="card">
            <div className="card-head">
              <div>
                <div className="card-title">{m.name}</div>
                <div className="muted">{m.unit}</div>
              </div>
              <div className="stats">
                <div>
                  <b>{m.newcomers}</b>
                  <span>новичков</span>
                </div>
                <div>
                  <b className={m.failed_surveys ? 'text-red' : ''}>{m.failed_surveys}</b>
                  <span>провалов</span>
                </div>
                <div>
                  <b className={m.at_risk ? 'text-red' : ''}>{m.at_risk}</b>
                  <span>в зоне риска</span>
                </div>
                <div>
                  <b className={m.open_tasks ? 'text-orange' : ''}>{m.open_tasks}</b>
                  <span>открытых задач</span>
                </div>
              </div>
            </div>
            {m.tasks.length === 0 ? (
              <div className="muted">Задач нет.</div>
            ) : (
              m.tasks.map((t) => <TaskCard key={t.id} task={t} onChange={onChange} />)
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
