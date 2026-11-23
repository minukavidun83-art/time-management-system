import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Edit3,
  Palette,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  DEFAULT_PDF_OPTIONS,
  exportCalendarPdf,
  type PdfPrintOptions,
} from '../lib/pdfExport.ts';
import { PdfPrintModal } from './PdfPrintModal.tsx';
import {
  getDefaultEventColor,
  MONTHS,
  PROFILE_THEMES,
  SCHEDULE_COLOR_PALETTE,
  WEEKDAYS_SHORT,
} from '../lib/theme.ts';
import type {
  CalendarEvent,
  CalendarEventType,
  StudentProfile,
  SubjectItem,
} from '../types/shared.ts';

interface CalendarViewProps {
  student: StudentProfile;
  events: CalendarEvent[];
  subjects: SubjectItem[];
  appName?: string;
  onRefresh: () => void;
}

type CalMode = 'monthly' | 'weekly' | 'daily';

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  exam: 'Exam Date',
  assignment: 'Assignment Deadline',
  tuition: 'Tuition Class',
  study_session: 'Study Session',
  reminder: 'Reminder',
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  student,
  events,
  subjects,
  appName,
  onRefresh,
}) => {
  const theme = PROFILE_THEMES[student.profileTheme] || PROFILE_THEMES.indigo;
  const now = new Date();

  const [mode, setMode] = useState<CalMode>('monthly');
  const [cursorDate, setCursorDate] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<CalendarEventType>('exam');
  const [eventDate, setEventDate] = useState(now.toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [subject, setSubject] = useState(subjects[0]?.name || 'Mathematics');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(getDefaultEventColor('exam'));
  const [manualColorPicked, setManualColorPicked] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOptions, setPrintOptions] = useState<PdfPrintOptions>(DEFAULT_PDF_OPTIONS);

  const year = cursorDate.getFullYear();
  const monthIndex = cursorDate.getMonth();
  const selectedIso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(cursorDate.getDate()).padStart(2, '0')}`;

  const monthGrid = useMemo(() => {
    const firstDay = new Date(year, monthIndex, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0..Sun=6
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: Array<{ iso: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ iso: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        iso: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
      });
    }
    return cells;
  }, [year, monthIndex]);

  const weekDates = useMemo(() => {
    const dow = (cursorDate.getDay() + 6) % 7;
    const monday = new Date(cursorDate);
    monday.setDate(cursorDate.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: d, iso };
    });
  }, [cursorDate]);

  const openCreateModal = (dateStr?: string) => {
    setEditingId(null);
    setTitle('');
    setEventType('exam');
    setEventDate(dateStr || selectedIso);
    setStartTime('09:00');
    setEndTime('10:30');
    setSubject(subjects[0]?.name || 'Mathematics');
    setDescription('');
    setColor(getDefaultEventColor('exam'));
    setManualColorPicked(false);
    setReminderMinutes(30);
    setShowModal(true);
  };

  const openEditModal = (evt: CalendarEvent) => {
    setEditingId(evt.id);
    setTitle(evt.title);
    setEventType(evt.eventType);
    setEventDate(evt.eventDate);
    setStartTime(evt.startTime);
    setEndTime(evt.endTime);
    setSubject(evt.subject);
    setDescription(evt.description);
    setColor(evt.color || getDefaultEventColor(evt.eventType));
    setManualColorPicked(true);
    setReminderMinutes(evt.reminderMinutes);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        eventType,
        eventDate,
        startTime,
        endTime,
        subject,
        description: description.trim(),
        color,
        reminderMinutes,
      };
      if (editingId) {
        await apiRequest(`/calendar/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/calendar', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleComplete = async (evt: CalendarEvent) => {
    await apiRequest(`/calendar/${evt.id}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: !evt.completed }),
    });
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await apiRequest(`/calendar/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const shiftCursor = (dir: -1 | 1) => {
    const next = new Date(cursorDate);
    if (mode === 'monthly') next.setMonth(next.getMonth() + dir);
    else if (mode === 'weekly') next.setDate(next.getDate() + dir * 7);
    else next.setDate(next.getDate() + dir);
    setCursorDate(next);
  };

  const dayEvents = events.filter((e) => e.eventDate === selectedIso);

  const handleExportPdf = (opts: PdfPrintOptions = printOptions) => {
    const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    if (mode === 'daily') {
      void exportCalendarPdf({
        student,
        appName,
        title: `Daily Academic Calendar · ${selectedIso}`,
        subtitle: `Exams, Assignments & Study Schedule`,
        events: dayEvents,
        filename: `calendar_daily_${selectedIso}`,
        printOptions: opts,
      });
    } else if (mode === 'weekly') {
      const weekIsos = new Set(weekDates.map((w) => w.iso));
      const weekEvents = events.filter((e) => weekIsos.has(e.eventDate));
      void exportCalendarPdf({
        student,
        appName,
        title: `Weekly Calendar · ${weekDates[0].iso} to ${weekDates[6].iso}`,
        subtitle: `${MONTHS[monthIndex]} ${year} Weekly Events`,
        events: weekEvents,
        filename: `calendar_weekly_${weekDates[0].iso}`,
        printOptions: opts,
      });
    } else {
      const monthEvents = events.filter((e) => e.eventDate.startsWith(monthPrefix));
      void exportCalendarPdf({
        student,
        appName,
        title: `Monthly Academic Calendar · ${MONTHS[monthIndex]} ${year}`,
        subtitle: `All Scheduled Exams, Assignments & Reminders`,
        events: monthEvents,
        filename: `calendar_${MONTHS[monthIndex].toLowerCase()}_${year}`,
        printOptions: opts,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftCursor(-1)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCursorDate(new Date())}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftCursor(1)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="font-display text-lg font-bold">
            {mode === 'daily'
              ? cursorDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
              : `${MONTHS[monthIndex]} ${year}`}
          </h2>

          <select
            value={year}
            onChange={(e) => setCursorDate(new Date(Number(e.target.value), monthIndex, 1))}
            className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          >
            {Array.from({ length: 11 }, (_, i) => 2022 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(['monthly', 'weekly', 'daily'] as CalMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize cursor-pointer ${
                  mode === m
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Export / Print PDF
          </button>

          <button
            type="button"
            onClick={() => openCreateModal()}
            className={`px-4 py-2 rounded-xl ${theme.primaryBg} ${theme.primaryHover} text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer`}
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        </div>
      </div>

      {/* Color Legend */}
      <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
          <Palette className="w-3.5 h-3.5 text-indigo-500" />
          Color Legend:
        </span>
        {SCHEDULE_COLOR_PALETTE.map((c) => (
          <span
            key={c.hex}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
            <span>{c.name}</span>
          </span>
        ))}
      </div>

      {/* Monthly Grid */}
      {mode === 'monthly' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-2 mb-2">
            {WEEKDAYS_SHORT.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthGrid.map((cell, idx) => {
              if (!cell.iso || !cell.dayNum) {
                return <div key={`empty-${idx}`} className="min-h-[96px] rounded-xl bg-slate-50/40 dark:bg-slate-950/30" />;
              }
              const cellEvents = events.filter((e) => e.eventDate === cell.iso);
              const isSelected = cell.iso === selectedIso;
              return (
                <div
                  key={cell.iso}
                  onClick={() => {
                    const [y, m, d] = cell.iso!.split('-').map(Number);
                    setCursorDate(new Date(y, m - 1, d));
                  }}
                  className={`min-h-[96px] rounded-xl border p-2 flex flex-col justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold tabular-nums">{cell.dayNum}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreateModal(cell.iso!);
                      }}
                      className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                      aria-label={`Add event on ${cell.iso}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1 mt-1">
                    {cellEvents.slice(0, 2).map((evt) => {
                      const evtColor = evt.color || getDefaultEventColor(evt.eventType);
                      return (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(evt);
                          }}
                          style={{
                            backgroundColor: `${evtColor}1A`,
                            borderColor: `${evtColor}45`,
                            color: evtColor,
                          }}
                          className="text-[11px] px-1.5 py-0.5 rounded border truncate font-semibold flex items-center gap-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: evtColor }} />
                          <span className="truncate">{evt.startTime} {evt.title}</span>
                        </div>
                      );
                    })}
                    {cellEvents.length > 2 && (
                      <div className="text-[10px] text-slate-400 font-medium">+{cellEvents.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly Calendar */}
      {mode === 'weekly' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDates.map(({ date, iso }) => {
            const items = events.filter((e) => e.eventDate === iso);
            return (
              <div key={iso} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 min-h-[240px]">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-xs font-bold">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className="font-mono text-xs text-slate-500 tabular-nums">{iso}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreateModal(iso)}
                    className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((evt) => {
                    const evtColor = evt.color || getDefaultEventColor(evt.eventType);
                    return (
                      <div
                        key={evt.id}
                        onClick={() => openEditModal(evt)}
                        style={{
                          backgroundColor: `${evtColor}14`,
                          borderColor: `${evtColor}45`,
                        }}
                        className="p-2.5 rounded-xl border space-y-1 cursor-pointer transition-opacity hover:opacity-95"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono font-bold" style={{ color: evtColor }}>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: evtColor }} />
                            {evt.startTime}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(evt.id);
                            }}
                            className="text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs font-semibold">{evt.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{EVENT_TYPE_LABELS[evt.eventType]}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Day Agenda (always shown in Daily mode and below Monthly mode) */}
      {(mode === 'daily' || mode === 'monthly') && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-base font-semibold">Events for {selectedIso}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dayEvents.length} scheduled items
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCreateModal(selectedIso)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              + Add Event on {selectedIso}
            </button>
          </div>

          {dayEvents.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              No exams, deadlines, or reminders on this date.
            </p>
          ) : (
            <div className="space-y-2.5">
              {dayEvents.map((evt) => {
                const evtColor = evt.color || getDefaultEventColor(evt.eventType);
                return (
                  <div
                    key={evt.id}
                    style={{
                      backgroundColor: `${evtColor}10`,
                      borderColor: `${evtColor}38`,
                    }}
                    className="p-3.5 rounded-xl border flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button type="button" onClick={() => handleToggleComplete(evt)} className="cursor-pointer shrink-0">
                        {evt.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                        )}
                      </button>
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: evtColor }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-semibold truncate ${evt.completed ? 'line-through text-slate-400' : ''}`}>
                            {evt.title}
                          </p>
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: `${evtColor}22`, color: evtColor }}
                          >
                            {EVENT_TYPE_LABELS[evt.eventType]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {evt.subject ? `${evt.subject}` : 'General'}
                          {evt.description ? ` · ${evt.description}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs tabular-nums font-semibold" style={{ color: evtColor }}>
                        {evt.startTime} – {evt.endTime}
                      </span>
                      <button type="button" onClick={() => openEditModal(evt)} className="p-1.5 text-slate-400 hover:text-indigo-600 cursor-pointer">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(evt.id)} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">{editingId ? 'Edit Event' : 'Add Calendar Event'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Term Mathematics Exam"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Type</label>
                  <select
                    value={eventType}
                    onChange={(e) => {
                      const nextType = e.target.value as CalendarEventType;
                      setEventType(nextType);
                      if (!manualColorPicked) {
                        setColor(getDefaultEventColor(nextType));
                      }
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Subject</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Event Color
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {SCHEDULE_COLOR_PALETTE.map((c) => {
                    const selected = color.toLowerCase() === c.hex.toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.name}
                        onClick={() => {
                          setColor(c.hex);
                          setManualColorPicked(true);
                        }}
                        style={{ backgroundColor: c.hex }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                          selected ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110' : 'hover:scale-105'
                        }`}
                        aria-label={`Select ${c.name}`}
                      >
                        {selected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">End</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Details / Reminder Notes</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-5 py-2 rounded-xl ${theme.primaryBg} text-white text-sm font-semibold cursor-pointer disabled:opacity-60`}
                >
                  {saving ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PdfPrintModal
        open={showPrintModal}
        title="Calendar PDF Print Settings"
        options={printOptions}
        onChange={setPrintOptions}
        onConfirm={() => handleExportPdf(printOptions)}
        onClose={() => setShowPrintModal(false)}
      />
    </div>
  );
};
