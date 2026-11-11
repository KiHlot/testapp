import { useState } from 'react';
import { api } from '../api.js';
import { formatPhone } from '../format.js';

export default function BotConnectModal({ employee, bot, onClose, onChange }) {
  const [phone, setPhone] = useState(formatPhone(employee.phone));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const link = bot.username ? `https://t.me/${bot.username}` : null;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  async function savePhone(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api(`/employees/${employee.id}`, { method: 'PATCH', body: { phone } });
      setPhone(formatPhone(saved.phone));
      setMessage({ ok: true, text: 'Телефон сохранён' });
      onChange();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="card-title">Подключение к боту «Новичок СпортОпт»</div>
            <div className="muted">
              {employee.name} · {employee.position}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {employee.telegram_connected ? (
          <div className="alert alert-success">Новичок подключил бота, опросы будут приходить ему в Telegram.</div>
        ) : (
          <div className="alert alert-warning">Новичок ещё не подключил бота.</div>
        )}

        <form className="phone-form" onSubmit={savePhone}>
          <label>
            <span className="muted small">
              Телефон из карточки приёма в формате +375 XX XXX-XX-XX. По нему бот узнаёт новичка.
            </span>
            <div className="phone-row">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+375 44 311-24-83" />
              <button className="btn btn-primary" disabled={saving}>
                Сохранить
              </button>
            </div>
          </label>
          {message && <div className={`small ${message.ok ? 'text-green' : 'text-red'}`}>{message.text}</div>}
        </form>

        <ol className="invite-steps">
          <li>При оформлении дайте новичку ссылку на бота (одна для всех).</li>
          <li>Новичок нажимает «Старт», затем «Поделиться номером».</li>
          <li>Бот находит его по телефону, статус в таблице меняется на «подключён».</li>
        </ol>

        {!bot.configured && (
          <div className="alert alert-error">Бот не настроен: задайте TELEGRAM_BOT_TOKEN в .env и перезапустите сервер.</div>
        )}
        {link && (
          <div className="invite-link">
            <code>{link}</code>
            <button className="btn btn-primary" onClick={copy}>
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
