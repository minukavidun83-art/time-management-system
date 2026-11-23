import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Coffee,
  Download,
  Edit3,
  FileUp,
  GraduationCap,
  ImagePlus,
  Palette,
  Play,
  Plus,
  Printer,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  addMinutesToTime,
  apiRequest,
  computeDurationMinutes,
  formatMinutes,
  readFileAsAttachment,
  type FileAttachmentPayload,
} from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import {
  DEFAULT_PDF_OPTIONS,
  exportTimetablePdf,
  type PdfColorMode,
  type PdfOrientation,
  type PdfPageSize,
  type PdfPrintOptions,
} from '../lib/pdfExport.ts';
import { OfficialTimetableSheet } from './OfficialTimetableSheet.tsx';
import { PdfPrintModal } from './PdfPrintModal.tsx';
import {
  getDefaultTimetableColor,
  MONTHS,
  PROFILE_THEMES,
  SCHEDULE_COLOR_PALETTE,
  WEEKDAYS,
  WEEKDAYS_SHORT,
} from '../lib/theme.ts';
import type {
  SiteSettings,
  StudentProfile,
  SubjectItem,
  TimetableCategory,
  TimetableEntry,
  TimetableScope,
  UiLanguage,
  YearlyGoal,
} from '../types/shared.ts';

interface TimetablesViewProps {
  student: StudentProfile;
  entries: TimetableEntry[];
  subjects: SubjectItem[];
  yearlyGoals: YearlyGoal[];
  siteSettings?: SiteSettings;
  lang?: UiLanguage;
  onRefresh: () => void;
  onStartFocusTimer?: (subject: string, minutes: number) => void;
}

const DURATION_PRESETS = [
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1h 30m', minutes: 90 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
}

function findOverlaps(items: TimetableEntry[]): number {
  const sorted = [...items].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  let overlaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = toMinutes(sorted[i - 1].endTime);
    const currStart = toMinutes(sorted[i].startTime);
    if (currStart < prevEnd && prevEnd > toMinutes(sorted[i - 1].startTime)) {
      overlaps++;
    }
  }
  return overlaps;
}

export const TimetablesView: React.FC<TimetablesViewProps> = ({
  student,
  entries,
  subjects,
  yearlyGoals,
  siteSettings,
  lang = 'en',
  onRefresh,
  onStartFocusTimer,
}) => {
  const theme = PROFILE_THEMES[student.profileTheme] || PROFILE_THEMES.indigo;
  const now = new Date();

  const enabledScopes = (['daily', 'weekly', 'monthly', 'yearly'] as TimetableScope[]).filter(
    (sc) => siteSettings?.enabledScopes?.[sc] ?? true
  );
  const enabledCategories = (['school', 'tuition', 'self_study'] as TimetableCategory[]).filter(
    (cat) => siteSettings?.enabledCategories?.[cat] ?? true
  );

  const [activeScope, setActiveScope] = useState<TimetableScope>(enabledScopes[0] || 'daily');
  const [activeCategory, setActiveCategory] = useState<'all' | TimetableCategory>('all');
  const [dailyLayout, setDailyLayout] = useState<'official' | 'list'>('official');
  const [weeklyLayout, setWeeklyLayout] = useState<'official' | 'list' | 'columns' | 'matrix'>('official');
  const [aiPreviewLayout, setAiPreviewLayout] = useState<'official' | 'edit'>('official');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(now.toISOString().slice(0, 10));

  // Entry Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCategory, setFormCategory] = useState<TimetableCategory>('self_study');
  const [formScope, setFormScope] = useState<TimetableScope>('daily');
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState(subjects[0]?.name || 'Mathematics');
  const [formTeacher, setFormTeacher] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(0);
  const [formMonth, setFormMonth] = useState<number>(now.getMonth() + 1);
  const [formYear, setFormYear] = useState<number>(now.getFullYear());
  const [formDate, setFormDate] = useState<string>(now.toISOString().slice(0, 10));
  const [formStartTime, setFormStartTime] = useState('16:00');
  const [formEndTime, setFormEndTime] = useState('17:30');
  const [formDuration, setFormDuration] = useState<number>(90);
  const [formNotes, setFormNotes] = useState('');
  const [formColor, setFormColor] = useState<string>(getDefaultTimetableColor('self_study'));
  const [manualColorPicked, setManualColorPicked] = useState(false);
  const [saving, setSaving] = useState(false);

  // Custom Subject Input
  const [newSubjectName, setNewSubjectName] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);

  // Yearly Goal State
  const [goalTitle, setGoalTitle] = useState('');
  const [goalMonth, setGoalMonth] = useState<number>(0);
  const [goalSubject, setGoalSubject] = useState(subjects[0]?.name || 'Mathematics');
  const [goalMetric, setGoalMetric] = useState('');

  // AI Smart Timetable & Own Timetable Modal State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiModalMode, setAiModalMode] = useState<'smart' | 'own'>('smart');
  const [aiSubjects, setAiSubjects] = useState<string[]>(subjects.slice(0, 5).map((s) => s.name));
  const [aiHoursPerDay, setAiHoursPerDay] = useState(3);
  const [aiSchoolTimes, setAiSchoolTimes] = useState('07:30 - 13:30 (Monday to Friday)');
  const [aiTuitionTimes, setAiTuitionTimes] = useState('Tue 16:00-18:00 Mathematics, Thu 16:00-18:00 Science');
  const [aiFreeTimes, setAiFreeTimes] = useState('18:30 - 21:30 weekdays, 09:00 - 17:00 weekends');
  const [aiExamDates, setAiExamDates] = useState('Term Exams next month');
  const [aiGoals, setAiGoals] = useState('Prioritize weak topics, include 15m breaks, balance all subjects');
  const [aiScope, setAiScope] = useState<'weekly' | 'daily'>('weekly');
  const [ownRawText, setOwnRawText] = useState('');
  const [ownLanguage, setOwnLanguage] = useState<'English' | 'Sinhala'>(lang === 'si' ? 'Sinhala' : 'English');
  const [ownOptimizeGoal, setOwnOptimizeGoal] = useState(
    'Keep my entered times & subjects accurate, fix overlaps, add 15m breaks, and format cleanly'
  );
  const [ownAttachments, setOwnAttachments] = useState<FileAttachmentPayload[]>([]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreviewSummary, setAiPreviewSummary] = useState('');
  const [aiPreviewEntries, setAiPreviewEntries] = useState<
    Array<Omit<TimetableEntry, 'id' | 'createdAt' | 'completed' | 'isAiGenerated'>>
  >([]);
  const [aiError, setAiError] = useState('');
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [autoSaveOnCreate, setAutoSaveOnCreate] = useState(true);
  const [aiSavedSuccess, setAiSavedSuccess] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOptions, setPrintOptions] = useState<PdfPrintOptions>(DEFAULT_PDF_OPTIONS);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (activeCategory !== 'all' && e.category !== activeCategory) return false;
      if (activeScope === 'daily') {
        const dow = (new Date(`${selectedDate}T00:00:00`).getDay() + 6) % 7;
        return (
          e.specificDate === selectedDate ||
          (e.scope === 'daily' && !e.specificDate) ||
          (e.scope === 'weekly' && e.dayOfWeek === dow)
        );
      }
      if (activeScope === 'weekly') {
        return e.scope === 'weekly';
      }
      if (activeScope === 'monthly') {
        return (
          (e.scope === 'monthly' && e.month === selectedMonth && e.year === selectedYear) ||
          (e.specificDate &&
            e.specificDate.startsWith(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}`))
        );
      }
      return e.year === selectedYear;
    });
  }, [entries, activeCategory, activeScope, selectedDate, selectedMonth, selectedYear]);

  const timeMetrics = useMemo(() => {
    const total = filteredEntries.reduce((acc, e) => acc + e.durationMinutes, 0);
    const school = filteredEntries
      .filter((e) => e.category === 'school')
      .reduce((acc, e) => acc + e.durationMinutes, 0);
    const tuition = filteredEntries
      .filter((e) => e.category === 'tuition')
      .reduce((acc, e) => acc + e.durationMinutes, 0);
    const selfStudy = filteredEntries
      .filter((e) => e.category === 'self_study')
      .reduce((acc, e) => acc + e.durationMinutes, 0);
    const completed = filteredEntries
      .filter((e) => e.completed)
      .reduce((acc, e) => acc + e.durationMinutes, 0);

    let overlapCount = 0;
    if (activeScope === 'daily') {
      overlapCount = findOverlaps(filteredEntries);
    } else if (activeScope === 'weekly') {
      for (let d = 0; d < 7; d++) {
        overlapCount += findOverlaps(filteredEntries.filter((e) => e.dayOfWeek === d));
      }
    }

    const dailyFree = Math.max(0, 24 * 60 - total);
    return { total, school, tuition, selfStudy, completed, overlapCount, dailyFree };
  }, [filteredEntries, activeScope]);

  const daysInSelectedMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const selectedMonthDayEntries = useMemo(() => {
    return entries
      .filter((e) => {
        if (activeCategory !== 'all' && e.category !== activeCategory) return false;
        return e.specificDate === selectedDate;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [entries, activeCategory, selectedDate]);

  const handleExportCurrentPdf = (opts: PdfPrintOptions = printOptions) => {
    const catName =
      activeCategory === 'all'
        ? 'All Categories'
        : activeCategory === 'school'
          ? 'School Timetable'
          : activeCategory === 'tuition'
            ? 'Tuition Timetable'
            : 'Self Study Timetable';
    const resolvedAppName = siteSettings?.appName || 'Student Time Management System';

    if (activeScope === 'daily') {
      void exportTimetablePdf({
        student,
        appName: resolvedAppName,
        title: `Daily Time Management Plan · ${selectedDate}`,
        subtitle: `24-Hour Schedule (${catName})`,
        entries: filteredEntries,
        filename: `timetable_daily_${selectedDate}`,
        printOptions: opts,
      });
    } else if (activeScope === 'weekly') {
      void exportTimetablePdf({
        student,
        appName: resolvedAppName,
        title: `PHYSICAL & STUDY CLASS TIMETABLE (OFFICIAL)`,
        subtitle: `Weekly Master Plan (${catName})`,
        entries: filteredEntries,
        filename: `timetable_weekly_${selectedYear}`,
        printOptions: opts,
      });
    } else if (activeScope === 'monthly') {
      void exportTimetablePdf({
        student,
        appName: resolvedAppName,
        title: `Monthly Timetable · ${MONTHS[selectedMonth - 1]} ${selectedYear}`,
        subtitle: `Monthly Schedule (${catName})`,
        entries: filteredEntries,
        filename: `timetable_${MONTHS[selectedMonth - 1].toLowerCase()}_${selectedYear}`,
        printOptions: opts,
      });
    } else {
      void exportTimetablePdf({
        student,
        appName: resolvedAppName,
        title: `Yearly Academic Timetable & Goals (${selectedYear})`,
        subtitle: `Annual Plan (${catName})`,
        entries: filteredEntries,
        goals: yearlyGoals.filter((g) => g.year === selectedYear),
        filename: `timetable_yearly_${selectedYear}`,
        printOptions: opts,
      });
    }
  };

  const resolveEntryColor = (item: Pick<TimetableEntry, 'category' | 'subject' | 'color'>) => {
    if (item.color && /^#[0-9a-fA-F]{6}$/.test(item.color)) return item.color;
    const matchedSubj = subjects.find((s) => s.name.toLowerCase() === (item.subject || '').toLowerCase());
    return getDefaultTimetableColor(item.category, matchedSubj?.color);
  };

  const renderCategoryIcon = (
    item: Pick<TimetableEntry, 'category' | 'title' | 'subject' | 'isAiGenerated'>,
    color: string
  ) => {
    const lower = `${item.title} ${item.subject}`.toLowerCase();
    if (lower.includes('break') || lower.includes('rest') || lower.includes('lunch')) {
      return <Coffee className="w-[18px] h-[18px] shrink-0" style={{ color }} />;
    }
    if (item.category === 'school') {
      return <GraduationCap className="w-[18px] h-[18px] shrink-0" style={{ color }} />;
    }
    if (item.category === 'tuition') {
      return <Building2 className="w-[18px] h-[18px] shrink-0" style={{ color }} />;
    }
    if (item.isAiGenerated) {
      return <Sparkles className="w-[18px] h-[18px] shrink-0" style={{ color }} />;
    }
    return <BookOpen className="w-[18px] h-[18px] shrink-0" style={{ color }} />;
  };

  const openCreateModal = (
    defaults?: Partial<{ scope: TimetableScope; dayOfWeek: number; specificDate: string; month: number }>
  ) => {
    const defaultCat = activeCategory === 'all' ? 'self_study' : activeCategory;
    const defaultSubj = subjects[0]?.name || 'Mathematics';
    const subjColor = subjects.find((s) => s.name === defaultSubj)?.color;
    setEditingId(null);
    setFormCategory(defaultCat);
    setFormScope(defaults?.scope ?? activeScope);
    setFormTitle('');
    setFormSubject(defaultSubj);
    setFormTeacher('');
    setFormLocation('');
    setFormDayOfWeek(defaults?.dayOfWeek ?? 0);
    setFormMonth(defaults?.month ?? selectedMonth);
    setFormYear(selectedYear);
    setFormDate(defaults?.specificDate ?? selectedDate);
    setFormStartTime('16:00');
    setFormEndTime('17:30');
    setFormDuration(90);
    setFormNotes('');
    setFormColor(getDefaultTimetableColor(defaultCat, subjColor));
    setManualColorPicked(false);
    setShowModal(true);
  };

  const openEditModal = (entry: TimetableEntry) => {
    setEditingId(entry.id);
    setFormCategory(entry.category);
    setFormScope(entry.scope);
    setFormTitle(entry.title);
    setFormSubject(entry.subject);
    setFormTeacher(entry.teacher);
    setFormLocation(entry.location);
    setFormDayOfWeek(entry.dayOfWeek ?? 0);
    setFormMonth(entry.month ?? selectedMonth);
    setFormYear(entry.year);
    setFormDate(entry.specificDate ?? selectedDate);
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormDuration(entry.durationMinutes);
    setFormNotes(entry.notes);
    setFormColor(resolveEntryColor(entry));
    setManualColorPicked(true);
    setShowModal(true);
  };

  const handleStartTimeChange = (val: string) => {
    setFormStartTime(val);
    setFormEndTime(addMinutesToTime(val, formDuration));
  };

  const handleEndTimeChange = (val: string) => {
    setFormEndTime(val);
    setFormDuration(computeDurationMinutes(formStartTime, val));
  };

  const handleDurationChange = (mins: number) => {
    const safe = Math.max(5, Math.min(720, mins));
    setFormDuration(safe);
    setFormEndTime(addMinutesToTime(formStartTime, safe));
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        category: formCategory,
        scope: formScope,
        title: formTitle.trim(),
        subject: formSubject.trim(),
        teacher: formTeacher.trim(),
        location: formLocation.trim(),
        dayOfWeek: formScope === 'weekly' ? formDayOfWeek : null,
        month: formScope === 'monthly' || formScope === 'yearly' ? formMonth : selectedMonth,
        year: formYear,
        specificDate: formScope === 'daily' || (formScope === 'monthly' && formDate) ? formDate : null,
        startTime: formStartTime,
        endTime: formEndTime,
        durationMinutes: formDuration,
        notes: formNotes.trim(),
        color: formColor,
      };

      if (editingId) {
        await apiRequest(`/timetables/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/timetables', {
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

  const handleToggleComplete = async (entry: TimetableEntry) => {
    await apiRequest(`/timetables/${entry.id}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: !entry.completed }),
    });
    onRefresh();
  };

  const handleDeleteEntry = async (id: string) => {
    await apiRequest(`/timetables/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    setAddingSubject(true);
    try {
      await apiRequest('/subjects', {
        method: 'POST',
        body: JSON.stringify({ name: newSubjectName.trim(), color: '#4F46E5' }),
      });
      setNewSubjectName('');
      onRefresh();
    } finally {
      setAddingSubject(false);
    }
  };

  const handleAddYearlyGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    await apiRequest('/yearly-goals', {
      method: 'POST',
      body: JSON.stringify({
        year: selectedYear,
        month: goalMonth,
        title: goalTitle.trim(),
        subject: goalSubject,
        targetMetric: goalMetric.trim(),
        progressPercent: 0,
      }),
    });
    setGoalTitle('');
    setGoalMetric('');
    onRefresh();
  };

  const handleUpdateGoalProgress = async (goal: YearlyGoal, progressPercent: number) => {
    await apiRequest(`/yearly-goals/${goal.id}`, {
      method: 'PUT',
      body: JSON.stringify({ progressPercent }),
    });
    onRefresh();
  };

  const handleDeleteGoal = async (id: string) => {
    await apiRequest(`/yearly-goals/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const selectedEnteredEntries = useMemo(
    () => entries.filter((e) => selectedEntryIds.includes(e.id)),
    [entries, selectedEntryIds]
  );

  const toggleSelectedEntryId = (id: string) => {
    setSelectedEntryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openAiCreator = (mode: 'smart' | 'own') => {
    setAiModalMode(mode);
    setAiError('');
    setAiSavedSuccess(false);
    setSelectedEntryIds(entries.map((e) => e.id));
    setShowAiModal(true);
  };

  const handleGenerateAiTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiError('');
    setAiSavedSuccess(false);
    setAiGenerating(true);
    try {
      const res = await apiRequest<{
        summary: string;
        entries: Array<Omit<TimetableEntry, 'id' | 'createdAt' | 'completed' | 'isAiGenerated'>>;
      }>('/ai/generate-timetable', {
        method: 'POST',
        body: JSON.stringify({
          subjects: aiSubjects,
          availableHoursPerDay: aiHoursPerDay,
          schoolTimes: aiSchoolTimes,
          tuitionTimes: aiTuitionTimes,
          freeTimes: aiFreeTimes,
          examDates: aiExamDates,
          studyGoals: aiGoals,
          scope: aiScope,
          selectedEntries: selectedEnteredEntries.map((item) => ({
            category: item.category,
            title: item.title,
            subject: item.subject,
            dayOfWeek: item.dayOfWeek,
            startTime: item.startTime,
            endTime: item.endTime,
            teacher: item.teacher,
            location: item.location,
            color: item.color,
          })),
        }),
      });
      setAiPreviewSummary(res.summary);
      setAiPreviewEntries(res.entries);
      if (autoSaveOnCreate && res.entries.length > 0) {
        await apiRequest('/timetables/bulk', {
          method: 'POST',
          body: JSON.stringify({
            entries: res.entries.map((entry) => ({ ...entry, isAiGenerated: true })),
          }),
        });
        setAiSavedSuccess(true);
        setActiveScope(aiScope);
        onRefresh();
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate AI timetable.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleOwnAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setAiError('');
    const next: FileAttachmentPayload[] = [];
    for (const file of Array.from(files)) {
      if (ownAttachments.length + next.length >= 6) break;
      try {
        next.push(await readFileAsAttachment(file, 8 * 1024 * 1024));
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Could not read attachment.');
      }
    }
    if (next.length > 0) setOwnAttachments((prev) => [...prev, ...next]);
    e.target.value = '';
  };

  const handleGenerateOwnTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedSelected =
      selectedEnteredEntries.length > 0
        ? `Selected Timetable Entries Entered by Student:\n${selectedEnteredEntries
            .map((item) => {
              const day =
                item.specificDate ||
                (item.dayOfWeek !== null && item.dayOfWeek !== undefined ? WEEKDAYS[item.dayOfWeek] : 'Daily');
              return `- ${day} ${item.startTime}-${item.endTime} [${item.category}] ${item.title} (${item.subject || 'General'})${item.teacher ? ` - Teacher: ${item.teacher}` : ''}${item.location ? ` @ ${item.location}` : ''}`;
            })
            .join('\n')}`
        : '';

    const combinedRawText = [formattedSelected, ownRawText.trim()].filter(Boolean).join('\n\n');
    if (!combinedRawText && ownAttachments.length === 0) {
      setAiError('Please select at least one entered timetable item, enter text, or upload a picture/PDF.');
      return;
    }

    setAiError('');
    setAiSavedSuccess(false);
    setAiGenerating(true);
    try {
      const res = await apiRequest<{
        summary: string;
        entries: Array<Omit<TimetableEntry, 'id' | 'createdAt' | 'completed' | 'isAiGenerated'>>;
      }>('/ai/beautify-own-timetable', {
        method: 'POST',
        body: JSON.stringify({
          rawTimetableText: combinedRawText,
          scope: aiScope,
          language: ownLanguage,
          optimizationGoal: ownOptimizeGoal,
          attachments: ownAttachments,
        }),
      });
      setAiPreviewSummary(res.summary);
      setAiPreviewEntries(res.entries);
      if (autoSaveOnCreate && res.entries.length > 0) {
        await apiRequest('/timetables/bulk', {
          method: 'POST',
          body: JSON.stringify({
            entries: res.entries.map((entry) => ({ ...entry, isAiGenerated: true })),
          }),
        });
        setAiSavedSuccess(true);
        setActiveScope(aiScope);
        onRefresh();
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate your timetable.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveAiPreview = async () => {
    if (aiPreviewEntries.length === 0) return;
    setAiGenerating(true);
    try {
      await apiRequest('/timetables/bulk', {
        method: 'POST',
        body: JSON.stringify({
          entries: aiPreviewEntries.map((e) => ({ ...e, isAiGenerated: true })),
        }),
      });
      setShowAiModal(false);
      setAiPreviewEntries([]);
      setAiSavedSuccess(false);
      setActiveScope(aiScope);
      onRefresh();
    } finally {
      setAiGenerating(false);
    }
  };

  const handleExportAiPreviewPdf = () => {
    if (aiPreviewEntries.length === 0) return;
    const resolvedAppName = siteSettings?.appName || 'Student Time Management System';
    void exportTimetablePdf({
      student,
      appName: resolvedAppName,
      title:
        aiModalMode === 'own'
          ? `AI PERSONALIZED CUSTOM TIMETABLE (OFFICIAL)`
          : `AI SMART BALANCED TIMETABLE (OFFICIAL)`,
      subtitle: aiPreviewSummary || `Generated by ${resolvedAppName}`,
      entries: aiPreviewEntries.map((e) => ({ ...e, isAiGenerated: true })),
      filename: aiModalMode === 'own' ? `my_own_ai_timetable_${aiScope}` : `ai_smart_timetable_${aiScope}`,
      printOptions,
      aiEnhanced: true,
    });
  };

  // Unique sorted time slots for Weekly Time-Grid Matrix view
  const weeklyTimeSlots = useMemo(() => {
    const set = new Set<string>();
    for (const e of filteredEntries) {
      set.add(`${e.startTime}–${e.endTime}`);
    }
    return Array.from(set).sort();
  }, [filteredEntries]);

  return (
    <div className="space-y-6">
      {/* Top Toolbar: 4 Timetable Scopes + PDF Export + AI Smart Timetable + Add */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
            {enabledScopes.map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setActiveScope(scope)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg capitalize transition-colors whitespace-nowrap cursor-pointer ${
                  activeScope === scope
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(lang, `tt_${scope}` as 'tt_daily')}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer print:hidden"
            >
              <Printer className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              Print
            </button>
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer print:hidden"
            >
              <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              {t(lang, 'tt_export_pdf')}
            </button>
            {(siteSettings?.aiOwnTimetableEnabled ?? true) && (
              <button
                type="button"
                onClick={() => openAiCreator('own')}
                className="px-3.5 py-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Wand2 className="w-4 h-4" />
                {t(lang, 'tt_ai_own')}
              </button>
            )}
            {(siteSettings?.aiTimetableEnabled ?? true) && (
              <button
                type="button"
                onClick={() => openAiCreator('smart')}
                className="px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {t(lang, 'tt_ai_smart')}
              </button>
            )}
            <button
              type="button"
              onClick={() => openCreateModal()}
              className={`px-4 py-2 rounded-xl ${theme.primaryBg} ${theme.primaryHover} text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer`}
            >
              <Plus className="w-4 h-4" />
              {t(lang, 'tt_add_activity')}
            </button>
          </div>
        </div>

        {/* 3 Main Study Timetable Categories + Custom Subject Quick-Add */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                activeCategory === 'all'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {t(lang, 'tt_all_categories')}
            </button>
            {enabledCategories.map((catId) => (
              <button
                key={catId}
                type="button"
                onClick={() => setActiveCategory(catId)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  activeCategory === catId
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t(lang, `tt_${catId}` as 'tt_school')}
              </button>
            ))}
          </div>

          <form onSubmit={handleAddSubject} className="flex items-center gap-2">
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Add custom subject..."
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={addingSubject || !newSubjectName.trim()}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Add Subject
            </button>
          </form>
        </div>
      </div>

      {/* Time Management Allocation Summary Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Planned Time</div>
          <div className="font-mono text-lg font-bold tabular-nums mt-0.5">{formatMinutes(timeMetrics.total)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">School Hours</div>
          <div className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums mt-0.5">
            {formatMinutes(timeMetrics.school)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Tuition Hours</div>
          <div className="font-mono text-lg font-bold text-violet-600 dark:text-violet-400 tabular-nums mt-0.5">
            {formatMinutes(timeMetrics.tuition)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Self Study</div>
          <div className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums mt-0.5">
            {formatMinutes(timeMetrics.selfStudy)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {activeScope === 'daily' ? 'Unscheduled (24h)' : 'Completed'}
          </div>
          <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
            {activeScope === 'daily' ? formatMinutes(timeMetrics.dailyFree) : formatMinutes(timeMetrics.completed)}
          </div>
        </div>
      </section>

      {timeMetrics.overlapCount > 0 && (
        <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Schedule overlap detected ({timeMetrics.overlapCount} time conflict{timeMetrics.overlapCount === 1 ? '' : 's'}). Review start/end times to keep your schedule balanced.
          </span>
        </div>
      )}

      {/* 1. DAILY 24-HOUR TIME MANAGEMENT PLANNER — Official Sheet + Clean Sectioned List */}
      {activeScope === 'daily' && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Daily 24-Hour Time Planner
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedDate} · {filteredEntries.filter((e) => e.completed).length} of {filteredEntries.length} completed
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl print:hidden">
                <button
                  type="button"
                  onClick={() => setDailyLayout('official')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                    dailyLayout === 'official'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Official Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setDailyLayout('list')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                    dailyLayout === 'list'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Clean List
                </button>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          {dailyLayout === 'official' ? (
            <OfficialTimetableSheet
              student={student}
              appName={siteSettings?.appName}
              title={`DAILY CLASS & STUDY TIMETABLE (${selectedDate})`}
              entries={filteredEntries}
              subjects={subjects}
              mode="daily"
              colorMode={printOptions.colorMode}
              onToggleComplete={handleToggleComplete}
              onEdit={openEditModal}
              onDelete={handleDeleteEntry}
              onStartFocusTimer={onStartFocusTimer}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {filteredEntries.length === 0 ? (
                <div className="py-12 text-center px-6">
                  <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">No activities scheduled for {selectedDate}.</p>
                  <button
                    type="button"
                    onClick={() => openCreateModal({ scope: 'daily', specificDate: selectedDate })}
                    className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Schedule Time Block
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(
                    [
                      { key: 'school', label: 'SCHOOL TIMETABLE' },
                      { key: 'tuition', label: 'TUITION & CLASSES' },
                      { key: 'self_study', label: 'SELF STUDY & REVISION' },
                    ] as const
                  ).map((section) => {
                    const sectionItems = filteredEntries
                      .filter((e) => e.category === section.key)
                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                    if (sectionItems.length === 0) return null;

                    return (
                      <div key={section.key} className="py-3">
                        <div className="px-6 py-2 text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 flex items-center justify-between">
                          <span>{section.label}</span>
                          <span className="font-mono font-medium">
                            {sectionItems.length} · {formatMinutes(sectionItems.reduce((s, x) => s + x.durationMinutes, 0))}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100/70 dark:divide-slate-800/60">
                          {sectionItems.map((item) => {
                            const itemColor = resolveEntryColor(item);
                            return (
                              <div
                                key={item.id}
                                style={
                                  item.isAiGenerated && !item.completed
                                    ? { backgroundColor: `${itemColor}0B` }
                                    : undefined
                                }
                                className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                              >
                                <div className="flex items-center gap-3.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleComplete(item)}
                                    className="shrink-0 cursor-pointer"
                                    aria-label={item.completed ? 'Mark pending' : 'Mark completed'}
                                  >
                                    {item.completed ? (
                                      <CheckCircle2 className="w-[18px] h-[18px] text-emerald-500" />
                                    ) : item.isAiGenerated ? (
                                      <span
                                        className="w-8 h-8 rounded-xl flex items-center justify-center shadow-xs"
                                        style={{ backgroundColor: `${itemColor}1D` }}
                                      >
                                        {renderCategoryIcon(item, itemColor)}
                                      </span>
                                    ) : (
                                      renderCategoryIcon(item, itemColor)
                                    )}
                                  </button>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className={`text-sm font-semibold ${
                                          item.completed
                                            ? 'line-through text-slate-400'
                                            : 'text-slate-800 dark:text-slate-100'
                                        }`}
                                      >
                                        {item.title}
                                      </span>
                                      {item.isAiGenerated && (
                                        <span
                                          className="text-[10px] font-bold tracking-wide uppercase"
                                          style={{ color: itemColor }}
                                        >
                                          · AI Plan
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                      {item.subject || 'General'}
                                      {item.teacher ? ` · ${item.teacher}` : ''}
                                      {item.location ? ` · ${item.location}` : ''}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-8 sm:pl-0">
                                  <div className="text-left sm:text-right">
                                    <div
                                      className="font-mono text-xs font-bold tabular-nums"
                                      style={{ color: item.completed ? '#94A3B8' : itemColor }}
                                    >
                                      {item.startTime} – {item.endTime}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      {formatMinutes(item.durationMinutes)}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {onStartFocusTimer && !item.completed && (
                                      <button
                                        type="button"
                                        onClick={() => onStartFocusTimer(item.subject || item.title, item.durationMinutes)}
                                        className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1 hover:bg-indigo-100 cursor-pointer whitespace-nowrap"
                                      >
                                        <Play className="w-3 h-3" />
                                        Start
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(item)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                      aria-label="Edit activity"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEntry(item.id)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                      aria-label="Delete activity"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 2. WEEKLY TIMETABLE (OFFICIAL BILINGUAL SHEET, CLEAN LIST, DAY COLUMNS, OR 24H TIME MATRIX) */}
      {activeScope === 'weekly' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-bold">Monday – Sunday Weekly Schedule</h2>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl print:hidden">
              <button
                type="button"
                onClick={() => setWeeklyLayout('official')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                  weeklyLayout === 'official'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Official Sheet
              </button>
              <button
                type="button"
                onClick={() => setWeeklyLayout('list')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                  weeklyLayout === 'list'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Clean List
              </button>
              <button
                type="button"
                onClick={() => setWeeklyLayout('columns')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                  weeklyLayout === 'columns'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Day Columns
              </button>
              <button
                type="button"
                onClick={() => setWeeklyLayout('matrix')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                  weeklyLayout === 'matrix'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Time Grid Matrix
              </button>
            </div>
          </div>

          {weeklyLayout === 'official' ? (
            <OfficialTimetableSheet
              student={student}
              appName={siteSettings?.appName}
              title="PHYSICAL & STUDY CLASS TIMETABLE (OFFICIAL)"
              entries={filteredEntries}
              subjects={subjects}
              mode="weekly"
              colorMode={printOptions.colorMode}
              onToggleComplete={handleToggleComplete}
              onEdit={openEditModal}
              onDelete={handleDeleteEntry}
              onAddDay={(idx) => openCreateModal({ scope: 'weekly', dayOfWeek: idx })}
              onStartFocusTimer={onStartFocusTimer}
            />
          ) : weeklyLayout === 'list' ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {filteredEntries.length === 0 ? (
                <div className="py-12 text-center px-6">
                  <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No weekly classes or study blocks yet. Add an entry or generate with AI.
                  </p>
                </div>
              ) : (
                WEEKDAYS.map((dayName, idx) => {
                  const dayEntries = filteredEntries
                    .filter((e) => e.dayOfWeek === idx)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                  if (dayEntries.length === 0) return null;
                  const dayMins = dayEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
                  const hasAiInDay = dayEntries.some((d) => d.isAiGenerated);
                  return (
                    <div key={dayName} className="py-2.5">
                      <div className="px-6 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
                            {dayName}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            · {dayEntries.length} items · {formatMinutes(dayMins)}
                          </span>
                          {hasAiInDay && (
                            <span className="text-[10px] font-semibold text-indigo-500 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              AI Enhanced
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => openCreateModal({ scope: 'weekly', dayOfWeek: idx })}
                          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100/70 dark:divide-slate-800/60">
                        {dayEntries.map((item) => {
                          const itemColor = resolveEntryColor(item);
                          return (
                            <div
                              key={item.id}
                              style={item.isAiGenerated ? { backgroundColor: `${itemColor}0B` } : undefined}
                              className="px-6 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                {item.isAiGenerated ? (
                                  <span
                                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                                    style={{ backgroundColor: `${itemColor}1D` }}
                                  >
                                    {renderCategoryIcon(item, itemColor)}
                                  </span>
                                ) : (
                                  renderCategoryIcon(item, itemColor)
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                      {item.title}
                                    </span>
                                    {item.isAiGenerated && (
                                      <span
                                        className="text-[10px] font-bold uppercase tracking-wide"
                                        style={{ color: itemColor }}
                                      >
                                        · AI
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {item.subject || item.category.replace('_', ' ')}
                                    {item.teacher ? ` · ${item.teacher}` : ''}
                                    {item.location ? ` · ${item.location}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                  <div
                                    className="font-mono text-xs font-bold tabular-nums"
                                    style={{ color: itemColor }}
                                  >
                                    {item.startTime} – {item.endTime}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {formatMinutes(item.durationMinutes)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(item)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                    aria-label="Edit"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEntry(item.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                    aria-label="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : weeklyLayout === 'columns' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
              {WEEKDAYS.map((dayName, idx) => {
                const dayEntries = filteredEntries
                  .filter((e) => e.dayOfWeek === idx)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                const dayMins = dayEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
                return (
                  <div
                    key={dayName}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between min-h-[280px]"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <h3 className="font-display text-sm font-bold">{WEEKDAYS_SHORT[idx]}</h3>
                          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                            {dayEntries.length} items · {formatMinutes(dayMins)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openCreateModal({ scope: 'weekly', dayOfWeek: idx })}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                          aria-label={`Add activity on ${dayName}`}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {dayEntries.length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">No entries</p>
                        ) : (
                          dayEntries.map((item) => {
                            const itemColor = resolveEntryColor(item);
                            return (
                              <div
                                key={item.id}
                                style={{
                                  backgroundColor: `${itemColor}14`,
                                  borderColor: `${itemColor}45`,
                                }}
                                className="p-2.5 rounded-xl border space-y-1"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className="font-mono text-[11px] font-bold tabular-nums flex items-center gap-1.5"
                                    style={{ color: itemColor }}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: itemColor }}
                                    />
                                    {item.startTime}–{item.endTime}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(item)}
                                      className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                                      aria-label="Edit"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEntry(item.id)}
                                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                      aria-label="Delete"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <p className="text-xs font-semibold leading-snug">{item.title}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {item.subject || item.category.replace('_', ' ')} · {formatMinutes(item.durationMinutes)}
                                </p>
                                {(item.teacher || item.location) && (
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {[item.teacher, item.location].filter(Boolean).join(' · ')}
                                  </p>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[780px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold">
                    <th className="p-3 w-28">24h Time</th>
                    {WEEKDAYS_SHORT.map((d) => (
                      <th key={d} className="p-3">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {weeklyTimeSlots.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400">
                        No weekly classes or study blocks yet. Add an entry or generate with AI.
                      </td>
                    </tr>
                  ) : (
                    weeklyTimeSlots.map((slot) => {
                      const [st, en] = slot.split('–');
                      return (
                        <tr key={slot}>
                          <td className="p-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums align-top">
                            {slot}
                          </td>
                          {WEEKDAYS_SHORT.map((_, dIdx) => {
                            const matches = filteredEntries.filter(
                              (e) => e.dayOfWeek === dIdx && e.startTime === st && e.endTime === en
                            );
                            return (
                              <td key={dIdx} className="p-2 align-top">
                                {matches.map((m) => {
                                  const mColor = resolveEntryColor(m);
                                  return (
                                    <div
                                      key={m.id}
                                      onClick={() => openEditModal(m)}
                                      style={{
                                        backgroundColor: `${mColor}18`,
                                        borderColor: `${mColor}45`,
                                      }}
                                      className="p-2 rounded-lg border cursor-pointer hover:opacity-90 mb-1"
                                    >
                                      <div className="font-semibold truncate flex items-center gap-1.5">
                                        <span
                                          className="w-2 h-2 rounded-full shrink-0"
                                          style={{ backgroundColor: mColor }}
                                        />
                                        <span className="truncate">{m.title}</span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate pl-3.5">
                                        {m.subject} · {m.category.replace('_', ' ')}
                                      </div>
                                    </div>
                                  );
                                })}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 3. MONTHLY TIMETABLE (2-PANE CALENDAR + SELECTED DAY PLANNER) */}
      {activeScope === 'monthly' && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold">
                  Monthly Timetable · {MONTHS[selectedMonth - 1]} {selectedYear}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Switch across all 12 months and click any day to manage its 24-hour timetable
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {MONTHS.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={2020}
                  max={2035}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-24 px-3 py-2 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
              {Array.from({ length: daysInSelectedMonth }, (_, i) => {
                const dayNum = i + 1;
                const dateKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayItems = filteredEntries.filter((e) => e.specificDate === dateKey);
                const isSelected = selectedDate === dateKey;
                return (
                  <div
                    key={dateKey}
                    onClick={() => setSelectedDate(dateKey)}
                    className={`p-3 rounded-xl border min-h-[104px] flex flex-col justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-xs font-bold tabular-nums">{dayNum}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCreateModal({ scope: 'monthly', specificDate: dateKey, month: selectedMonth });
                          }}
                          className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                          aria-label={`Add on ${dateKey}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {dayItems.slice(0, 2).map((it) => {
                          const itColor = resolveEntryColor(it);
                          return (
                            <div
                              key={it.id}
                              style={{
                                backgroundColor: `${itColor}1A`,
                                borderColor: `${itColor}45`,
                                color: itColor,
                              }}
                              className="text-[11px] px-1.5 py-0.5 rounded border truncate font-semibold flex items-center gap-1"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: itColor }}
                              />
                              <span className="truncate">{it.startTime} {it.title}</span>
                            </div>
                          );
                        })}
                        {dayItems.length > 2 && (
                          <div className="text-[10px] text-slate-400 font-medium">+{dayItems.length - 2} more</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Day Schedule Inspector */}
          <aside className="xl:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">{selectedDate}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedMonthDayEntries.length} scheduled items
                </p>
              </div>
              <button
                type="button"
                onClick={() => openCreateModal({ scope: 'monthly', specificDate: selectedDate, month: selectedMonth })}
                className={`px-3 py-1.5 rounded-xl ${theme.primaryBg} text-white text-xs font-semibold cursor-pointer`}
              >
                + Add
              </button>
            </div>

            {selectedMonthDayEntries.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                Select any date to inspect or add study blocks for that day.
              </p>
            ) : (
              <div className="space-y-2.5">
                {selectedMonthDayEntries.map((item) => {
                  const itemColor = resolveEntryColor(item);
                  return (
                    <div
                      key={item.id}
                      style={{
                        backgroundColor: `${itemColor}14`,
                        borderColor: `${itemColor}45`,
                      }}
                      className="p-3 rounded-xl border flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div
                          className="font-mono text-[11px] font-bold tabular-nums flex items-center gap-1.5"
                          style={{ color: itemColor }}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: itemColor }} />
                          {item.startTime} – {item.endTime} ({formatMinutes(item.durationMinutes)})
                        </div>
                        <p className="text-xs font-semibold truncate mt-0.5">{item.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.subject} · {item.category.replace('_', ' ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </section>
      )}

      {/* 4. YEARLY TIMETABLE & GOALS */}
      {activeScope === 'yearly' && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold">Yearly Academic Roadmap ({selectedYear})</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Organize study plans month-by-month, set yearly academic goals, and track progress
                </p>
              </div>
              <input
                type="number"
                min={2020}
                max={2035}
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-24 px-3 py-2 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <form
              onSubmit={handleAddYearlyGoal}
              className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800"
            >
              <input
                type="text"
                required
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder="Yearly academic goal (e.g. Master Calculus Unit 1-4)"
                className="sm:col-span-2 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <select
                value={goalMonth}
                onChange={(e) => setGoalMonth(Number(e.target.value))}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value={0}>Full Year Goal</option>
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={goalSubject}
                onChange={(e) => setGoalSubject(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className={`px-4 py-2 rounded-xl ${theme.primaryBg} text-white text-xs font-semibold cursor-pointer`}
              >
                Add Goal
              </button>
            </form>

            {yearlyGoals.filter((g) => g.year === selectedYear).length > 0 && (
              <div className="space-y-3 pt-2">
                {yearlyGoals
                  .filter((g) => g.year === selectedYear)
                  .map((g) => (
                    <div
                      key={g.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-indigo-500 shrink-0" />
                          <p className="text-sm font-semibold truncate">{g.title}</p>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {g.month === 0 ? 'Full Year' : MONTHS[g.month - 1]} · {g.subject}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={g.progressPercent}
                          onChange={(e) => handleUpdateGoalProgress(g, Number(e.target.value))}
                          className="w-28 accent-indigo-600"
                        />
                        <span className="font-mono text-xs font-bold tabular-nums w-10 text-right">
                          {g.progressPercent}%
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteGoal(g.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                          aria-label="Delete goal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MONTHS.map((mName, idx) => {
              const mNum = idx + 1;
              const mEntries = entries.filter(
                (e) =>
                  e.year === selectedYear &&
                  (e.month === mNum ||
                    (e.specificDate &&
                      e.specificDate.startsWith(`${selectedYear}-${String(mNum).padStart(2, '0')}`)))
              );
              const mMins = mEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
              const mGoals = yearlyGoals.filter((g) => g.year === selectedYear && g.month === mNum);
              return (
                <div
                  key={mName}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-display text-sm font-bold">{mName}</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMonth(mNum);
                          setActiveScope('monthly');
                        }}
                        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Open
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {mEntries.length} sessions ({formatMinutes(mMins)}) · {mGoals.length} goals
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openCreateModal({
                        scope: 'monthly',
                        month: mNum,
                        specificDate: `${selectedYear}-${String(mNum).padStart(2, '0')}-01`,
                      })
                    }
                    className="mt-4 w-full py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    + Plan {mName}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Add/Edit Timetable Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">
                {editingId ? 'Edit Timetable Activity' : 'Add Timetable Activity'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Timetable Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as TimetableCategory)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="school">School Timetable</option>
                    <option value="tuition">Tuition / Class</option>
                    <option value="self_study">Self Study</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Timetable Scope
                  </label>
                  <select
                    value={formScope}
                    onChange={(e) => setFormScope(e.target.value as TimetableScope)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Title / Activity Name
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Algebra Practice, Physics Tuition, Lunch Break"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Subject
                  </label>
                  <select
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                    <option value="Break / Rest">Break / Rest</option>
                    <option value="School Activity">School Activity</option>
                  </select>
                </div>

                {formScope === 'weekly' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Day of Week
                    </label>
                    <select
                      value={formDayOfWeek}
                      onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      {WEEKDAYS.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Specific Date
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                )}
              </div>

              {(formCategory === 'school' || formCategory === 'tuition') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Teacher Name
                    </label>
                    <input
                      type="text"
                      value={formTeacher}
                      onChange={(e) => setFormTeacher(e.target.value)}
                      placeholder="e.g. Mr. Silva"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Classroom / Location
                    </label>
                    <input
                      type="text"
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      placeholder="e.g. Hall B / Room 204"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Start (24h)
                  </label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    End (24h)
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => handleEndTimeChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={720}
                    value={formDuration}
                    onChange={(e) => handleDurationChange(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                  {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => handleDurationChange(p.minutes)}
                    className={`px-2.5 py-1 text-xs rounded-lg border cursor-pointer ${
                      formDuration === p.minutes
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  <Palette className="w-3.5 h-3.5 text-indigo-500" />
                  Block Color
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {SCHEDULE_COLOR_PALETTE.map((c) => {
                    const selected = formColor.toLowerCase() === c.hex.toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.name}
                        onClick={() => {
                          setFormColor(c.hex);
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

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-5 py-2 rounded-xl ${theme.primaryBg} text-white text-sm font-semibold cursor-pointer disabled:opacity-60`}
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add to Timetable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI-Powered Smart Timetable & AI Generate My Own Time Table Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {aiModalMode === 'own' ? (
                  <Wand2 className="w-5 h-5 text-violet-500" />
                ) : (
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                )}
                <h3 className="font-display text-lg font-bold">
                  {aiModalMode === 'own' ? 'AI Generate My Own Time Table' : 'AI Smart Timetable Generator'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Switch between AI Generate My Own Time Table and AI Smart Timetable */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {(siteSettings?.aiOwnTimetableEnabled ?? true) && (
                <button
                  type="button"
                  onClick={() => {
                    setAiModalMode('own');
                    setAiError('');
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
                    aiModalMode === 'own'
                      ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  AI Generate My Own Time Table
                </button>
              )}
              {(siteSettings?.aiTimetableEnabled ?? true) && (
                <button
                  type="button"
                  onClick={() => {
                    setAiModalMode('smart');
                    setAiError('');
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
                    aiModalMode === 'smart'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Smart Planner (Auto)
                </button>
              )}
            </div>

            {aiError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                {aiError}
              </div>
            )}

            {/* Shared Step 1: Select From Entered Timetable Items + PDF Page/Color Options */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Select From Your Entered Timetable Items ({selectedEntryIds.length}/{entries.length} selected)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tick the classes or study blocks you entered to include them when creating your AI timetable
                  </div>
                </div>
                {entries.length > 0 && (
                  <div className="flex items-center gap-2 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setSelectedEntryIds(entries.map((e) => e.id))}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedEntryIds([])}
                      className="text-slate-500 hover:text-rose-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {entries.length === 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 py-2">
                  You haven&apos;t added timetable entries yet — enter your classes/notes below or upload a photo to generate from scratch.
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                  {entries.map((entry) => {
                    const checked = selectedEntryIds.includes(entry.id);
                    const dotColor = resolveEntryColor(entry);
                    const dayText =
                      entry.specificDate ||
                      (entry.dayOfWeek !== null && entry.dayOfWeek !== undefined
                        ? WEEKDAYS_SHORT[entry.dayOfWeek]
                        : 'Daily');
                    return (
                      <label
                        key={entry.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'border-indigo-400 bg-white dark:bg-slate-900 shadow-xs'
                            : 'border-slate-200/70 dark:border-slate-700/70 bg-transparent opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelectedEntryId(entry.id)}
                          className="accent-indigo-600 rounded"
                        />
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate">{entry.title}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">
                            {dayText} · {entry.startTime}–{entry.endTime} · {entry.subject || entry.category}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

                  <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/70 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          PDF Page Size
                        </label>
                        <select
                          value={printOptions.pageSize}
                          onChange={(e) =>
                            setPrintOptions((prev) => ({ ...prev, pageSize: e.target.value as PdfPageSize }))
                          }
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="a4">A4 (Standard)</option>
                          <option value="a3">A3 (Large Chart)</option>
                          <option value="a5">A5 (Compact)</option>
                          <option value="letter">US Letter</option>
                          <option value="legal">US Legal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Orientation
                        </label>
                        <select
                          value={printOptions.orientation}
                          onChange={(e) =>
                            setPrintOptions((prev) => ({ ...prev, orientation: e.target.value as PdfOrientation }))
                          }
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="landscape">Landscape (Wide)</option>
                          <option value="portrait">Portrait (Tall)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Color Mode
                        </label>
                        <select
                          value={printOptions.colorMode}
                          onChange={(e) =>
                            setPrintOptions((prev) => ({ ...prev, colorMode: e.target.value as PdfColorMode }))
                          }
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="color">Full Color</option>
                          <option value="bw">Black &amp; White</option>
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={autoSaveOnCreate}
                        onChange={(e) => setAutoSaveOnCreate(e.target.checked)}
                        className="accent-emerald-600 rounded"
                      />
                      <span>Automatically create &amp; save to my timetable immediately when I click Create</span>
                    </label>
                  </div>
                </div>

                {aiModalMode === 'own' ? (
                  <form onSubmit={handleGenerateOwnTimetable} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        {lang === 'si'
                          ? 'ඔබේ කාලසටහන මෙහි ලියන්න හෝ Paste කරන්න (පාසල, ටියුෂන්, පාඩම් වේලාවන්):'
                          : 'Enter or paste your own rough timetable (classes, times, subjects, breaks):'}
                      </label>
                      <textarea
                        rows={4}
                        value={ownRawText}
                        onChange={(e) => setOwnRawText(e.target.value)}
                        placeholder={`Example:\nMon: 07:30-13:30 School, 16:00-18:00 Maths Tuition (Mr. Silva), 19:00-20:30 Science revision\nTue: 15:30-17:30 English class, 18:30-20:00 ICT practice\nSat: 09:00-11:30 Past Papers, 14:00-16:00 History`}
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>

                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {lang === 'si'
                            ? 'හෝ ඔබේ කාලසටහනේ පින්තූරයක් / PDF එකක් එක් කරන්න:'
                            : 'Or upload a picture / PDF of your handwritten or school timetable:'}
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                            <ImagePlus className="w-3.5 h-3.5" />
                            Picture
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleOwnAttachmentUpload}
                              className="sr-only"
                            />
                          </label>
                          <label className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                            <FileUp className="w-3.5 h-3.5" />
                            PDF / Doc
                            <input
                              type="file"
                              accept=".pdf,.txt,.md,.csv"
                              multiple
                              onChange={handleOwnAttachmentUpload}
                              className="sr-only"
                            />
                          </label>
                        </div>
                      </div>

                      {ownAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {ownAttachments.map((att, idx) => (
                            <div
                              key={`${att.name}-${idx}`}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px]"
                            >
                              <span className="truncate max-w-[140px]">{att.name}</span>
                              <button
                                type="button"
                                onClick={() => setOwnAttachments((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Timetable Scope
                        </label>
                        <select
                          value={aiScope}
                          onChange={(e) => setAiScope(e.target.value as 'weekly' | 'daily')}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        >
                          <option value="weekly">Weekly Timetable (Mon–Sun)</option>
                          <option value="daily">Daily Timetable (24h)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Output Language
                        </label>
                        <select
                          value={ownLanguage}
                          onChange={(e) => setOwnLanguage(e.target.value as 'English' | 'Sinhala')}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        >
                          <option value="English">English</option>
                          <option value="Sinhala">Sinhala (සිංහල)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        AI Beautify &amp; Polish Instructions
                      </label>
                      <input
                        type="text"
                        value={ownOptimizeGoal}
                        onChange={(e) => setOwnOptimizeGoal(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={aiGenerating}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Wand2 className="w-4 h-4" />
                      {aiGenerating ? 'Creating Your Timetable...' : 'Create Timetable with AI'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleGenerateAiTimetable} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        Select Subjects to Schedule
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {subjects.map((s) => {
                          const active = aiSubjects.includes(s.name);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() =>
                                setAiSubjects((prev) =>
                                  active ? prev.filter((x) => x !== s.name) : [...prev, s.name]
                                )
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                                active
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Available Self-Study Hours / Day
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={aiHoursPerDay}
                          onChange={(e) => setAiHoursPerDay(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Timetable Scope
                        </label>
                        <select
                          value={aiScope}
                          onChange={(e) => setAiScope(e.target.value as 'weekly' | 'daily')}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        >
                          <option value="weekly">Full Weekly Plan (Mon–Sun)</option>
                          <option value="daily">Today&apos;s Daily Plan</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          School Times
                        </label>
                        <input
                          type="text"
                          value={aiSchoolTimes}
                          onChange={(e) => setAiSchoolTimes(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Tuition Class Times
                        </label>
                        <input
                          type="text"
                          value={aiTuitionTimes}
                          onChange={(e) => setAiTuitionTimes(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Preferred Free / Study Windows
                        </label>
                        <input
                          type="text"
                          value={aiFreeTimes}
                          onChange={(e) => setAiFreeTimes(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Upcoming Exam Dates
                        </label>
                        <input
                          type="text"
                          value={aiExamDates}
                          onChange={(e) => setAiExamDates(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Study Goals &amp; Priorities
                      </label>
                      <input
                        type="text"
                        value={aiGoals}
                        onChange={(e) => setAiGoals(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={aiGenerating}
                      className={`w-full py-2.5 rounded-xl ${theme.primaryBg} text-white text-sm font-semibold cursor-pointer disabled:opacity-60`}
                    >
                      {aiGenerating ? 'Creating Balanced Timetable...' : 'Create Personalized Timetable'}
                    </button>
                  </form>
                )}

                {aiPreviewEntries.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    {aiSavedSuccess && (
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          Created and saved {aiPreviewEntries.length} sessions directly to your timetable!
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAiModal(false)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer shrink-0"
                        >
                          View Timetable
                        </button>
                      </div>
                    )}

                    {/* Extra-Beautiful AI Showcase Banner */}
                    <div className="rounded-2xl border border-indigo-200/70 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/90 via-violet-50/70 to-sky-50/90 dark:from-indigo-950/40 dark:via-violet-950/35 dark:to-sky-950/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                          <Sparkles className="w-4 h-4 shrink-0" />
                          <h4 className="font-display text-sm font-bold">
                            AI Styled Official Timetable ({aiPreviewEntries.length} sessions ·{' '}
                            {formatMinutes(aiPreviewEntries.reduce((s, x) => s + x.durationMinutes, 0))})
                          </h4>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {aiPreviewSummary}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-indigo-200/60 dark:border-indigo-800/60">
                          <button
                            type="button"
                            onClick={() => setAiPreviewLayout('official')}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg cursor-pointer ${
                              aiPreviewLayout === 'official'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            Official Sheet
                          </button>
                          <button
                            type="button"
                            onClick={() => setAiPreviewLayout('edit')}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg cursor-pointer ${
                              aiPreviewLayout === 'edit'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            Quick Edit
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleExportAiPreviewPdf}
                          className="px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-xs font-semibold flex items-center gap-1.5 hover:bg-indigo-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          Download PDF ({printOptions.pageSize.toUpperCase()} · {printOptions.colorMode === 'bw' ? 'B&W' : 'Color'})
                        </button>
                        {!aiSavedSuccess ? (
                          <button
                            type="button"
                            onClick={handleSaveAiPreview}
                            disabled={aiGenerating}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            Save to Timetable
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowAiModal(false)}
                            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                          >
                            Done
                          </button>
                        )}
                      </div>
                    </div>

                    {aiPreviewLayout === 'official' ? (
                      <div className="max-h-[420px] overflow-y-auto rounded-2xl">
                        <OfficialTimetableSheet
                          student={student}
                          appName={siteSettings?.appName}
                          title={
                            aiModalMode === 'own'
                              ? 'AI PERSONALIZED CUSTOM TIMETABLE (OFFICIAL)'
                              : 'AI SMART BALANCED TIMETABLE (OFFICIAL)'
                          }
                          aiSummary={aiPreviewSummary}
                          entries={aiPreviewEntries.map((item, origIdx) => ({
                            ...item,
                            isAiGenerated: true,
                            _origIdx: origIdx,
                          }))}
                          subjects={subjects}
                          mode={aiScope}
                          colorMode={printOptions.colorMode}
                          aiEnhanced
                          onCyclePreviewColor={(origIdx, nextHex) =>
                            setAiPreviewEntries((prev) =>
                              prev.map((row, i) => (i === origIdx ? { ...row, color: nextHex } : row))
                            )
                          }
                          onRemovePreviewItem={(origIdx) =>
                            setAiPreviewEntries((prev) => prev.filter((_, i) => i !== origIdx))
                          }
                        />
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                        {(aiScope === 'weekly' ? WEEKDAYS.map((_, i) => i) : [null]).map((dayKey) => {
                          const groupItems = aiPreviewEntries
                            .map((item, origIdx) => ({ item, origIdx }))
                            .filter(({ item }) =>
                              aiScope === 'weekly' ? (item.dayOfWeek ?? 0) === dayKey : true
                            )
                            .sort((a, b) => a.item.startTime.localeCompare(b.item.startTime));

                          if (groupItems.length === 0) return null;

                          const sectionTitle =
                            dayKey === null ? 'DAILY AI TIMETABLE' : WEEKDAYS[dayKey].toUpperCase();

                          return (
                            <div key={String(dayKey)} className="py-2">
                              <div className="px-4 py-1.5 text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 flex items-center justify-between">
                                <span>{sectionTitle}</span>
                                <span className="font-mono font-medium">
                                  {groupItems.length} ·{' '}
                                  {formatMinutes(groupItems.reduce((s, x) => s + x.item.durationMinutes, 0))}
                                </span>
                              </div>
                              <div className="divide-y divide-slate-100/70 dark:divide-slate-800/60">
                                {groupItems.map(({ item, origIdx }) => {
                                  const previewColor = item.color || getDefaultTimetableColor(item.category);
                                  return (
                                    <div
                                      key={origIdx}
                                      style={{ backgroundColor: `${previewColor}0D` }}
                                      className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                    >
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <button
                                          type="button"
                                          title="Click to cycle beautiful color"
                                          onClick={() => {
                                            const currIdx = SCHEDULE_COLOR_PALETTE.findIndex(
                                              (c) => c.hex.toLowerCase() === previewColor.toLowerCase()
                                            );
                                            const nextHex =
                                              SCHEDULE_COLOR_PALETTE[(currIdx + 1) % SCHEDULE_COLOR_PALETTE.length].hex;
                                            setAiPreviewEntries((prev) =>
                                              prev.map((row, i) => (i === origIdx ? { ...row, color: nextHex } : row))
                                            );
                                          }}
                                          style={{ backgroundColor: `${previewColor}22` }}
                                          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition-transform"
                                          aria-label="Change session color"
                                        >
                                          {renderCategoryIcon({ ...item, isAiGenerated: true }, previewColor)}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                          <input
                                            type="text"
                                            value={item.title}
                                            onChange={(e) =>
                                              setAiPreviewEntries((prev) =>
                                                prev.map((row, i) =>
                                                  i === origIdx ? { ...row, title: e.target.value } : row
                                                )
                                              )
                                            }
                                            className="px-1.5 py-0.5 text-xs font-semibold rounded bg-transparent hover:bg-white/80 dark:hover:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-transparent focus:border-slate-300 dark:focus:border-slate-700 w-full focus:outline-none"
                                          />
                                          <div className="text-[11px] text-slate-500 dark:text-slate-400 px-1.5 truncate">
                                            {item.subject || item.category.replace('_', ' ')}
                                            {item.notes ? ` · ${item.notes}` : ''}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0 text-xs font-mono pl-11 sm:pl-0">
                                        <input
                                          type="time"
                                          value={item.startTime}
                                          onChange={(e) =>
                                            setAiPreviewEntries((prev) =>
                                              prev.map((row, i) =>
                                                i === origIdx ? { ...row, startTime: e.target.value } : row
                                              )
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                        />
                                        <span style={{ color: previewColor }}>–</span>
                                        <input
                                          type="time"
                                          value={item.endTime}
                                          onChange={(e) =>
                                            setAiPreviewEntries((prev) =>
                                              prev.map((row, i) =>
                                                i === origIdx ? { ...row, endTime: e.target.value } : row
                                              )
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAiPreviewEntries((prev) => prev.filter((_, i) => i !== origIdx))
                                          }
                                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                                          aria-label="Remove preview item"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

      <PdfPrintModal
        open={showPrintModal}
        title="Timetable PDF Print Settings"
        options={printOptions}
        onChange={setPrintOptions}
        onConfirm={() => handleExportCurrentPdf(printOptions)}
        onClose={() => setShowPrintModal(false)}
      />
    </div>
  );
};
