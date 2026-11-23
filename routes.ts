import { Router } from 'express';
import { db, getSiteSettings, newId, saveSiteSettings, seedNewStudentDefaults } from './db.ts';
import {
  clearSessionCookie,
  createAdminSession,
  createSession,
  deleteAdminSession,
  deleteSession,
  getEnvAdminPasscode,
  hashPassword,
  hasAdminPasscodeConfigured,
  mapStudentRow,
  requireAdmin,
  requireAuth,
  saveClaimedAdminHash,
  setSessionCookie,
  verifyAdminPasscode,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import {
  beautifyOwnTimetable,
  generateQuestionPaper,
  generateSmartTimetable,
  gradeSubjectiveAnswersWithAI,
  runStudyAssistant,
  streamStudyAssistant,
  summarizeSavedNote,
} from './ai.ts';
import type {
  AiChatMessage,
  DashboardAnalytics,
  ExamQuestion,
  GradedQuestionResult,
  PaperLanguage,
  ProfileTheme,
  QuestionType,
  SiteSettings,
  TimetableCategory,
  TimetableScope,
} from '../src/types/shared.ts';

export const apiRouter = Router();

apiRouter.get('/site-settings', (_req, res) => {
  res.json({ settings: getSiteSettings() });
});

// ---------- AUTH ROUTES ----------

apiRouter.post('/auth/register', (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const name = String(req.body?.name ?? '').trim();
    const grade = String(req.body?.grade ?? '').trim();
    const schoolName = String(req.body?.schoolName ?? '').trim();

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'Please enter your full name.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM students WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const id = newId('stu');
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);
    const defaultAvatar = getSiteSettings().defaultStudentAvatarUrl;

    db.prepare(
      `INSERT INTO students (id, email, password_hash, name, grade, school_name, avatar_url, family_group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, email, passwordHash, name, grade, schoolName, defaultAvatar, id, now);

    seedNewStudentDefaults(id, name);

    const token = createSession(id);
    setSessionCookie(req, res, token);

    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(id)!;
    res.status(201).json({ student: mapStudentRow(row), token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Unable to create student account.' });
  }
});

apiRouter.post('/auth/login', (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db.prepare('SELECT * FROM students WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const studentId = String(row.id);
    const token = createSession(studentId);
    setSessionCookie(req, res, token);

    res.json({ student: mapStudentRow(row), token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Unable to sign in.' });
  }
});

apiRouter.post('/auth/forgot-password', (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const schoolName = String(req.body?.schoolName ?? '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword ?? '');

    if (!email || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Email and a new password (at least 6 characters) are required.' });
      return;
    }

    const row = db.prepare('SELECT id, school_name, name FROM students WHERE email = ?').get(email);
    if (!row) {
      res.status(404).json({ error: 'No student account found with that email.' });
      return;
    }

    const storedSchool = String(row.school_name ?? '').trim().toLowerCase();
    const storedName = String(row.name ?? '').trim().toLowerCase();

    // Verify account ownership using either school name (if set) or registered student name
    const verificationMatches =
      (storedSchool && schoolName === storedSchool) ||
      (!storedSchool && schoolName === storedName);

    if (!verificationMatches) {
      res.status(403).json({
        error: storedSchool
          ? 'Verification failed: school name does not match this student profile.'
          : 'Verification failed: full name does not match this student profile.',
      });
      return;
    }

    const newHash = hashPassword(newPassword);
    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(newHash, String(row.id));
    db.prepare('DELETE FROM sessions WHERE student_id = ?').run(String(row.id));

    res.json({ ok: true, message: 'Password updated successfully. Please sign in with your new password.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Unable to reset password.' });
  }
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionToken) {
    deleteSession(req.sessionToken);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const row = db.prepare('SELECT * FROM students WHERE id = ?').get(req.studentId!);
  if (!row) {
    res.status(404).json({ error: 'Student profile not found.' });
    return;
  }
  res.json({ student: mapStudentRow(row) });
});

// ---------- PROFILE & SETTINGS ----------

apiRouter.put('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const grade = String(req.body?.grade ?? '').trim();
    const schoolName = String(req.body?.schoolName ?? '').trim();
    const bio = String(req.body?.bio ?? '').trim();
    const avatarUrl = String(req.body?.avatarUrl ?? '').trim();
    const profileTheme = String(req.body?.profileTheme ?? 'indigo') as ProfileTheme;
    const darkMode = req.body?.darkMode ? 1 : 0;
    const dailyGoalMinutes = Math.max(15, Math.min(720, Number(req.body?.dailyGoalMinutes ?? 120)));

    if (!name) {
      res.status(400).json({ error: 'Student name cannot be empty.' });
      return;
    }

    const validThemes: ProfileTheme[] = ['indigo', 'violet', 'cobalt', 'emerald', 'amber'];
    const safeTheme = validThemes.includes(profileTheme) ? profileTheme : 'indigo';

    db.prepare(
      `UPDATE students
       SET name = ?, grade = ?, school_name = ?, bio = ?, avatar_url = ?, profile_theme = ?, dark_mode = ?, daily_goal_minutes = ?
       WHERE id = ?`
    ).run(
      name,
      grade,
      schoolName,
      bio,
      avatarUrl || '/src/assets/images/avatar_student_default_1795360852554.jpg',
      safeTheme,
      darkMode,
      dailyGoalMinutes,
      req.studentId!
    );

    const updated = db.prepare('SELECT * FROM students WHERE id = ?').get(req.studentId!)!;
    res.json({ student: mapStudentRow(updated) });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

apiRouter.post('/profile/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const row = db.prepare('SELECT password_hash FROM students WHERE id = ?').get(req.studentId!);
    if (!row || !verifyPassword(currentPassword, String(row.password_hash))) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const nextHash = hashPassword(newPassword);
    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(nextHash, req.studentId!);
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ---------- SUBJECTS ----------

apiRouter.get('/subjects', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM subjects WHERE student_id = ? ORDER BY created_at ASC')
    .all(req.studentId!);
  res.json({
    subjects: rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      color: String(r.color),
      targetHoursWeekly: Number(r.target_hours_weekly),
      createdAt: String(r.created_at),
    })),
  });
});

apiRouter.post('/subjects', requireAuth, (req: AuthenticatedRequest, res) => {
  const name = String(req.body?.name ?? '').trim();
  const color = String(req.body?.color ?? '#4F46E5').trim();
  const targetHoursWeekly = Math.max(1, Math.min(40, Number(req.body?.targetHoursWeekly ?? 4)));

  if (!name) {
    res.status(400).json({ error: 'Subject name is required.' });
    return;
  }

  const id = newId('subj');
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO subjects (id, student_id, name, color, target_hours_weekly, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, req.studentId!, name, color, targetHoursWeekly, now);

  res.status(201).json({
    subject: { id, name, color, targetHoursWeekly, createdAt: now },
  });
});

apiRouter.delete('/subjects/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ? AND student_id = ?').run(req.params.id, req.studentId!);
  res.json({ ok: true });
});

// ---------- TIMETABLES ----------

function mapTimetableRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    category: String(r.category) as TimetableCategory,
    scope: String(r.scope) as TimetableScope,
    title: String(r.title),
    subject: String(r.subject ?? ''),
    teacher: String(r.teacher ?? ''),
    location: String(r.location ?? ''),
    dayOfWeek: r.day_of_week === null || r.day_of_week === undefined ? null : Number(r.day_of_week),
    month: r.month === null || r.month === undefined ? null : Number(r.month),
    year: Number(r.year),
    specificDate: r.specific_date ? String(r.specific_date) : null,
    startTime: String(r.start_time),
    endTime: String(r.end_time),
    durationMinutes: Number(r.duration_minutes),
    completed: Number(r.completed ?? 0) === 1,
    notes: String(r.notes ?? ''),
    color: String(r.color ?? ''),
    isAiGenerated: Number(r.is_ai_generated ?? 0) === 1,
    createdAt: String(r.created_at),
  };
}

apiRouter.get('/timetables', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM timetable_entries WHERE student_id = ? ORDER BY start_time ASC')
    .all(req.studentId!);
  res.json({ entries: rows.map(mapTimetableRow) });
});

apiRouter.post('/timetables', requireAuth, (req: AuthenticatedRequest, res) => {
  const category = String(req.body?.category ?? 'self_study') as TimetableCategory;
  const scope = String(req.body?.scope ?? 'weekly') as TimetableScope;
  const title = String(req.body?.title ?? '').trim();
  const subject = String(req.body?.subject ?? '').trim();
  const teacher = String(req.body?.teacher ?? '').trim();
  const location = String(req.body?.location ?? '').trim();
  const dayOfWeek = req.body?.dayOfWeek === null || req.body?.dayOfWeek === undefined ? null : Number(req.body.dayOfWeek);
  const month = req.body?.month === null || req.body?.month === undefined ? null : Number(req.body.month);
  const year = Number(req.body?.year ?? new Date().getFullYear());
  const specificDate = req.body?.specificDate ? String(req.body.specificDate) : null;
  const startTime = String(req.body?.startTime ?? '09:00');
  const endTime = String(req.body?.endTime ?? '10:00');
  const durationMinutes = Math.max(5, Number(req.body?.durationMinutes ?? 60));
  const notes = String(req.body?.notes ?? '').trim();
  const color = String(req.body?.color ?? '').trim();
  const isAiGenerated = req.body?.isAiGenerated ? 1 : 0;

  if (!title) {
    res.status(400).json({ error: 'Activity or class title is required.' });
    return;
  }

  const id = newId('tt');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO timetable_entries
     (id, student_id, category, scope, title, subject, teacher, location, day_of_week, month, year, specific_date, start_time, end_time, duration_minutes, completed, notes, color, is_ai_generated, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).run(
    id,
    req.studentId!,
    category,
    scope,
    title,
    subject,
    teacher,
    location,
    dayOfWeek,
    month,
    year,
    specificDate,
    startTime,
    endTime,
    durationMinutes,
    notes,
    color,
    isAiGenerated,
    now
  );

  const row = db.prepare('SELECT * FROM timetable_entries WHERE id = ?').get(id)!;
  res.status(201).json({ entry: mapTimetableRow(row) });
});

apiRouter.post('/timetables/bulk', requireAuth, (req: AuthenticatedRequest, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO timetable_entries
     (id, student_id, category, scope, title, subject, teacher, location, day_of_week, month, year, specific_date, start_time, end_time, duration_minutes, completed, notes, color, is_ai_generated, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
  );

  const createdIds: string[] = [];
  for (const item of entries) {
    const id = newId('tt');
    insert.run(
      id,
      req.studentId!,
      String(item.category ?? 'self_study'),
      String(item.scope ?? 'weekly'),
      String(item.title ?? 'Study Session'),
      String(item.subject ?? ''),
      String(item.teacher ?? ''),
      String(item.location ?? ''),
      item.dayOfWeek ?? null,
      item.month ?? null,
      Number(item.year ?? new Date().getFullYear()),
      item.specificDate ?? null,
      String(item.startTime ?? '16:00'),
      String(item.endTime ?? '17:00'),
      Math.max(5, Number(item.durationMinutes ?? 60)),
      String(item.notes ?? ''),
      String(item.color ?? ''),
      item.isAiGenerated ? 1 : 0,
      now
    );
    createdIds.push(id);
  }

  const rows = db
    .prepare('SELECT * FROM timetable_entries WHERE student_id = ? ORDER BY start_time ASC')
    .all(req.studentId!);
  res.status(201).json({ entries: rows.map(mapTimetableRow), addedCount: createdIds.length });
});

apiRouter.put('/timetables/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const existing = db
    .prepare('SELECT * FROM timetable_entries WHERE id = ? AND student_id = ?')
    .get(req.params.id, req.studentId!);
  if (!existing) {
    res.status(404).json({ error: 'Timetable entry not found.' });
    return;
  }

  const title = String(req.body?.title ?? existing.title).trim();
  const category = String(req.body?.category ?? existing.category);
  const scope = String(req.body?.scope ?? existing.scope);
  const subject = String(req.body?.subject ?? existing.subject);
  const teacher = String(req.body?.teacher ?? existing.teacher);
  const location = String(req.body?.location ?? existing.location);
  const dayOfWeek = req.body?.dayOfWeek !== undefined ? req.body.dayOfWeek : existing.day_of_week;
  const month = req.body?.month !== undefined ? req.body.month : existing.month;
  const year = Number(req.body?.year ?? existing.year);
  const specificDate = req.body?.specificDate !== undefined ? req.body.specificDate : existing.specific_date;
  const startTime = String(req.body?.startTime ?? existing.start_time);
  const endTime = String(req.body?.endTime ?? existing.end_time);
  const durationMinutes = Number(req.body?.durationMinutes ?? existing.duration_minutes);
  const completed = req.body?.completed !== undefined ? (req.body.completed ? 1 : 0) : Number(existing.completed);
  const notes = String(req.body?.notes ?? existing.notes);
  const color = req.body?.color !== undefined ? String(req.body.color).trim() : String(existing.color ?? '');

  db.prepare(
    `UPDATE timetable_entries
     SET category = ?, scope = ?, title = ?, subject = ?, teacher = ?, location = ?, day_of_week = ?, month = ?, year = ?, specific_date = ?, start_time = ?, end_time = ?, duration_minutes = ?, completed = ?, notes = ?, color = ?
     WHERE id = ? AND student_id = ?`
  ).run(
    category,
    scope,
    title,
    subject,
    teacher,
    location,
    dayOfWeek,
    month,
    year,
    specificDate,
    startTime,
    endTime,
    durationMinutes,
    completed,
    notes,
    color,
    req.params.id,
    req.studentId!
  );

  const row = db.prepare('SELECT * FROM timetable_entries WHERE id = ?').get(req.params.id)!;
  res.json({ entry: mapTimetableRow(row) });
});

apiRouter.delete('/timetables/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM timetable_entries WHERE id = ? AND student_id = ?').run(req.params.id, req.studentId!);
  res.json({ ok: true });
});

// ---------- YEARLY GOALS ----------

apiRouter.get('/yearly-goals', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM yearly_goals WHERE student_id = ? ORDER BY month ASC, created_at DESC')
    .all(req.studentId!);
  res.json({
    goals: rows.map((r) => ({
      id: String(r.id),
      year: Number(r.year),
      month: Number(r.month),
      title: String(r.title),
      subject: String(r.subject ?? ''),
      targetMetric: String(r.target_metric ?? ''),
      progressPercent: Number(r.progress_percent ?? 0),
      completed: Number(r.completed ?? 0) === 1,
      createdAt: String(r.created_at),
    })),
  });
});

apiRouter.post('/yearly-goals', requireAuth, (req: AuthenticatedRequest, res) => {
  const title = String(req.body?.title ?? '').trim();
  if (!title) {
    res.status(400).json({ error: 'Goal title is required.' });
    return;
  }
  const id = newId('yg');
  const now = new Date().toISOString();
  const year = Number(req.body?.year ?? new Date().getFullYear());
  const month = Number(req.body?.month ?? 0);
  const subject = String(req.body?.subject ?? '');
  const targetMetric = String(req.body?.targetMetric ?? '');
  const progressPercent = Math.max(0, Math.min(100, Number(req.body?.progressPercent ?? 0)));

  db.prepare(
    `INSERT INTO yearly_goals (id, student_id, year, month, title, subject, target_metric, progress_percent, completed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.studentId!, year, month, title, subject, targetMetric, progressPercent, progressPercent >= 100 ? 1 : 0, now);

  res.status(201).json({
    goal: {
      id,
      year,
      month,
      title,
      subject,
      targetMetric,
      progressPercent,
      completed: progressPercent >= 100,
      createdAt: now,
    },
  });
});

apiRouter.put('/yearly-goals/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const existing = db
    .prepare('SELECT * FROM yearly_goals WHERE id = ? AND student_id = ?')
    .get(req.params.id, req.studentId!);
  if (!existing) {
    res.status(404).json({ error: 'Goal not found.' });
    return;
  }

  const progressPercent = Math.max(
    0,
    Math.min(100, Number(req.body?.progressPercent ?? existing.progress_percent))
  );
  const completed =
    req.body?.completed !== undefined ? (req.body.completed ? 1 : 0) : progressPercent >= 100 ? 1 : 0;
  const title = String(req.body?.title ?? existing.title);

  db.prepare('UPDATE yearly_goals SET title = ?, progress_percent = ?, completed = ? WHERE id = ? AND student_id = ?').run(
    title,
    progressPercent,
    completed,
    req.params.id,
    req.studentId!
  );

  res.json({ ok: true });
});

apiRouter.delete('/yearly-goals/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM yearly_goals WHERE id = ? AND student_id = ?').run(req.params.id, req.studentId!);
  res.json({ ok: true });
});

// ---------- CALENDAR EVENTS ----------

function mapEventRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    title: String(r.title),
    eventType: String(r.event_type),
    eventDate: String(r.event_date),
    startTime: String(r.start_time),
    endTime: String(r.end_time),
    subject: String(r.subject ?? ''),
    description: String(r.description ?? ''),
    color: String(r.color ?? ''),
    reminderMinutes: Number(r.reminder_minutes ?? 30),
    completed: Number(r.completed ?? 0) === 1,
    createdAt: String(r.created_at),
  };
}

apiRouter.get('/calendar', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM calendar_events WHERE student_id = ? ORDER BY event_date ASC, start_time ASC')
    .all(req.studentId!);
  res.json({ events: rows.map(mapEventRow) });
});

apiRouter.post('/calendar', requireAuth, (req: AuthenticatedRequest, res) => {
  const title = String(req.body?.title ?? '').trim();
  const eventType = String(req.body?.eventType ?? 'study_session');
  const eventDate = String(req.body?.eventDate ?? new Date().toISOString().slice(0, 10));
  const startTime = String(req.body?.startTime ?? '09:00');
  const endTime = String(req.body?.endTime ?? '10:00');
  const subject = String(req.body?.subject ?? '').trim();
  const description = String(req.body?.description ?? '').trim();
  const color = String(req.body?.color ?? '').trim();
  const reminderMinutes = Number(req.body?.reminderMinutes ?? 30);

  if (!title) {
    res.status(400).json({ error: 'Event title is required.' });
    return;
  }

  const id = newId('evt');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO calendar_events (id, student_id, title, event_type, event_date, start_time, end_time, subject, description, color, reminder_minutes, completed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, req.studentId!, title, eventType, eventDate, startTime, endTime, subject, description, color, reminderMinutes, now);

  // Create notification reminder for exams and assignments
  if (eventType === 'exam' || eventType === 'assignment') {
    db.prepare(
      'INSERT INTO notifications (id, student_id, title, message, category, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
    ).run(
      newId('notif'),
      req.studentId!,
      `${eventType === 'exam' ? 'Exam Scheduled' : 'Assignment Deadline'}: ${title}`,
      `${subject ? `${subject} · ` : ''}Due on ${eventDate} at ${startTime}.`,
      eventType,
      now
    );
  }

  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id)!;
  res.status(201).json({ event: mapEventRow(row) });
});

apiRouter.put('/calendar/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const existing = db
    .prepare('SELECT * FROM calendar_events WHERE id = ? AND student_id = ?')
    .get(req.params.id, req.studentId!);
  if (!existing) {
    res.status(404).json({ error: 'Calendar event not found.' });
    return;
  }

  const title = String(req.body?.title ?? existing.title).trim();
  const eventType = String(req.body?.eventType ?? existing.event_type);
  const eventDate = String(req.body?.eventDate ?? existing.event_date);
  const startTime = String(req.body?.startTime ?? existing.start_time);
  const endTime = String(req.body?.endTime ?? existing.end_time);
  const subject = String(req.body?.subject ?? existing.subject);
  const description = String(req.body?.description ?? existing.description);
  const color = req.body?.color !== undefined ? String(req.body.color).trim() : String(existing.color ?? '');
  const reminderMinutes = Number(req.body?.reminderMinutes ?? existing.reminder_minutes);
  const completed = req.body?.completed !== undefined ? (req.body.completed ? 1 : 0) : Number(existing.completed);

  db.prepare(
    `UPDATE calendar_events
     SET title = ?, event_type = ?, event_date = ?, start_time = ?, end_time = ?, subject = ?, description = ?, color = ?, reminder_minutes = ?, completed = ?
     WHERE id = ? AND student_id = ?`
  ).run(
    title,
    eventType,
    eventDate,
    startTime,
    endTime,
    subject,
    description,
    color,
    reminderMinutes,
    completed,
    req.params.id,
    req.studentId!
  );

  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id)!;
  res.json({ event: mapEventRow(row) });
});

apiRouter.delete('/calendar/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM calendar_events WHERE id = ? AND student_id = ?').run(req.params.id, req.studentId!);
  res.json({ ok: true });
});

// ---------- STUDY TIMER SESSIONS ----------

apiRouter.get('/study-sessions', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM study_sessions WHERE student_id = ? ORDER BY completed_at DESC LIMIT 200')
    .all(req.studentId!);
  res.json({
    sessions: rows.map((r) => ({
      id: String(r.id),
      subject: String(r.subject),
      mode: String(r.mode),
      durationMinutes: Number(r.duration_minutes),
      sessionDate: String(r.session_date),
      completedAt: String(r.completed_at),
    })),
  });
});

apiRouter.post('/study-sessions', requireAuth, (req: AuthenticatedRequest, res) => {
  const subject = String(req.body?.subject ?? 'General').trim();
  const mode = String(req.body?.mode ?? 'focus_25');
  const durationMinutes = Math.max(1, Math.min(600, Number(req.body?.durationMinutes ?? 25)));
  const now = new Date();
  const sessionDate = String(req.body?.sessionDate ?? now.toISOString().slice(0, 10));
  const id = newId('sess');

  db.prepare(
    `INSERT INTO study_sessions (id, student_id, subject, mode, duration_minutes, session_date, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.studentId!, subject, mode, durationMinutes, sessionDate, now.toISOString());

  res.status(201).json({
    session: {
      id,
      subject,
      mode,
      durationMinutes,
      sessionDate,
      completedAt: now.toISOString(),
    },
  });
});

// ---------- NOTES & STUDY MATERIALS ----------

function mapNoteRow(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    title: String(r.title),
    subject: String(r.subject),
    lesson: String(r.lesson ?? ''),
    content: String(r.content ?? ''),
    isImportant: Number(r.is_important ?? 0) === 1,
    attachmentName: String(r.attachment_name ?? ''),
    attachmentMime: String(r.attachment_mime ?? ''),
    attachmentData: String(r.attachment_data ?? ''),
    aiSummary: String(r.ai_summary ?? ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

apiRouter.get('/notes', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notes WHERE student_id = ? ORDER BY is_important DESC, updated_at DESC')
    .all(req.studentId!);
  res.json({ notes: rows.map(mapNoteRow) });
});

apiRouter.post('/notes', requireAuth, (req: AuthenticatedRequest, res) => {
  const title = String(req.body?.title ?? '').trim();
  const subject = String(req.body?.subject ?? 'General').trim();
  const lesson = String(req.body?.lesson ?? '').trim();
  const content = String(req.body?.content ?? '');
  const isImportant = req.body?.isImportant ? 1 : 0;
  const attachmentName = String(req.body?.attachmentName ?? '');
  const attachmentMime = String(req.body?.attachmentMime ?? '');
  const attachmentData = String(req.body?.attachmentData ?? '');

  if (!title) {
    res.status(400).json({ error: 'Note title is required.' });
    return;
  }

  const id = newId('note');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notes (id, student_id, title, subject, lesson, content, is_important, attachment_name, attachment_mime, attachment_data, ai_summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
  ).run(
    id,
    req.studentId!,
    title,
    subject,
    lesson,
    content,
    isImportant,
    attachmentName,
    attachmentMime,
    attachmentData,
    now,
    now
  );

  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)!;
  res.status(201).json({ note: mapNoteRow(row) });
});

apiRouter.put('/notes/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const existing = db
    .prepare('SELECT * FROM notes WHERE id = ? AND student_id = ?')
    .get(req.params.id, req.studentId!);
  if (!existing) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  const title = String(req.body?.title ?? existing.title).trim();
  const subject = String(req.body?.subject ?? existing.subject).trim();
  const lesson = String(req.body?.lesson ?? existing.lesson).trim();
  const content = String(req.body?.content ?? existing.content);
  const isImportant = req.body?.isImportant !== undefined ? (req.body.isImportant ? 1 : 0) : Number(existing.is_important);
  const attachmentName = req.body?.attachmentName !== undefined ? String(req.body.attachmentName) : String(existing.attachment_name);
  const attachmentMime = req.body?.attachmentMime !== undefined ? String(req.body.attachmentMime) : String(existing.attachment_mime);
  const attachmentData = req.body?.attachmentData !== undefined ? String(req.body.attachmentData) : String(existing.attachment_data);
  const aiSummary = req.body?.aiSummary !== undefined ? String(req.body.aiSummary) : String(existing.ai_summary);
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE notes
     SET title = ?, subject = ?, lesson = ?, content = ?, is_important = ?, attachment_name = ?, attachment_mime = ?, attachment_data = ?, ai_summary = ?, updated_at = ?
     WHERE id = ? AND student_id = ?`
  ).run(
    title,
    subject,
    lesson,
    content,
    isImportant,
    attachmentName,
    attachmentMime,
    attachmentData,
    aiSummary,
    now,
    req.params.id,
    req.studentId!
  );

  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)!;
  res.json({ note: mapNoteRow(row) });
});

apiRouter.delete('/notes/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM notes WHERE id = ? AND student_id = ?').run(req.params.id, req.studentId!);
  res.json({ ok: true });
});

apiRouter.post('/notes/:id/summarize', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const existing = db
      .prepare('SELECT * FROM notes WHERE id = ? AND student_id = ?')
      .get(req.params.id, req.studentId!);
    if (!existing) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    const summary = await summarizeSavedNote({
      title: String(existing.title),
      subject: String(existing.subject),
      lesson: String(existing.lesson ?? ''),
      content: String(existing.content ?? ''),
      attachment: existing.attachment_data
        ? {
            name: String(existing.attachment_name),
            mimeType: String(existing.attachment_mime),
            data: String(existing.attachment_data),
          }
        : null,
    });

    const now = new Date().toISOString();
    db.prepare('UPDATE notes SET ai_summary = ?, updated_at = ? WHERE id = ? AND student_id = ?').run(
      summary,
      now,
      req.params.id,
      req.studentId!
    );

    const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)!;
    res.json({ note: mapNoteRow(updated) });
  } catch (err) {
    console.error('Summarize note error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI summary failed.' });
  }
});

// ---------- AI STUDY ASSISTANT ----------

apiRouter.get('/ai/chats', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM ai_chats WHERE student_id = ? ORDER BY updated_at DESC')
    .all(req.studentId!);
  res.json({
    threads: rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      subject: String(r.subject),
      messages: JSON.parse(String(r.messages_json || '[]')) as AiChatMessage[],
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    })),
  });
});

apiRouter.delete('/ai/chats/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM ai_chats WHERE id = ? AND student_id = ?').run(req.params.id, req.studentId!);
  res.json({ ok: true });
});

apiRouter.post('/ai/assistant', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const mode = String(req.body?.mode ?? 'qa') as 'explain' | 'summarize' | 'study_plan' | 'practice' | 'qa';
    const subject = String(req.body?.subject ?? 'General').trim();
    const prompt = String(req.body?.prompt ?? '').trim();
    const notesText = String(req.body?.notesText ?? '').trim();
    const threadId = req.body?.threadId ? String(req.body.threadId) : null;
    const attachment = req.body?.attachment ?? null;
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (!prompt && !notesText && !attachment && attachments.length === 0) {
      res.status(400).json({ error: 'Please enter a question, study notes, or upload pictures/documents.' });
      return;
    }

    const studentRow = db.prepare('SELECT name, grade FROM students WHERE id = ?').get(req.studentId!);
    let existingMessages: AiChatMessage[] = [];
    if (threadId) {
      const existingThread = db
        .prepare('SELECT messages_json FROM ai_chats WHERE id = ? AND student_id = ?')
        .get(threadId, req.studentId!);
      if (existingThread) {
        existingMessages = JSON.parse(String(existingThread.messages_json || '[]')) as AiChatMessage[];
      }
    }

    const effectivePrompt = prompt || (mode === 'summarize' ? 'Summarize the provided study materials.' : 'Help me study this material.');
    const reply = await runStudyAssistant({
      mode,
      subject,
      prompt: effectivePrompt,
      notesText,
      history: existingMessages.map((m) => ({ role: m.role, content: m.content })),
      attachment,
      attachments,
      studentName: studentRow ? String(studentRow.name) : undefined,
      studentGrade: studentRow ? String(studentRow.grade) : undefined,
    });

    const attachmentNames = [
      ...(attachment?.name ? [String(attachment.name)] : []),
      ...attachments.map((a: { name?: string }) => String(a?.name ?? '')).filter(Boolean),
    ];

    const now = new Date().toISOString();
    const userMsg: AiChatMessage = {
      id: newId('msg'),
      role: 'user',
      content: effectivePrompt + (notesText ? `\n\n[Attached Notes: ${notesText.slice(0, 160)}${notesText.length > 160 ? '...' : ''}]` : ''),
      mode,
      attachmentName: attachmentNames.length > 0 ? attachmentNames.join(', ') : undefined,
      createdAt: now,
    };
    const aiMsg: AiChatMessage = {
      id: newId('msg'),
      role: 'assistant',
      content: reply,
      mode,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...existingMessages, userMsg, aiMsg];
    let savedThreadId = threadId;

    if (savedThreadId) {
      db.prepare('UPDATE ai_chats SET messages_json = ?, updated_at = ? WHERE id = ? AND student_id = ?').run(
        JSON.stringify(nextMessages),
        now,
        savedThreadId,
        req.studentId!
      );
    } else {
      savedThreadId = newId('chat');
      const title = effectivePrompt.slice(0, 56) + (effectivePrompt.length > 56 ? '...' : '');
      db.prepare(
        'INSERT INTO ai_chats (id, student_id, title, subject, messages_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(savedThreadId, req.studentId!, title, subject, JSON.stringify(nextMessages), now, now);
    }

    res.json({
      threadId: savedThreadId,
      reply,
      messages: nextMessages,
    });
  } catch (err) {
    console.error('AI Assistant error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI Study Assistant failed.' });
  }
});

apiRouter.post('/ai/assistant/stream', requireAuth, async (req: AuthenticatedRequest, res) => {
  const mode = String(req.body?.mode ?? 'qa') as 'explain' | 'summarize' | 'study_plan' | 'practice' | 'qa';
  const subject = String(req.body?.subject ?? 'General').trim();
  const prompt = String(req.body?.prompt ?? '').trim();
  const notesText = String(req.body?.notesText ?? '').trim();
  const threadId = req.body?.threadId ? String(req.body.threadId) : null;
  const attachment = req.body?.attachment ?? null;
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  if (!prompt && !notesText && !attachment && attachments.length === 0) {
    res.status(400).json({ error: 'Please enter a question, study notes, or upload pictures/documents.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const writeSse = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const studentRow = db.prepare('SELECT name, grade FROM students WHERE id = ?').get(req.studentId!);
    let existingMessages: AiChatMessage[] = [];
    if (threadId) {
      const existingThread = db
        .prepare('SELECT messages_json FROM ai_chats WHERE id = ? AND student_id = ?')
        .get(threadId, req.studentId!);
      if (existingThread) {
        existingMessages = JSON.parse(String(existingThread.messages_json || '[]')) as AiChatMessage[];
      }
    }

    const effectivePrompt =
      prompt || (mode === 'summarize' ? 'Summarize the provided study materials.' : 'Help me study this material.');

    writeSse({ type: 'start' });

    const reply = await streamStudyAssistant(
      {
        mode,
        subject,
        prompt: effectivePrompt,
        notesText,
        history: existingMessages.map((m) => ({ role: m.role, content: m.content })),
        attachment,
        attachments,
        studentName: studentRow ? String(studentRow.name) : undefined,
        studentGrade: studentRow ? String(studentRow.grade) : undefined,
      },
      (delta) => {
        writeSse({ type: 'delta', text: delta });
      }
    );

    const attachmentNames = [
      ...(attachment?.name ? [String(attachment.name)] : []),
      ...attachments.map((a: { name?: string }) => String(a?.name ?? '')).filter(Boolean),
    ];

    const now = new Date().toISOString();
    const userMsg: AiChatMessage = {
      id: newId('msg'),
      role: 'user',
      content:
        effectivePrompt +
        (notesText ? `\n\n[Attached Notes: ${notesText.slice(0, 160)}${notesText.length > 160 ? '...' : ''}]` : ''),
      mode,
      attachmentName: attachmentNames.length > 0 ? attachmentNames.join(', ') : undefined,
      createdAt: now,
    };
    const aiMsg: AiChatMessage = {
      id: newId('msg'),
      role: 'assistant',
      content: reply,
      mode,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...existingMessages, userMsg, aiMsg];
    let savedThreadId = threadId;

    if (savedThreadId) {
      db.prepare('UPDATE ai_chats SET messages_json = ?, updated_at = ? WHERE id = ? AND student_id = ?').run(
        JSON.stringify(nextMessages),
        now,
        savedThreadId,
        req.studentId!
      );
    } else {
      savedThreadId = newId('chat');
      const title = effectivePrompt.slice(0, 56) + (effectivePrompt.length > 56 ? '...' : '');
      db.prepare(
        'INSERT INTO ai_chats (id, student_id, title, subject, messages_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(savedThreadId, req.studentId!, title, subject, JSON.stringify(nextMessages), now, now);
    }

    writeSse({
      type: 'done',
      threadId: savedThreadId,
      reply,
      messages: nextMessages,
    });
    res.end();
  } catch (err) {
    console.error('AI Assistant stream error:', err);
    writeSse({
      type: 'error',
      error: err instanceof Error ? err.message : 'AI Study Assistant failed.',
    });
    res.end();
  }
});

// ---------- AI QUESTION PAPER GENERATOR & EXAM MODE ----------

apiRouter.get('/papers', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM question_papers WHERE student_id = ? ORDER BY created_at DESC')
    .all(req.studentId!);
  res.json({
    papers: rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      subject: String(r.subject),
      lessonName: String(r.lesson_name ?? ''),
      language: String(r.language) as PaperLanguage,
      timeLimitMinutes: Number(r.time_limit_minutes),
      totalMarks: Number(r.total_marks),
      questions: JSON.parse(String(r.questions_json)) as ExamQuestion[],
      sourceSummary: String(r.source_summary ?? ''),
      createdAt: String(r.created_at),
    })),
  });
});

apiRouter.post('/papers/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const subject = String(req.body?.subject ?? 'General').trim();
    const lessonName = String(req.body?.lessonName ?? '').trim();
    const topic = String(req.body?.topic ?? '').trim();
    const notesText = String(req.body?.notesText ?? '').trim();
    const questionCount = Math.max(5, Math.min(60, Number(req.body?.questionCount ?? 20)));
    const questionTypes = (Array.isArray(req.body?.questionTypes) ? req.body.questionTypes : ['MCQ']) as QuestionType[];
    const language = (String(req.body?.language ?? 'English') as PaperLanguage);
    const timeLimitMinutes = Math.max(5, Math.min(180, Number(req.body?.timeLimitMinutes ?? 30)));
    const attachment = req.body?.attachment ?? null;
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (!lessonName && !topic && !notesText && !attachment && attachments.length === 0) {
      res.status(400).json({ error: 'Please provide a lesson/topic, study notes, or upload pictures/documents.' });
      return;
    }

    const generated = await generateQuestionPaper({
      subject,
      lessonName: lessonName || topic || 'Lesson Practice',
      topic,
      notesText,
      questionCount,
      questionTypes,
      language,
      timeLimitMinutes,
      attachment,
      attachments,
    });

    const totalMarks = generated.questions.reduce((acc, q) => acc + q.marks, 0);
    const id = newId('paper');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO question_papers
       (id, student_id, title, subject, lesson_name, language, time_limit_minutes, total_marks, questions_json, source_summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.studentId!,
      generated.paperTitle,
      subject,
      lessonName || topic,
      language,
      timeLimitMinutes,
      totalMarks,
      JSON.stringify(generated.questions),
      generated.sourceSummary,
      now
    );

    res.status(201).json({
      paper: {
        id,
        title: generated.paperTitle,
        subject,
        lessonName: lessonName || topic,
        language,
        timeLimitMinutes,
        totalMarks,
        questions: generated.questions,
        sourceSummary: generated.sourceSummary,
        createdAt: now,
      },
    });
  } catch (err) {
    console.error('Generate paper error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate question paper.' });
  }
});

apiRouter.delete('/papers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM question_papers WHERE id = ? AND student_id = ?').run(req.params.id, req.studentId!);
  res.json({ ok: true });
});

function normalizeAns(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

apiRouter.post('/papers/:id/submit', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const paperRow = db
      .prepare('SELECT * FROM question_papers WHERE id = ? AND student_id = ?')
      .get(req.params.id, req.studentId!);

    if (!paperRow) {
      res.status(404).json({ error: 'Question paper not found.' });
      return;
    }

    const questions = JSON.parse(String(paperRow.questions_json)) as ExamQuestion[];
    const answers = (req.body?.answers ?? {}) as Record<string, string | string[]>;
    const timeSpentSeconds = Math.max(0, Number(req.body?.timeSpentSeconds ?? 0));
    const language = String(paperRow.language ?? 'English') as PaperLanguage;

    // Collect subjective answers to evaluate with Gemini AI if non-empty
    const subjectiveItems: Array<{
      questionId: string;
      question: string;
      modelAnswer: string;
      maxMarks: number;
      studentAnswer: string;
    }> = [];

    for (const q of questions) {
      if (q.type === 'Short Answer' || q.type === 'Structured') {
        const raw = answers[q.id];
        const ansStr = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '').trim();
        if (ansStr.length > 0) {
          subjectiveItems.push({
            questionId: q.id,
            question: q.question,
            modelAnswer: q.correctAnswer,
            maxMarks: q.marks,
            studentAnswer: ansStr,
          });
        }
      }
    }

    let aiGrades: Record<string, { marksAwarded: number; feedback: string }> = {};
    if (subjectiveItems.length > 0) {
      try {
        aiGrades = await gradeSubjectiveAnswersWithAI({ language, items: subjectiveItems });
      } catch (e) {
        console.error('Subjective grading fallback:', e);
      }
    }

    const results: GradedQuestionResult[] = [];
    let score = 0;
    let totalMarks = 0;
    let correctCount = 0;
    let incorrectCount = 0;

    for (const q of questions) {
      totalMarks += q.marks;
      const rawAns = answers[q.id];

      if (q.type === 'Multiple Answer') {
        const selected = Array.isArray(rawAns)
          ? rawAns.map(normalizeAns).filter(Boolean)
          : String(rawAns ?? '')
              .split('|')
              .map(normalizeAns)
              .filter(Boolean);
        const expectedList = (
          q.acceptableAnswers.length > 0
            ? q.acceptableAnswers
            : q.correctAnswer.split('|')
        )
          .map(normalizeAns)
          .filter(Boolean);

        const isExactMatch =
          selected.length === expectedList.length &&
          expectedList.every((exp) => selected.includes(exp));

        const awarded = isExactMatch ? q.marks : 0;
        score += awarded;
        if (isExactMatch) correctCount += 1;
        else incorrectCount += 1;

        results.push({
          questionId: q.id,
          number: q.number,
          type: q.type,
          question: q.question,
          userAnswer: Array.isArray(rawAns) ? rawAns : String(rawAns ?? ''),
          correctAnswer: q.correctAnswer,
          isCorrect: isExactMatch,
          marksAwarded: awarded,
          maxMarks: q.marks,
          explanation: q.explanation,
        });
      } else if (q.type === 'Short Answer' || q.type === 'Structured') {
        const ansStr = Array.isArray(rawAns) ? rawAns.join(', ') : String(rawAns ?? '').trim();
        const graded = aiGrades[q.id];
        let awarded = 0;
        let feedback = '';

        if (!ansStr) {
          awarded = 0;
          feedback = 'No answer provided.';
        } else if (graded) {
          awarded = Math.max(0, Math.min(q.marks, graded.marksAwarded));
          feedback = graded.feedback;
        } else {
          // Deterministic keyword overlap if AI grader unavailable
          const expectedTokens = normalizeAns(q.correctAnswer).split(' ').filter((w) => w.length > 3);
          const studentTokens = normalizeAns(ansStr);
          const hits = expectedTokens.filter((t) => studentTokens.includes(t)).length;
          const ratio = expectedTokens.length > 0 ? hits / expectedTokens.length : 0;
          awarded = Math.round(q.marks * Math.min(1, ratio * 1.4));
          feedback = awarded >= q.marks * 0.5 ? 'Key concepts covered.' : 'Review the model answer for full points.';
        }

        const passed = awarded >= q.marks * 0.5;
        score += awarded;
        if (passed) correctCount += 1;
        else incorrectCount += 1;

        results.push({
          questionId: q.id,
          number: q.number,
          type: q.type,
          question: q.question,
          userAnswer: ansStr,
          correctAnswer: q.correctAnswer,
          isCorrect: passed,
          marksAwarded: awarded,
          maxMarks: q.marks,
          explanation: q.explanation,
          aiFeedback: feedback,
        });
      } else {
        // MCQ, True or False, Single Answer, Fill in the Blanks
        const userStr = Array.isArray(rawAns) ? rawAns[0] ?? '' : String(rawAns ?? '');
        const normUser = normalizeAns(userStr);
        const validSet = new Set(
          [q.correctAnswer, ...(q.acceptableAnswers ?? [])].map(normalizeAns).filter(Boolean)
        );
        const isCorrect = normUser.length > 0 && validSet.has(normUser);
        const awarded = isCorrect ? q.marks : 0;
        score += awarded;
        if (isCorrect) correctCount += 1;
        else incorrectCount += 1;

        results.push({
          questionId: q.id,
          number: q.number,
          type: q.type,
          question: q.question,
          userAnswer: userStr,
          correctAnswer: q.correctAnswer,
          isCorrect,
          marksAwarded: awarded,
          maxMarks: q.marks,
          explanation: q.explanation,
        });
      }
    }

    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 1000) / 10 : 0;
    const attemptId = newId('att');
    const submittedAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO exam_attempts
       (id, student_id, paper_id, answers_json, results_json, score, total_marks, percentage, correct_count, incorrect_count, time_spent_seconds, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attemptId,
      req.studentId!,
      req.params.id,
      JSON.stringify(answers),
      JSON.stringify(results),
      score,
      totalMarks,
      percentage,
      correctCount,
      incorrectCount,
      timeSpentSeconds,
      submittedAt
    );

    res.status(201).json({
      attempt: {
        id: attemptId,
        paperId: String(paperRow.id),
        paperTitle: String(paperRow.title),
        subject: String(paperRow.subject),
        lessonName: String(paperRow.lesson_name ?? ''),
        score,
        totalMarks,
        percentage,
        correctCount,
        incorrectCount,
        timeSpentSeconds,
        results,
        submittedAt,
      },
    });
  } catch (err) {
    console.error('Submit exam error:', err);
    res.status(500).json({ error: 'Failed to submit and mark examination paper.' });
  }
});

apiRouter.get('/exam-attempts', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, p.title as paper_title, p.subject, p.lesson_name
       FROM exam_attempts a
       JOIN question_papers p ON p.id = a.paper_id
       WHERE a.student_id = ?
       ORDER BY a.submitted_at DESC`
    )
    .all(req.studentId!);

  res.json({
    attempts: rows.map((r) => ({
      id: String(r.id),
      paperId: String(r.paper_id),
      paperTitle: String(r.paper_title),
      subject: String(r.subject),
      lessonName: String(r.lesson_name ?? ''),
      score: Number(r.score),
      totalMarks: Number(r.total_marks),
      percentage: Number(r.percentage),
      correctCount: Number(r.correct_count),
      incorrectCount: Number(r.incorrect_count),
      timeSpentSeconds: Number(r.time_spent_seconds),
      results: JSON.parse(String(r.results_json)) as GradedQuestionResult[],
      submittedAt: String(r.submitted_at),
    })),
  });
});

// ---------- AI SMART TIMETABLE ----------

apiRouter.post('/ai/generate-timetable', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const subjects = Array.isArray(req.body?.subjects)
      ? req.body.subjects.map(String).filter(Boolean)
      : ['Mathematics', 'Science', 'English'];
    const availableHoursPerDay = Number(req.body?.availableHoursPerDay ?? 3);
    const schoolTimes = String(req.body?.schoolTimes ?? '');
    const tuitionTimes = String(req.body?.tuitionTimes ?? '');
    const freeTimes = String(req.body?.freeTimes ?? '');
    const examDates = String(req.body?.examDates ?? '');
    const studyGoals = String(req.body?.studyGoals ?? '');
    const scope = (req.body?.scope === 'daily' ? 'daily' : 'weekly') as 'weekly' | 'daily';
    const selectedEntries = Array.isArray(req.body?.selectedEntries) ? req.body.selectedEntries : undefined;

    const generated = await generateSmartTimetable({
      subjects,
      availableHoursPerDay,
      schoolTimes,
      tuitionTimes,
      freeTimes,
      examDates,
      studyGoals,
      scope,
      selectedEntries,
    });

    res.json(generated);
  } catch (err) {
    console.error('AI timetable error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate AI timetable.' });
  }
});

// ---------- ANALYTICS & NOTIFICATIONS ----------

apiRouter.get('/analytics', requireAuth, (req: AuthenticatedRequest, res) => {
  const sid = req.studentId!;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentMonthPrefix = todayStr.slice(0, 7);
  const currentYear = today.getFullYear();

  const sessions = db
    .prepare('SELECT subject, mode, duration_minutes, session_date FROM study_sessions WHERE student_id = ?')
    .all(sid) as Array<{ subject: string; mode: string; duration_minutes: number; session_date: string }>;

  const focusSessions = sessions.filter((s) => s.mode !== 'break_5' && s.mode !== 'long_break_15');

  const todayStudyMinutes = focusSessions
    .filter((s) => s.session_date === todayStr)
    .reduce((acc, s) => acc + Number(s.duration_minutes), 0);

  // Build 7-day rolling chart ending today
  const weeklyChart: { day: string; date: string; minutes: number }[] = [];
  let weeklyStudyMinutes = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mins = focusSessions
      .filter((s) => s.session_date === dStr)
      .reduce((acc, s) => acc + Number(s.duration_minutes), 0);
    weeklyStudyMinutes += mins;
    weeklyChart.push({ day: dayLabel, date: dStr, minutes: mins });
  }

  const monthlyStudyMinutes = focusSessions
    .filter((s) => s.session_date.startsWith(currentMonthPrefix))
    .reduce((acc, s) => acc + Number(s.duration_minutes), 0);

  const totalStudyMinutes = focusSessions.reduce((acc, s) => acc + Number(s.duration_minutes), 0);

  // Calculate study streak
  const activeDates = new Set(focusSessions.map((s) => s.session_date));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    if (activeDates.has(dStr)) {
      streak++;
    } else if (i === 0) {
      // If no study yet today, still count consecutive days ending yesterday
      continue;
    } else {
      break;
    }
  }

  // Tasks completed vs pending (timetable entries + calendar events)
  const ttCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done,
         SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) as pending
       FROM timetable_entries WHERE student_id = ?`
    )
    .get(sid) as { done: number | null; pending: number | null } | undefined;

  const evtCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done,
         SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) as pending
       FROM calendar_events WHERE student_id = ?`
    )
    .get(sid) as { done: number | null; pending: number | null } | undefined;

  const completedTasksCount = Number(ttCounts?.done ?? 0) + Number(evtCounts?.done ?? 0);
  const pendingTasksCount = Number(ttCounts?.pending ?? 0) + Number(evtCounts?.pending ?? 0);

  // Exam stats
  const examRows = db
    .prepare(
      `SELECT a.id, a.percentage, a.submitted_at, p.title, p.subject
       FROM exam_attempts a
       JOIN question_papers p ON p.id = a.paper_id
       WHERE a.student_id = ?
       ORDER BY a.submitted_at DESC`
    )
    .all(sid) as Array<{ id: string; percentage: number; submitted_at: string; title: string; subject: string }>;

  const averageExamPercentage =
    examRows.length > 0
      ? Math.round((examRows.reduce((acc, r) => acc + Number(r.percentage), 0) / examRows.length) * 10) / 10
      : 0;

  // Monthly chart for current year (12 months)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyChart = monthNames.map((mName, idx) => {
    const prefix = `${currentYear}-${String(idx + 1).padStart(2, '0')}`;
    const mins = focusSessions
      .filter((s) => s.session_date.startsWith(prefix))
      .reduce((acc, s) => acc + Number(s.duration_minutes), 0);
    const monthExams = examRows.filter((e) => e.submitted_at.startsWith(prefix));
    const avg =
      monthExams.length > 0
        ? Math.round(monthExams.reduce((acc, e) => acc + Number(e.percentage), 0) / monthExams.length)
        : 0;
    return { month: mName, minutes: mins, examsAvg: avg };
  });

  // Subject distribution
  const subjectColorsRows = db
    .prepare('SELECT name, color FROM subjects WHERE student_id = ?')
    .all(sid) as Array<{ name: string; color: string }>;
  const colorMap = new Map(subjectColorsRows.map((s) => [s.name, s.color]));
  const subjTotals = new Map<string, number>();
  for (const s of focusSessions) {
    subjTotals.set(s.subject, (subjTotals.get(s.subject) ?? 0) + Number(s.duration_minutes));
  }
  const subjectDistribution = Array.from(subjTotals.entries()).map(([subject, minutes]) => ({
    subject,
    minutes,
    color: colorMap.get(subject) || '#4F46E5',
  }));

  const analytics: DashboardAnalytics = {
    todayStudyMinutes,
    weeklyStudyMinutes,
    monthlyStudyMinutes,
    totalStudyMinutes,
    studyStreakDays: streak,
    completedTasksCount,
    pendingTasksCount,
    averageExamPercentage,
    weeklyChart,
    monthlyChart,
    subjectDistribution,
    recentExams: examRows.slice(0, 6).map((e) => ({
      id: String(e.id),
      title: String(e.title),
      subject: String(e.subject),
      percentage: Number(e.percentage),
      submittedAt: String(e.submitted_at),
    })),
  };

  res.json({ analytics });
});

apiRouter.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const sid = req.studentId!;
  const rows = db
    .prepare('SELECT * FROM notifications WHERE student_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(sid);

  // Also check upcoming calendar events in the next 48 hours and synthesize live upcoming reminders
  const todayStr = new Date().toISOString().slice(0, 10);
  const twoDaysLater = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const upcomingEvents = db
    .prepare(
      `SELECT id, title, event_type, event_date, start_time, subject
       FROM calendar_events
       WHERE student_id = ? AND completed = 0 AND event_date >= ? AND event_date <= ?
       ORDER BY event_date ASC, start_time ASC`
    )
    .all(sid, todayStr, twoDaysLater);

  res.json({
    notifications: rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      message: String(r.message),
      category: String(r.category),
      isRead: Number(r.is_read ?? 0) === 1,
      createdAt: String(r.created_at),
    })),
    upcomingReminders: upcomingEvents.map((e) => ({
      id: String(e.id),
      title: String(e.title),
      eventType: String(e.event_type),
      eventDate: String(e.event_date),
      startTime: String(e.start_time),
      subject: String(e.subject ?? ''),
    })),
  });
});

apiRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE student_id = ?').run(req.studentId!);
  res.json({ ok: true });
});

// ---------- AI BEAUTIFY MY OWN TIMETABLE ----------

apiRouter.post('/ai/beautify-own-timetable', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const rawTimetableText = String(req.body?.rawTimetableText ?? '').trim();
    const scope = (req.body?.scope === 'daily' ? 'daily' : 'weekly') as 'weekly' | 'daily';
    const language = (req.body?.language === 'Sinhala' ? 'Sinhala' : 'English') as 'English' | 'Sinhala';
    const optimizationGoal = String(req.body?.optimizationGoal ?? '').trim();
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (!rawTimetableText && attachments.length === 0) {
      res.status(400).json({ error: 'Please enter your timetable details or upload a picture/document of your timetable.' });
      return;
    }

    const result = await beautifyOwnTimetable({
      rawTimetableText,
      scope,
      language,
      optimizationGoal,
      attachments,
    });

    res.json(result);
  } catch (err) {
    console.error('Beautify own timetable error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to organize your timetable with AI.' });
  }
});

// ---------- MULTI-CHILD FAMILY MANAGEMENT ----------

function ensureStudentFamilyGroup(studentId: string): string {
  const row = db
    .prepare('SELECT id, family_group_id FROM students WHERE id = ?')
    .get(studentId) as { id: string; family_group_id?: string } | undefined;
  if (!row) return studentId;
  const fg = String(row.family_group_id || '').trim();
  if (fg) return fg;
  db.prepare('UPDATE students SET family_group_id = ? WHERE id = ?').run(studentId, studentId);
  return studentId;
}

apiRouter.get('/family/children', requireAuth, (req: AuthenticatedRequest, res) => {
  const familyGroupId = ensureStudentFamilyGroup(req.studentId!);
  const rows = db
    .prepare(
      `SELECT id, email, name, grade, school_name, avatar_url, profile_theme
       FROM students
       WHERE family_group_id = ? OR id = ?
       ORDER BY created_at ASC`
    )
    .all(familyGroupId, req.studentId!);

  res.json({
    children: rows.map((r) => ({
      id: String(r.id),
      email: String(r.email),
      name: String(r.name),
      grade: String(r.grade ?? ''),
      schoolName: String(r.school_name ?? ''),
      avatarUrl: String(r.avatar_url ?? '/src/assets/images/avatar_student_default_1795360852554.jpg'),
      profileTheme: String(r.profile_theme ?? 'indigo') as ProfileTheme,
    })),
  });
});

apiRouter.post('/family/add-child', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const name = String(req.body?.name ?? '').trim();
    const grade = String(req.body?.grade ?? '').trim();
    const schoolName = String(req.body?.schoolName ?? '').trim();
    const avatarUrl = String(req.body?.avatarUrl ?? '').trim() || getSiteSettings().defaultStudentAvatarUrl;

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Please enter a valid email address for the child.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: "Please enter the child's full name." });
      return;
    }

    const existing = db.prepare('SELECT id FROM students WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists. Use Link Existing Child instead.' });
      return;
    }

    const familyGroupId = ensureStudentFamilyGroup(req.studentId!);
    const childId = newId('stu');
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    db.prepare(
      `INSERT INTO students (id, email, password_hash, name, grade, school_name, avatar_url, family_group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(childId, email, passwordHash, name, grade, schoolName, avatarUrl, familyGroupId, now);

    seedNewStudentDefaults(childId, name);

    const switchNow = Boolean(req.body?.switchImmediately ?? true);
    let token: string | undefined;
    if (switchNow) {
      token = createSession(childId);
      setSessionCookie(req, res, token);
    }

    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(childId)!;
    res.status(201).json({ student: mapStudentRow(row), token });
  } catch (err) {
    console.error('Add child error:', err);
    res.status(500).json({ error: 'Unable to add child account.' });
  }
});

apiRouter.post('/family/link-child', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required to link an existing child account.' });
      return;
    }

    const row = db.prepare('SELECT * FROM students WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password for that student account.' });
      return;
    }

    const familyGroupId = ensureStudentFamilyGroup(req.studentId!);
    db.prepare('UPDATE students SET family_group_id = ? WHERE id = ?').run(familyGroupId, String(row.id));

    res.json({ ok: true, child: mapStudentRow(db.prepare('SELECT * FROM students WHERE id = ?').get(String(row.id))!) });
  } catch (err) {
    console.error('Link child error:', err);
    res.status(500).json({ error: 'Unable to link child account.' });
  }
});

apiRouter.post('/family/switch-child', requireAuth, (req: AuthenticatedRequest, res) => {
  const targetStudentId = String(req.body?.targetStudentId ?? '').trim();
  if (!targetStudentId) {
    res.status(400).json({ error: 'Target student ID is required.' });
    return;
  }

  const currentFamily = ensureStudentFamilyGroup(req.studentId!);
  const targetRow = db.prepare('SELECT * FROM students WHERE id = ?').get(targetStudentId);
  if (!targetRow) {
    res.status(404).json({ error: 'Student account not found.' });
    return;
  }

  const targetFamily = String(targetRow.family_group_id || targetRow.id);
  if (targetFamily !== currentFamily) {
    res.status(403).json({ error: 'You do not have permission to switch to this student account.' });
    return;
  }

  const token = createSession(targetStudentId);
  setSessionCookie(req, res, token);
  res.json({ student: mapStudentRow(targetRow), token });
});

// ---------- ACCOUNT DATA MANAGEMENT (BACKUP / IMPORT / RESET / DELETE) ----------

apiRouter.get('/account/backup', requireAuth, (req: AuthenticatedRequest, res) => {
  const sid = req.studentId!;
  const studentRow = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  if (!studentRow) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  const backup = {
    exportedAt: new Date().toISOString(),
    app: getSiteSettings().appName || 'Student Time Management System',
    version: 1,
    profile: mapStudentRow(studentRow),
    subjects: db.prepare('SELECT name, color, target_hours_weekly FROM subjects WHERE student_id = ?').all(sid),
    timetables: db
      .prepare(
        'SELECT category, scope, title, subject, teacher, location, day_of_week, month, year, specific_date, start_time, end_time, duration_minutes, completed, notes, color, is_ai_generated FROM timetable_entries WHERE student_id = ?'
      )
      .all(sid),
    yearlyGoals: db
      .prepare('SELECT year, month, title, subject, target_metric, progress_percent, completed FROM yearly_goals WHERE student_id = ?')
      .all(sid),
    calendarEvents: db
      .prepare(
        'SELECT title, event_type, event_date, start_time, end_time, subject, description, color, reminder_minutes, completed FROM calendar_events WHERE student_id = ?'
      )
      .all(sid),
    notes: db
      .prepare('SELECT title, subject, lesson, content, is_important, ai_summary FROM notes WHERE student_id = ?')
      .all(sid),
  };

  res.json({ backup });
});

apiRouter.post('/account/import-backup', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const sid = req.studentId!;
    const backup = req.body?.backup;
    if (!backup || typeof backup !== 'object') {
      res.status(400).json({ error: 'Invalid backup file format.' });
      return;
    }

    const now = new Date().toISOString();
    let importedCount = 0;

    if (Array.isArray(backup.subjects)) {
      const existingNames = new Set(
        (db.prepare('SELECT name FROM subjects WHERE student_id = ?').all(sid) as Array<{ name: string }>).map((s) =>
          s.name.toLowerCase()
        )
      );
      const ins = db.prepare(
        'INSERT INTO subjects (id, student_id, name, color, target_hours_weekly, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const s of backup.subjects) {
        const name = String(s?.name ?? '').trim();
        if (name && !existingNames.has(name.toLowerCase())) {
          ins.run(newId('subj'), sid, name, String(s?.color || '#4F46E5'), Number(s?.target_hours_weekly || 4), now);
          existingNames.add(name.toLowerCase());
          importedCount++;
        }
      }
    }

    if (Array.isArray(backup.timetables)) {
      const ins = db.prepare(
        `INSERT INTO timetable_entries
         (id, student_id, category, scope, title, subject, teacher, location, day_of_week, month, year, specific_date, start_time, end_time, duration_minutes, completed, notes, color, is_ai_generated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const t of backup.timetables) {
        if (!t?.title) continue;
        ins.run(
          newId('tt'),
          sid,
          String(t.category || 'self_study'),
          String(t.scope || 'weekly'),
          String(t.title),
          String(t.subject || ''),
          String(t.teacher || ''),
          String(t.location || ''),
          t.day_of_week ?? null,
          t.month ?? null,
          Number(t.year || new Date().getFullYear()),
          t.specific_date ?? null,
          String(t.start_time || '16:00'),
          String(t.end_time || '17:00'),
          Number(t.duration_minutes || 60),
          Number(t.completed ? 1 : 0),
          String(t.notes || ''),
          String(t.color || ''),
          Number(t.is_ai_generated ? 1 : 0),
          now
        );
        importedCount++;
      }
    }

    if (Array.isArray(backup.yearlyGoals)) {
      const ins = db.prepare(
        'INSERT INTO yearly_goals (id, student_id, year, month, title, subject, target_metric, progress_percent, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const g of backup.yearlyGoals) {
        if (!g?.title) continue;
        ins.run(
          newId('yg'),
          sid,
          Number(g.year || new Date().getFullYear()),
          Number(g.month || 0),
          String(g.title),
          String(g.subject || ''),
          String(g.target_metric || ''),
          Number(g.progress_percent || 0),
          Number(g.completed ? 1 : 0),
          now
        );
        importedCount++;
      }
    }

    if (Array.isArray(backup.calendarEvents)) {
      const ins = db.prepare(
        'INSERT INTO calendar_events (id, student_id, title, event_type, event_date, start_time, end_time, subject, description, color, reminder_minutes, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const c of backup.calendarEvents) {
        if (!c?.title || !c?.event_date) continue;
        ins.run(
          newId('evt'),
          sid,
          String(c.title),
          String(c.event_type || 'study_session'),
          String(c.event_date),
          String(c.start_time || '09:00'),
          String(c.end_time || '10:00'),
          String(c.subject || ''),
          String(c.description || ''),
          String(c.color || ''),
          Number(c.reminder_minutes || 30),
          Number(c.completed ? 1 : 0),
          now
        );
        importedCount++;
      }
    }

    if (Array.isArray(backup.notes)) {
      const ins = db.prepare(
        "INSERT INTO notes (id, student_id, title, subject, lesson, content, is_important, attachment_name, attachment_mime, attachment_data, ai_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', ?, ?, ?)"
      );
      for (const n of backup.notes) {
        if (!n?.title) continue;
        ins.run(
          newId('note'),
          sid,
          String(n.title),
          String(n.subject || 'General'),
          String(n.lesson || ''),
          String(n.content || ''),
          Number(n.is_important ? 1 : 0),
          String(n.ai_summary || ''),
          now,
          now
        );
        importedCount++;
      }
    }

    res.json({ ok: true, importedCount });
  } catch (err) {
    console.error('Import backup error:', err);
    res.status(500).json({ error: 'Failed to import backup data.' });
  }
});

apiRouter.post('/account/reset', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const sid = req.studentId!;
    const studentRow = db.prepare('SELECT name FROM students WHERE id = ?').get(sid) as { name: string } | undefined;
    if (!studentRow) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    db.prepare('DELETE FROM timetable_entries WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM yearly_goals WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM calendar_events WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM study_sessions WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM notes WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM exam_attempts WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM question_papers WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM ai_chats WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM notifications WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM subjects WHERE student_id = ?').run(sid);

    seedNewStudentDefaults(sid, String(studentRow.name));
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset account error:', err);
    res.status(500).json({ error: 'Unable to reset workspace data.' });
  }
});

apiRouter.delete('/account', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const sid = req.studentId!;
    const password = String(req.body?.password ?? '');
    const row = db.prepare('SELECT password_hash FROM students WHERE id = ?').get(sid);
    if (!row) {
      res.status(404).json({ error: 'Student account not found.' });
      return;
    }
    if (!verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Incorrect password. Account deletion cancelled.' });
      return;
    }

    db.prepare('DELETE FROM students WHERE id = ?').run(sid);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Unable to delete account.' });
  }
});

// ---------- ADMIN PANEL ROUTES ----------

apiRouter.get('/admin/status', (_req, res) => {
  res.json({
    configured: hasAdminPasscodeConfigured(),
    usingEnvSecret: Boolean(getEnvAdminPasscode()),
  });
});

apiRouter.post('/admin/claim', (req, res) => {
  if (req.headers['x-requested-with'] !== 'SmartStudyAI') {
    res.status(403).json({ error: 'Missing required request verification header.' });
    return;
  }
  if (hasAdminPasscodeConfigured()) {
    res.status(409).json({ error: 'Admin passcode is already configured. Please enter it to unlock.' });
    return;
  }
  const passcode = String(req.body?.passcode ?? '').trim();
  if (passcode.length < 4) {
    res.status(400).json({ error: 'Admin passcode must be at least 4 characters.' });
    return;
  }
  const saved = saveClaimedAdminHash(passcode);
  if (!saved) {
    res.status(409).json({ error: 'Admin passcode was already claimed.' });
    return;
  }
  const adminToken = createAdminSession();
  res.status(201).json({ adminToken });
});

apiRouter.post('/admin/unlock', (req, res) => {
  if (req.headers['x-requested-with'] !== 'SmartStudyAI') {
    res.status(403).json({ error: 'Missing required request verification header.' });
    return;
  }
  if (!hasAdminPasscodeConfigured()) {
    res.status(400).json({ error: 'Admin passcode is not set yet. Claim your passcode first.' });
    return;
  }
  const passcode = String(req.body?.passcode ?? '').trim();
  if (!verifyAdminPasscode(passcode)) {
    res.status(401).json({ error: 'Invalid admin passcode.' });
    return;
  }
  const adminToken = createAdminSession();
  res.json({ adminToken });
});

apiRouter.post('/admin/lock', requireAdmin, (req: AuthenticatedRequest, res) => {
  if (req.adminToken) {
    deleteAdminSession(req.adminToken);
  }
  res.json({ ok: true });
});

apiRouter.get('/admin/overview', requireAdmin, (_req, res) => {
  const settings = getSiteSettings();
  const studentRows = db
    .prepare('SELECT id, email, name, grade, school_name, avatar_url, family_group_id, daily_goal_minutes, created_at FROM students ORDER BY created_at DESC')
    .all();

  const totalTimetables = Number((db.prepare('SELECT COUNT(*) as cnt FROM timetable_entries').get() as { cnt: number }).cnt);
  const totalPapers = Number((db.prepare('SELECT COUNT(*) as cnt FROM question_papers').get() as { cnt: number }).cnt);
  const totalNotes = Number((db.prepare('SELECT COUNT(*) as cnt FROM notes').get() as { cnt: number }).cnt);

  res.json({
    settings,
    students: studentRows.map((r) => ({
      id: String(r.id),
      email: String(r.email),
      name: String(r.name),
      grade: String(r.grade ?? ''),
      schoolName: String(r.school_name ?? ''),
      avatarUrl: String(r.avatar_url ?? ''),
      familyGroupId: String(r.family_group_id || r.id),
      dailyGoalMinutes: Number(r.daily_goal_minutes ?? 120),
      createdAt: String(r.created_at),
    })),
    stats: {
      totalStudents: studentRows.length,
      totalTimetables,
      totalPapers,
      totalNotes,
    },
  });
});

apiRouter.put('/admin/settings', requireAdmin, (req, res) => {
  try {
    const current = getSiteSettings();
    const incoming = (req.body?.settings ?? {}) as Partial<SiteSettings>;
    const syncToExisting = Boolean(req.body?.syncSubjectsToAllStudents);

    const next: SiteSettings = {
      ...current,
      ...incoming,
      appName: String(incoming.appName ?? current.appName).trim() || 'Student Time Management System',
      appTagline: String(incoming.appTagline ?? current.appTagline),
      welcomeHeadline: String(incoming.welcomeHeadline ?? current.welcomeHeadline),
      welcomeSubheadline: String(incoming.welcomeSubheadline ?? current.welcomeSubheadline),
      heroImageUrl: String(incoming.heroImageUrl ?? current.heroImageUrl),
      examBannerUrl: String(incoming.examBannerUrl ?? current.examBannerUrl),
      scholarAvatarUrl: String(incoming.scholarAvatarUrl ?? current.scholarAvatarUrl),
      defaultStudentAvatarUrl: String(incoming.defaultStudentAvatarUrl ?? current.defaultStudentAvatarUrl),
      timetablesEnabled: incoming.timetablesEnabled !== undefined ? Boolean(incoming.timetablesEnabled) : current.timetablesEnabled,
      enabledScopes: {
        ...current.enabledScopes,
        ...(incoming.enabledScopes || {}),
      },
      enabledCategories: {
        ...current.enabledCategories,
        ...(incoming.enabledCategories || {}),
      },
      aiTimetableEnabled:
        incoming.aiTimetableEnabled !== undefined ? Boolean(incoming.aiTimetableEnabled) : current.aiTimetableEnabled,
      aiOwnTimetableEnabled:
        incoming.aiOwnTimetableEnabled !== undefined
          ? Boolean(incoming.aiOwnTimetableEnabled)
          : current.aiOwnTimetableEnabled,
      features: {
        ...current.features,
        ...(incoming.features || {}),
      },
      defaultSubjects: Array.isArray(incoming.defaultSubjects)
        ? incoming.defaultSubjects
            .map((s) => ({
              name: String(s?.name ?? '').trim(),
              color: String(s?.color || '#4F46E5'),
              targetHoursWeekly: Math.max(1, Math.min(40, Number(s?.targetHoursWeekly ?? 4))),
            }))
            .filter((s) => s.name.length > 0)
        : current.defaultSubjects,
      installPromptMessage: String(incoming.installPromptMessage ?? current.installPromptMessage),
    };

    const saved = saveSiteSettings(next);

    if (syncToExisting) {
      const students = db.prepare('SELECT id FROM students').all() as Array<{ id: string }>;
      const now = new Date().toISOString();
      const desiredNames = new Set(saved.defaultSubjects.map((s) => s.name.toLowerCase()));

      for (const stu of students) {
        const existingSubjs = db
          .prepare('SELECT id, name FROM subjects WHERE student_id = ?')
          .all(stu.id) as Array<{ id: string; name: string }>;
        const existingMap = new Map(existingSubjs.map((s) => [s.name.toLowerCase(), s.id]));

        // Add new global subjects
        for (const gs of saved.defaultSubjects) {
          if (!existingMap.has(gs.name.toLowerCase())) {
            db.prepare(
              'INSERT INTO subjects (id, student_id, name, color, target_hours_weekly, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(newId('subj'), stu.id, gs.name, gs.color, gs.targetHoursWeekly, now);
          }
        }
        // Remove subjects that admin deleted from global defaults
        for (const es of existingSubjs) {
          if (!desiredNames.has(es.name.toLowerCase())) {
            db.prepare('DELETE FROM subjects WHERE id = ?').run(es.id);
          }
        }
      }
    }

    res.json({ settings: saved });
  } catch (err) {
    console.error('Admin save settings error:', err);
    res.status(500).json({ error: 'Failed to update site settings.' });
  }
});

apiRouter.post('/admin/students', requireAdmin, (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const grade = String(req.body?.grade ?? '').trim();
    const schoolName = String(req.body?.schoolName ?? '').trim();
    const familyGroupId = String(req.body?.familyGroupId ?? '').trim();

    if (!name || !email || !email.includes('@') || password.length < 6) {
      res.status(400).json({ error: 'Name, valid email, and password (6+ chars) are required.' });
      return;
    }
    const existing = db.prepare('SELECT id FROM students WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'A student with this email already exists.' });
      return;
    }

    const id = newId('stu');
    const now = new Date().toISOString();
    const defaultAvatar = getSiteSettings().defaultStudentAvatarUrl;
    db.prepare(
      `INSERT INTO students (id, email, password_hash, name, grade, school_name, avatar_url, family_group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, email, hashPassword(password), name, grade, schoolName, defaultAvatar, familyGroupId || id, now);

    seedNewStudentDefaults(id, name);
    res.status(201).json({ ok: true, studentId: id });
  } catch (err) {
    console.error('Admin add student error:', err);
    res.status(500).json({ error: 'Failed to add student.' });
  }
});

apiRouter.put('/admin/students/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }
  const name = String(req.body?.name ?? existing.name).trim();
  const grade = String(req.body?.grade ?? existing.grade).trim();
  const schoolName = String(req.body?.schoolName ?? existing.school_name).trim();
  const avatarUrl = String(req.body?.avatarUrl ?? existing.avatar_url).trim();
  const familyGroupId = String(req.body?.familyGroupId ?? existing.family_group_id).trim();
  const dailyGoalMinutes = Math.max(15, Math.min(720, Number(req.body?.dailyGoalMinutes ?? existing.daily_goal_minutes)));
  const newPassword = String(req.body?.newPassword ?? '').trim();

  db.prepare(
    'UPDATE students SET name = ?, grade = ?, school_name = ?, avatar_url = ?, family_group_id = ?, daily_goal_minutes = ? WHERE id = ?'
  ).run(name, grade, schoolName, avatarUrl, familyGroupId, dailyGoalMinutes, req.params.id);

  if (newPassword.length >= 6) {
    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.params.id);
  }
  res.json({ ok: true });
});

apiRouter.delete('/admin/students/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

apiRouter.get('/admin/students/:id/subjects', requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT id, name, color, target_hours_weekly, created_at FROM subjects WHERE student_id = ? ORDER BY created_at ASC')
    .all(req.params.id);
  res.json({
    subjects: rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      color: String(r.color),
      targetHoursWeekly: Number(r.target_hours_weekly),
      createdAt: String(r.created_at),
    })),
  });
});

apiRouter.post('/admin/students/:id/subjects', requireAdmin, (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const color = String(req.body?.color ?? '#4F46E5').trim();
  const targetHoursWeekly = Math.max(1, Math.min(40, Number(req.body?.targetHoursWeekly ?? 4)));
  if (!name) {
    res.status(400).json({ error: 'Subject name is required.' });
    return;
  }
  const id = newId('subj');
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO subjects (id, student_id, name, color, target_hours_weekly, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.id, name, color, targetHoursWeekly, now);
  res.status(201).json({ subject: { id, name, color, targetHoursWeekly, createdAt: now } });
});

apiRouter.delete('/admin/students/:id/subjects/:subjectId', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ? AND student_id = ?').run(req.params.subjectId, req.params.id);
  res.json({ ok: true });
});

