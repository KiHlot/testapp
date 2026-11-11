import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

const { resetData, seedIfEmpty } = await import('./seed.js');
const {
  HttpError,
  closeTask,
  connectTelegramByPhone,
  getOrCreatePendingSurvey,
  getSurveyForm,
  hrOverview,
  listEmployees,
  listManagers,
  submitSurvey,
  updateEmployeePhone,
} = await import('./service.js');
const { botStatus, sendSurveyLink, startBot } = await import('./telegram.js');

seedIfEmpty();
startBot({ onContact: (phone, chatId) => connectTelegramByPhone(phone, chatId) });

const app = express();
app.set('trust proxy', true);
app.use(express.json());

function publicUrl(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

app.get('/api/bot', (req, res) => {
  res.json(botStatus());
});

app.get('/api/employees', (req, res) => {
  res.json(listEmployees());
});

app.patch('/api/employees/:id', (req, res) => {
  res.json(updateEmployeePhone(Number(req.params.id), req.body?.phone));
});

app.get('/api/managers', (req, res) => {
  res.json(listManagers());
});

app.get('/api/hr', (req, res) => {
  res.json(hrOverview());
});

// Emulates the Bitrix24 outgoing webhook fired for a newcomer.
app.post('/api/webhook/bitrix', async (req, res) => {
  const employeeId = Number(req.body?.employeeId);
  if (!Number.isInteger(employeeId)) throw new HttpError(400, 'Нужен employeeId');

  const { employee, survey, reused } = getOrCreatePendingSurvey(employeeId);
  const url = `${publicUrl(req)}/survey/${survey.token}`;
  const telegram = await sendSurveyLink({ chatId: employee.telegram_chat_id, name: employee.name, url });
  res.json({ url, reused, telegram });
});

app.get('/api/surveys/:token', (req, res) => {
  res.json(getSurveyForm(req.params.token));
});

app.post('/api/surveys/:token', (req, res) => {
  const { answers, comment } = req.body ?? {};
  const { score, failed } = submitSurvey(req.params.token, answers, comment);
  res.json({ score, failed });
});

app.patch('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (req.body?.status !== 'done') throw new HttpError(400, 'Поддерживается только status: "done"');
  res.json(closeTask(id).task);
});

app.post('/api/reset', (req, res) => {
  resetData();
  res.json({ ok: true });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Не найдено' });
});

const distDir = path.join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  const status = err instanceof HttpError ? err.status : err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка сервера' : err.message });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`API: http://localhost:${port}`);
});
