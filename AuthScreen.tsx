import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Eye, EyeOff, GraduationCap, Languages, Lock, Mail, Moon, School, Sun, User } from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { PWAInstallBanner, PWAInstallButton } from './PWAInstallPrompt.tsx';
import type { SiteSettings, StudentProfile, UiLanguage } from '../types/shared.ts';

interface AuthScreenProps {
  onAuthenticated: (student: StudentProfile) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  lang: UiLanguage;
  onToggleLang: () => void;
  siteSettings?: SiteSettings;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthenticated,
  darkMode,
  onToggleDarkMode,
  lang,
  onToggleLang,
  siteSettings,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await apiRequest<{ student: StudentProfile; token: string }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setAuthToken(res.token);
        onAuthenticated(res.student);
      } else if (mode === 'register') {
        const res = await apiRequest<{ student: StudentProfile; token: string }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, name, grade, schoolName }),
        });
        setAuthToken(res.token);
        onAuthenticated(res.student);
      } else {
        const res = await apiRequest<{ ok: boolean; message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email, schoolName, newPassword }),
        });
        setSuccessMsg(res.message);
        setMode('login');
        setPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Clean top bar */}
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-sm">
            <GraduationCap className="w-4.5 h-4.5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            {siteSettings?.appName || 'Student Time Management System'}
          </span>
        </div>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <span className="whitespace-nowrap shrink-0">Smart Timetables</span>
          <span className="whitespace-nowrap shrink-0">AI Study Tutor</span>
          <span className="whitespace-nowrap shrink-0">Exam Generator</span>
          <span className="whitespace-nowrap shrink-0">Study Analytics</span>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton lang={lang} appName={siteSettings?.appName} />

          <button
            type="button"
            onClick={onToggleLang}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{t(lang, 'lang_label')}</span>
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label="Toggle color theme"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register');
              setError('');
              setSuccessMsg('');
            }}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {mode === 'register' ? t(lang, 'sign_in') : t(lang, 'create_account')}
          </button>
        </div>
      </header>

      {/* Main Split Viewport */}
      <div className="max-w-7xl w-full mx-auto px-6 lg:px-10 pt-6">
        <PWAInstallBanner
          lang={lang}
          appName={siteSettings?.appName}
          customMessage={siteSettings?.installPromptMessage}
        />
      </div>
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch max-w-7xl w-full mx-auto px-6 lg:px-10 pb-8 gap-8">
        {/* Left Editorial Hero Image & Feature Overview */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="relative h-64 sm:h-80 lg:h-full min-h-[280px] flex-1 overflow-hidden bg-gradient-to-br from-indigo-900 via-violet-900 to-slate-900">
            <img
              src={siteSettings?.heroImageUrl || '/src/assets/images/hero_study_workspace_1795360852973.jpg'}
              alt="Student studying at a sunlit desk with laptop and notebook"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 text-white">
              <p className="text-xs font-medium text-indigo-200 mb-2">
                {siteSettings?.appTagline || 'Personal Learning Workspace · Private Student Accounts'}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight leading-tight text-balance mb-3">
                {siteSettings?.welcomeHeadline || 'Organize every subject, timetable, and exam with AI precision.'}
              </h1>
              <p className="text-sm text-slate-200 max-w-lg leading-relaxed">
                {siteSettings?.welcomeSubheadline ||
                  'Manage School, Tuition, and Self-Study schedules across 24-hour daily, weekly, monthly, and yearly planners. Generate real question papers in Sinhala, English, or Tamil directly from your notes.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90">
            <div className="p-4">
              <div className="font-mono text-lg font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">4 Views</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Daily to Yearly Planners</div>
            </div>
            <div className="p-4">
              <div className="font-mono text-lg font-semibold text-violet-600 dark:text-violet-400 tabular-nums">3 Languages</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Sinhala · English · Tamil</div>
            </div>
            <div className="p-4">
              <div className="font-mono text-lg font-semibold text-blue-600 dark:text-blue-400 tabular-nums">7 Types</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">AI Exam Paper Formats</div>
            </div>
          </div>
        </div>

        {/* Right Authentication Form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="lg:col-span-6 flex items-center justify-center"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm">
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(lang, 'auth_signin_tab')}
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(lang, 'auth_signup_tab')}
              </button>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setSuccessMsg(''); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'forgot'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(lang, 'auth_reset_tab')}
              </button>
            </div>

            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {mode === 'login'
                  ? t(lang, 'auth_welcome_back')
                  : mode === 'register'
                    ? t(lang, 'auth_create_title')
                    : t(lang, 'auth_recover_title')}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {mode === 'login'
                  ? 'Sign in to access your private timetable, notes, and AI exams.'
                  : mode === 'register'
                    ? 'Each student gets a private, secure dashboard and study library.'
                    : 'Verify your registered email and school name to set a new password.'}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Student Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Kasun Perera"
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@school.edu"
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {(mode === 'register' || mode === 'forgot') && (
                <div className={mode === 'register' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                  {mode === 'register' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Grade / Class
                      </label>
                      <div className="relative">
                        <BookOpen className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                          placeholder="e.g. Grade 11"
                          className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {mode === 'forgot' ? 'Registered School Name (or Full Name if unset)' : 'School Name'}
                    </label>
                    <div className="relative">
                      <School className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required={mode === 'forgot'}
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                        placeholder="e.g. Royal College"
                        className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {mode !== 'forgot' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (6+ chars)"
                      className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold text-sm transition-all shadow-sm disabled:opacity-60 cursor-pointer"
              >
                {loading
                  ? 'Please wait...'
                  : mode === 'login'
                    ? 'Sign In to Dashboard'
                    : mode === 'register'
                      ? 'Create Private Account'
                      : 'Reset Password'}
              </button>
            </form>
          </div>
        </motion.div>
      </main>
    </div>
  );
};
