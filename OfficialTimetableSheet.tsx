import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  CheckCircle2,
  Coffee,
  Edit3,
  GraduationCap,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { formatMinutes } from '../lib/api.ts';
import { getDefaultTimetableColor, SCHEDULE_COLOR_PALETTE, WEEKDAYS } from '../lib/theme.ts';
import type { StudentProfile, SubjectItem, TimetableEntry } from '../types/shared.ts';

export const WEEKDAYS_SINHALA = [
  'සඳුදා',
  'අඟහරුවාදා',
  'බදාදා',
  'බ්‍රහස්පතින්දා',
  'සිකුරාදා',
  'සෙනසුරාදා',
  'ඉරිදා',
];

export type PrintableSheetItem = Omit<TimetableEntry, 'id' | 'createdAt' | 'completed' | 'isAiGenerated'> & {
  id?: string;
  completed?: boolean;
  isAiGenerated?: boolean;
  _origIdx?: number;
};

interface OfficialTimetableSheetProps {
  student: StudentProfile;
  appName?: string;
  title?: string;
  aiSummary?: string;
  entries: PrintableSheetItem[];
  subjects?: SubjectItem[];
  mode?: 'weekly' | 'daily' | 'monthly';
  colorMode?: 'color' | 'bw';
  aiEnhanced?: boolean;
  onToggleComplete?: (item: TimetableEntry) => void;
  onEdit?: (item: TimetableEntry) => void;
  onDelete?: (id: string) => void;
  onAddDay?: (dayIndex: number) => void;
  onStartFocusTimer?: (subject: string, minutes: number) => void;
  onCyclePreviewColor?: (origIdx: number, nextHex: string) => void;
  onRemovePreviewItem?: (origIdx: number) => void;
}

export const OfficialTimetableSheet: React.FC<OfficialTimetableSheetProps> = ({
  student,
  appName = 'Student Time Management System',
  title,
  aiSummary,
  entries,
  subjects = [],
  mode = 'weekly',
  colorMode = 'color',
  aiEnhanced,
  onToggleComplete,
  onEdit,
  onDelete,
  onAddDay,
  onStartFocusTimer,
  onCyclePreviewColor,
  onRemovePreviewItem,
}) => {
  const [nowClock, setNowClock] = useState(() => new Date());
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [student.avatarUrl]);

  useEffect(() => {
    const timer = setInterval(() => setNowClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const isBw = colorMode === 'bw';
  const hasAi = aiEnhanced ?? entries.some((e) => e.isAiGenerated);
  const resolvedAppName = appName?.trim() || 'Student Time Management System';

  const dateTimeString = `${nowClock.toLocaleDateString()} · ${nowClock.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  const resolveColor = (item: PrintableSheetItem): string => {
    if (isBw) return '#1E293B';
    if (item.color && /^#[0-9a-fA-F]{6}$/.test(item.color)) return item.color;
    const matchedSubj = subjects.find((s) => s.name.toLowerCase() === (item.subject || '').toLowerCase());
    return getDefaultTimetableColor(item.category, matchedSubj?.color);
  };

  const renderIcon = (item: PrintableSheetItem, hex: string) => {
    const lower = `${item.title} ${item.subject}`.toLowerCase();
    const style = { color: isBw ? '#0F172A' : hex };
    if (lower.includes('break') || lower.includes('rest') || lower.includes('lunch')) {
      return <Coffee className="w-4 h-4 shrink-0" style={style} />;
    }
    if (item.category === 'school') {
      return <GraduationCap className="w-4 h-4 shrink-0" style={style} />;
    }
    if (item.category === 'tuition') {
      return <Building2 className="w-4 h-4 shrink-0" style={style} />;
    }
    if (item.isAiGenerated || hasAi) {
      return <Sparkles className="w-4 h-4 shrink-0" style={style} />;
    }
    return <BookOpen className="w-4 h-4 shrink-0" style={style} />;
  };

  // Group entries cleanly by day (weekly) or category (daily/monthly)
  const groups: Array<{
    key: string;
    labelEn: string;
    labelSi: string;
    dayIdx?: number;
    items: PrintableSheetItem[];
  }> = [];

  if (mode === 'weekly') {
    WEEKDAYS.forEach((dayName, idx) => {
      const dayItems = entries
        .filter((e) => (e.dayOfWeek ?? 0) === idx)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (dayItems.length > 0 || onAddDay) {
        groups.push({
          key: `day-${idx}`,
          labelEn: dayName,
          labelSi: WEEKDAYS_SINHALA[idx],
          dayIdx: idx,
          items: dayItems,
        });
      }
    });
  } else {
    const categories: Array<{ key: string; en: string; si: string }> = [
      { key: 'school', en: 'School', si: 'පාසල් කාලසටහන' },
      { key: 'tuition', en: 'Tuition', si: 'අමතර පන්ති' },
      { key: 'self_study', en: 'Self Study', si: 'ස්වයං අධ්‍යයන' },
    ];
    categories.forEach((cat) => {
      const catItems = entries
        .filter((e) => e.category === cat.key)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (catItems.length > 0) {
        groups.push({
          key: cat.key,
          labelEn: cat.en,
          labelSi: cat.si,
          items: catItems,
        });
      }
    });
  }

  const sheetHeading =
    title ||
    (hasAi
      ? 'AI PERSONALIZED STUDY TIMETABLE (OFFICIAL)'
      : 'PHYSICAL & STUDY CLASS TIMETABLE (OFFICIAL)');

  const initials = (student.name || 'S')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div
      className={`rounded-2xl border p-5 sm:p-7 space-y-6 transition-colors ${
        isBw
          ? 'bg-white text-slate-950 border-slate-900'
          : hasAi
            ? 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-900/70 shadow-sm'
            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
      }`}
    >
      {/* Official Framed Header Box with Student Profile Picture, Dynamic Website Name, & Date/Time */}
      <div
        className={`border-2 px-5 py-4 sm:px-7 sm:py-5 ${
          isBw
            ? 'border-slate-950 bg-white'
            : hasAi
              ? 'border-indigo-900/80 dark:border-indigo-500/70 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/80 dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/35 rounded-xl'
              : 'border-slate-900 dark:border-slate-300 bg-white dark:bg-slate-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Student Profile Picture */}
          <div className="shrink-0">
            {student.avatarUrl && !avatarFailed ? (
              <img
                src={student.avatarUrl}
                alt={student.name}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className={`w-16 h-16 rounded-2xl object-cover border-2 shadow-xs ${
                  isBw
                    ? 'border-slate-950 grayscale'
                    : hasAi
                      ? 'border-indigo-500/60'
                      : 'border-slate-800 dark:border-slate-300'
                }`}
              />
            ) : (
              <div
                className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center font-display text-lg font-extrabold ${
                  isBw
                    ? 'border-slate-950 bg-slate-100 text-slate-950'
                    : 'border-indigo-500/50 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                }`}
              >
                {initials}
              </div>
            )}
          </div>

          <div className="flex-1 text-center space-y-1.5 min-w-0">
            <div
              className={`text-[11px] sm:text-xs font-bold tracking-[0.14em] uppercase flex items-center justify-center gap-2 flex-wrap ${
                isBw
                  ? 'text-slate-800'
                  : hasAi
                    ? 'text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {hasAi && !isBw && <Sparkles className="w-3.5 h-3.5 shrink-0" />}
              <span>{resolvedAppName.toUpperCase()} • කාලසටහන් ලේඛනය</span>
            </div>
            <h2 className="font-display text-lg sm:text-2xl font-extrabold tracking-tight uppercase text-slate-950 dark:text-white">
              {sheetHeading}
            </h2>
          </div>

          <div className="hidden sm:block w-16 shrink-0" aria-hidden="true" />
        </div>

        <div
          className={`my-3.5 border-t-2 ${
            isBw
              ? 'border-slate-950'
              : hasAi
                ? 'border-indigo-900/70 dark:border-indigo-500/60'
                : 'border-slate-900 dark:border-slate-300'
          }`}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1.5 gap-x-4 text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
          <div className="truncate">
            <span className="text-slate-500 dark:text-slate-400">STUDENT: </span>
            <span>{student.name}</span>
          </div>
          <div className="truncate sm:text-center">
            <span className="text-slate-500 dark:text-slate-400">GRADE / LEVEL: </span>
            <span>{student.grade || 'Student'}</span>
          </div>
          <div className="truncate sm:text-right">
            <span className="text-slate-500 dark:text-slate-400">INSTITUTION / SCHOOL: </span>
            <span>{student.schoolName || resolvedAppName}</span>
          </div>
          <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
            <span>
              <span className="text-slate-500 dark:text-slate-400">DATE &amp; TIME: </span>
              <span className="font-mono">{dateTimeString}</span>
            </span>
            {aiSummary && (
              <span
                className={`normal-case font-medium ${
                  isBw ? 'text-slate-700' : 'text-indigo-700 dark:text-indigo-300'
                }`}
              >
                {aiSummary}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Official Structured Table */}
      <div className="overflow-x-auto">
        <table
          className={`w-full border-collapse text-left ${
            isBw ? 'border border-slate-950' : 'border border-slate-300 dark:border-slate-700'
          }`}
        >
          <thead>
            <tr
              className={`text-xs font-bold ${
                isBw
                  ? 'bg-slate-100 text-slate-950'
                  : hasAi
                    ? 'bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-100'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100'
              }`}
            >
              <th
                className={`p-3 w-36 sm:w-44 border ${
                  isBw ? 'border-slate-950' : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                {mode === 'weekly' ? 'Day / දිනය' : 'Category / කොටස'}
              </th>
              <th
                className={`p-3 border ${
                  isBw ? 'border-slate-950' : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                Scheduled Time Intervals &amp; Subjects (කාල පරිච්ඡේද සහ විෂයන්)
              </th>
              <th
                className={`p-3 w-24 sm:w-28 text-center border ${
                  isBw ? 'border-slate-950' : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {groups.length === 0 || entries.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className={`p-8 text-center text-sm border ${
                    isBw
                      ? 'border-slate-950 text-slate-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  No timetable entries scheduled yet. Add an activity or generate with AI!
                </td>
              </tr>
            ) : (
              groups.map((grp) => {
                const totalMins = grp.items.reduce((sum, x) => sum + Number(x.durationMinutes || 0), 0);
                return (
                  <tr
                    key={grp.key}
                    className={
                      isBw
                        ? 'bg-white'
                        : 'bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
                    }
                  >
                    <td
                      className={`p-3 align-top border ${
                        isBw ? 'border-slate-950' : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <div className="font-display text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        {grp.labelEn}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {grp.labelSi}
                      </div>
                      {onAddDay && typeof grp.dayIdx === 'number' && (
                        <button
                          type="button"
                          onClick={() => onAddDay(grp.dayIdx!)}
                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer print:hidden"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      )}
                    </td>

                    <td
                      className={`p-2.5 sm:p-3 align-top border ${
                        isBw ? 'border-slate-950' : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {grp.items.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">No sessions scheduled</span>
                      ) : (
                        <div className="space-y-1.5">
                          {grp.items.map((item, itemIdx) => {
                            const itemColor = resolveColor(item);
                            const fullItem = item as TimetableEntry;
                            return (
                              <div
                                key={item.id || `${grp.key}-${itemIdx}`}
                                style={
                                  isBw
                                    ? undefined
                                    : hasAi || item.isAiGenerated
                                      ? {
                                          backgroundColor: `${itemColor}14`,
                                          borderColor: `${itemColor}45`,
                                        }
                                      : {
                                          backgroundColor: `${itemColor}0A`,
                                          borderColor: `${itemColor}30`,
                                        }
                                }
                                className={`px-3 py-2 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${
                                  isBw ? 'border-slate-300 bg-slate-50/70' : ''
                                } ${item.completed ? 'opacity-65' : ''}`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {typeof item._origIdx === 'number' && onCyclePreviewColor && !isBw ? (
                                    <button
                                      type="button"
                                      title="Click to change color"
                                      onClick={() => {
                                        const currIdx = SCHEDULE_COLOR_PALETTE.findIndex(
                                          (c) => c.hex.toLowerCase() === itemColor.toLowerCase()
                                        );
                                        const nextHex =
                                          SCHEDULE_COLOR_PALETTE[(currIdx + 1) % SCHEDULE_COLOR_PALETTE.length].hex;
                                        onCyclePreviewColor(item._origIdx!, nextHex);
                                      }}
                                      style={{ backgroundColor: `${itemColor}22` }}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition-transform"
                                    >
                                      {renderIcon(item, itemColor)}
                                    </button>
                                  ) : onToggleComplete && item.id ? (
                                    <button
                                      type="button"
                                      onClick={() => onToggleComplete(fullItem)}
                                      className="shrink-0 cursor-pointer"
                                      aria-label={item.completed ? 'Mark pending' : 'Mark completed'}
                                    >
                                      {item.completed ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                      ) : (
                                        renderIcon(item, itemColor)
                                      )}
                                    </button>
                                  ) : (
                                    <span
                                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                      style={isBw ? undefined : { backgroundColor: `${itemColor}1F` }}
                                    >
                                      {renderIcon(item, itemColor)}
                                    </span>
                                  )}

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className="font-mono text-xs font-bold tabular-nums shrink-0"
                                        style={{ color: isBw ? '#0F172A' : itemColor }}
                                      >
                                        {item.startTime} – {item.endTime}
                                      </span>
                                      <span
                                        className={`text-xs sm:text-sm font-semibold ${
                                          item.completed
                                            ? 'line-through text-slate-400'
                                            : 'text-slate-900 dark:text-slate-100'
                                        }`}
                                      >
                                        {item.title}
                                      </span>
                                      {(item.isAiGenerated || hasAi) && !isBw && (
                                        <span
                                          className="text-[10px] font-bold uppercase tracking-wider"
                                          style={{ color: itemColor }}
                                        >
                                          · AI
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                      {item.subject || item.category.replace('_', ' ')}
                                      {item.teacher ? ` · ${item.teacher}` : ''}
                                      {item.location ? ` · ${item.location}` : ''}
                                      {item.notes ? ` · ${item.notes}` : ''}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 pl-9 sm:pl-0 print:hidden">
                                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mr-1">
                                    ({formatMinutes(item.durationMinutes)})
                                  </span>
                                  {onStartFocusTimer && !item.completed && item.id && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onStartFocusTimer(item.subject || item.title, item.durationMinutes)
                                      }
                                      className="p-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60 cursor-pointer"
                                      title="Start Focus Timer"
                                    >
                                      <Play className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {onEdit && item.id && (
                                    <button
                                      type="button"
                                      onClick={() => onEdit(fullItem)}
                                      className="p-1 rounded-md text-slate-400 hover:text-indigo-600 cursor-pointer"
                                      aria-label="Edit activity"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {onDelete && item.id && (
                                    <button
                                      type="button"
                                      onClick={() => onDelete(item.id!)}
                                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 cursor-pointer"
                                      aria-label="Delete activity"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {onRemovePreviewItem && typeof item._origIdx === 'number' && (
                                    <button
                                      type="button"
                                      onClick={() => onRemovePreviewItem(item._origIdx!)}
                                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 cursor-pointer"
                                      aria-label="Remove item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td
                      className={`p-3 align-middle text-center border font-mono text-xs font-bold tabular-nums ${
                        isBw
                          ? 'border-slate-950 text-slate-950'
                          : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {totalMins > 0 ? formatMinutes(totalMins) : '—'}
                      {grp.items.length > 0 && (
                        <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                          {grp.items.length} {grp.items.length === 1 ? 'item' : 'items'}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Official Signature Footer matching Screenshot 2 */}
      <div className="pt-4 space-y-5">
        <div
          className={`border-t-2 ${
            isBw ? 'border-slate-950' : 'border-slate-900 dark:border-slate-300'
          }`}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 pt-6">
          <div className="text-center space-y-2">
            <div
              className={`border-t-2 mx-auto w-4/5 ${
                isBw ? 'border-slate-950' : 'border-slate-900 dark:border-slate-300'
              }`}
            />
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Student&apos;s Signature / ශිෂ්‍ය අත්සන
            </p>
          </div>
          <div className="text-center space-y-2">
            <div
              className={`border-t-2 mx-auto w-4/5 ${
                isBw ? 'border-slate-950' : 'border-slate-900 dark:border-slate-300'
              }`}
            />
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Parent or Guardian / මව්පිය අත්සන
            </p>
          </div>
          <div className="text-center space-y-2">
            <div
              className={`border-t-2 mx-auto w-4/5 ${
                isBw ? 'border-slate-950' : 'border-slate-900 dark:border-slate-300'
              }`}
            />
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Class Teacher or Mentor / ගුරු අත්සන
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 text-center">
          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
            — Official Academic Schedule Sheet • {resolvedAppName} —
          </p>
        </div>
      </div>
    </div>
  );
};
