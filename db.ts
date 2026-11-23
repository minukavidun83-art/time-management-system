import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { SiteSettings } from '../src/types/shared.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'smart_study.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    grade TEXT NOT NULL DEFAULT '',
    school_name TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '/src/assets/images/avatar_student_default_1795360852554.jpg',
    profile_theme TEXT NOT NULL DEFAULT 'indigo',
    dark_mode INTEGER NOT NULL DEFAULT 0,
    daily_goal_minutes INTEGER NOT NULL DEFAULT 120,
    family_group_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4F46E5',
    target_hours_weekly INTEGER NOT NULL DEFAULT 4,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS timetable_entries (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    scope TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    teacher TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    day_of_week INTEGER,
    month INTEGER,
    year INTEGER NOT NULL,
    specific_date TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    is_ai_generated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS yearly_goals (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    target_metric TEXT NOT NULL DEFAULT '',
    progress_percent INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '09:00',
    end_time TEXT NOT NULL DEFAULT '10:00',
    subject TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    reminder_minutes INTEGER NOT NULL DEFAULT 30,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    mode TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    session_date TEXT NOT NULL,
    completed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    lesson TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    is_important INTEGER NOT NULL DEFAULT 0,
    attachment_name TEXT NOT NULL DEFAULT '',
    attachment_mime TEXT NOT NULL DEFAULT '',
    attachment_data TEXT NOT NULL DEFAULT '',
    ai_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS question_papers (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    lesson_name TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'English',
    time_limit_minutes INTEGER NOT NULL DEFAULT 30,
    total_marks INTEGER NOT NULL DEFAULT 20,
    questions_json TEXT NOT NULL,
    source_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exam_attempts (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES question_papers(id) ON DELETE CASCADE,
    answers_json TEXT NOT NULL,
    results_json TEXT NOT NULL,
    score REAL NOT NULL,
    total_marks REAL NOT NULL,
    percentage REAL NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    submitted_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_chats (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT 'General',
    messages_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'study',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

// Safe migrations for existing databases
try {
  db.exec("ALTER TABLE students ADD COLUMN family_group_id TEXT NOT NULL DEFAULT ''");
} catch {
  // column already exists
}
try {
  db.exec("ALTER TABLE timetable_entries ADD COLUMN color TEXT NOT NULL DEFAULT ''");
} catch {
  // column already exists
}
try {
  db.exec("ALTER TABLE calendar_events ADD COLUMN color TEXT NOT NULL DEFAULT ''");
} catch {
  // column already exists
}

export function newId(prefix = ''): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export const DEFAULT_SUBJECTS = [
  { name: 'Mathematics', color: '#4F46E5', targetHoursWeekly: 6 },
  { name: 'Science', color: '#0EA5E9', targetHoursWeekly: 5 },
  { name: 'English', color: '#8B5CF6', targetHoursWeekly: 4 },
  { name: 'Sinhala', color: '#10B981', targetHoursWeekly: 3 },
  { name: 'History', color: '#F59E0B', targetHoursWeekly: 3 },
  { name: 'ICT', color: '#6366F1', targetHoursWeekly: 4 },
];

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  appName: 'Student Time Management System',
  appTagline: 'Personal Learning Workspace · Private Student Accounts',
  welcomeHeadline: 'Organize every subject, timetable, and exam with AI precision.',
  welcomeSubheadline:
    'Manage School, Tuition, and Self-Study schedules across 24-hour daily, weekly, monthly, and yearly planners. Generate real question papers in Sinhala, English, or Tamil directly from your notes.',
  heroImageUrl: '/src/assets/images/hero_study_workspace_1795360852973.jpg',
  examBannerUrl: '/src/assets/images/banner_exam_hall_1795360852847.jpg',
  scholarAvatarUrl: '/src/assets/images/avatar_scholar_bot_1795360852131.jpg',
  defaultStudentAvatarUrl: '/src/assets/images/avatar_student_default_1795360852554.jpg',
  timetablesEnabled: true,
  enabledScopes: {
    daily: true,
    weekly: true,
    monthly: true,
    yearly: true,
  },
  enabledCategories: {
    school: true,
    tuition: true,
    self_study: true,
  },
  aiTimetableEnabled: true,
  aiOwnTimetableEnabled: true,
  features: {
    aiAssistant: true,
    examGenerator: true,
    studyTimer: true,
    calendar: true,
    notes: true,
  },
  defaultSubjects: DEFAULT_SUBJECTS,
  installPromptMessage:
    'Install Student Time Management System on your phone, tablet, or computer for quick one-tap access and offline study support.',
};

export function getSiteSettings(): SiteSettings {
  const row = db
    .prepare('SELECT value_json FROM app_settings WHERE key = ?')
    .get('site_settings') as { value_json: string } | undefined;

  if (!row) {
    return DEFAULT_SITE_SETTINGS;
  }

  try {
    const parsed = JSON.parse(row.value_json) as Partial<SiteSettings>;
    const normalizedAppName =
      !parsed.appName || parsed.appName === 'SMART STUDY AI'
        ? DEFAULT_SITE_SETTINGS.appName
        : parsed.appName;
    return {
      ...DEFAULT_SITE_SETTINGS,
      ...parsed,
      appName: normalizedAppName,
      enabledScopes: { ...DEFAULT_SITE_SETTINGS.enabledScopes, ...(parsed.enabledScopes || {}) },
      enabledCategories: {
        ...DEFAULT_SITE_SETTINGS.enabledCategories,
        ...(parsed.enabledCategories || {}),
      },
      features: { ...DEFAULT_SITE_SETTINGS.features, ...(parsed.features || {}) },
      defaultSubjects:
        Array.isArray(parsed.defaultSubjects) && parsed.defaultSubjects.length > 0
          ? parsed.defaultSubjects
          : DEFAULT_SUBJECTS,
    };
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

export function saveSiteSettings(next: SiteSettings): SiteSettings {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES ('site_settings', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify(next), now);
  return getSiteSettings();
}

export function seedNewStudentDefaults(studentId: string, studentName: string): void {
  const now = new Date().toISOString();
  const settings = getSiteSettings();
  const insertSubject = db.prepare(
    'INSERT INTO subjects (id, student_id, name, color, target_hours_weekly, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const subj of settings.defaultSubjects) {
    insertSubject.run(newId('subj'), studentId, subj.name, subj.color, subj.targetHoursWeekly, now);
  }

  db.prepare(
    'INSERT INTO notifications (id, student_id, title, message, category, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).run(
    newId('notif'),
    studentId,
    `Welcome to ${settings.appName}`,
    `Hi ${studentName}! Your private workspace is ready. Start by adding your school or tuition schedule, or generate your first AI study plan.`,
    'goal',
    now
  );
}
