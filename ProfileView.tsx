import React, { useState } from 'react';
import { Camera, Check, Lock, Moon, Save, Sun, User } from 'lucide-react';
import { apiRequest, formatMinutes, readFileAsAttachment } from '../lib/api.ts';
import { PROFILE_THEMES } from '../lib/theme.ts';
import { ProfileAccountManager } from './ProfileAccountMenu.tsx';
import type { DashboardAnalytics, ProfileTheme, SiteSettings, StudentProfile, UiLanguage } from '../types/shared.ts';

interface ProfileViewProps {
  student: StudentProfile;
  analytics: DashboardAnalytics | null;
  lang: UiLanguage;
  siteSettings?: SiteSettings;
  onProfileUpdated: (student: StudentProfile) => void;
  onSwitchedStudent: (student: StudentProfile) => Promise<void> | void;
  onSignOutToFirstPage: () => void;
  onWorkspaceRefresh: () => Promise<void> | void;
  onGoToDashboardFirstPage: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  student,
  analytics,
  lang,
  siteSettings,
  onProfileUpdated,
  onSwitchedStudent,
  onSignOutToFirstPage,
  onWorkspaceRefresh,
  onGoToDashboardFirstPage,
}) => {
  const avatarPresets = [
    siteSettings?.defaultStudentAvatarUrl || '/src/assets/images/avatar_student_default_1795360852554.jpg',
    siteSettings?.scholarAvatarUrl || '/src/assets/images/avatar_scholar_bot_1795360852131.jpg',
  ];
  const [name, setName] = useState(student.name);
  const [grade, setGrade] = useState(student.grade);
  const [schoolName, setSchoolName] = useState(student.schoolName);
  const [bio, setBio] = useState(student.bio);
  const [avatarUrl, setAvatarUrl] = useState(student.avatarUrl);
  const [profileTheme, setProfileTheme] = useState<ProfileTheme>(student.profileTheme);
  const [darkMode, setDarkMode] = useState(student.darkMode);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(student.dailyGoalMinutes);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [message, setMessage] = useState('');
  const [passMessage, setPassMessage] = useState('');
  const [error, setError] = useState('');

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG or JPG) for your profile picture.');
      return;
    }
    try {
      const attachment = await readFileAsAttachment(file, 2 * 1024 * 1024);
      setAvatarUrl(attachment.data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile picture.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setMessage('');
    setError('');
    try {
      const res = await apiRequest<{ student: StudentProfile }>('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          grade,
          schoolName,
          bio,
          avatarUrl,
          profileTheme,
          darkMode,
          dailyGoalMinutes,
        }),
      });
      onProfileUpdated(res.student);
      setMessage('Profile updated and saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPass(true);
    setPassMessage('');
    setError('');
    try {
      await apiRequest('/profile/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setPassMessage('Password changed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setSavingPass(false);
    }
  };

  const activeTheme = PROFILE_THEMES[profileTheme] || PROFILE_THEMES.indigo;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Profile Summary Header */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
            <img
              src={avatarUrl}
              alt={name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <label
              title="Upload Profile Picture"
              className="absolute inset-0 bg-slate-950/45 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
            >
              <Camera className="w-5 h-5" />
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="sr-only" />
            </label>
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {student.email}
              {grade ? ` · ${grade}` : ''}
              {schoolName ? ` · ${schoolName}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {avatarPresets.map((preset, idx) => (
                <button
                  key={`${preset}-${idx}`}
                  type="button"
                  onClick={() => setAvatarUrl(preset)}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Preset {idx + 1}
                </button>
              ))}
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <label className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
                Upload Photo
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="sr-only" />
              </label>
            </div>
          </div>
        </div>

        {/* Personal Study Statistics */}
        <div className="grid grid-cols-3 gap-4 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-4 sm:pt-0 sm:pl-6">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Total Study</div>
            <div className="font-mono text-lg font-bold tabular-nums">
              {formatMinutes(analytics?.totalStudyMinutes ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Streak</div>
            <div className="font-mono text-lg font-bold tabular-nums">
              {analytics?.studyStreakDays ?? 0}d
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Exam Avg</div>
            <div className="font-mono text-lg font-bold tabular-nums">
              {analytics?.averageExamPercentage ?? 0}%
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Personal Info & Theme Form */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-500" />
            <h2 className="font-display text-base font-semibold">Personal Information &amp; Appearance</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Student Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Grade / Class
              </label>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. Grade 11 · Science"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                School Name
              </label>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Your school or college"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Daily Study Goal (minutes)
              </label>
              <input
                type="number"
                min={15}
                max={720}
                value={dailyGoalMinutes}
                onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Personal Bio / Academic Focus
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write your academic goals or target exams..."
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Profile Theme Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Profile Accent Theme
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PROFILE_THEMES) as ProfileTheme[]).map((key) => {
                const item = PROFILE_THEMES[key];
                const active = profileTheme === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setProfileTheme(key)}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${item.primaryBg}`} />
                    {item.name}
                    {active && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Light / Dark Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-sm font-medium">Interface Theme Mode</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Switch between clean Light Mode and focused Dark Mode
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>

          <div className="flex items-center justify-between pt-2">
            {message ? (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{message}</span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={savingProfile}
              className={`px-5 py-2.5 rounded-xl ${activeTheme.primaryBg} ${activeTheme.primaryHover} text-white text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60`}
            >
              <Save className="w-4 h-4" />
              {savingProfile ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>

        {/* Right Column: Account & Data Management Menu + Change Password */}
        <div className="lg:col-span-5 space-y-6">
          <ProfileAccountManager
            student={student}
            lang={lang}
            renderInline
            onEditProfile={() => {
              const nameInput = document.querySelector<HTMLInputElement>('form input[type="text"]');
              nameInput?.focus();
            }}
            onSwitchedStudent={onSwitchedStudent}
            onSignOutToFirstPage={onSignOutToFirstPage}
            onWorkspaceRefresh={onWorkspaceRefresh}
            onGoToDashboardFirstPage={onGoToDashboardFirstPage}
          />

          <form
            onSubmit={handleChangePassword}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 h-fit"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-500" />
              <h2 className="font-display text-base font-semibold">
                {lang === 'si' ? 'මුරපදය වෙනස් කරන්න' : 'Change Password'}
              </h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                New Password (6+ characters)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {passMessage && (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{passMessage}</p>
            )}

            <button
              type="submit"
              disabled={savingPass}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              {savingPass ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
