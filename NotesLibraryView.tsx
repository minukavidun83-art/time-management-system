import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  FileText,
  GraduationCap,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiRequest, readFileAsAttachment } from '../lib/api.ts';
import { PROFILE_THEMES } from '../lib/theme.ts';
import type { StudentProfile, StudyNote, SubjectItem } from '../types/shared.ts';

interface NotesLibraryViewProps {
  student: StudentProfile;
  notes: StudyNote[];
  subjects: SubjectItem[];
  onRefresh: () => void;
  onGenerateExamFromNote: (note: StudyNote) => void;
}

export const NotesLibraryView: React.FC<NotesLibraryViewProps> = ({
  student,
  notes,
  subjects,
  onRefresh,
  onGenerateExamFromNote,
}) => {
  const theme = PROFILE_THEMES[student.profileTheme] || PROFILE_THEMES.indigo;

  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [importantOnly, setImportantOnly] = useState(false);

  const [selectedNote, setSelectedNote] = useState<StudyNote | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(subjects[0]?.name || 'Mathematics');
  const [lesson, setLesson] = useState('');
  const [content, setContent] = useState('');
  const [isImportant, setIsImportant] = useState(false);
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentMime, setAttachmentMime] = useState('');
  const [attachmentData, setAttachmentData] = useState('');
  const [saving, setSaving] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (subjectFilter !== 'All' && n.subject !== subjectFilter) return false;
      if (importantOnly && !n.isImportant) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.lesson.toLowerCase().includes(q) ||
          n.subject.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [notes, subjectFilter, importantOnly, search]);

  const openCreate = () => {
    setEditingId(null);
    setTitle('');
    setSubject(subjects[0]?.name || 'Mathematics');
    setLesson('');
    setContent('');
    setIsImportant(false);
    setAttachmentName('');
    setAttachmentMime('');
    setAttachmentData('');
    setError('');
    setShowEditor(true);
  };

  const openEdit = (n: StudyNote) => {
    setEditingId(n.id);
    setTitle(n.title);
    setSubject(n.subject);
    setLesson(n.lesson);
    setContent(n.content);
    setIsImportant(n.isImportant);
    setAttachmentName(n.attachmentName);
    setAttachmentMime(n.attachmentMime);
    setAttachmentData(n.attachmentData);
    setError('');
    setShowEditor(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const att = await readFileAsAttachment(file, 8 * 1024 * 1024);
      setAttachmentName(att.name);
      setAttachmentMime(att.mimeType);
      setAttachmentData(att.data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed.');
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        subject,
        lesson: lesson.trim(),
        content,
        isImportant,
        attachmentName,
        attachmentMime,
        attachmentData,
      };
      if (editingId) {
        const res = await apiRequest<{ note: StudyNote }>(`/notes/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setSelectedNote(res.note);
      } else {
        const res = await apiRequest<{ note: StudyNote }>('/notes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSelectedNote(res.note);
      }
      setShowEditor(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStar = async (n: StudyNote) => {
    const res = await apiRequest<{ note: StudyNote }>(`/notes/${n.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isImportant: !n.isImportant }),
    });
    if (selectedNote?.id === n.id) setSelectedNote(res.note);
    onRefresh();
  };

  const handleDeleteNote = async (id: string) => {
    await apiRequest(`/notes/${id}`, { method: 'DELETE' });
    if (selectedNote?.id === id) setSelectedNote(null);
    onRefresh();
  };

  const handleSummarizeNote = async (n: StudyNote) => {
    setSummarizingId(n.id);
    setError('');
    try {
      const res = await apiRequest<{ note: StudyNote }>(`/notes/${n.id}/summarize`, {
        method: 'POST',
      });
      setSelectedNote(res.note);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI summary failed.');
    } finally {
      setSummarizingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, lessons, or keywords..."
              className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          >
            <option value="All">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setImportantOnly(!importantOnly)}
            className={`px-3 py-2 text-xs font-medium rounded-xl border flex items-center gap-1.5 cursor-pointer ${
              importantOnly
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            Important Only
          </button>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className={`px-4 py-2.5 rounded-xl ${theme.primaryBg} ${theme.primaryHover} text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer`}
        >
          <Plus className="w-4 h-4" />
          New Study Note
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Two-Column Library */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
              <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No study notes yet. Save lecture notes, PDFs, or images here.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
              >
                Create First Note
              </button>
            </div>
          ) : (
            filteredNotes.map((n) => (
              <div
                key={n.id}
                onClick={() => setSelectedNote(n)}
                className={`rounded-2xl border p-4 cursor-pointer transition-colors ${
                  selectedNote?.id === n.id
                    ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold truncate">{n.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {n.subject}
                      {n.lesson ? ` · ${n.lesson}` : ''}
                      {n.attachmentName ? ` · ${n.attachmentName}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStar(n);
                    }}
                    className="text-slate-400 hover:text-amber-500 shrink-0 cursor-pointer"
                    aria-label="Toggle important"
                  >
                    <Star className={`w-4 h-4 ${n.isImportant ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                </div>
                {n.content && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{n.content}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Selected Note Reader & AI Tools */}
        <div className="lg:col-span-7">
          {selectedNote ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedNote.subject}
                    {selectedNote.lesson ? ` · ${selectedNote.lesson}` : ''}
                    {` · Updated ${new Date(selectedNote.updatedAt).toLocaleDateString()}`}
                  </p>
                  <h2 className="font-display text-xl font-bold mt-1">{selectedNote.title}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSummarizeNote(selectedNote)}
                    disabled={summarizingId === selectedNote.id}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {summarizingId === selectedNote.id ? 'Summarizing...' : 'AI Summarize'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onGenerateExamFromNote(selectedNote)}
                    className="px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    Create Questions
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(selectedNote)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNote(selectedNote.id)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label="Delete note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {selectedNote.aiSummary && (
                <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/70 space-y-1.5">
                  <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Study Summary
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {selectedNote.aiSummary}
                  </div>
                </div>
              )}

              <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {selectedNote.content || 'No written notes added.'}
              </div>

              {selectedNote.attachmentData && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      {selectedNote.attachmentName}
                    </span>
                    <a
                      href={selectedNote.attachmentData}
                      download={selectedNote.attachmentName}
                      className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                    >
                      Download File
                    </a>
                  </div>
                  {selectedNote.attachmentMime.startsWith('image/') && (
                    <img
                      src={selectedNote.attachmentData}
                      alt={selectedNote.attachmentName}
                      className="max-h-72 rounded-xl border border-slate-200 dark:border-slate-700 object-contain"
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Select a study note on the left to read, summarize with AI, or generate a practice exam paper.
            </div>
          )}
        </div>
      </div>

      {/* Note Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">{editingId ? 'Edit Study Note' : 'New Study Note'}</h3>
              <button type="button" onClick={() => setShowEditor(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Note Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Photosynthesis Light & Dark Reactions"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Subject</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                    <option value="General">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Lesson / Unit</label>
                  <input
                    type="text"
                    value={lesson}
                    onChange={(e) => setLesson(e.target.value)}
                    placeholder="e.g. Unit 3 · Plant Biology"
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Study Notes Content</label>
                <textarea
                  rows={7}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write or paste your lesson notes here..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <Upload className="w-4 h-4 text-indigo-500" />
                  {attachmentName ? `Attached: ${attachmentName}` : 'Attach PDF or Image (max 8MB)'}
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,image/*"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isImportant}
                    onChange={(e) => setIsImportant(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  Mark as Important Material
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-5 py-2 rounded-xl ${theme.primaryBg} text-white text-sm font-semibold cursor-pointer disabled:opacity-60`}
                >
                  {saving ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
