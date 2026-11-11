import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'app.db');
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'hr')),
    unit TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    position TEXT NOT NULL,
    manager_id INTEGER NOT NULL REFERENCES users(id),
    hire_date TEXT NOT NULL,
    phone TEXT,
    telegram_chat_id TEXT,
    telegram_connected_at TEXT
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    sent_at TEXT NOT NULL,
    answered_at TEXT,
    answers TEXT,
    comment TEXT,
    score REAL,
    failed INTEGER
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('manager', 'hr')),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    survey_id INTEGER REFERENCES surveys(id),
    assignee_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    deadline TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    created_at TEXT NOT NULL,
    closed_at TEXT
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS employees_phone ON employees(phone)');

let depth = 0;

// Nested calls join the outer transaction: SQLite has no nested BEGIN.
export function transaction(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}
