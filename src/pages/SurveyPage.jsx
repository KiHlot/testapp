import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ANSWERS, QUESTIONS } from '../../shared/survey.js';

export default function SurveyPage() {
  const { token } = useParams();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api(`/surveys/${token}`).then(setForm, (err) => setError(err.message));
  }, [token]);

  const complete = QUESTIONS.every((q) => answers[q.id]);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api(`/surveys/${token}`, { method: 'POST', body: { answers, comment } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!form) {
    return (
      <div className="survey">
        <div className="survey-card">{error ? <p className="text-red">{error}</p> : <p>Загрузка…</p>}</div>
      </div>
    );
  }

  if (done || form.answered) {
    return (
      <div className="survey">
        <div className="survey-card survey-thanks">
          <h1>Спасибо!</h1>
          <p>
            {done
              ? 'Ответы сохранены. Если что-то не так, руководитель свяжется с вами в ближайшие дни.'
              : 'Этот опрос уже пройден.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="survey">
      <form className="survey-card" onSubmit={submit}>
        <h1>{form.employeeName.split(' ')[1] || form.employeeName}, как проходят первые дни?</h1>
        <p className="muted">4 вопроса, меньше минуты. Ответы увидит ваш руководитель и HR.</p>

        {QUESTIONS.map((q, i) => (
          <fieldset key={q.id} className="question">
            <legend>
              {i + 1}. {q.text}
            </legend>
            <div className="options">
              {Object.entries(ANSWERS).map(([value, { label }]) => (
                <button
                  type="button"
                  key={value}
                  className={`option option-${value} ${answers[q.id] === value ? 'selected' : ''}`}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}

        <label className="question">
          <span className="legend">Что мешает? (необязательно)</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Например: не выдали форму, график не такой, как обещали"
          />
        </label>

        {error && <p className="text-red">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!complete || submitting}>
          {submitting ? 'Отправка…' : 'Отправить'}
        </button>
      </form>
    </div>
  );
}
