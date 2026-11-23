import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMinutes } from './api.ts';
import {
  getDefaultEventColor,
  getDefaultTimetableColor,
  hexToRgb,
  MONTHS,
  WEEKDAYS,
} from './theme.ts';
import type {
  CalendarEvent,
  QuestionPaper,
  StudentProfile,
  TimetableEntry,
  YearlyGoal,
} from '../types/shared.ts';

export type PdfPageSize = 'a4' | 'a3' | 'a5' | 'letter' | 'legal';
export type PdfOrientation = 'landscape' | 'portrait';
export type PdfColorMode = 'color' | 'bw';

export interface PdfPrintOptions {
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  colorMode: PdfColorMode;
}

export const DEFAULT_PDF_OPTIONS: PdfPrintOptions = {
  pageSize: 'a4',
  orientation: 'landscape',
  colorMode: 'color',
};

export interface PrintableTimetableEntry {
  category: string;
  title: string;
  subject: string;
  teacher?: string;
  location?: string;
  dayOfWeek?: number | null;
  month?: number | null;
  specificDate?: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  completed?: boolean;
  isAiGenerated?: boolean;
  notes?: string;
  color?: string;
}

const WEEKDAYS_SINHALA = [
  'සඳුදා',
  'අඟහරුවාදා',
  'බදාදා',
  'බ්‍රහස්පතින්දා',
  'සිකුරාදා',
  'සෙනසුරාදා',
  'ඉරිදා',
];

const PDF_SANS_FONT =
  '"Plus Jakarta Sans", "DM Sans", "Noto Sans Sinhala", system-ui, -apple-system, sans-serif';
const PDF_MONO_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

const DEFAULT_SYSTEM_NAME = 'Student Time Management System';

function formatPrintDateTime(): string {
  const now = new Date();
  return `${now.toLocaleDateString()} · ${now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

async function waitForWebFonts(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 400)),
    ]);
  }
}

async function loadAvatarImage(avatarUrl?: string): Promise<HTMLImageElement | null> {
  if (!avatarUrl || typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => resolve(null), 1500);
    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = avatarUrl;
  });
}

async function loadAvatarPngDataUrl(
  avatarUrl?: string,
  studentName?: string,
  isBw = false
): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const img = await loadAvatarImage(avatarUrl);
  const size = 120;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawRoundedRect(ctx, 0, 0, size, size, 24);
  ctx.save();
  ctx.clip();

  if (img && img.naturalWidth > 0) {
    if (isBw) {
      ctx.filter = 'grayscale(100%)';
    }
    // Center-crop square
    const minSide = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - minSide) / 2;
    const sy = (img.naturalHeight - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = isBw ? '#E2E8F0' : '#4F46E5';
    ctx.fillRect(0, 0, size, size);
    const initials = (studentName || 'S')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
    ctx.fillStyle = isBw ? '#0F172A' : '#FFFFFF';
    ctx.font = `800 44px ${PDF_SANS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, size / 2, size / 2);
  }
  ctx.restore();

  ctx.strokeStyle = isBw ? '#0F172A' : '#FFFFFF';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 2, 2, size - 4, size - 4, 22);
  ctx.stroke();

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function createScaledCanvas(widthPt: number, heightPt: number, scale = 2.5): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthPt * scale));
  canvas.height = Math.max(1, Math.round(heightPt * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function renderHeaderCanvas(params: {
  contentWidth: number;
  student: StudentProfile;
  avatarImg: HTMLImageElement | null;
  appName: string;
  title: string;
  subtitle?: string;
  dateTimeText: string;
  isBw: boolean;
  isAiEnhanced: boolean;
  compact: boolean;
}): { dataUrl: string; heightPt: number } {
  const {
    contentWidth,
    student,
    avatarImg,
    appName,
    title,
    subtitle,
    dateTimeText,
    isBw,
    isAiEnhanced,
    compact,
  } = params;

  const measure = createScaledCanvas(contentWidth, 120, 1);
  measure.ctx.font = `500 ${compact ? 8.5 : 9.5}px ${PDF_SANS_FONT}`;
  const subLines = subtitle ? wrapCanvasText(measure.ctx, subtitle, contentWidth - 40) : [];

  const baseHeight = compact ? 112 : 120;
  const extraSubH = subLines.length > 0 ? subLines.length * 12 + 8 : 0;
  const heightPt = baseHeight + extraSubH;

  const { canvas, ctx } = createScaledCanvas(contentWidth, heightPt);

  if (isBw) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, contentWidth, heightPt);
  } else if (isAiEnhanced) {
    const grad = ctx.createLinearGradient(0, 0, contentWidth, heightPt);
    grad.addColorStop(0, '#EEF2FF');
    grad.addColorStop(0.5, '#FFFFFF');
    grad.addColorStop(1, '#F5F3FF');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, contentWidth, heightPt);
    const barGrad = ctx.createLinearGradient(0, 0, contentWidth, 0);
    barGrad.addColorStop(0, '#4F46E5');
    barGrad.addColorStop(0.5, '#7C3AED');
    barGrad.addColorStop(1, '#0284C7');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, contentWidth, 4);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, contentWidth, heightPt);
  }

  ctx.strokeStyle = isBw ? '#000000' : isAiEnhanced ? '#3730A3' : '#0F172A';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, contentWidth - 2, heightPt - 2);

  // Student Profile Picture box on left inside header
  const avSize = compact ? 38 : 44;
  const avX = 16;
  const avY = 10;

  ctx.save();
  drawRoundedRect(ctx, avX, avY, avSize, avSize, 9);
  ctx.clip();
  if (avatarImg && avatarImg.naturalWidth > 0) {
    if (isBw) ctx.filter = 'grayscale(100%)';
    const minSide = Math.min(avatarImg.naturalWidth, avatarImg.naturalHeight);
    const sx = (avatarImg.naturalWidth - minSide) / 2;
    const sy = (avatarImg.naturalHeight - minSide) / 2;
    ctx.drawImage(avatarImg, sx, sy, minSide, minSide, avX, avY, avSize, avSize);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = isBw ? '#E2E8F0' : '#4F46E5';
    ctx.fillRect(avX, avY, avSize, avSize);
    const initials = (student.name || 'S')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
    ctx.fillStyle = isBw ? '#0F172A' : '#FFFFFF';
    ctx.font = `800 ${compact ? 14 : 16}px ${PDF_SANS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, avX + avSize / 2, avY + avSize / 2);
  }
  ctx.restore();

  ctx.strokeStyle = isBw ? '#000000' : isAiEnhanced ? '#4338CA' : '#0F172A';
  ctx.lineWidth = 1.4;
  drawRoundedRect(ctx, avX, avY, avSize, avSize, 9);
  ctx.stroke();

  // Header Title Block centered (leaving room for avatar)
  const textAreaLeft = avX + avSize + 10;
  const textMaxW = contentWidth - textAreaLeft - 24;
  const centerX = contentWidth / 2 + (compact ? 14 : 10);

  ctx.fillStyle = isBw ? '#1E293B' : isAiEnhanced ? '#4338CA' : '#334155';
  ctx.font = `700 ${compact ? 7.8 : 8.8}px ${PDF_SANS_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(
    `${appName.toUpperCase()}  •  කාලසටහන් ලේඛනය`,
    centerX,
    compact ? 22 : 24,
    textMaxW
  );

  ctx.fillStyle = '#0F172A';
  ctx.font = `800 ${compact ? 14 : 18}px ${PDF_SANS_FONT}`;
  const cleanTitle = (title || 'PHYSICAL CLASS TIMETABLE (OFFICIAL)').toUpperCase();
  ctx.fillText(cleanTitle, centerX, compact ? 43 : 47, textMaxW);

  // Divider line below header + avatar
  const lineY = compact ? 56 : 62;
  ctx.strokeStyle = isBw ? '#000000' : isAiEnhanced ? '#4338CA' : '#0F172A';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(16, lineY);
  ctx.lineTo(contentWidth - 16, lineY);
  ctx.stroke();

  // 3-Column Student Info Grid + Date & Time
  const metaY1 = lineY + 18;
  const metaY2 = metaY1 + 16;
  ctx.font = `700 ${compact ? 8.2 : 9.2}px ${PDF_SANS_FONT}`;
  ctx.fillStyle = '#0F172A';

  ctx.textAlign = 'left';
  ctx.fillText(`STUDENT: ${(student.name || 'Student').toUpperCase()}`, 18, metaY1, contentWidth * 0.35);

  ctx.textAlign = 'center';
  ctx.fillText(
    `GRADE / LEVEL: ${(student.grade || 'Student').toUpperCase()}`,
    contentWidth / 2,
    metaY1,
    contentWidth * 0.28
  );

  ctx.textAlign = 'right';
  ctx.fillText(
    `SCHOOL: ${(student.schoolName || appName).toUpperCase()}`,
    contentWidth - 18,
    metaY1,
    contentWidth * 0.34
  );

  ctx.textAlign = 'left';
  ctx.fillText(`DATE & TIME: ${dateTimeText}`, 18, metaY2, contentWidth - 36);

  if (subLines.length > 0) {
    ctx.fillStyle = isBw ? '#334155' : '#4338CA';
    ctx.font = `500 ${compact ? 8 : 9}px ${PDF_SANS_FONT}`;
    let sy = metaY2 + 15;
    for (const line of subLines.slice(0, 2)) {
      ctx.fillText(line, 18, sy);
      sy += 12;
    }
  }

  return { dataUrl: canvas.toDataURL('image/png'), heightPt };
}

function renderTableHeaderCanvas(params: {
  contentWidth: number;
  dayColW: number;
  totalColW: number;
  modeLabel: string;
  isBw: boolean;
  isAiEnhanced: boolean;
  compact: boolean;
}): { dataUrl: string; heightPt: number } {
  const { contentWidth, dayColW, totalColW, modeLabel, isBw, isAiEnhanced, compact } = params;
  const midColW = contentWidth - dayColW - totalColW;
  const heightPt = compact ? 26 : 30;
  const { canvas, ctx } = createScaledCanvas(contentWidth, heightPt);

  ctx.fillStyle = isBw ? '#F1F5F9' : isAiEnhanced ? '#EEF2FF' : '#F8FAFC';
  ctx.fillRect(0, 0, contentWidth, heightPt);

  ctx.strokeStyle = isBw ? '#000000' : '#94A3B8';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, contentWidth - 1, heightPt - 1);

  ctx.beginPath();
  ctx.moveTo(dayColW, 0);
  ctx.lineTo(dayColW, heightPt);
  ctx.moveTo(dayColW + midColW, 0);
  ctx.lineTo(dayColW + midColW, heightPt);
  ctx.stroke();

  ctx.fillStyle = isBw ? '#000000' : isAiEnhanced ? '#312E81' : '#0F172A';
  ctx.font = `700 ${compact ? 8.5 : 9.5}px ${PDF_SANS_FONT}`;
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillText(modeLabel, 10, heightPt / 2, dayColW - 16);
  ctx.fillText(
    'Scheduled Time Intervals & Subjects (කාල පරිච්ඡේද සහ විෂයන්)',
    dayColW + 10,
    heightPt / 2,
    midColW - 18
  );
  ctx.textAlign = 'center';
  ctx.fillText('Total', dayColW + midColW + totalColW / 2, heightPt / 2);

  return { dataUrl: canvas.toDataURL('image/png'), heightPt };
}

function renderDayGroupRowCanvas(params: {
  contentWidth: number;
  dayColW: number;
  totalColW: number;
  labelEn: string;
  labelSi: string;
  items: PrintableTimetableEntry[];
  isBw: boolean;
  isAiEnhanced: boolean;
  compact: boolean;
}): { dataUrl: string; heightPt: number } {
  const { contentWidth, dayColW, totalColW, labelEn, labelSi, items, isBw, isAiEnhanced, compact } =
    params;
  const midColW = contentWidth - dayColW - totalColW;
  const padY = 8;
  const itemHeight = compact ? 24 : 26;
  const itemGap = 4;
  const itemsBlockH =
    items.length === 0 ? 22 : items.length * itemHeight + Math.max(0, items.length - 1) * itemGap;
  const heightPt = Math.max(40, padY * 2 + itemsBlockH);

  const { canvas, ctx } = createScaledCanvas(contentWidth, heightPt);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, contentWidth, heightPt);

  ctx.strokeStyle = isBw ? '#000000' : '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, contentWidth - 1, heightPt - 1);

  ctx.beginPath();
  ctx.moveTo(dayColW, 0);
  ctx.lineTo(dayColW, heightPt);
  ctx.moveTo(dayColW + midColW, 0);
  ctx.lineTo(dayColW + midColW, heightPt);
  ctx.stroke();

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = `700 ${compact ? 9 : 10}px ${PDF_SANS_FONT}`;
  ctx.fillText(labelEn, 10, padY + 1, dayColW - 16);

  ctx.fillStyle = '#64748B';
  ctx.font = `500 ${compact ? 7.5 : 8.5}px ${PDF_SANS_FONT}`;
  ctx.fillText(labelSi, 10, padY + 14, dayColW - 16);

  if (items.length === 0) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = `400 ${compact ? 8 : 9}px ${PDF_SANS_FONT}`;
    ctx.fillText('No sessions scheduled', dayColW + 10, padY + 4);
  } else {
    let curY = padY;
    for (const item of items) {
      const hex = item.color || getDefaultTimetableColor(item.category);
      const [r, g, b] = hexToRgb(hex);

      const cardX = dayColW + 8;
      const cardW = midColW - 16;

      drawRoundedRect(ctx, cardX, curY, cardW, itemHeight, 5);
      if (isBw) {
        ctx.fillStyle = '#F8FAFC';
        ctx.fill();
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else {
        ctx.fillStyle = isAiEnhanced
          ? `rgba(${r}, ${g}, ${b}, 0.11)`
          : `rgba(${r}, ${g}, ${b}, 0.06)`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${isAiEnhanced ? 0.42 : 0.28})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cardX + 10, curY + itemHeight / 2, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = isBw ? '#1E293B' : hex;
      ctx.fill();

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = isBw ? '#0F172A' : hex;
      ctx.font = `700 ${compact ? 7.5 : 8.5}px ${PDF_MONO_FONT}`;
      const timeStr = `${item.startTime}–${item.endTime}`;
      ctx.fillText(timeStr, cardX + 18, curY + itemHeight / 2);

      const timeEndOffset = compact ? 76 : 86;

      ctx.fillStyle = '#0F172A';
      ctx.font = `600 ${compact ? 8 : 9}px ${PDF_SANS_FONT}`;
      const details = [
        item.subject && item.subject !== item.title ? item.subject : '',
        item.teacher || '',
        item.location || '',
      ]
        .filter(Boolean)
        .join(' · ');
      const fullLine = details ? `${item.title} (${details})` : item.title;
      const availTextW = Math.max(60, cardW - timeEndOffset - 46);
      ctx.fillText(fullLine, cardX + timeEndOffset, curY + itemHeight / 2, availTextW);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748B';
      ctx.font = `500 ${compact ? 7 : 8}px ${PDF_MONO_FONT}`;
      ctx.fillText(formatMinutes(item.durationMinutes), cardX + cardW - 8, curY + itemHeight / 2);

      curY += itemHeight + itemGap;
    }
  }

  const totalMins = items.reduce((sum, x) => sum + Number(x.durationMinutes || 0), 0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  ctx.font = `700 ${compact ? 8.5 : 9.5}px ${PDF_MONO_FONT}`;
  const centerColX = dayColW + midColW + totalColW / 2;
  ctx.fillText(totalMins > 0 ? formatMinutes(totalMins) : '—', centerColX, heightPt / 2 - 5);

  if (items.length > 0) {
    ctx.fillStyle = '#64748B';
    ctx.font = `400 ${compact ? 7 : 7.5}px ${PDF_SANS_FONT}`;
    ctx.fillText(
      `${items.length} ${items.length === 1 ? 'item' : 'items'}`,
      centerColX,
      heightPt / 2 + 8
    );
  }

  return { dataUrl: canvas.toDataURL('image/png'), heightPt };
}

function renderSignatureFooterCanvas(params: {
  contentWidth: number;
  appName: string;
  isBw: boolean;
  compact: boolean;
}): { dataUrl: string; heightPt: number } {
  const { contentWidth, appName, isBw, compact } = params;
  const heightPt = compact ? 86 : 94;
  const { canvas, ctx } = createScaledCanvas(contentWidth, heightPt);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, contentWidth, heightPt);

  ctx.strokeStyle = isBw ? '#000000' : '#0F172A';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(contentWidth, 4);
  ctx.stroke();

  const sigLabels = [
    "Student's Signature / ශිෂ්‍ය අත්සන",
    'Parent or Guardian / මව්පිය අත්සන',
    'Class Teacher or Mentor / ගුරු අත්සන',
  ];

  const colW = contentWidth / 3;
  const sigLineY = compact ? 40 : 44;

  sigLabels.forEach((label, idx) => {
    const cx = colW * idx + colW / 2;
    const lineHalf = colW * 0.36;

    ctx.strokeStyle = isBw ? '#000000' : '#0F172A';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - lineHalf, sigLineY);
    ctx.lineTo(cx + lineHalf, sigLineY);
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.font = `700 ${compact ? 8 : 9}px ${PDF_SANS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, cx, sigLineY + 7, colW - 14);
  });

  const botRuleY = heightPt - 22;
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, botRuleY);
  ctx.lineTo(contentWidth, botRuleY);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = `500 ${compact ? 7 : 8}px ${PDF_MONO_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `— Official Academic Schedule Sheet • ${appName} —`,
    contentWidth / 2,
    heightPt - 10
  );

  return { dataUrl: canvas.toDataURL('image/png'), heightPt };
}

export async function exportTimetablePdf(params: {
  student: StudentProfile;
  appName?: string;
  title: string;
  subtitle: string;
  entries: PrintableTimetableEntry[];
  goals?: YearlyGoal[];
  filename?: string;
  printOptions?: Partial<PdfPrintOptions>;
  aiEnhanced?: boolean;
}): Promise<void> {
  const { student, appName, title, subtitle, entries, goals, filename, printOptions, aiEnhanced } =
    params;
  const resolvedAppName = appName?.trim() || DEFAULT_SYSTEM_NAME;
  const opts: PdfPrintOptions = {
    pageSize: printOptions?.pageSize ?? 'a4',
    orientation: printOptions?.orientation ?? 'landscape',
    colorMode: printOptions?.colorMode ?? 'color',
  };
  const isBw = opts.colorMode === 'bw';
  const isAi = aiEnhanced ?? entries.some((e) => e.isAiGenerated);
  const dateTimeText = formatPrintDateTime();

  const [, avatarImg] = await Promise.all([
    waitForWebFonts(),
    loadAvatarImage(student.avatarUrl),
  ]);

  const doc = new jsPDF({
    orientation: opts.orientation,
    unit: 'pt',
    format: opts.pageSize,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const compact = opts.pageSize === 'a5' || opts.orientation === 'portrait';
  const marginX = opts.pageSize === 'a5' ? 22 : 30;
  const marginY = opts.pageSize === 'a5' ? 20 : 26;
  const contentWidth = pageWidth - marginX * 2;

  const dayColW = compact ? contentWidth * 0.19 : contentWidth * 0.15;
  const totalColW = compact ? contentWidth * 0.14 : contentWidth * 0.11;

  const hasWeeklyDays = entries.some((e) => e.dayOfWeek !== null && e.dayOfWeek !== undefined);
  const groups: Array<{ labelEn: string; labelSi: string; items: PrintableTimetableEntry[] }> = [];

  if (hasWeeklyDays) {
    WEEKDAYS.forEach((dayName, idx) => {
      const dayItems = entries
        .filter((e) => (e.dayOfWeek ?? 0) === idx)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (dayItems.length > 0) {
        groups.push({ labelEn: dayName, labelSi: WEEKDAYS_SINHALA[idx], items: dayItems });
      }
    });
  } else {
    const cats = [
      { key: 'school', en: 'School', si: 'පාසල් කාලසටහන' },
      { key: 'tuition', en: 'Tuition', si: 'අමතර පන්ති' },
      { key: 'self_study', en: 'Self Study', si: 'ස්වයං අධ්‍යයන' },
    ];
    cats.forEach((c) => {
      const catItems = entries
        .filter((e) => e.category === c.key)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (catItems.length > 0) {
        groups.push({ labelEn: c.en, labelSi: c.si, items: catItems });
      }
    });
  }

  let cursorY = marginY;

  const headerImg = renderHeaderCanvas({
    contentWidth,
    student,
    avatarImg,
    appName: resolvedAppName,
    title,
    subtitle,
    dateTimeText,
    isBw,
    isAiEnhanced: isAi,
    compact,
  });
  doc.addImage(headerImg.dataUrl, 'PNG', marginX, cursorY, contentWidth, headerImg.heightPt);
  cursorY += headerImg.heightPt + 12;

  const tableHeaderImg = renderTableHeaderCanvas({
    contentWidth,
    dayColW,
    totalColW,
    modeLabel: hasWeeklyDays ? 'Day / දිනය' : 'Category / කොටස',
    isBw,
    isAiEnhanced: isAi,
    compact,
  });
  doc.addImage(tableHeaderImg.dataUrl, 'PNG', marginX, cursorY, contentWidth, tableHeaderImg.heightPt);
  cursorY += tableHeaderImg.heightPt;

  const sigFooterImg = renderSignatureFooterCanvas({
    contentWidth,
    appName: resolvedAppName,
    isBw,
    compact,
  });

  if (groups.length === 0) {
    const emptyRow = renderDayGroupRowCanvas({
      contentWidth,
      dayColW,
      totalColW,
      labelEn: 'Schedule',
      labelSi: 'කාලසටහන',
      items: [],
      isBw,
      isAiEnhanced: isAi,
      compact,
    });
    doc.addImage(emptyRow.dataUrl, 'PNG', marginX, cursorY, contentWidth, emptyRow.heightPt);
    cursorY += emptyRow.heightPt;
  } else {
    for (const grp of groups) {
      const rowImg = renderDayGroupRowCanvas({
        contentWidth,
        dayColW,
        totalColW,
        labelEn: grp.labelEn,
        labelSi: grp.labelSi,
        items: grp.items,
        isBw,
        isAiEnhanced: isAi,
        compact,
      });
      if (cursorY + rowImg.heightPt > pageHeight - marginY - 12) {
        doc.addPage();
        cursorY = marginY;
        doc.addImage(
          tableHeaderImg.dataUrl,
          'PNG',
          marginX,
          cursorY,
          contentWidth,
          tableHeaderImg.heightPt
        );
        cursorY += tableHeaderImg.heightPt;
      }
      doc.addImage(rowImg.dataUrl, 'PNG', marginX, cursorY, contentWidth, rowImg.heightPt);
      cursorY += rowImg.heightPt;
    }
  }

  if (goals && goals.length > 0) {
    if (cursorY + 90 > pageHeight - marginY) {
      doc.addPage();
      cursorY = marginY;
    } else {
      cursorY += 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(isBw ? 15 : 30, isBw ? 15 : 41, isBw ? 15 : 59);
    doc.text('Academic Goals Progress', marginX, cursorY);

    autoTable(doc, {
      startY: cursorY + 8,
      head: [['Goal', 'Period', 'Subject', 'Progress', 'Status']],
      body: goals.map((g) => [
        g.title,
        g.month === 0 ? `Full Year ${g.year}` : `${MONTHS[g.month - 1]} ${g.year}`,
        g.subject || 'General',
        `${g.progressPercent}%`,
        g.completed ? 'Achieved' : 'In Progress',
      ]),
      theme: 'grid',
      styles: {
        fontSize: compact ? 7.5 : 8.5,
        cellPadding: 4.5,
        textColor: isBw ? [15, 15, 15] : [30, 41, 59],
        lineColor: isBw ? [150, 150, 150] : [203, 213, 225],
      },
      headStyles: { fillColor: isBw ? [35, 35, 35] : [79, 70, 229], textColor: [255, 255, 255] },
      margin: { left: marginX, right: marginX },
    });

    cursorY =
      ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY + 60) +
      14;
  }

  if (cursorY + sigFooterImg.heightPt + 12 > pageHeight - marginY) {
    doc.addPage();
    cursorY = pageHeight - marginY - sigFooterImg.heightPt;
  } else {
    cursorY = Math.max(cursorY + 14, pageHeight - marginY - sigFooterImg.heightPt);
  }
  doc.addImage(
    sigFooterImg.dataUrl,
    'PNG',
    marginX,
    cursorY,
    contentWidth,
    sigFooterImg.heightPt
  );

  const safeName = (filename || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  doc.save(`${safeName || 'student_timetable'}_${opts.pageSize}_${opts.colorMode}.pdf`);
}

const CALENDAR_TYPE_NAMES: Record<string, string> = {
  exam: 'Exam Date',
  assignment: 'Assignment',
  tuition: 'Tuition Class',
  study_session: 'Study Session',
  reminder: 'Reminder',
};

export async function exportCalendarPdf(params: {
  student: StudentProfile;
  appName?: string;
  title: string;
  subtitle: string;
  events: CalendarEvent[];
  filename?: string;
  printOptions?: Partial<PdfPrintOptions>;
}): Promise<void> {
  const { student, appName, title, subtitle, events, filename, printOptions } = params;
  const resolvedAppName = appName?.trim() || DEFAULT_SYSTEM_NAME;
  const opts: PdfPrintOptions = {
    pageSize: printOptions?.pageSize ?? 'a4',
    orientation: printOptions?.orientation ?? 'landscape',
    colorMode: printOptions?.colorMode ?? 'color',
  };
  const isBw = opts.colorMode === 'bw';
  const dateTimeText = formatPrintDateTime();
  const avatarPng = await loadAvatarPngDataUrl(student.avatarUrl, student.name, isBw);

  const doc = new jsPDF({
    orientation: opts.orientation,
    unit: 'pt',
    format: opts.pageSize,
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const compact = opts.pageSize === 'a5' || opts.orientation === 'portrait';
  const marginX = opts.pageSize === 'a5' ? 24 : 36;

  // Header band
  if (isBw) {
    doc.setFillColor(28, 28, 28);
  } else {
    doc.setFillColor(67, 56, 202);
  }
  doc.rect(0, 0, pageWidth, 84, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(compact ? 13 : 17);
  doc.text(`${resolvedAppName} — Academic Calendar`, marginX, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(compact ? 10 : 11);
  doc.text(title, marginX, 52);

  doc.setFontSize(9);
  doc.setTextColor(isBw ? 225 : 224, isBw ? 225 : 231, isBw ? 225 : 255);
  doc.text(subtitle, marginX, 68);

  // Student info + Profile Picture on right
  const avatarSize = 42;
  const textRightX = avatarPng ? pageWidth - marginX - avatarSize - 10 : pageWidth - marginX;
  if (avatarPng) {
    doc.addImage(avatarPng, 'PNG', pageWidth - marginX - avatarSize, 21, avatarSize, avatarSize);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(compact ? 9.5 : 10.5);
  doc.text(student.name, textRightX, 33, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const metaLine = [student.grade, student.schoolName].filter(Boolean).join(' · ') || student.email;
  doc.text(metaLine, textRightX, 49, { align: 'right' });
  doc.text(
    `Printed: ${dateTimeText} · ${opts.pageSize.toUpperCase()} · ${isBw ? 'B&W' : 'Color'}`,
    textRightX,
    64,
    { align: 'right' }
  );

  // Summary strip
  const examCount = events.filter((e) => e.eventType === 'exam').length;
  const assignCount = events.filter((e) => e.eventType === 'assignment').length;
  const studyCount = events.filter((e) => e.eventType === 'study_session' || e.eventType === 'tuition').length;
  const completedCount = events.filter((e) => e.completed).length;

  doc.setFillColor(isBw ? 245 : 248, isBw ? 245 : 250, isBw ? 245 : 252);
  doc.rect(marginX, 100, pageWidth - marginX * 2, 34, 'F');
  doc.setDrawColor(isBw ? 175 : 226, isBw ? 175 : 232, isBw ? 175 : 240);
  doc.rect(marginX, 100, pageWidth - marginX * 2, 34, 'S');

  doc.setTextColor(isBw ? 20 : 30, isBw ? 20 : 41, isBw ? 20 : 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(compact ? 8 : 9.5);
  doc.text(
    `Total Events: ${events.length}   |   Exams: ${examCount}   |   Assignments: ${assignCount}   |   Study / Tuition: ${studyCount}   |   Completed: ${completedCount}`,
    marginX + 12,
    121
  );

  const sorted = [...events].sort((a, b) => {
    if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
    return a.startTime.localeCompare(b.startTime);
  });

  const rowColors = sorted.map((e) => e.color || getDefaultEventColor(e.eventType));

  const rows = sorted.map((evt, idx) => [
    String(idx + 1),
    evt.eventDate,
    `${evt.startTime} - ${evt.endTime}`,
    CALENDAR_TYPE_NAMES[evt.eventType] || evt.eventType,
    evt.subject || 'General',
    evt.title,
    evt.description || '-',
    evt.completed ? 'Completed' : 'Upcoming',
  ]);

  autoTable(doc, {
    startY: 148,
    head: [['#', 'Date', '24h Time', 'Event Type', 'Subject', 'Event Title', 'Details / Notes', 'Status']],
    body: rows.length > 0 ? rows : [['-', '-', '-', '-', '-', 'No calendar events scheduled in this period', '-', '-']],
    theme: 'grid',
    styles: {
      fontSize: compact ? 7.5 : 8.5,
      cellPadding: compact ? 4.5 : 6,
      textColor: isBw ? [20, 20, 20] : [30, 41, 59],
      lineColor: isBw ? [165, 165, 165] : [226, 232, 240],
      lineWidth: 0.6,
    },
    headStyles: {
      fillColor: isBw ? [35, 35, 35] : [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: isBw ? [245, 245, 245] : [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      3: { cellPadding: { top: compact ? 4.5 : 6, right: 6, bottom: compact ? 4.5 : 6, left: 16 } },
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 3 && sorted.length > 0) {
        const hex = rowColors[data.row.index];
        if (hex) {
          if (isBw) {
            doc.setFillColor(55, 55, 55);
          } else {
            const [r, g, b] = hexToRgb(hex);
            doc.setFillColor(r, g, b);
          }
          doc.circle(data.cell.x + 9, data.cell.y + data.cell.height / 2, 3.5, 'F');
        }
      }
    },
    margin: { left: marginX, right: marginX },
  });

  const safeName = (filename || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  doc.save(`${safeName || 'student_calendar'}_${opts.pageSize}_${opts.colorMode}.pdf`);
}

export async function exportQuestionPaperPdf(
  paper: QuestionPaper,
  student: StudentProfile,
  appName?: string
): Promise<void> {
  const resolvedAppName = appName?.trim() || DEFAULT_SYSTEM_NAME;
  const dateTimeText = formatPrintDateTime();
  const avatarPng = await loadAvatarPngDataUrl(student.avatarUrl, student.name, false);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(67, 56, 202);
  doc.rect(0, 0, pageWidth, 82, 'F');

  if (avatarPng) {
    doc.addImage(avatarPng, 'PNG', pageWidth - 36 - 44, 19, 44, 44);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${resolvedAppName} — Practice Question Paper`, 36, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `${paper.subject} · ${paper.lessonName} · ${paper.language} · ${paper.totalMarks} Marks · ${paper.timeLimitMinutes} mins`,
    36,
    49
  );
  doc.setFontSize(8.5);
  doc.setTextColor(224, 231, 255);
  doc.text(`Printed: ${dateTimeText}`, 36, 65);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(paper.title, 36, 108);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Student: ${student.name}${student.grade ? ` (${student.grade})` : ''}${student.schoolName ? ` · ${student.schoolName}` : ''}`,
    36,
    126
  );

  let y = 152;
  for (const q of paper.questions) {
    if (y > 740) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    const qLines = doc.splitTextToSize(`${q.number}. [${q.type} · ${q.marks}m] ${q.question}`, pageWidth - 72);
    doc.text(qLines, 36, y);
    y += qLines.length * 14 + 4;

    if (q.options && q.options.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      q.options.forEach((opt, i) => {
        if (y > 760) {
          doc.addPage();
          y = 48;
        }
        const optLines = doc.splitTextToSize(`   ${String.fromCharCode(65 + i)}) ${opt}`, pageWidth - 88);
        doc.text(optLines, 44, y);
        y += optLines.length * 13 + 2;
      });
    }
    y += 10;
  }

  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Answer Sheet & Explanations', 36, 48);

  autoTable(doc, {
    startY: 64,
    head: [['Q#', 'Type', 'Answer', 'Explanation']],
    body: paper.questions.map((q) => [
      String(q.number),
      q.type,
      q.correctAnswer,
      q.explanation || '-',
    ]),
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
    margin: { left: 36, right: 36 },
  });

  const safeTitle = paper.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  doc.save(`${safeTitle || 'question_paper'}.pdf`);
}

export function getWeeklyTotalMinutes(entries: TimetableEntry[]): number {
  return entries.reduce((sum, e) => sum + e.durationMinutes, 0);
}
