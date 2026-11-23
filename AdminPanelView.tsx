import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Plus,
  Save,
  ShieldCheck,
  Sliders,
  Trash2,
  Unlock,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest, getAdminToken, readFileAsAttachment, setAdminToken } from '../lib/api.ts';
import type {
  AdminStudentSummary,
  DefaultSubjectConfig,
  SiteSettings,
  SubjectItem,
  UiLanguage,
} from '../types/shared.ts';

interface AdminPanelViewProps {
  lang: UiLanguage;
  onSiteSettingsUpdated: (settings: SiteSettings) => void;
  onWorkspaceRefresh: () => Promise<void> | void;
}

type AdminTab = 'pictures' | 'toggles' | 'subjects' | 'students';

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  lang,
  onSiteSettingsUpdated,
  onWorkspaceRefresh,
}) => {
  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [usingEnvSecret, setUsingEnvSecret] = useState(false);
  const [unlocked, setUnlocked] = useState(Boolean(getAdminToken()));

  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('pictures');
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [stats, setStats] = useState({ totalStudents: 0, totalTimetables: 0, totalPapers: 0, totalNotes: 0 });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Subjects manager
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjColor, setNewSubjColor] = useState('#4F46E5');
  const [newSubjHours, setNewSubjHours] = useState(4);
  const [syncToExisting, setSyncToExisting] = useState(true);

  // Per-student subject inspector
  const [inspectStudentId, setInspectStudentId] = useState('');
  const [studentSubjects, setStudentSubjects] = useState<SubjectItem[]>([]);
  const [stuSubjName, setStuSubjName] = useState('');
  const [stuSubjColor, setStuSubjColor] = useState('#0EA5E9');

  // Admin add/edit student
  const [newStuName, setNewStuName] = useState('');
  const [newStuEmail, setNewStuEmail] = useState('');
  const [newStuPass, setNewStuPass] = useState('');
  const [newStuGrade, setNewStuGrade] = useState('');
  const [newStuSchool, setNewStuSchool] = useState('');
  const [editingStudent, setEditingStudent] = useState<AdminStudentSummary | null>(null);
  const [editStuPassword, setEditStuPassword] = useState('');

  const loadOverview = async () => {
    try {
      const res = await apiRequest<{
        settings: SiteSettings;
        students: AdminStudentSummary[];
        stats: { totalStudents: number; totalTimetables: number; totalPapers: number; totalNotes: number };
      }>('/admin/overview');
      setSettings(res.settings);
      setStudents(res.students);
      setStats(res.stats);
      if (res.students.length > 0 && !inspectStudentId) {
        setInspectStudentId(res.students[0].id);
      }
      setUnlocked(true);
    } catch {
      setAdminToken(null);
      setUnlocked(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const st = await apiRequest<{ configured: boolean; usingEnvSecret: boolean }>('/admin/status');
        setConfigured(st.configured);
        setUsingEnvSecret(st.usingEnvSecret);
        if (getAdminToken()) {
          await loadOverview();
        }
      } catch {
        // ignore
      } finally {
        setStatusLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!unlocked || !inspectStudentId) return;
    (async () => {
      try {
        const res = await apiRequest<{ subjects: SubjectItem[] }>(`/admin/students/${inspectStudentId}/subjects`);
        setStudentSubjects(res.subjects);
      } catch {
        // ignore
      }
    })();
  }, [unlocked, inspectStudentId]);

  const handleClaimOrUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      if (!configured) {
        if (passcode.length < 4) {
          setAuthError('Please choose a passcode of at least 4 characters.');
          setAuthBusy(false);
          return;
        }
        if (passcode !== confirmPasscode) {
          setAuthError('Passcodes do not match.');
          setAuthBusy(false);
          return;
        }
        const res = await apiRequest<{ adminToken: string }>('/admin/claim', {
          method: 'POST',
          body: JSON.stringify({ passcode }),
        });
        setAdminToken(res.adminToken);
        setConfigured(true);
      } else {
        const res = await apiRequest<{ adminToken: string }>('/admin/unlock', {
          method: 'POST',
          body: JSON.stringify({ passcode }),
        });
        setAdminToken(res.adminToken);
      }
      setPasscode('');
      setConfirmPasscode('');
      await loadOverview();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Admin authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLock = async () => {
    try {
      await apiRequest('/admin/lock', { method: 'POST' });
    } catch {
      // ignore
    }
    setAdminToken(null);
    setUnlocked(false);
  };

  const handleImageUpload = async (
    field: 'heroImageUrl' | 'examBannerUrl' | 'scholarAvatarUrl' | 'defaultStudentAvatarUrl',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !settings) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    try {
      const att = await readFileAsAttachment(file, 4 * 1024 * 1024);
      setSettings({ ...settings, [field]: att.data });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image.');
    }
  };

  const saveAllSettings = async (overrideSettings?: SiteSettings, syncSubjects = syncToExisting) => {
    const payload = overrideSettings || settings;
    if (!payload) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ settings: SiteSettings }>('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          settings: payload,
          syncSubjectsToAllStudents: syncSubjects,
        }),
      });
      setSettings(res.settings);
      onSiteSettingsUpdated(res.settings);
      await onWorkspaceRefresh();
      if (inspectStudentId) {
        const subRes = await apiRequest<{ subjects: SubjectItem[] }>(`/admin/students/${inspectStudentId}/subjects`);
        setStudentSubjects(subRes.subjects);
      }
      setNotice(lang === 'si' ? 'Admin වෙනස්කම් සාර්ථකව සුරැකිනි!' : 'All Admin settings saved & applied live!');
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddGlobalSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !newSubjName.trim()) return;
    const item: DefaultSubjectConfig = {
      name: newSubjName.trim(),
      color: newSubjColor,
      targetHoursWeekly: newSubjHours,
    };
    const next = {
      ...settings,
      defaultSubjects: [...settings.defaultSubjects, item],
    };
    setSettings(next);
    setNewSubjName('');
    await saveAllSettings(next, syncToExisting);
  };

  const handleRemoveGlobalSubject = async (name: string) => {
    if (!settings) return;
    const next = {
      ...settings,
      defaultSubjects: settings.defaultSubjects.filter((s) => s.name !== name),
    };
    setSettings(next);
    await saveAllSettings(next, syncToExisting);
  };

  const handleAddStudentSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectStudentId || !stuSubjName.trim()) return;
    try {
      const res = await apiRequest<{ subject: SubjectItem }>(`/admin/students/${inspectStudentId}/subjects`, {
        method: 'POST',
        body: JSON.stringify({ name: stuSubjName.trim(), color: stuSubjColor, targetHoursWeekly: 4 }),
      });
      setStudentSubjects((prev) => [...prev, res.subject]);
      setStuSubjName('');
      await onWorkspaceRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add student subject.');
    }
  };

  const handleDeleteStudentSubject = async (subjectId: string) => {
    if (!inspectStudentId) return;
    await apiRequest(`/admin/students/${inspectStudentId}/subjects/${subjectId}`, { method: 'DELETE' });
    setStudentSubjects((prev) => prev.filter((s) => s.id !== subjectId));
    await onWorkspaceRefresh();
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          name: newStuName,
          email: newStuEmail,
          password: newStuPass,
          grade: newStuGrade,
          schoolName: newStuSchool,
        }),
      });
      setNewStuName('');
      setNewStuEmail('');
      setNewStuPass('');
      setNewStuGrade('');
      setNewStuSchool('');
      await loadOverview();
      setNotice('Student account created!');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create student.');
    }
  };

  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      await apiRequest(`/admin/students/${editingStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...editingStudent,
          newPassword: editStuPassword,
        }),
      });
      setEditingStudent(null);
      setEditStuPassword('');
      await loadOverview();
      await onWorkspaceRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update student.');
    }
  };

  const handleDeleteStudent = async (id: string) => {
    await apiRequest(`/admin/students/${id}`, { method: 'DELETE' });
    await loadOverview();
  };

  if (statusLoading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">Checking Admin Panel status...</div>
    );
  }

  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">
              {configured
                ? lang === 'si'
                  ? 'Admin Panel විවෘත කරන්න'
                  : 'Unlock Admin Panel'
                : lang === 'si'
                  ? 'පළමු වරට Admin මුරපදය සකසන්න'
                  : 'Set Up Admin Passcode'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {configured
                ? usingEnvSecret
                  ? 'Verified against server ADMIN_PASSCODE secret.'
                  : 'Enter your Admin passcode to manage pictures, timetables, subjects & students.'
                : 'First-run setup: claim your Admin passcode to secure full app customization.'}
            </p>
          </div>
        </div>

        {authError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
            {authError}
          </div>
        )}

        <form onSubmit={handleClaimOrUnlock} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {configured ? 'Admin Passcode' : 'Create Admin Passcode (4+ chars)'}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={4}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          {!configured && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Confirm Admin Passcode
              </label>
              <input
                type="password"
                required
                minLength={4}
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="Re-enter passcode"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={authBusy}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Unlock className="w-4 h-4" />
            {authBusy ? 'Verifying...' : configured ? 'Unlock Admin Panel' : 'Claim & Open Admin Panel'}
          </button>
        </form>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Header & KPI Stats */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="font-display text-xl font-bold">
              {lang === 'si'
                ? `${settings.appName || 'Student Time Management System'} — පරිපාලක පුවරුව`
                : `${settings.appName || 'Student Time Management System'} — Admin Control Center`}
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {lang === 'si'
              ? 'පින්තූර, කාලසටහන් On/Off, විෂයයන් එකතු/ඉවත් කිරීම සහ සිසුන් කළමනාකරණය කරන්න.'
              : 'Customize any picture, toggle timetables & features ON/OFF, add/remove subjects, and manage student accounts.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="grid grid-cols-4 gap-3 text-center px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800">
            <div>
              <div className="font-mono text-sm font-bold tabular-nums">{stats.totalStudents}</div>
              <div className="text-[10px] text-slate-500">Students</div>
            </div>
            <div>
              <div className="font-mono text-sm font-bold tabular-nums">{stats.totalTimetables}</div>
              <div className="text-[10px] text-slate-500">Schedules</div>
            </div>
            <div>
              <div className="font-mono text-sm font-bold tabular-nums">{stats.totalPapers}</div>
              <div className="text-[10px] text-slate-500">Papers</div>
            </div>
            <div>
              <div className="font-mono text-sm font-bold tabular-nums">{stats.totalNotes}</div>
              <div className="text-[10px] text-slate-500">Notes</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLock}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            Lock Admin
          </button>
        </div>
      </section>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
          {notice}
        </div>
      )}

      {/* Admin Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
        {(
          [
            { id: 'pictures', label: 'Branding & Pictures', icon: ImageIcon },
            { id: 'toggles', label: 'Timetables & Features ON/OFF', icon: Sliders },
            { id: 'subjects', label: 'Subjects Manager', icon: BookOpen },
            { id: 'students', label: 'Students & Children', icon: Users },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                active ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: BRANDING & PICTURES */}
      {activeTab === 'pictures' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-base font-semibold">Website Text &amp; Install Prompt Message</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">App Name</label>
                <input
                  type="text"
                  value={settings.appName}
                  onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tagline</label>
                <input
                  type="text"
                  value={settings.appTagline}
                  onChange={(e) => setSettings({ ...settings, appTagline: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Welcome Headline (1st Page)</label>
                <input
                  type="text"
                  value={settings.welcomeHeadline}
                  onChange={(e) => setSettings({ ...settings, welcomeHeadline: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Welcome Description</label>
                <textarea
                  rows={2}
                  value={settings.welcomeSubheadline}
                  onChange={(e) => setSettings({ ...settings, welcomeSubheadline: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">PWA Install Banner Message</label>
                <input
                  type="text"
                  value={settings.installPromptMessage}
                  onChange={(e) => setSettings({ ...settings, installPromptMessage: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-base font-semibold">App Pictures &amp; Avatars (Upload or Paste URL)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(
                [
                  {
                    key: 'heroImageUrl',
                    label: '1st Page Hero Study Picture',
                    fallback: '/src/assets/images/hero_study_workspace_1795360852973.jpg',
                  },
                  {
                    key: 'examBannerUrl',
                    label: 'Exam Hall Banner Picture',
                    fallback: '/src/assets/images/banner_exam_hall_1795360852847.jpg',
                  },
                  {
                    key: 'defaultStudentAvatarUrl',
                    label: 'Default Student Profile Picture',
                    fallback: '/src/assets/images/avatar_student_default_1795360852554.jpg',
                  },
                  {
                    key: 'scholarAvatarUrl',
                    label: 'AI Scholar Assistant Avatar',
                    fallback: '/src/assets/images/avatar_scholar_bot_1795360852131.jpg',
                  },
                ] as const
              ).map((item) => (
                <div
                  key={item.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, [item.key]: item.fallback })}
                      className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Reset Default
                    </button>
                  </div>
                  <div className="h-32 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                    <img
                      src={settings[item.key]}
                      alt={item.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={settings[item.key]}
                      onChange={(e) => setSettings({ ...settings, [item.key]: e.target.value })}
                      placeholder="Image URL or uploaded data"
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <label className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleImageUpload(item.key, e)}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveAllSettings()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Pictures & Branding'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TIMETABLES & FEATURES ON/OFF */}
      {activeTab === 'toggles' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
          <div>
            <h2 className="font-display text-base font-semibold">Timetable Master &amp; View Switches (ON / OFF)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Turn off or turn on the entire Timetable module, individual views, categories, or AI generators.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToggleCard
              title="Entire Timetables Module"
              description="Show or hide Timetables across navigation and dashboard"
              checked={settings.timetablesEnabled}
              onChange={(v) => setSettings({ ...settings, timetablesEnabled: v })}
            />
            <ToggleCard
              title="AI Smart Timetable Generator"
              description="Allow students to generate schedules from hours & free windows"
              checked={settings.aiTimetableEnabled}
              onChange={(v) => setSettings({ ...settings, aiTimetableEnabled: v })}
            />
            <ToggleCard
              title="AI Generate My Own Time Table"
              description="Allow students to enter/upload their own timetable for AI polishing"
              checked={settings.aiOwnTimetableEnabled}
              onChange={(v) => setSettings({ ...settings, aiOwnTimetableEnabled: v })}
            />
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Timetable Time Scopes</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((sc) => (
                <ToggleCard
                  key={sc}
                  title={`${sc.charAt(0).toUpperCase() + sc.slice(1)} View`}
                  checked={settings.enabledScopes[sc]}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      enabledScopes: { ...settings.enabledScopes, [sc]: v },
                    })
                  }
                />
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Timetable Categories</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { id: 'school', label: 'School Timetable' },
                  { id: 'tuition', label: 'Tuition / Class Timetable' },
                  { id: 'self_study', label: 'Self Study Timetable' },
                ] as const
              ).map((cat) => (
                <ToggleCard
                  key={cat.id}
                  title={cat.label}
                  checked={settings.enabledCategories[cat.id]}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      enabledCategories: { ...settings.enabledCategories, [cat.id]: v },
                    })
                  }
                />
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Platform Modules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { id: 'aiAssistant', label: 'AI Study Assistant' },
                  { id: 'examGenerator', label: 'AI Question Paper Generator' },
                  { id: 'studyTimer', label: 'Smart Study Timer' },
                  { id: 'calendar', label: 'Interactive Calendar' },
                  { id: 'notes', label: 'Notes & Study Library' },
                ] as const
              ).map((feat) => (
                <ToggleCard
                  key={feat.id}
                  title={feat.label}
                  checked={settings.features[feat.id]}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      features: { ...settings.features, [feat.id]: v },
                    })
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAllSettings()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save ON/OFF Controls'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: SUBJECTS MANAGER */}
      {activeTab === 'subjects' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold">Global Default Subjects</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Add or remove subjects globally across the platform.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={syncToExisting}
                onChange={(e) => setSyncToExisting(e.target.checked)}
                className="rounded border-slate-300"
              />
              Sync added/removed subjects to all existing students immediately
            </label>

            <form onSubmit={handleAddGlobalSubject} className="flex flex-wrap gap-2">
              <input
                type="text"
                required
                value={newSubjName}
                onChange={(e) => setNewSubjName(e.target.value)}
                placeholder="New subject (e.g. Commerce)"
                className="flex-1 min-w-[140px] px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <input
                type="color"
                value={newSubjColor}
                onChange={(e) => setNewSubjColor(e.target.value)}
                className="w-10 h-9 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
                title="Pick subject color"
              />
              <input
                type="number"
                min={1}
                max={40}
                value={newSubjHours}
                onChange={(e) => setNewSubjHours(Number(e.target.value))}
                className="w-16 px-2.5 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                title="Target weekly hours"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </form>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {settings.defaultSubjects.map((s) => (
                <div key={s.name} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs font-mono text-slate-400">{s.targetHoursWeekly}h/wk</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemoveGlobalSubject(s.name)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    title="Remove subject"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold">Per-Student Subject Editor</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pick any child/student to add or remove subjects specifically for them.
              </p>
            </div>

            <select
              value={inspectStudentId}
              onChange={(e) => setInspectStudentId(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            >
              {students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.email})
                </option>
              ))}
            </select>

            <form onSubmit={handleAddStudentSubject} className="flex gap-2">
              <input
                type="text"
                required
                value={stuSubjName}
                onChange={(e) => setStuSubjName(e.target.value)}
                placeholder="Add subject for selected student"
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <input
                type="color"
                value={stuSubjColor}
                onChange={(e) => setStuSubjColor(e.target.value)}
                className="w-10 h-9 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                Add
              </button>
            </form>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
              {studentSubjects.map((s) => (
                <div key={s.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteStudentSubject(s.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {studentSubjects.length === 0 && (
                <p className="text-xs text-slate-400 py-4 text-center">No subjects found for this student.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: STUDENTS & CHILDREN */}
      {activeTab === 'students' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateStudent}
            className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3 h-fit"
          >
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="w-4 h-4 text-indigo-500" />
              <h2 className="font-display text-base font-semibold">Add New Student / Child</h2>
            </div>
            <input
              type="text"
              required
              value={newStuName}
              onChange={(e) => setNewStuName(e.target.value)}
              placeholder="Full Name *"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <input
              type="email"
              required
              value={newStuEmail}
              onChange={(e) => setNewStuEmail(e.target.value)}
              placeholder="Email Address *"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <input
              type="password"
              required
              minLength={6}
              value={newStuPass}
              onChange={(e) => setNewStuPass(e.target.value)}
              placeholder="Password (6+ chars) *"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <input
              type="text"
              value={newStuGrade}
              onChange={(e) => setNewStuGrade(e.target.value)}
              placeholder="Grade / Class"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <input
              type="text"
              value={newStuSchool}
              onChange={(e) => setNewStuSchool(e.target.value)}
              placeholder="School Name"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
            >
              Create Student Account
            </button>
          </form>

          <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-base font-semibold">Registered Students ({students.length})</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {students.map((st) => (
                <div key={st.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={st.avatarUrl}
                      alt={st.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{st.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {st.email} {st.grade ? `· ${st.grade}` : ''} {st.schoolName ? `· ${st.schoolName}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStudent(st);
                        setEditStuPassword('');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteStudent(st.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      title="Delete student"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveStudentEdit}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3 shadow-xl"
          >
            <h3 className="font-display text-base font-bold">Edit Student: {editingStudent.name}</h3>
            <input
              type="text"
              required
              value={editingStudent.name}
              onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
              placeholder="Name"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={editingStudent.grade}
                onChange={(e) => setEditingStudent({ ...editingStudent, grade: e.target.value })}
                placeholder="Grade"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <input
                type="text"
                value={editingStudent.schoolName}
                onChange={(e) => setEditingStudent({ ...editingStudent, schoolName: e.target.value })}
                placeholder="School"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Daily Goal (mins)</label>
                <input
                  type="number"
                  min={15}
                  max={720}
                  value={editingStudent.dailyGoalMinutes}
                  onChange={(e) => setEditingStudent({ ...editingStudent, dailyGoalMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Family Group ID</label>
                <input
                  type="text"
                  value={editingStudent.familyGroupId}
                  onChange={(e) => setEditingStudent({ ...editingStudent, familyGroupId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>
            <input
              type="password"
              value={editStuPassword}
              onChange={(e) => setEditStuPassword(e.target.value)}
              placeholder="New Password (leave empty to keep)"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const ToggleCard: React.FC<{
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}> = ({ title, description, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
      checked
        ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30'
        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 opacity-75'
    }`}
  >
    <div className="min-w-0">
      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {description && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</div>}
    </div>
    <span
      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
        checked ? 'bg-emerald-600 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
      }`}
    >
      {checked ? 'ON' : 'OFF'}
    </span>
  </button>
);
