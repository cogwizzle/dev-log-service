import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'dev-log.db');

/** @type {Database.Database | null} */
let db = null;

/**
 * Returns the singleton SQLite database connection, creating and migrating it on first call.
 *
 * @returns {Database.Database} The open database instance.
 */
export function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

/**
 * Runs all schema migrations against the provided database.
 *
 * @param {Database.Database} database - The database to migrate.
 */
function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS activity_cache (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      source    TEXT NOT NULL,
      date      TEXT NOT NULL,
      data      TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      UNIQUE(source, date)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL UNIQUE,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      date       TEXT NOT NULL
    );
  `);
}

/**
 * Closes the database connection. Primarily used in tests.
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
