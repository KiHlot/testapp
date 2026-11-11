const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso) => (iso ? dateFormat.format(new Date(iso)) : '—');
export const formatDateTime = (iso) => (iso ? dateTimeFormat.format(new Date(iso)) : '—');

export function formatPhone(phone) {
  if (!phone) return '—';
  const m = phone.match(/^375(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+375 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : `+${phone}`;
}

export const isOverdue = (task) => task.status === 'open' && new Date(task.deadline) < new Date();
