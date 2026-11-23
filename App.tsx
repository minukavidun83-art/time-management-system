import React, { Component, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookMarked,
  CalendarDays,
  ChevronDown,
  Clock,
  GraduationCap,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Table2,
  UserCircle2,
  X,
} from 'lucide-react';
import { apiRequest, setAuthToken } from './lib/api.ts';
import { t, type I18nKey } from './lib/i18n.ts';
import { applyDarkMode, PROFILE_THEMES } from './lib/theme.ts';
import { AuthScreen } from './components/AuthScreen.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { TimetablesView } from './components/TimetablesView.tsx';
import { AiAssistantView } from './components/AiAssistantView.tsx';
import { ExamGeneratorView } from './components/ExamGeneratorView.tsx';
import { StudyTimerView } from './components/StudyTimerView.tsx';
import { CalendarView } from './components/CalendarView.tsx';
import { NotesLibraryView } from './components/NotesLibraryView.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { AdminPanelView } from './components/AdminPanelView.tsx';
import { ProfileAccountManager } from './components/ProfileAccountMenu.tsx';
import { OfflineIndicator, PWAInstallBanner, PWAInstallButton } from './components/PWAInstallPrompt.tsx';
import type {
  AiChatThread,
  CalendarEvent,
  DashboardAnalytics,
  ExamAttempt,
  NotificationItem,
  QuestionPaper,
  SiteSettings,
  StudentProfile,
  StudyNote,
  StudySession,
  SubjectItem,
  TimetableEntry,
  UiLanguage,
  YearlyGoal,
} from './types/shared.ts';

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3 text-center">
            <h2 className="font-display text-lg font-bold">Something went wrong</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type NavTab =
  | 'dashboard'
  | 'timetables'
  | 'ai-assistant'
  | 'exam-generator'
  | 'study-timer'
  | 'calendar'
  | 'notes'
  | 'profile'
  | 'admin';

const ALL_NAV_ITEMS: { id: NavTab; labelKey: I18nKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard },
  { id: 'timetables', labelKey: 'nav_timetables', icon: Table2 },
  { id: 'ai-assistant', labelKey: 'nav_ai_assistant', icon: Sparkles },
  { id: 'exam-generator', labelKey: 'nav_exam_generator', icon: GraduationCap },
  { id: 'study-timer', labelKey: 'nav_study_timer', icon: Clock },
  { id: 'calendar', labelKey: 'nav_calendar', icon: CalendarDays },
  { id: 'notes', labelKey: 'nav_notes', icon: BookMarked },
  { id: 'profile', labelKey: 'nav_profile', icon: UserCircle2 },
  { id: 'admin', labelKey: 'nav_admin', icon: ShieldCheck },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState<UiLanguage>(() => {
    try {
      return localStorage.getItem('smart_study_lang') === 'si' ? 'si' : 'en';
    } catch {
      return 'en';
    }
  });
  const [siteSettings, setSiteSettings] = useState<SiteSettings | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Student Workspace Data
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [yearlyGoals, setYearlyGoals] = useState<YearlyGoal[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [papers, setPapers] = useState<QuestionPaper[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [chatThreads, setChatThreads] = useState<AiChatThread[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<
    Array<{ id: string; title: string; eventType: string; eventDate: string; startTime: string; subject: string }>
  >([]);

  const [prefillExamNote, setPrefillExamNote] = useState<StudyNote | null>(null);
  const [timerPreset, setTimerPreset] = useState<{ subject: string; minutes: number } | null>(null);
  const [nowClock, setNowClock] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNowClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loadSiteSettings = useCallback(async () => {
    try {
      const res = await apiRequest<{ settings: SiteSettings }>('/site-settings');
      setSiteSettings(res.settings);
      if (res.settings?.appName) {
        document.title = res.settings.appName;
      }
    } catch {
      // non-blocking
    }
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [
        subjRes,
        ttRes,
        goalsRes,
        calRes,
        sessRes,
        notesRes,
        papersRes,
        attRes,
        chatsRes,
        analyticsRes,
        notifRes,
      ] = await Promise.all([
        apiRequest<{ subjects: SubjectItem[] }>('/subjects'),
        apiRequest<{ entries: TimetableEntry[] }>('/timetables'),
        apiRequest<{ goals: YearlyGoal[] }>('/yearly-goals'),
        apiRequest<{ events: CalendarEvent[] }>('/calendar'),
        apiRequest<{ sessions: StudySession[] }>('/study-sessions'),
        apiRequest<{ notes: StudyNote[] }>('/notes'),
        apiRequest<{ papers: QuestionPaper[] }>('/papers'),
        apiRequest<{ attempts: ExamAttempt[] }>('/exam-attempts'),
        apiRequest<{ threads: AiChatThread[] }>('/ai/chats'),
        apiRequest<{ analytics: DashboardAnalytics }>('/analytics'),
        apiRequest<{
          notifications: NotificationItem[];
          upcomingReminders: Array<{
            id: string;
            title: string;
            eventType: string;
            eventDate: string;
            startTime: string;
            subject: string;
          }>;
        }>('/notifications'),
      ]);

      setSubjects(subjRes.subjects);
      setTimetableEntries(ttRes.entries);
      setYearlyGoals(goalsRes.goals);
      setCalendarEvents(calRes.events);
      setStudySessions(sessRes.sessions);
      setNotes(notesRes.notes);
      setPapers(papersRes.papers);
      setAttempts(attRes.attempts);
      setChatThreads(chatsRes.threads);
      setAnalytics(analyticsRes.analytics);
      setNotifications(notifRes.notifications);
      setUpcomingReminders(notifRes.upcomingReminders);
    } catch (err) {
      console.error('Workspace load error:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadSiteSettings();
      try {
        const res = await apiRequest<{ student: StudentProfile }>('/auth/me');
        setStudent(res.student);
        setDarkMode(res.student.darkMode);
        applyDarkMode(res.student.darkMode);
        await loadWorkspaceData();
      } catch {
        setStudent(null);
      } finally {
        setBooting(false);
      }
    })();
  }, [loadSiteSettings, loadWorkspaceData]);

  const visibleNavItems = useMemo(() => {
    return ALL_NAV_ITEMS.filter((item) => {
      if (!siteSettings) return true;
      if (item.id === 'timetables') return siteSettings.timetablesEnabled;
      if (item.id === 'ai-assistant') return siteSettings.features.aiAssistant;
      if (item.id === 'exam-generator') return siteSettings.features.examGenerator;
      if (item.id === 'study-timer') return siteSettings.features.studyTimer;
      if (item.id === 'calendar') return siteSettings.features.calendar;
      if (item.id === 'notes') return siteSettings.features.notes;
      return true;
    });
  }, [siteSettings]);

  useEffect(() => {
    if (!visibleNavItems.some((item) => item.id === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [visibleNavItems, activeTab]);

  const handleToggleLang = () => {
    const next: UiLanguage = lang === 'en' ? 'si' : 'en';
    setLang(next);
    try {
      localStorage.setItem('smart_study_lang', next);
    } catch {
      // ignore storage failure
    }
  };

  const handleAuthenticated = async (profile: StudentProfile) => {
    setStudent(profile);
    setDarkMode(profile.darkMode);
    applyDarkMode(profile.darkMode);
    setActiveTab('dashboard');
    await loadWorkspaceData();
  };

  const handleSwitchedStudent = async (nextStudent: StudentProfile) => {
    setStudent(nextStudent);
    setDarkMode(nextStudent.darkMode);
    applyDarkMode(nextStudent.darkMode);
    setActiveTab('dashboard');
    await loadWorkspaceData();
  };

  const handleToggleDarkMode = async () => {
    const next = !darkMode;
    setDarkMode(next);
    applyDarkMode(next);
    if (student) {
      try {
        const res = await apiRequest<{ student: StudentProfile }>('/profile', {
          method: 'PUT',
          body: JSON.stringify({
            ...student,
            darkMode: next,
          }),
        });
        setStudent(res.student);
      } catch {
        // non-blocking
      }
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setStudent(null);
    setActiveTab('dashboard');
  };

  const handleToggleTimetableComplete = async (entry: TimetableEntry) => {
    await apiRequest(`/timetables/${entry.id}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: !entry.completed }),
    });
    await loadWorkspaceData();
  };

  const handleMarkNotificationsRead = async () => {
    await apiRequest('/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
        <div className="text-sm font-medium">
          Loading {siteSettings?.appName || 'Student Time Management System'}...
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <AppErrorBoundary>
        <AuthScreen
          onAuthenticated={handleAuthenticated}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
          lang={lang}
          onToggleLang={handleToggleLang}
          siteSettings={siteSettings}
        />
        <OfflineIndicator lang={lang} />
      </AppErrorBoundary>
    );
  }

  const theme = PROFILE_THEMES[student.profileTheme] || PROFILE_THEMES.indigo;
  const unreadCount = notifications.filter((n) => !n.isRead).length + upcomingReminders.length;
  const activeNavMeta = visibleNavItems.find((n) => n.id === activeTab) || visibleNavItems[0];
  const appName = siteSettings?.appName || 'Student Time Management System';

  return (
    <AppErrorBoundary>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30">
          <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-white shrink-0`}>
              <GraduationCap className="w-4.5 h-4.5" />
            </div>
            <span className="font-display text-base font-bold tracking-tight truncate">
              {appName}
            </span>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? `${theme.softBg} ${theme.primaryText} font-semibold`
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5 shrink-0" />
                  <span className="truncate">{t(lang, item.labelKey)}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <ProfileAccountManager
              student={student}
              lang={lang}
              menuPosition="top-right"
              onEditProfile={() => setActiveTab('profile')}
              onSwitchedStudent={handleSwitchedStudent}
              onSignOutToFirstPage={handleLogout}
              onWorkspaceRefresh={loadWorkspaceData}
              onGoToDashboardFirstPage={() => setActiveTab('dashboard')}
              childrenTrigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  className="w-full flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={student.avatarUrl}
                      alt={student.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{student.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {student.grade || student.email}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              )}
            />

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              {t(lang, 'sign_out')}
            </button>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
            <div className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full p-5 flex flex-col justify-between z-10 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
                  <span className="font-display text-base font-bold truncate">{appName}</span>
                  <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="space-y-1">
                  {visibleNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium cursor-pointer ${
                          active
                            ? `${theme.softBg} ${theme.primaryText} font-semibold`
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="w-4.5 h-4.5 shrink-0" />
                        <span className="truncate">{t(lang, item.labelKey)}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={handleToggleLang}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  <Languages className="w-4 h-4 text-indigo-500" />
                  {t(lang, 'lang_label')}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  {t(lang, 'sign_out')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="h-16 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-display text-base font-bold truncate">
                {t(lang, activeNavMeta.labelKey)}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 relative">
              <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>
                  {nowClock.toLocaleDateString()} ·{' '}
                  {nowClock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <button
                type="button"
                onClick={handleToggleLang}
                aria-label="Switch Language (Sinhala / English)"
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Languages className="w-3.5 h-3.5 text-indigo-500" />
                <span>{t(lang, 'lang_label')}</span>
              </button>

              <div className="hidden sm:block">
                <PWAInstallButton lang={lang} appName={appName} />
              </div>

              <button
                type="button"
                onClick={handleToggleDarkMode}
                aria-label="Toggle Light/Dark Mode"
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Open Notifications & Reminders"
                className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              <ProfileAccountManager
                student={student}
                lang={lang}
                menuPosition="bottom-right"
                onEditProfile={() => setActiveTab('profile')}
                onSwitchedStudent={handleSwitchedStudent}
                onSignOutToFirstPage={handleLogout}
                onWorkspaceRefresh={loadWorkspaceData}
                onGoToDashboardFirstPage={() => setActiveTab('dashboard')}
                childrenTrigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    aria-label="Student Account Menu"
                    className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <img
                      src={student.avatarUrl}
                      alt={student.name}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-lg object-cover"
                    />
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                )}
              />

              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 sm:w-96 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-4 space-y-3 z-40">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-display text-sm font-bold">Notifications &amp; Reminders</span>
                    <button
                      type="button"
                      onClick={handleMarkNotificationsRead}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto space-y-2.5">
                    {upcomingReminders.map((r) => (
                      <div key={r.id} className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/60 text-xs">
                        <div className="font-semibold text-amber-900 dark:text-amber-200">
                          Upcoming {r.eventType.replace('_', ' ')}: {r.title}
                        </div>
                        <div className="text-amber-700 dark:text-amber-300 mt-0.5 font-mono tabular-nums">
                          {r.eventDate} · {r.startTime} {r.subject ? `· ${r.subject}` : ''}
                        </div>
                      </div>
                    ))}

                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-xl border text-xs ${
                          n.isRead
                            ? 'border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                            : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30'
                        }`}
                      >
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</div>
                        <div className="mt-0.5">{n.message}</div>
                      </div>
                    ))}

                    {notifications.length === 0 && upcomingReminders.length === 0 && (
                      <p className="text-xs text-slate-500 text-center py-6">You&apos;re all caught up!</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Active Page Viewport */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <PWAInstallBanner
              lang={lang}
              appName={appName}
              customMessage={siteSettings?.installPromptMessage}
            />

            {activeTab === 'dashboard' && (
              <DashboardView
                student={student}
                analytics={analytics}
                timetableEntries={timetableEntries}
                calendarEvents={calendarEvents}
                yearlyGoals={yearlyGoals}
                lang={lang}
                siteSettings={siteSettings}
                onToggleTimetableComplete={handleToggleTimetableComplete}
                onNavigate={(tab) => setActiveTab(tab as NavTab)}
              />
            )}

            {activeTab === 'timetables' && siteSettings?.timetablesEnabled !== false && (
              <TimetablesView
                student={student}
                entries={timetableEntries}
                subjects={subjects}
                yearlyGoals={yearlyGoals}
                siteSettings={siteSettings}
                lang={lang}
                onRefresh={loadWorkspaceData}
                onStartFocusTimer={(subj, mins) => {
                  setTimerPreset({ subject: subj, minutes: mins });
                  setActiveTab('study-timer');
                }}
              />
            )}

            {activeTab === 'ai-assistant' && siteSettings?.features.aiAssistant !== false && (
              <AiAssistantView
                student={student}
                subjects={subjects}
                threads={chatThreads}
                siteSettings={siteSettings}
                onRefreshChats={loadWorkspaceData}
                onRefreshNotes={loadWorkspaceData}
              />
            )}

            {activeTab === 'exam-generator' && siteSettings?.features.examGenerator !== false && (
              <ExamGeneratorView
                student={student}
                subjects={subjects}
                papers={papers}
                attempts={attempts}
                prefillNote={prefillExamNote}
                siteSettings={siteSettings}
                appName={appName}
                onClearPrefillNote={() => setPrefillExamNote(null)}
                onRefresh={loadWorkspaceData}
              />
            )}

            {activeTab === 'study-timer' && siteSettings?.features.studyTimer !== false && (
              <StudyTimerView
                student={student}
                subjects={subjects}
                analytics={analytics}
                sessions={studySessions}
                presetRequest={timerPreset}
                onConsumePreset={() => setTimerPreset(null)}
                onSessionLogged={loadWorkspaceData}
              />
            )}

            {activeTab === 'calendar' && siteSettings?.features.calendar !== false && (
              <CalendarView
                student={student}
                events={calendarEvents}
                subjects={subjects}
                appName={appName}
                onRefresh={loadWorkspaceData}
              />
            )}

            {activeTab === 'notes' && siteSettings?.features.notes !== false && (
              <NotesLibraryView
                student={student}
                notes={notes}
                subjects={subjects}
                onRefresh={loadWorkspaceData}
                onGenerateExamFromNote={(note) => {
                  setPrefillExamNote(note);
                  setActiveTab('exam-generator');
                }}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                student={student}
                analytics={analytics}
                lang={lang}
                siteSettings={siteSettings}
                onProfileUpdated={(updated) => {
                  setStudent(updated);
                  setDarkMode(updated.darkMode);
                  applyDarkMode(updated.darkMode);
                }}
                onSwitchedStudent={handleSwitchedStudent}
                onSignOutToFirstPage={handleLogout}
                onWorkspaceRefresh={loadWorkspaceData}
                onGoToDashboardFirstPage={() => setActiveTab('dashboard')}
              />
            )}

            {activeTab === 'admin' && (
              <AdminPanelView
                lang={lang}
                onSiteSettingsUpdated={(updated) => {
                  setSiteSettings(updated);
                  if (updated.appName) {
                    document.title = updated.appName;
                  }
                }}
                onWorkspaceRefresh={loadWorkspaceData}
              />
            )}
          </main>
        </div>

        <OfflineIndicator lang={lang} />
      </div>
    </AppErrorBoundary>
  );
}
