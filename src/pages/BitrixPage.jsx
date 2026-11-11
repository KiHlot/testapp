import { useSearchParams } from 'react-router-dom';
import { api, usePolling } from '../api.js';
import NewcomersTab from '../components/NewcomersTab.jsx';
import ManagersTab from '../components/ManagersTab.jsx';
import HrTab from '../components/HrTab.jsx';

const TABS = [
  { id: 'newcomers', label: 'Новички' },
  { id: 'managers', label: 'Руководители' },
  { id: 'hr', label: 'HR' },
];

async function loadAll() {
  const [employees, managers, hr, bot] = await Promise.all([
    api('/employees'),
    api('/managers'),
    api('/hr'),
    api('/bot'),
  ]);
  return { employees, managers, hr, bot };
}

export default function BitrixPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'newcomers';
  const { data, error, refresh } = usePolling(loadAll, 3000);

  const counters = data && {
    managers: data.managers.reduce((sum, m) => sum + m.open_tasks, 0),
    hr: data.hr.open_tasks,
  };

  async function reset() {
    if (!confirm('Вернуть демо-данные к исходному состоянию?')) return;
    await api('/reset', { method: 'POST' });
    refresh();
  }

  return (
    <div className="b24">
      <header className="b24-header">
        <div className="b24-logo">
          Битрикс<span>24</span>
        </div>
        <div className="b24-emulation">эмуляция портала · «СпортОпт»</div>
        <button className="b24-reset" onClick={reset}>
          Сбросить демо-данные
        </button>
      </header>

      <div className="b24-body">
        <nav className="b24-menu">
          <div className="b24-menu-title">Пульс новичка</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`b24-menu-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setParams({ tab: t.id })}
            >
              <span className="b24-menu-icon">{t.label[0]}</span>
              {t.label}
              {counters?.[t.id] > 0 && <span className="b24-counter">{counters[t.id]}</span>}
            </button>
          ))}
        </nav>

        <main className="b24-content">
          {error && <div className="alert alert-error">Нет связи с сервером: {error}</div>}
          {!data && !error && <div className="muted">Загрузка…</div>}
          {data && tab === 'newcomers' && <NewcomersTab employees={data.employees} bot={data.bot} onChange={refresh} />}
          {data && tab === 'managers' && <ManagersTab managers={data.managers} onChange={refresh} />}
          {data && tab === 'hr' && <HrTab hr={data.hr} onChange={refresh} />}
        </main>
      </div>
    </div>
  );
}
