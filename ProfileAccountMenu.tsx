import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  LogOut,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import type { FamilyChildSummary, StudentProfile, UiLanguage } from '../types/shared.ts';

interface ProfileAccountMenuProps {
  student: StudentProfile;
  lang: UiLanguage;
  onEditProfile: () => void;
  onSwitchedStudent: (nextStudent: StudentProfile) => Promise<void> | void;
  onSignOutToFirstPage: () => void;
  onWorkspaceRefresh: () => Promise<void> | void;
  onGoToDashboardFirstPage: () => void;
  inlineCard?: boolean;
  onCloseMenu?: () => void;
}

export const ProfileAccountMenuList: React.FC<ProfileAccountMenuProps & {
  onOpenSwitchModal: () => void;
  onOpenDeleteModal: () => void;
  onOpenResetModal: () => void;
  onExportBackup: () => void;
  onTriggerImport: () => void;
}> = ({
  lang,
  onEditProfile,
  onSignOutToFirstPage,
  onOpenSwitchModal,
  onOpenDeleteModal,
  onOpenResetModal,
  onExportBackup,
  onTriggerImport,
  inlineCard,
  onCloseMenu,
}) => {
  return (
    <div
      className={
        inlineCard
          ? 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm'
          : 'w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xl'
      }
    >
      <div className="px-2.5 pt-1 pb-2 text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
        {t(lang, 'menu_student_account')}
      </div>
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => {
            onEditProfile();
            onCloseMenu?.();
          }}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
        >
          <UserCheck className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>{t(lang, 'menu_edit_profile')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenSwitchModal();
            onCloseMenu?.();
          }}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
        >
          <Users className="w-4 h-4 text-blue-500 shrink-0" />
          <span>{t(lang, 'menu_switch_student')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCloseMenu?.();
            onSignOutToFirstPage();
          }}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors text-left cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{t(lang, 'menu_sign_out')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenDeleteModal();
            onCloseMenu?.();
          }}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left cursor-pointer"
        >
          <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{t(lang, 'menu_delete_account')}</span>
        </button>
      </div>

      <div className="my-2.5 border-t border-slate-100 dark:border-slate-800" />

      <div className="px-2.5 pt-0.5 pb-2 text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
        {t(lang, 'menu_data_management')}
      </div>
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => {
            onExportBackup();
            onCloseMenu?.();
          }}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
        >
          <Download className="w-4 h-4 text-blue-500 shrink-0" />
          <span>{t(lang, 'menu_export_backup')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onTriggerImport();
            onCloseMenu?.();
          }}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
        >
          <Upload className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{t(lang, 'menu_import_backup')}</span>
        </button>
      </div>

      <div className="my-2.5 border-t border-slate-100 dark:border-slate-800" />

      <button
        type="button"
        onClick={() => {
          onOpenResetModal();
          onCloseMenu?.();
        }}
        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left cursor-pointer"
      >
        <RotateCcw className="w-4 h-4 text-rose-500 shrink-0" />
        <span>{t(lang, 'menu_reset_default')}</span>
      </button>
    </div>
  );
};

export const ProfileAccountManager: React.FC<
  ProfileAccountMenuProps & {
    childrenTrigger?: (open: () => void, isOpen: boolean) => React.ReactNode;
    menuPosition?: 'top-right' | 'bottom-right';
    renderInline?: boolean;
  }
> = (props) => {
  const {
    student,
    lang,
    onSwitchedStudent,
    onSignOutToFirstPage,
    onWorkspaceRefresh,
    onGoToDashboardFirstPage,
    childrenTrigger,
    menuPosition = 'bottom-right',
    renderInline = false,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Switch / Add Child Modal state
  const [familyChildren, setFamilyChildren] = useState<FamilyChildSummary[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [childTab, setChildTab] = useState<'list' | 'add' | 'link'>('list');
  const [childName, setChildName] = useState('');
  const [childEmail, setChildEmail] = useState('');
  const [childPassword, setChildPassword] = useState('');
  const [childGrade, setChildGrade] = useState('');
  const [childSchool, setChildSchool] = useState(student.schoolName || '');
  const [modalError, setModalError] = useState('');
  const [modalBusy, setModalBusy] = useState(false);

  // Delete modal state
  const [deletePassword, setDeletePassword] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const loadChildren = async () => {
    setLoadingChildren(true);
    try {
      const res = await apiRequest<{ children: FamilyChildSummary[] }>('/family/children');
      setFamilyChildren(res.children);
    } catch {
      // ignore
    } finally {
      setLoadingChildren(false);
    }
  };

  const openSwitchModal = () => {
    setModalError('');
    setChildTab('list');
    setShowSwitchModal(true);
    void loadChildren();
  };

  const handleSwitchChild = async (targetId: string) => {
    if (targetId === student.id) {
      setShowSwitchModal(false);
      onGoToDashboardFirstPage();
      return;
    }
    setModalBusy(true);
    setModalError('');
    try {
      const res = await apiRequest<{ student: StudentProfile; token: string }>('/family/switch-child', {
        method: 'POST',
        body: JSON.stringify({ targetStudentId: targetId }),
      });
      setAuthToken(res.token);
      setShowSwitchModal(false);
      await onSwitchedStudent(res.student);
      onGoToDashboardFirstPage();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to switch student.');
    } finally {
      setModalBusy(false);
    }
  };

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalBusy(true);
    setModalError('');
    try {
      const res = await apiRequest<{ student: StudentProfile; token?: string }>('/family/add-child', {
        method: 'POST',
        body: JSON.stringify({
          name: childName,
          email: childEmail,
          password: childPassword,
          grade: childGrade,
          schoolName: childSchool,
          switchImmediately: true,
        }),
      });
      if (res.token) setAuthToken(res.token);
      setChildName('');
      setChildEmail('');
      setChildPassword('');
      setChildGrade('');
      setShowSwitchModal(false);
      await onSwitchedStudent(res.student);
      onGoToDashboardFirstPage();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to add child.');
    } finally {
      setModalBusy(false);
    }
  };

  const handleLinkChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalBusy(true);
    setModalError('');
    try {
      await apiRequest('/family/link-child', {
        method: 'POST',
        body: JSON.stringify({ email: childEmail, password: childPassword }),
      });
      setChildEmail('');
      setChildPassword('');
      setChildTab('list');
      await loadChildren();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to link child.');
    } finally {
      setModalBusy(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const res = await apiRequest<{ backup: unknown }>('/account/backup');
      const blob = new Blob([JSON.stringify(res.backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart_study_backup_${student.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToastMsg(lang === 'si' ? 'උපස්ථ ගොනුව (Backup) බාගත විය.' : 'Backup exported successfully.');
      setTimeout(() => setToastMsg(''), 3000);
    } catch {
      // ignore
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const res = await apiRequest<{ importedCount: number }>('/account/import-backup', {
        method: 'POST',
        body: JSON.stringify({ backup }),
      });
      await onWorkspaceRefresh();
      onGoToDashboardFirstPage();
      setToastMsg(
        lang === 'si'
          ? `දත්ත ${res.importedCount}ක් සාර්ථකව ඇතුළත් කරන ලදී.`
          : `Imported ${res.importedCount} study items.`
      );
      setTimeout(() => setToastMsg(''), 3500);
    } catch (err) {
      setToastMsg(err instanceof Error ? err.message : 'Invalid backup file.');
      setTimeout(() => setToastMsg(''), 3500);
    }
  };

  const handleResetToDefault = async () => {
    setModalBusy(true);
    setModalError('');
    try {
      await apiRequest('/account/reset', { method: 'POST' });
      setShowResetModal(false);
      await onWorkspaceRefresh();
      onGoToDashboardFirstPage();
      setToastMsg(lang === 'si' ? 'ගිණුම මුල් තත්ත්වයට පත් කරන ලදී.' : 'Workspace reset to default.');
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setModalBusy(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalBusy(true);
    setModalError('');
    try {
      await apiRequest('/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      setShowDeleteModal(false);
      setAuthToken(null);
      onSignOutToFirstPage();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not delete account.');
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {!renderInline && childrenTrigger?.(() => setMenuOpen((prev) => !prev), menuOpen)}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFileChange}
        className="sr-only"
      />

      {renderInline ? (
        <ProfileAccountMenuList
          {...props}
          inlineCard
          onOpenSwitchModal={openSwitchModal}
          onOpenDeleteModal={() => {
            setModalError('');
            setDeletePassword('');
            setShowDeleteModal(true);
          }}
          onOpenResetModal={() => {
            setModalError('');
            setShowResetModal(true);
          }}
          onExportBackup={handleExportBackup}
          onTriggerImport={() => fileInputRef.current?.click()}
        />
      ) : (
        menuOpen && (
          <div
            className={`absolute z-50 ${
              menuPosition === 'top-right' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2'
            }`}
          >
            <ProfileAccountMenuList
              {...props}
              onOpenSwitchModal={openSwitchModal}
              onOpenDeleteModal={() => {
                setModalError('');
                setDeletePassword('');
                setShowDeleteModal(true);
              }}
              onOpenResetModal={() => {
                setModalError('');
                setShowResetModal(true);
              }}
              onExportBackup={handleExportBackup}
              onTriggerImport={() => fileInputRef.current?.click()}
              onCloseMenu={() => setMenuOpen(false)}
            />
          </div>
        )
      )}

      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white px-4 py-2.5 text-xs font-semibold shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* Switch Student / Add Child Modal */}
      {showSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold">{t(lang, 'switch_title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t(lang, 'switch_subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSwitchModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setChildTab('list');
                  setModalError('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                  childTab === 'list' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {lang === 'si' ? 'දරුවන්ගේ ලැයිස්තුව' : `Children (${familyChildren.length})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChildTab('add');
                  setModalError('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                  childTab === 'add' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                + {t(lang, 'add_child_btn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChildTab('link');
                  setModalError('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                  childTab === 'link' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {lang === 'si' ? 'ගිණුමක් සම්බන්ධ කරන්න' : 'Link Existing'}
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {modalError}
              </div>
            )}

            {childTab === 'list' && (
              <div className="space-y-3">
                {loadingChildren ? (
                  <p className="text-xs text-slate-500 py-4 text-center">Loading student profiles...</p>
                ) : (
                  <div className="space-y-2">
                    {familyChildren.map((child) => {
                      const isCurrent = child.id === student.id;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          disabled={modalBusy}
                          onClick={() => void handleSwitchChild(child.id)}
                          className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isCurrent
                              ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={child.avatarUrl}
                              alt={child.name}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{child.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {[child.grade, child.schoolName].filter(Boolean).join(' · ') || child.email}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                            {isCurrent
                              ? lang === 'si'
                                ? 'දැනට සක්‍රියයි'
                                : 'Active'
                              : lang === 'si'
                                ? 'මාරු වන්න →'
                                : 'Open 1st Page →'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setChildTab('add')}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {t(lang, 'add_child_btn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSwitchModal(false);
                      onSignOutToFirstPage();
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    {t(lang, 'go_first_page')}
                  </button>
                </div>
              </div>
            )}

            {childTab === 'add' && (
              <form onSubmit={handleAddChild} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {lang === 'si' ? 'දරුවාගේ නම *' : 'Child Full Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={childName}
                      onChange={(e) => setChildName(e.target.value)}
                      placeholder="e.g. Nethmi Perera"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {lang === 'si' ? 'ශ්‍රේණිය / පන්තිය' : 'Grade / Class'}
                    </label>
                    <input
                      type="text"
                      value={childGrade}
                      onChange={(e) => setChildGrade(e.target.value)}
                      placeholder="e.g. Grade 8"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {lang === 'si' ? 'පාසල' : 'School Name'}
                  </label>
                  <input
                    type="text"
                    value={childSchool}
                    onChange={(e) => setChildSchool(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={childEmail}
                      onChange={(e) => setChildEmail(e.target.value)}
                      placeholder="child@school.edu"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {lang === 'si' ? 'මුරපදය (6+ අක්ෂර) *' : 'Password (6+ chars) *'}
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={childPassword}
                      onChange={(e) => setChildPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={modalBusy}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Plus className="w-4 h-4" />
                  {modalBusy
                    ? 'Creating...'
                    : lang === 'si'
                      ? 'දරුවා එකතු කර 1st Page වෙත යන්න'
                      : 'Add Child & Go to 1st Page'}
                </button>
              </form>
            )}

            {childTab === 'link' && (
              <form onSubmit={handleLinkChild} className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'si'
                    ? 'දැනටමත් ඇති ශිෂ්‍ය ගිණුමක Email සහ මුරපදය ලබා දී පවුලේ ලැයිස්තුවට සම්බන්ධ කරන්න.'
                    : 'Enter an existing child account email and password to add them to your quick-switch list.'}
                </p>
                <input
                  type="email"
                  required
                  value={childEmail}
                  onChange={(e) => setChildEmail(e.target.value)}
                  placeholder="student@school.edu"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <input
                  type="password"
                  required
                  value={childPassword}
                  onChange={(e) => setChildPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="submit"
                  disabled={modalBusy}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {modalBusy ? 'Linking...' : lang === 'si' ? 'සම්බන්ධ කරන්න' : 'Link Child Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset to Default Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl">
            <h3 className="font-display text-lg font-bold text-rose-600 dark:text-rose-400">
              {t(lang, 'menu_reset_default')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {lang === 'si'
                ? 'මෙමගින් ඔබේ කාලසටහන්, සටහන්, දින දර්ශන සිදුවීම් සහ ප්‍රශ්න පත්‍ර ඉවත් කර මුල් විෂයයන් නැවත සකසයි. ඔබේ ගිණුම ඉතිරි වේ.'
                : 'This clears your timetables, notes, calendar events, and study history and restores the default subjects configured by the Admin.'}
            </p>
            {modalError && <p className="text-xs text-rose-600">{modalError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                {lang === 'si' ? 'අවලංගු කරන්න' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => void handleResetToDefault()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {modalBusy ? 'Resetting...' : t(lang, 'menu_reset_default')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleDeleteAccount}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-bold text-rose-600 dark:text-rose-400">
              {t(lang, 'menu_delete_account')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {lang === 'si'
                ? 'ගිණුම ස්ථිරවම මැකීමට කරුණාකර ඔබේ මුරපදය ඇතුළත් කරන්න.'
                : 'Enter your current password to permanently delete this student account and return to the 1st page.'}
            </p>
            <input
              type="password"
              required
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Current Password"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            {modalError && <p className="text-xs text-rose-600">{modalError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                {lang === 'si' ? 'අවලංගු කරන්න' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={modalBusy}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {modalBusy ? 'Deleting...' : t(lang, 'menu_delete_account')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
