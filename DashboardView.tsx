import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  GraduationCap,
  Target,
  TrendingUp,
} from 'lucide-react';
import { formatMinutes } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { PROFILE_THEMES } from '../lib/theme.ts';
import type {
  CalendarEvent,
  DashboardAnalytics,
  SiteSettings,
  StudentProfile,
  TimetableEntry,
  UiLanguage,
  YearlyGoal,
} from '../types/shared.ts';

interface DashboardViewProps {
  student: StudentProfile;
  analytics: DashboardAnalytics | null;
  timetableEntries: TimetableEntry[];
  calendarEvents: CalendarEvent[];
  yearlyGoals: YearlyGoal[];
  lang?: UiLanguage;
  siteSettings?: SiteSettings;
  onToggleTimetableComplete: (entry: TimetableEntry) => void;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  student,
  analytics,
  timetableEntries,
  calendarEvents,
  yearlyGoals,
  lang = 'en',
  siteSettings,
  onToggleTimetableComplete,
  onNavigate,
}) => {
  const theme = PROFILE_THEMES[student.profileTheme] || PROFILE_THEMES.indigo;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  // JS getDay(): 0=Sun..6=Sat -> convert to 0=Mon..6=Sun
  const todayDow = (today.getDay() + 6) % 7;

  const todaysSchedule = timetableEntries
    .filter(
      (e) =>
        e.specificDate === todayStr ||
        (e.scope === 'weekly' && e.dayOfWeek === todayDow) ||
        (e.scope === 'daily' && !e.specificDate)
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const upcomingEvents = calendarEvents
    .filter((e) => e.eventDate >= todayStr && !e.completed)
    .slice(0, 5);

  const todayMinutes = analytics?.todayStudyMinutes ?? 0;
  const goalMinutes = student.dailyGoalMinutes || 120;
  const goalPct = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100));

  const weeklyMax = Math.max(
    60,
    ...(analytics?.weeklyChart.map((d) => d.minutes) ?? [60])
  );

  const monthlyMax = Math.max(
    60,
    ...(analytics?.monthlyChart.map((m) => m.minutes) ?? [60])
  );

  return (
    <div className="space-y-6">
      {/* Welcome Banner & Primary CTA */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 bg-indigo-50 dark:bg-indigo-950">
            <img
              src={student.avatarUrl}
              alt={student.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {today.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
              {student.grade ? ` · ${student.grade}` : ''}
              {student.schoolName ? ` · ${student.schoolName}` : ''}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight mt-0.5 text-balance">
              {lang === 'si'
                ? `ආයුබෝවන්, ${student.name}`
                : `Good ${today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'}, ${student.name}`}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {siteSettings?.features.studyTimer !== false && (
            <button
              type="button"
              onClick={() => onNavigate('study-timer')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              {t(lang, 'dash_start_timer')}
            </button>
          )}
          {siteSettings?.features.examGenerator !== false && (
            <button
              type="button"
              onClick={() => onNavigate('exam-generator')}
              className={`px-4 py-2.5 rounded-xl ${theme.primaryBg} ${theme.primaryHover} text-white text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer`}
            >
              <GraduationCap className="w-4 h-4" />
              {t(lang, 'dash_generate_exam')}
            </button>
          )}
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t(lang, 'dash_today_goal')}</span>
            <Target className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums">{formatMinutes(todayMinutes)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              / {formatMinutes(goalMinutes)} ({goalPct}%)
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${theme.gradient} transition-all duration-300`}
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t(lang, 'dash_streak')}</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums">{analytics?.studyStreakDays ?? 0} days</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              · {formatMinutes(analytics?.totalStudyMinutes ?? 0)} total
            </span>
          </div>
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Weekly: {formatMinutes(analytics?.weeklyStudyMinutes ?? 0)} · Monthly: {formatMinutes(analytics?.monthlyStudyMinutes ?? 0)}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t(lang, 'dash_completed_pending')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums">{analytics?.completedTasksCount ?? 0}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              completed · {analytics?.pendingTasksCount ?? 0} pending
            </span>
          </div>
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
            Across daily timetables &amp; scheduled deadlines
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t(lang, 'dash_exam_perf')}</span>
            <Award className="w-4 h-4 text-violet-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums">
              {analytics?.averageExamPercentage ?? 0}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              avg across {analytics?.recentExams.length ?? 0} papers
            </span>
          </div>
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
            {analytics?.recentExams[0]
              ? `Latest: ${analytics.recentExams[0].subject} (${analytics.recentExams[0].percentage}%)`
              : 'Take an AI exam paper to track scores'}
          </p>
        </motion.div>
      </section>

      {/* Main Analytics Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Study Hours Bar Chart */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-base font-semibold">Weekly Study Progress</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Last 7 days focus duration · Total {formatMinutes(analytics?.weeklyStudyMinutes ?? 0)}
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>

          <div className="grid grid-cols-7 gap-3 items-end h-44 pt-4">
            {(analytics?.weeklyChart ?? []).map((bar) => {
              const heightPct = Math.max(6, Math.round((bar.minutes / weeklyMax) * 100));
              return (
                <div key={bar.date} className="flex flex-col items-center h-full justify-end gap-2 group">
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {bar.minutes > 0 ? formatMinutes(bar.minutes) : '0m'}
                  </span>
                  <div className="w-full max-w-[38px] flex-1 flex items-end bg-slate-100 dark:bg-slate-800/70 rounded-xl overflow-hidden">
                    <div
                      className={`w-full rounded-xl bg-gradient-to-t ${theme.gradient} transition-all duration-300`}
                      style={{ height: `${bar.minutes > 0 ? heightPct : 4}%`, opacity: bar.minutes > 0 ? 1 : 0.3 }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{bar.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Yearly / Monthly Study Progress Trend */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold">Yearly Study &amp; Exam Curve</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                12-month study activity ({new Date().getFullYear()})
              </p>
            </div>
            {siteSettings?.timetablesEnabled !== false && (
              <button
                type="button"
                onClick={() => onNavigate('timetables')}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap cursor-pointer"
              >
                Yearly Plan
              </button>
            )}
          </div>

          <div className="grid grid-cols-12 gap-1.5 items-end h-32 pt-3">
            {(analytics?.monthlyChart ?? []).map((m) => {
              const hPct = Math.max(8, Math.round((m.minutes / monthlyMax) * 100));
              return (
                <div key={m.month} className="flex flex-col items-center h-full justify-end gap-1.5" title={`${m.month}: ${formatMinutes(m.minutes)}`}>
                  <div className="w-full flex-1 flex items-end bg-slate-100 dark:bg-slate-800/70 rounded-md overflow-hidden">
                    <div
                      className="w-full bg-indigo-500 dark:bg-indigo-400 rounded-md"
                      style={{ height: `${m.minutes > 0 ? hPct : 6}%`, opacity: m.minutes > 0 ? 0.9 : 0.2 }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{m.month.slice(0, 1)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Subject Distribution</span>
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {analytics?.subjectDistribution.length ?? 0} active
              </span>
            </div>
            {(analytics?.subjectDistribution ?? []).slice(0, 3).map((s) => (
              <div key={s.subject} className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{s.subject}</span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {formatMinutes(s.minutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Today's Timetable + Upcoming Classes/Exams + Exam Results & Goals */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Today's Timetable */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold">{t(lang, 'dash_todays_tt')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {todaysSchedule.length} scheduled items across school, tuition &amp; self study
              </p>
            </div>
            {siteSettings?.timetablesEnabled !== false && (
              <button
                type="button"
                onClick={() => onNavigate('timetables')}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                Manage <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {todaysSchedule.length === 0 ? (
            <div className="py-10 text-center">
              <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-600 dark:text-slate-400">No timetable items scheduled for today yet.</p>
              {siteSettings?.timetablesEnabled !== false && (
                <button
                  type="button"
                  onClick={() => onNavigate('timetables')}
                  className="mt-3 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Add Daily or AI Timetable
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {todaysSchedule.slice(0, 6).map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleTimetableComplete(item)}
                    className="flex items-center gap-3 text-left min-w-0 cursor-pointer"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${item.completed ? 'line-through text-slate-400' : ''}`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {item.subject || 'General'} · {item.category.replace('_', ' ')}
                        {item.location ? ` · ${item.location}` : ''}
                      </p>
                    </div>
                  </button>
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                    {item.startTime} – {item.endTime}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Classes, Exam Dates & Academic Goals */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-semibold">{t(lang, 'dash_upcoming')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Exams, assignments, and tuition reminders
                </p>
              </div>
              {siteSettings?.features.calendar !== false && (
                <button
                  type="button"
                  onClick={() => onNavigate('calendar')}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  Open Calendar <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="py-6 text-center">
                <CalendarIcon className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming calendar events.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {upcomingEvents.map((evt) => (
                  <div key={evt.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{evt.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {evt.eventType.replace('_', ' ')}
                        {evt.subject ? ` · ${evt.subject}` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                      {evt.eventDate} · {evt.startTime}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Recent Exam Results &amp; Yearly Goals
              </h3>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {yearlyGoals.filter((g) => g.completed).length}/{yearlyGoals.length} goals met
              </span>
            </div>

            {(analytics?.recentExams ?? []).length === 0 && yearlyGoals.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Complete an AI Question Paper or add a Yearly Academic Goal to see progress here.
              </p>
            ) : (
              <div className="space-y-2">
                {(analytics?.recentExams ?? []).slice(0, 2).map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{ex.title} · {ex.subject}</span>
                    <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums shrink-0">
                      {ex.percentage}%
                    </span>
                  </div>
                ))}
                {yearlyGoals.slice(0, 2).map((g) => (
                  <div key={g.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-600 dark:text-slate-400">Goal: {g.title}</span>
                    <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                      {g.progressPercent}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
