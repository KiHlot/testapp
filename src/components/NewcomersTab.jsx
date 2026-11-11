import { Fragment, useState } from 'react';
import { api } from '../api.js';
import { formatDate, formatDateTime, formatPhone } from '../format.js';
import { ANSWERS, QUESTIONS } from '../../shared/survey.js';
import StatusBadge, { surveyStatus } from './StatusBadge.jsx';
import BotConnectModal from './BotConnectModal.jsx';

function SendResult({ result }) {
  if (result.error) return <div className="send-result text-red">{result.error}</div>;
  return (
    <div className="send-result">
      {result.telegram.sent ? (
        <span className="text-green">Отправлено в Telegram{result.reused && ' (повторно, тот же опрос)'}</span>
      ) : (
        <span className="text-orange">{result.telegram.reason}</span>
      )}
      {' · '}
      <a href={result.url} target="_blank" rel="noreferrer">
        ссылка на опрос
      </a>
    </div>
  );
}

function SurveyHistory({ surveys }) {
  if (surveys.length === 0) return <div className="muted">Опросов ещё не было.</div>;
  return (
    <table className="history">
      <thead>
        <tr>
          <th>Отправлен</th>
          <th>Ответ</th>
          {QUESTIONS.map((q) => (
            <th key={q.id}>{q.short}</th>
          ))}
          <th>Итог</th>
          <th>Комментарий</th>
        </tr>
      </thead>
      <tbody>
        {surveys.map((s) => (
          <tr key={s.id}>
            <td>{formatDateTime(s.sent_at)}</td>
            <td>
              {s.answered_at ? (
                formatDateTime(s.answered_at)
              ) : (
                <a href={`/survey/${s.token}`} target="_blank" rel="noreferrer">
                  открыть опрос
                </a>
              )}
            </td>
            {QUESTIONS.map((q) => {
              const a = s.answers?.[q.id];
              return (
                <td key={q.id} className={a ? `answer-${a}` : ''}>
                  {a ? ANSWERS[a].label : '—'}
                </td>
              );
            })}
            <td>
              <StatusBadge status={surveyStatus(s)} score={s.score} />
            </td>
            <td className="comment">{s.comment || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function NewcomersTab({ employees, bot, onChange }) {
  const [expanded, setExpanded] = useState(null);
  const [inviteFor, setInviteFor] = useState(null);
  const [sending, setSending] = useState(null);
  const [results, setResults] = useState({});

  async function sendSurvey(employee) {
    setSending(employee.id);
    try {
      const result = await api('/webhook/bitrix', { method: 'POST', body: { employeeId: employee.id } });
      setResults((r) => ({ ...r, [employee.id]: result }));
      onChange();
    } catch (err) {
      setResults((r) => ({ ...r, [employee.id]: { error: err.message } }));
    } finally {
      setSending(null);
    }
  }

  return (
    <section>
      <h1>Новички на испытательном сроке</h1>
      <p className="muted">
        При оформлении новичок получает ссылку на бот «Новичок СпортОпт» и делится в нём номером телефона, по которому
        бот его узнаёт. Кнопка «Отправить опрос» эмулирует исходящий вебхук Битрикс24: сервер создаёт опрос и отправляет
        ссылку новичку в бот.
      </p>
      {inviteFor && (
        <BotConnectModal
          employee={employees.find((e) => e.id === inviteFor) ?? {}}
          bot={bot}
          onClose={() => setInviteFor(null)}
          onChange={onChange}
        />
      )}
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Подразделение</th>
              <th>Руководитель</th>
              <th>Дата приёма</th>
              <th>День</th>
              <th>Последний опрос</th>
              <th>Провалов</th>
              <th>Telegram</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const last = e.surveys[0];
              const isOpen = expanded === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className={`row ${e.fail_count >= 2 ? 'row-risk' : ''}`}>
                    <td>
                      <button className="link" onClick={() => setExpanded(isOpen ? null : e.id)}>
                        {isOpen ? '▾' : '▸'} {e.name}
                      </button>
                      <div className="muted small">{e.position}</div>
                    </td>
                    <td>{e.department}</td>
                    <td>{e.manager_name}</td>
                    <td className="nowrap">{formatDate(e.hire_date)}</td>
                    <td>{e.tenure_day}</td>
                    <td>
                      <StatusBadge status={e.last_status} score={last?.score} />
                    </td>
                    <td className={e.fail_count >= 2 ? 'text-red bold' : ''}>{e.fail_count}</td>
                    <td>
                      <button
                        className={`badge badge-button ${e.telegram_connected ? 'badge-green' : 'badge-gray'}`}
                        onClick={() => setInviteFor(e.id)}
                      >
                        {e.telegram_connected ? 'подключён' : 'не подключён'}
                      </button>
                      <div className="muted small nowrap">{formatPhone(e.phone)}</div>
                    </td>
                    <td className="actions">
                      <button className="btn btn-primary" onClick={() => sendSurvey(e)} disabled={sending === e.id}>
                        {sending === e.id ? 'Отправка…' : 'Отправить опрос'}
                      </button>
                      {results[e.id] && <SendResult result={results[e.id]} />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="row-details">
                      <td colSpan={9}>
                        <SurveyHistory surveys={e.surveys} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
