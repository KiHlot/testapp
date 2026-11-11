import { db, transaction } from './db.js';
import { closeTask, getOrCreatePendingSurvey, submitSurvey } from './service.js';

const USERS = [
  { id: 1, name: 'Карпов Дмитрий', role: 'manager', unit: 'Склад' },
  { id: 2, name: 'Белова Ирина', role: 'manager', unit: 'Магазин «Южный»' },
  { id: 3, name: 'Гусев Олег', role: 'manager', unit: 'Магазин «Северный»' },
  { id: 4, name: 'Соколова Наталья', role: 'manager', unit: 'Отдел продаж' },
  { id: 5, name: 'Лебедев Артём', role: 'manager', unit: 'Офис' },
  { id: 6, name: 'Морозова Елена', role: 'hr', unit: 'HR' },
];

// hiredDaysAgo is relative to the moment of seeding, so the demo always looks "fresh".
const EMPLOYEES = [
  { id: 1, name: 'Захаров Никита', department: 'Склад', position: 'Комплектовщик', managerId: 1, hiredDaysAgo: 9 },
  { id: 2, name: 'Ершова Дарья', department: 'Склад', position: 'Кладовщик', managerId: 1, hiredDaysAgo: 26 },
  { id: 3, name: 'Тимофеев Руслан', department: 'Склад', position: 'Водитель погрузчика', managerId: 1, hiredDaysAgo: 3 },
  { id: 4, name: 'Исаева Полина', department: 'Магазин «Южный»', position: 'Продавец-консультант', managerId: 2, hiredDaysAgo: 12 },
  { id: 5, name: 'Мельников Кирилл', department: 'Магазин «Южный»', position: 'Кассир', managerId: 2, hiredDaysAgo: 40 },
  { id: 6, name: 'Фомина Алина', department: 'Магазин «Северный»', position: 'Продавец-консультант', managerId: 3, hiredDaysAgo: 5 },
  { id: 7, name: 'Савченко Егор', department: 'Магазин «Северный»', position: 'Продавец-консультант', managerId: 3, hiredDaysAgo: 64 },
  { id: 8, name: 'Королёва Мария', department: 'Отдел продаж', position: 'Менеджер по оптовым продажам', managerId: 4, hiredDaysAgo: 18 },
  { id: 9, name: 'Абрамов Илья', department: 'Отдел продаж', position: 'Менеджер по работе с клиентами', managerId: 4, hiredDaysAgo: 33 },
  { id: 10, name: 'Голубева Ксения', department: 'Офис', position: 'Бухгалтер', managerId: 5, hiredDaysAgo: 21 },
];

const yes = { equipment: 'yes', mentor: 'yes', expectations: 'yes', salary: 'yes' };

// onDay: tenure day when the survey was sent; closeManagerTask: the manager already handled it.
const HISTORY = [
  {
    employeeId: 2,
    onDay: 7,
    answers: { ...yes, expectations: 'no' },
    comment: 'На собеседовании говорили 5/2, по факту ставят 6/1 и ночные смены.',
    closeManagerTask: true,
  },
  {
    employeeId: 2,
    onDay: 21,
    answers: { ...yes, expectations: 'no', salary: 'idk' },
    comment: 'График так и не поменяли. Аванс пришёл меньше, чем я рассчитывала, никто не объяснил почему.',
  },
  {
    employeeId: 1,
    onDay: 7,
    answers: { ...yes, equipment: 'no' },
    comment: 'Форму и перчатки так и не выдали, работаю в своём.',
  },
  { employeeId: 5, onDay: 7, answers: yes },
  { employeeId: 5, onDay: 30, answers: { ...yes, salary: 'idk' } },
  { employeeId: 7, onDay: 7, answers: yes },
  { employeeId: 7, onDay: 30, answers: yes },
  { employeeId: 7, onDay: 60, answers: { ...yes, mentor: 'idk' } },
  { employeeId: 8, onDay: 7, answers: yes },
  { employeeId: 8, onDay: 14, pending: true },
  { employeeId: 9, onDay: 7, answers: yes },
  { employeeId: 9, onDay: 30, answers: yes },
  {
    employeeId: 10,
    onDay: 7,
    answers: { ...yes, mentor: 'idk', salary: 'idk' },
    comment: 'Пока не понимаю, к кому идти с вопросами по 1С.',
    closeManagerTask: true,
  },
];

function daysAgo(days, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function resetData() {
  transaction(() => {
    // Demo reset keeps Telegram connections, otherwise every reset means re-onboarding in the bot.
    const connected = db
      .prepare('SELECT id, phone, telegram_chat_id, telegram_connected_at FROM employees WHERE telegram_chat_id IS NOT NULL')
      .all();

    db.exec('DELETE FROM tasks; DELETE FROM surveys; DELETE FROM employees; DELETE FROM users;');

    const insertUser = db.prepare('INSERT INTO users (id, name, role, unit) VALUES (?, ?, ?, ?)');
    for (const u of USERS) insertUser.run(u.id, u.name, u.role, u.unit);

    const insertEmployee = db.prepare(
      `INSERT INTO employees (id, name, department, position, manager_id, hire_date, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of EMPLOYEES) {
      insertEmployee.run(
        e.id,
        e.name,
        e.department,
        e.position,
        e.managerId,
        daysAgo(e.hiredDaysAgo, 9).toISOString(),
        `375${['29', '44', '33', '25'][e.id % 4]}100${String(e.id).padStart(4, '0')}`,
      );
    }
    const restore = db.prepare(
      'UPDATE employees SET phone = ?, telegram_chat_id = ?, telegram_connected_at = ? WHERE id = ?',
    );
    for (const c of connected) restore.run(c.phone, c.telegram_chat_id, c.telegram_connected_at, c.id);

    for (const item of HISTORY) {
      const employee = EMPLOYEES.find((e) => e.id === item.employeeId);
      const daysBack = employee.hiredDaysAgo - item.onDay + 1;
      const { survey } = getOrCreatePendingSurvey(item.employeeId, daysAgo(daysBack, 10));
      if (item.pending) continue;

      const { tasks } = submitSurvey(survey.token, item.answers, item.comment, daysAgo(daysBack, 18));
      if (item.closeManagerTask) {
        const managerTask = tasks.find((t) => t.type === 'manager');
        if (managerTask) closeTask(managerTask.id, daysAgo(Math.max(daysBack - 1, 0), 15));
      }
    }
  });
}

export function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count === 0) resetData();
}
