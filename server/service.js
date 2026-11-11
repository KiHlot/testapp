import crypto from 'node:crypto';
import { db, transaction } from './db.js';
import {
  ANSWERS,
  HR_ESCALATION_FAILS,
  PASS_THRESHOLD,
  QUESTIONS,
  scoreSurvey,
} from '../shared/survey.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function tenureDay(hireDate, now = new Date()) {
  return Math.round((startOfDay(now) - startOfDay(hireDate)) / DAY_MS) + 1;
}

export function addWorkdays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const weekday = d.getDay();
    if (weekday !== 0 && weekday !== 6) added++;
  }
  return d;
}

// Only Belarusian numbers, stored as "375XXXXXXXXX". Telegram may send the contact without the leading "+".
export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('375') ? digits : null;
}

export function updateEmployeePhone(id, rawPhone) {
  const phone = String(rawPhone ?? '').trim().startsWith('+375') ? normalizePhone(rawPhone) : null;
  if (!phone) throw new HttpError(400, 'Номер должен быть в формате +375 XX XXX-XX-XX');
  const { changes } = db.prepare('UPDATE employees SET phone = ? WHERE id = ?').run(phone, id);
  if (!changes) throw new HttpError(404, 'Новичок не найден');
  return { id, phone };
}

// One phone may belong to several cards (e.g. a rehire), so all of them get connected.
export function connectTelegramByPhone(rawPhone, chatId, now = new Date()) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return [];
  const employees = db.prepare('SELECT * FROM employees WHERE phone = ? ORDER BY hire_date DESC').all(phone);
  const update = db.prepare('UPDATE employees SET telegram_chat_id = ?, telegram_connected_at = ? WHERE id = ?');
  for (const e of employees) update.run(String(chatId), now.toISOString(), e.id);
  return employees;
}

function getEmployee(id) {
  const employee = db
    .prepare(
      `SELECT e.*, u.name AS manager_name, u.unit AS manager_unit
       FROM employees e JOIN users u ON u.id = e.manager_id
       WHERE e.id = ?`,
    )
    .get(id);
  if (!employee) throw new HttpError(404, 'Новичок не найден');
  return employee;
}

function getSurveyByToken(token) {
  const survey = db.prepare('SELECT * FROM surveys WHERE token = ?').get(String(token));
  if (!survey) throw new HttpError(404, 'Опрос не найден');
  return survey;
}

function parseSurvey(row) {
  return {
    ...row,
    answers: row.answers ? JSON.parse(row.answers) : null,
    failed: row.failed === null ? null : Boolean(row.failed),
  };
}

function surveysOf(employeeId) {
  return db
    .prepare('SELECT * FROM surveys WHERE employee_id = ? ORDER BY sent_at DESC, id DESC')
    .all(employeeId)
    .map(parseSurvey);
}

function surveyStatus(survey) {
  if (!survey) return 'none';
  if (!survey.answered_at) return 'pending';
  return survey.failed ? 'failed' : 'passed';
}

function insertTask({ type, employeeId, surveyId, assigneeId, title, description, deadline, now }) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO tasks (type, employee_id, survey_id, assignee_id, title, description, deadline, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(type, employeeId, surveyId, assigneeId, title, description, deadline.toISOString(), now.toISOString());
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(lastInsertRowid);
}

function createManagerTask(employee, surveyId, answers, comment, score, now) {
  const problems = QUESTIONS.filter((q) => answers[q.id] !== 'yes').map(
    (q) => `— ${q.text} Ответ: «${ANSWERS[answers[q.id]].label}»`,
  );
  const description = [
    `${employee.position}, ${employee.department}, ${tenureDay(employee.hire_date, now)}-й день работы.`,
    `Результат опроса: ${score}% (порог ${PASS_THRESHOLD}%, любой ответ «Нет» — провал).`,
    '',
    'Что не так:',
    ...problems,
    '',
    comment ? `Комментарий новичка: «${comment}»` : 'Комментария нет.',
    '',
    'Поговорите с новичком лично, решите проблему и закройте задачу.',
  ].join('\n');

  return insertTask({
    type: 'manager',
    employeeId: employee.id,
    surveyId,
    assigneeId: employee.manager_id,
    title: `Поговорить с новичком: ${employee.name}`,
    description,
    deadline: addWorkdays(now, 2),
    now,
  });
}

function createHrTask(employee, surveyId, failCount, now) {
  const hr = db.prepare("SELECT id FROM users WHERE role = 'hr' ORDER BY id LIMIT 1").get();
  if (!hr) return null;
  const managerTasks = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(status = 'done') AS done
       FROM tasks WHERE type = 'manager' AND employee_id = ?`,
    )
    .get(employee.id);
  const description = [
    `${employee.position}, ${employee.department}, ${tenureDay(employee.hire_date, now)}-й день работы.`,
    `Проваленных опросов: ${failCount}.`,
    `Руководитель: ${employee.manager_name} (${employee.manager_unit}).`,
    `Задач руководителю по этому новичку: ${managerTasks.total}, закрыто: ${managerTasks.done ?? 0}.`,
    '',
    'Новичок провалил опрос повторно. Свяжитесь с новичком и руководителем, решите вопрос и закройте задачу.',
  ].join('\n');

  return insertTask({
    type: 'hr',
    employeeId: employee.id,
    surveyId,
    assigneeId: hr.id,
    title: `Новичок в зоне риска: ${employee.name}`,
    description,
    deadline: addWorkdays(now, 1),
    now,
  });
}

export function getOrCreatePendingSurvey(employeeId, now = new Date()) {
  return transaction(() => {
    const employee = getEmployee(employeeId);
    const pending = db
      .prepare('SELECT * FROM surveys WHERE employee_id = ? AND answered_at IS NULL ORDER BY id DESC LIMIT 1')
      .get(employeeId);
    if (pending) return { employee, survey: pending, reused: true };

    const { lastInsertRowid } = db
      .prepare('INSERT INTO surveys (token, employee_id, sent_at) VALUES (?, ?, ?)')
      .run(crypto.randomUUID(), employeeId, now.toISOString());
    const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(lastInsertRowid);
    return { employee, survey, reused: false };
  });
}

export function getSurveyForm(token) {
  const survey = getSurveyByToken(token);
  const employee = getEmployee(survey.employee_id);
  return { employeeName: employee.name, answered: Boolean(survey.answered_at) };
}

export function submitSurvey(token, answers, comment, now = new Date()) {
  return transaction(() => {
    const survey = getSurveyByToken(token);
    if (survey.answered_at) throw new HttpError(409, 'Этот опрос уже пройден');

    let result;
    try {
      result = scoreSurvey(answers);
    } catch (err) {
      throw new HttpError(400, err.message);
    }

    const cleanAnswers = Object.fromEntries(QUESTIONS.map((q) => [q.id, answers[q.id]]));
    const cleanComment =
      typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 1000) : null;

    db.prepare(
      'UPDATE surveys SET answered_at = ?, answers = ?, comment = ?, score = ?, failed = ? WHERE id = ?',
    ).run(now.toISOString(), JSON.stringify(cleanAnswers), cleanComment, result.score, result.failed ? 1 : 0, survey.id);

    const tasks = [];
    if (result.failed) {
      const employee = getEmployee(survey.employee_id);
      tasks.push(createManagerTask(employee, survey.id, cleanAnswers, cleanComment, result.score, now));

      const { failCount } = db
        .prepare('SELECT COUNT(*) AS failCount FROM surveys WHERE employee_id = ? AND failed = 1')
        .get(employee.id);
      const openHrTask = db
        .prepare("SELECT id FROM tasks WHERE type = 'hr' AND employee_id = ? AND status = 'open'")
        .get(employee.id);
      if (failCount >= HR_ESCALATION_FAILS && !openHrTask) {
        const hrTask = createHrTask(employee, survey.id, failCount, now);
        if (hrTask) tasks.push(hrTask);
      }
    }
    return { ...result, tasks };
  });
}

export function closeTask(id, now = new Date()) {
  const { changes } = db
    .prepare("UPDATE tasks SET status = 'done', closed_at = ? WHERE id = ? AND status = 'open'")
    .run(now.toISOString(), id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) throw new HttpError(404, 'Задача не найдена');
  return { task, changed: changes > 0 };
}

function listTasks(where, params = []) {
  return db
    .prepare(
      `SELECT t.*, e.name AS employee_name, e.position AS employee_position, e.department AS employee_department,
              a.name AS assignee_name, m.name AS manager_name
       FROM tasks t
       JOIN employees e ON e.id = t.employee_id
       JOIN users a ON a.id = t.assignee_id
       JOIN users m ON m.id = e.manager_id
       ${where}
       ORDER BY t.status = 'done', t.id DESC`,
    )
    .all(...params);
}

export function listEmployees(now = new Date()) {
  return db
    .prepare(
      `SELECT e.*, u.name AS manager_name
       FROM employees e JOIN users u ON u.id = e.manager_id
       ORDER BY e.hire_date DESC`,
    )
    .all()
    .map(({ telegram_chat_id, ...employee }) => {
      const surveys = surveysOf(employee.id);
      return {
        ...employee,
        telegram_connected: Boolean(telegram_chat_id),
        tenure_day: tenureDay(employee.hire_date, now),
        surveys,
        last_status: surveyStatus(surveys[0]),
        fail_count: surveys.filter((s) => s.failed).length,
      };
    });
}

export function listManagers() {
  const employees = listEmployees();
  return db
    .prepare("SELECT * FROM users WHERE role = 'manager' ORDER BY name")
    .all()
    .map((manager) => {
      const own = employees.filter((e) => e.manager_id === manager.id);
      const tasks = listTasks("WHERE t.type = 'manager' AND t.assignee_id = ?", [manager.id]);
      return {
        ...manager,
        newcomers: own.length,
        failed_surveys: own.reduce((sum, e) => sum + e.fail_count, 0),
        at_risk: own.filter((e) => e.fail_count >= HR_ESCALATION_FAILS).length,
        open_tasks: tasks.filter((t) => t.status === 'open').length,
        tasks,
      };
    });
}

export function hrOverview() {
  const employees = listEmployees();
  const byId = new Map(employees.map((e) => [e.id, e]));
  const tasks = listTasks("WHERE t.type = 'hr'").map((task) => {
    const employee = byId.get(task.employee_id);
    const managerTasks = listTasks("WHERE t.type = 'manager' AND t.employee_id = ?", [task.employee_id]);
    return {
      ...task,
      failed_surveys: employee.surveys.filter((s) => s.failed),
      manager_tasks: managerTasks.map(({ id, status, created_at, closed_at }) => ({ id, status, created_at, closed_at })),
    };
  });
  return {
    summary: {
      total: employees.length,
      pending: employees.filter((e) => e.last_status === 'pending').length,
      failed_last: employees.filter((e) => e.last_status === 'failed').length,
      at_risk: employees.filter((e) => e.fail_count >= HR_ESCALATION_FAILS).length,
    },
    open_tasks: tasks.filter((t) => t.status === 'open').length,
    tasks,
  };
}
