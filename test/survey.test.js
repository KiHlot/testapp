import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';

const { scoreSurvey } = await import('../shared/survey.js');
const { db } = await import('../server/db.js');
const { resetData } = await import('../server/seed.js');
const {
  getOrCreatePendingSurvey,
  submitSurvey,
  closeTask,
  connectTelegramByPhone,
  listEmployees,
  normalizePhone,
  updateEmployeePhone,
} = await import('../server/service.js');

const yes = { equipment: 'yes', mentor: 'yes', expectations: 'yes', salary: 'yes' };

test('скоринг: крайние случаи', () => {
  assert.deepEqual(scoreSurvey(yes), { score: 100, failed: false });
  assert.deepEqual(scoreSurvey({ ...yes, salary: 'idk' }), { score: 82.5, failed: false });
  assert.deepEqual(scoreSurvey({ ...yes, salary: 'idk', mentor: 'idk' }), { score: 65, failed: true });
  assert.deepEqual(scoreSurvey({ ...yes, salary: 'no' }), { score: 75, failed: true });
  assert.deepEqual(scoreSurvey({ equipment: 'no', mentor: 'no', expectations: 'no', salary: 'no' }), {
    score: 0,
    failed: true,
  });
});

test('скоринг: неполные и чужие ответы отклоняются', () => {
  assert.throws(() => scoreSurvey({ ...yes, salary: undefined }));
  assert.throws(() => scoreSurvey({ ...yes, salary: 'maybe' }));
  assert.throws(() => scoreSurvey({ ...yes, salary: 'toString' }));
  assert.throws(() => scoreSurvey(null));
});

function tasksOf(employeeId, type) {
  return db.prepare('SELECT * FROM tasks WHERE employee_id = ? AND type = ?').all(employeeId, type);
}

function answer(employeeId, answers) {
  const { survey } = getOrCreatePendingSurvey(employeeId);
  return submitSurvey(survey.token, answers, 'тест');
}

test('пройденный опрос не создаёт задач', () => {
  resetData();
  const result = answer(3, yes);
  assert.equal(result.failed, false);
  assert.equal(tasksOf(3, 'manager').length, 0);
});

test('первый провал: задача руководителю, второй: ещё и задача HR, без дублей', () => {
  resetData();
  const first = answer(3, { ...yes, expectations: 'no' });
  assert.equal(first.failed, true);
  assert.equal(tasksOf(3, 'manager').length, 1);
  assert.equal(tasksOf(3, 'manager')[0].assignee_id, 1);
  assert.equal(tasksOf(3, 'hr').length, 0);

  answer(3, { ...yes, salary: 'idk', mentor: 'idk' });
  assert.equal(tasksOf(3, 'manager').length, 2);
  assert.equal(tasksOf(3, 'hr').length, 1);

  answer(3, { ...yes, equipment: 'no' });
  assert.equal(tasksOf(3, 'hr').length, 1, 'пока задача HR открыта, новая не создаётся');

  closeTask(tasksOf(3, 'hr')[0].id);
  answer(3, { ...yes, equipment: 'no' });
  assert.equal(tasksOf(3, 'hr').length, 2, 'после закрытия новый провал снова эскалируется');
});

test('повторно пройти опрос по той же ссылке нельзя', () => {
  resetData();
  const { survey } = getOrCreatePendingSurvey(3);
  submitSurvey(survey.token, yes);
  assert.throws(() => submitSurvey(survey.token, yes), { status: 409 });
});

test('повторный вебхук переиспользует неотвеченный опрос', () => {
  resetData();
  const a = getOrCreatePendingSurvey(4);
  const b = getOrCreatePendingSurvey(4);
  assert.equal(a.survey.token, b.survey.token);
  assert.equal(b.reused, true);
});

test('телефон: разные форматы приводятся к одному', () => {
  for (const raw of ['+375 44 3112483', '+375 (44) 311-24-83', '+375443112483', '375443112483']) {
    assert.equal(normalizePhone(raw), '375443112483', raw);
  }
  for (const raw of ['8 044 311-24-83', '044 3112483', '44 3112483', '+7 900 123-45-67', '12345']) {
    assert.equal(normalizePhone(raw), null, raw);
  }
  assert.throws(() => updateEmployeePhone(6, '375443112483'), { status: 400 }, 'HR вводит номер только с +375');
  assert.throws(() => updateEmployeePhone(6, 'abc'), { status: 400 });
  assert.equal(updateEmployeePhone(6, '+375 25 111-22-33').phone, '375251112233');
});

test('подключение бота: по номеру из Telegram привязывается chat_id нужного новичка', () => {
  resetData();
  updateEmployeePhone(6, '+375 33 555-44-33');

  assert.equal(connectTelegramByPhone('+375449990000', 111).length, 0);
  const connected = connectTelegramByPhone('375335554433', 111);
  assert.deepEqual(connected.map((e) => e.id), [6]);

  const employees = listEmployees();
  assert.equal(employees.find((e) => e.id === 6).telegram_connected, true);
  assert.equal(employees.find((e) => e.id === 5).telegram_connected, false);
  assert.equal('telegram_chat_id' in employees[0], false, 'chat_id не уходит во фронтенд');
  assert.equal(getOrCreatePendingSurvey(6).employee.telegram_chat_id, '111');
});

test('сброс демо-данных сохраняет подключения к боту', () => {
  resetData();
  updateEmployeePhone(1, '+375 29 311-24-83');
  connectTelegramByPhone('375293112483', 222);
  resetData();
  const zakharov = db.prepare('SELECT phone, telegram_chat_id FROM employees WHERE id = 1').get();
  assert.deepEqual({ ...zakharov }, { phone: '375293112483', telegram_chat_id: '222' });
});

test('демо-данные: у Ершовой задача HR, у Захарова один провал', () => {
  resetData();
  assert.equal(tasksOf(2, 'hr').length, 1);
  assert.equal(tasksOf(1, 'manager').length, 1);
  assert.equal(tasksOf(1, 'hr').length, 0);
});
