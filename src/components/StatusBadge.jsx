const STATUSES = {
  none: { label: 'Опросов не было', className: 'badge-gray' },
  pending: { label: 'Ожидает ответа', className: 'badge-blue' },
  passed: { label: 'Пройден', className: 'badge-green' },
  failed: { label: 'Провален', className: 'badge-red' },
};

export function surveyStatus(survey) {
  if (!survey) return 'none';
  if (!survey.answered_at) return 'pending';
  return survey.failed ? 'failed' : 'passed';
}

export default function StatusBadge({ status, score }) {
  const { label, className } = STATUSES[status];
  return (
    <span className={`badge ${className}`}>
      {label}
      {score != null && ` · ${score}%`}
    </span>
  );
}
