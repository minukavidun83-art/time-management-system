export type ProfileTheme = 'indigo' | 'violet' | 'cobalt' | 'emerald' | 'amber';
export type UiLanguage = 'en' | 'si';

export interface DefaultSubjectConfig {
  name: string;
  color: string;
  targetHoursWeekly: number;
}

export interface SiteSettings {
  appName: string;
  appTagline: string;
  welcomeHeadline: string;
  welcomeSubheadline: string;
  heroImageUrl: string;
  examBannerUrl: string;
  scholarAvatarUrl: string;
  defaultStudentAvatarUrl: string;
  timetablesEnabled: boolean;
  enabledScopes: {
    daily: boolean;
    weekly: boolean;
    monthly: boolean;
    yearly: boolean;
  };
  enabledCategories: {
    school: boolean;
    tuition: boolean;
    self_study: boolean;
  };
  aiTimetableEnabled: boolean;
  aiOwnTimetableEnabled: boolean;
  features: {
    aiAssistant: boolean;
    examGenerator: boolean;
    studyTimer: boolean;
    calendar: boolean;
    notes: boolean;
  };
  defaultSubjects: DefaultSubjectConfig[];
  installPromptMessage: string;
}

export interface FamilyChildSummary {
  id: string;
  email: string;
  name: string;
  grade: string;
  schoolName: string;
  avatarUrl: string;
  profileTheme: ProfileTheme;
}

export interface AdminStudentSummary {
  id: string;
  email: string;
  name: string;
  grade: string;
  schoolName: string;
  avatarUrl: string;
  familyGroupId: string;
  dailyGoalMinutes: number;
  createdAt: string;
}

export interface StudentProfile {
  id: string;
  email: string;
  name: string;
  grade: string;
  schoolName: string;
  bio: string;
  avatarUrl: string;
  profileTheme: ProfileTheme;
  darkMode: boolean;
  dailyGoalMinutes: number;
  familyGroupId?: string;
  createdAt: string;
}

export interface SubjectItem {
  id: string;
  name: string;
  color: string;
  targetHoursWeekly: number;
  createdAt: string;
}

export type TimetableCategory = 'school' | 'tuition' | 'self_study';
export type TimetableScope = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface TimetableEntry {
  id: string;
  category: TimetableCategory;
  scope: TimetableScope;
  title: string;
  subject: string;
  teacher: string;
  location: string;
  dayOfWeek: number | null; // 0 = Monday ... 6 = Sunday
  month: number | null; // 1..12
  year: number;
  specificDate: string | null; // YYYY-MM-DD
  startTime: string; // HH:MM (24h)
  endTime: string; // HH:MM (24h)
  durationMinutes: number;
  completed: boolean;
  notes: string;
  color?: string;
  isAiGenerated: boolean;
  createdAt: string;
}

export interface YearlyGoal {
  id: string;
  year: number;
  month: number; // 0 for full year, 1..12 for specific month
  title: string;
  subject: string;
  targetMetric: string;
  progressPercent: number;
  completed: boolean;
  createdAt: string;
}

export type CalendarEventType = 'exam' | 'assignment' | 'tuition' | 'study_session' | 'reminder';

export interface CalendarEvent {
  id: string;
  title: string;
  eventType: CalendarEventType;
  eventDate: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  subject: string;
  description: string;
  color?: string;
  reminderMinutes: number;
  completed: boolean;
  createdAt: string;
}

export type TimerMode = 'focus_25' | 'break_5' | 'long_break_15' | 'custom';

export interface StudySession {
  id: string;
  subject: string;
  mode: TimerMode;
  durationMinutes: number;
  sessionDate: string;
  completedAt: string;
}

export interface StudyNote {
  id: string;
  title: string;
  subject: string;
  lesson: string;
  content: string;
  isImportant: boolean;
  attachmentName: string;
  attachmentMime: string;
  attachmentData: string; // base64 data URL or raw base64
  aiSummary: string;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType =
  | 'MCQ'
  | 'Single Answer'
  | 'Multiple Answer'
  | 'True or False'
  | 'Fill in the Blanks'
  | 'Short Answer'
  | 'Structured';

export type PaperLanguage = 'English' | 'Sinhala' | 'Tamil';

export interface ExamQuestion {
  id: string;
  number: number;
  type: QuestionType;
  question: string;
  options: string[];
  correctAnswer: string;
  acceptableAnswers: string[];
  marks: number;
  explanation: string;
}

export interface QuestionPaper {
  id: string;
  title: string;
  subject: string;
  lessonName: string;
  language: PaperLanguage;
  timeLimitMinutes: number;
  totalMarks: number;
  questions: ExamQuestion[];
  sourceSummary: string;
  createdAt: string;
}

export interface GradedQuestionResult {
  questionId: string;
  number: number;
  type: QuestionType;
  question: string;
  userAnswer: string | string[];
  correctAnswer: string;
  isCorrect: boolean;
  marksAwarded: number;
  maxMarks: number;
  explanation: string;
  aiFeedback?: string;
}

export interface ExamAttempt {
  id: string;
  paperId: string;
  paperTitle: string;
  subject: string;
  lessonName: string;
  score: number;
  totalMarks: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  timeSpentSeconds: number;
  results: GradedQuestionResult[];
  submittedAt: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: string;
  attachmentName?: string;
  createdAt: string;
}

export interface AiChatThread {
  id: string;
  title: string;
  subject: string;
  messages: AiChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: 'study' | 'school' | 'tuition' | 'exam' | 'assignment' | 'goal';
  isRead: boolean;
  createdAt: string;
}

export interface DashboardAnalytics {
  todayStudyMinutes: number;
  weeklyStudyMinutes: number;
  monthlyStudyMinutes: number;
  totalStudyMinutes: number;
  studyStreakDays: number;
  completedTasksCount: number;
  pendingTasksCount: number;
  averageExamPercentage: number;
  weeklyChart: { day: string; date: string; minutes: number }[];
  monthlyChart: { month: string; minutes: number; examsAvg: number }[];
  subjectDistribution: { subject: string; minutes: number; color: string }[];
  recentExams: { id: string; title: string; subject: string; percentage: number; submittedAt: string }[];
}
