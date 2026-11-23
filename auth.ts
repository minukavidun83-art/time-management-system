import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import type { StudentProfile, ProfileTheme } from '../src/types/shared.ts';

export const SESSION_COOKIE_NAME = 'smart_study_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuffer.length) return false;
  return crypto.timingSafeEqual(derived, storedBuffer);
}

export function createSession(studentId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, student_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    studentId,
    expiresAt,
    now.toISOString()
  );
  return token;
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) out[key] = val;
  }
  return out;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'Max-Age=0'];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || null;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export interface AuthenticatedRequest extends Request {
  studentId?: string;
  sessionToken?: string;
  adminToken?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const customHeader = req.headers['x-requested-with'];
    const authHeader = req.headers.authorization;
    if (!authHeader && customHeader !== 'SmartStudyAI') {
      res.status(403).json({ error: 'Missing required request verification header.' });
      return;
    }
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const row = db
    .prepare('SELECT token, student_id, expires_at FROM sessions WHERE token = ?')
    .get(token) as { token: string; student_id: string; expires_at: string } | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  req.studentId = row.student_id;
  req.sessionToken = row.token;
  next();
}

// ---------- ADMIN PASSCODE & SESSION MANAGEMENT ----------

export function getEnvAdminPasscode(): string {
  return String(process.env.ADMIN_PASSCODE ?? '').trim();
}

export function getStoredAdminHash(): string | null {
  const row = db
    .prepare("SELECT value_json FROM app_settings WHERE key = 'admin_passcode_hash'")
    .get() as { value_json: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value_json);
    return typeof parsed === 'string' && parsed.includes(':') ? parsed : null;
  } catch {
    return null;
  }
}

export function hasAdminPasscodeConfigured(): boolean {
  return Boolean(getEnvAdminPasscode() || getStoredAdminHash());
}

export function saveClaimedAdminHash(passcode: string): boolean {
  if (hasAdminPasscodeConfigured()) return false;
  const hash = hashPassword(passcode);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO app_settings (key, value_json, updated_at)
       VALUES ('admin_passcode_hash', ?, ?)`
    )
    .run(JSON.stringify(hash), now);
  return info.changes > 0;
}

export function verifyAdminPasscode(passcode: string): boolean {
  const envSecret = getEnvAdminPasscode();
  if (envSecret) {
    const a = crypto.createHash('sha256').update(passcode).digest();
    const b = crypto.createHash('sha256').update(envSecret).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const storedHash = getStoredAdminHash();
  if (!storedHash) return false;
  return verifyPassword(passcode, storedHash);
}

export function createAdminSession(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)').run(
    token,
    now.toISOString(),
    expiresAt
  );
  return token;
}

export function deleteAdminSession(token: string): void {
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const customHeader = req.headers['x-requested-with'];
    if (customHeader !== 'SmartStudyAI') {
      res.status(403).json({ error: 'Missing required request verification header.' });
      return;
    }
  }

  const adminToken = String(req.headers['x-admin-token'] ?? '').trim();
  if (!adminToken) {
    res.status(401).json({ error: 'Admin verification required.' });
    return;
  }

  const row = db
    .prepare('SELECT token, expires_at FROM admin_sessions WHERE token = ?')
    .get(adminToken) as { token: string; expires_at: string } | undefined;

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    if (row) deleteAdminSession(adminToken);
    res.status(401).json({ error: 'Admin session expired. Please unlock the Admin Panel again.' });
    return;
  }

  req.adminToken = row.token;
  next();
}

export function mapStudentRow(row: Record<string, unknown>): StudentProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    grade: String(row.grade ?? ''),
    schoolName: String(row.school_name ?? ''),
    bio: String(row.bio ?? ''),
    avatarUrl: String(row.avatar_url ?? '/src/assets/images/avatar_student_default_1795360852554.jpg'),
    profileTheme: (String(row.profile_theme ?? 'indigo') as ProfileTheme),
    darkMode: Number(row.dark_mode ?? 0) === 1,
    dailyGoalMinutes: Number(row.daily_goal_minutes ?? 120),
    familyGroupId: String(row.family_group_id || row.id),
    createdAt: String(row.created_at),
  };
}
