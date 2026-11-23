import type { ProfileTheme } from '../types/shared.ts';

export interface ThemePalette {
  name: string;
  primaryBg: string;
  primaryHover: string;
  primaryText: string;
  softBg: string;
  ring: string;
  gradient: string;
}

export const PROFILE_THEMES: Record<ProfileTheme, ThemePalette> = {
  indigo: {
    name: 'Royal Indigo',
    primaryBg: 'bg-indigo-600',
    primaryHover: 'hover:bg-indigo-700',
    primaryText: 'text-indigo-600 dark:text-indigo-400',
    softBg: 'bg-indigo-50 dark:bg-indigo-950/50',
    ring: 'focus:ring-indigo-500',
    gradient: 'from-indigo-600 via-blue-600 to-violet-600',
  },
  violet: {
    name: 'Scholar Violet',
    primaryBg: 'bg-violet-600',
    primaryHover: 'hover:bg-violet-700',
    primaryText: 'text-violet-600 dark:text-violet-400',
    softBg: 'bg-violet-50 dark:bg-violet-950/50',
    ring: 'focus:ring-violet-500',
    gradient: 'from-violet-600 via-purple-600 to-indigo-600',
  },
  cobalt: {
    name: 'Cobalt Azure',
    primaryBg: 'bg-blue-600',
    primaryHover: 'hover:bg-blue-700',
    primaryText: 'text-blue-600 dark:text-blue-400',
    softBg: 'bg-blue-50 dark:bg-blue-950/50',
    ring: 'focus:ring-blue-500',
    gradient: 'from-blue-600 via-indigo-600 to-sky-600',
  },
  emerald: {
    name: 'Forest Emerald',
    primaryBg: 'bg-emerald-600',
    primaryHover: 'hover:bg-emerald-700',
    primaryText: 'text-emerald-600 dark:text-emerald-400',
    softBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    ring: 'focus:ring-emerald-500',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
  },
  amber: {
    name: 'Warm Amber',
    primaryBg: 'bg-amber-600',
    primaryHover: 'hover:bg-amber-700',
    primaryText: 'text-amber-600 dark:text-amber-400',
    softBg: 'bg-amber-50 dark:bg-amber-950/50',
    ring: 'focus:ring-amber-500',
    gradient: 'from-amber-600 via-orange-600 to-rose-600',
  },
};

export function applyDarkMode(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface ScheduleColorOption {
  name: string;
  hex: string;
  rgb: [number, number, number];
}

export const SCHEDULE_COLOR_PALETTE: ScheduleColorOption[] = [
  { name: 'Royal Indigo', hex: '#4F46E5', rgb: [79, 70, 229] },
  { name: 'Sky Azure', hex: '#0284C7', rgb: [2, 132, 199] },
  { name: 'Emerald Mint', hex: '#10B981', rgb: [16, 185, 129] },
  { name: 'Scholar Violet', hex: '#8B5CF6', rgb: [139, 92, 246] },
  { name: 'Rose Berry', hex: '#E11D48', rgb: [225, 29, 72] },
  { name: 'Warm Amber', hex: '#F59E0B', rgb: [245, 158, 11] },
  { name: 'Ocean Teal', hex: '#0D9488', rgb: [13, 148, 136] },
  { name: 'Coral Sunset', hex: '#F97316', rgb: [249, 115, 22] },
];

export function getDefaultEventColor(eventType: string): string {
  switch (eventType) {
    case 'exam':
      return '#E11D48';
    case 'assignment':
      return '#F59E0B';
    case 'tuition':
      return '#8B5CF6';
    case 'reminder':
      return '#0D9488';
    case 'study_session':
    default:
      return '#4F46E5';
  }
}

export function getDefaultTimetableColor(category: string, subjectColor?: string): string {
  if (subjectColor && /^#[0-9a-fA-F]{6}$/.test(subjectColor)) return subjectColor;
  switch (category) {
    case 'school':
      return '#0284C7';
    case 'tuition':
      return '#8B5CF6';
    case 'self_study':
    default:
      return '#4F46E5';
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '#4F46E5').replace('#', '');
  if (clean.length !== 6) return [79, 70, 229];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [79, 70, 229];
  return [r, g, b];
}

