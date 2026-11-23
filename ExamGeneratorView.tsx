import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  FileUp,
  GraduationCap,
  ImagePlus,
  Play,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { apiRequest, readFileAsAttachment, type FileAttachmentPayload } from '../lib/api.ts';
import { exportQuestionPaperPdf } from '../lib/pdfExport.ts';
import { PROFILE_THEMES } from '../lib/theme.ts';
import type {
  ExamAttempt,
  PaperLanguage,
  QuestionPaper,
  QuestionType,
  SiteSettings,
  StudentProfile,
  StudyNote,
  SubjectItem,
} from '../types/shared.ts';

interface ExamGeneratorViewProps {
  student: StudentProfile;
  subjects: SubjectItem[];
  papers: QuestionPaper[];
  attempts: ExamAttempt[];
  prefillNote: StudyNote | null;
  siteSettings?: SiteSettings;
  appName?: string;
  onClearPrefillNote: () => void;
  onRefresh: () => void;
}

const ALL_QUESTION_TYPES: QuestionType[] = [
  'MCQ',
  'Single Answer',
  'Multiple Answer',
  'True or False',
  'Fill in the Blanks',
  'Short Answer',
  'Structured',
];

const LANGUAGES: PaperLanguage[] = ['English', 'Sinhala', 'Tamil'];

type SubView = 'generator' | 'library' | 'exam' | 'results';

export const ExamGeneratorView: React.FC<ExamGeneratorViewProps> = ({
  student,
  subjects,
  papers,
  attempts,
  prefillNote,
  siteSettings,
  appName,
  onClearPrefillNote,
  onRefresh,
}) => {
  const theme = PROFILE_THEMES[student.profileTheme] || PROFILE_THEMES.indigo;

  const [subView, setSubView] = useState<SubView>('generator');

  // Generator Form State
  const [subject, setSubject] = useState<string>(subjects[0]?.name || 'Mathematics');
  const [lessonName, setLessonName] = useState('');
  const [topic, setTopic] = useState('');
  const [notesText, setNotesText] = useState('');
  const [attachments, setAttachments] = useState<FileAttachmentPayload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [countPreset, setCountPreset] = useState<'20' | '30' | '50' | 'custom'>('20');
  const [customCount, setCustomCount] = useState<number>(15);
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>(['MCQ', 'True or False', 'Fill in the Blanks', 'Short Answer']);
  const [language, setLanguage] = useState<PaperLanguage>('English');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(30);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Exam Mode State
  const [activePaper, setActivePaper] = useState<QuestionPaper | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [latestAttempt, setLatestAttempt] = useState<ExamAttempt | null>(null);
  const [autoSaveLabel, setAutoSaveLabel] = useState('');

  const timerRef = useRef<number | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    if (prefillNote) {
      setSubject(prefillNote.subject || subjects[0]?.name || 'Mathematics');
      setLessonName(prefillNote.lesson || prefillNote.title);
      setTopic(prefillNote.title);
      setNotesText(prefillNote.content || '');
      if (prefillNote.attachmentData) {
        setAttachments([
          {
            name: prefillNote.attachmentName,
            mimeType: prefillNote.attachmentMime,
            data: prefillNote.attachmentData,
          },
        ]);
      }
      setSubView('generator');
      onClearPrefillNote();
    }
  }, [prefillNote, subjects, onClearPrefillNote]);

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError('');
    const incoming: FileAttachmentPayload[] = [];
    for (const file of Array.from(fileList)) {
      if (attachments.length + incoming.length >= 10) {
        setError('Maximum 10 pictures/documents can be attached per paper.');
        break;
      }
      try {
        const att = await readFileAsAttachment(file, 8 * 1024 * 1024);
        incoming.push(att);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not read ${file.name}.`);
      }
    }
    if (incoming.length > 0) {
      setAttachments((prev) => [...prev, ...incoming]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await addFiles(e.dataTransfer.files);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleQuestionType = (qt: QuestionType) => {
    setSelectedTypes((prev) => {
      if (prev.includes(qt)) {
        return prev.length > 1 ? prev.filter((x) => x !== qt) : prev;
      }
      return [...prev, qt];
    });
  };

  const handleGeneratePaper = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setGenerating(true);
    const questionCount = countPreset === 'custom' ? customCount : Number(countPreset);

    try {
      const res = await apiRequest<{ paper: QuestionPaper }>('/papers/generate', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          lessonName: lessonName.trim() || topic.trim(),
          topic: topic.trim(),
          notesText: notesText.trim(),
          questionCount,
          questionTypes: selectedTypes,
          language,
          timeLimitMinutes,
          attachments,
        }),
      });
      onRefresh();
      startExam(res.paper);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate question paper.');
    } finally {
      setGenerating(false);
    }
  };

  const startExam = (paper: QuestionPaper) => {
    setActivePaper(paper);
    setCurrentIndex(0);
    setAnswers({});
    setRemainingSeconds(paper.timeLimitMinutes * 60);
    setAutoSaveLabel('Auto-save enabled');
    setSubView('exam');
  };

  const handleSubmitExam = async (autoTriggered = false) => {
    if (!activePaper || submittingExam) return;
    setSubmittingExam(true);
    if (timerRef.current) window.clearInterval(timerRef.current);

    const totalSec = activePaper.timeLimitMinutes * 60;
    const spent = Math.max(1, totalSec - remainingSeconds);

    try {
      const res = await apiRequest<{ attempt: ExamAttempt }>(`/papers/${activePaper.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: answersRef.current,
          timeSpentSeconds: autoTriggered ? totalSec : spent,
        }),
      });
      setLatestAttempt(res.attempt);
      setSubView('results');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit exam.');
    } finally {
      setSubmittingExam(false);
    }
  };

  useEffect(() => {
    if (subView !== 'exam' || !activePaper) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }

    timerRef.current = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timerRef.current!);
          void handleSubmitExam(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [subView, activePaper?.id]);

  const setAnswerForQuestion = (questionId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setAutoSaveLabel(`Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  };

  const handleDeletePaper = async (id: string) => {
    await apiRequest(`/papers/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const activeQuestion = activePaper?.questions[currentIndex] || null;
  const pictureCount = attachments.filter((a) => a.mimeType.startsWith('image/')).length;
  const documentCount = attachments.length - pictureCount;

  return (
    <div className="space-y-6">
      {/* Top Sub-Navigation */}
      {subView !== 'exam' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setSubView('generator')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                subView === 'generator'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              AI Paper Generator
            </button>
            <button
              type="button"
              onClick={() => setSubView('library')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                subView === 'library'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Saved Papers &amp; Results ({papers.length})
            </button>
            {latestAttempt && (
              <button
                type="button"
                onClick={() => setSubView('results')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                  subView === 'results'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Latest Results
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* 1. AI QUESTION PAPER GENERATOR FORM */}
      {subView === 'generator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleGeneratePaper}
            className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 dark:border-slate-800">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <div>
                <h2 className="font-display text-lg font-bold">AI Question Paper Generator</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add multiple pictures of textbook pages/notes AND PDF or text documents—AI builds questions strictly from your materials
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Subject</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  <option value="General Knowledge">General Knowledge</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Lesson or Unit Name
                </label>
                <input
                  type="text"
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  placeholder="e.g. Unit 4: Cellular Respiration"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Specific Topic / Learning Objectives
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Glycolysis, Krebs Cycle, ATP yield and Electron Transport Chain"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Paste Study Notes / Textbook Passage
              </label>
              <textarea
                rows={4}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Paste your study notes, definitions, or chapter text here..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            {/* Multi-Picture & Document Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-2xl border-2 border-dashed p-5 transition-colors ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Attach Study Pictures &amp; Documents ({attachments.length}/10)
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Drag &amp; drop or choose multiple photos (PNG, JPG, WEBP) and documents (PDF, TXT, MD, CSV)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer whitespace-nowrap">
                    <ImagePlus className="w-4 h-4" />
                    Add Pictures
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>

                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                    <FileUp className="w-4 h-4 text-indigo-500" />
                    Add Documents
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.csv"
                      multiple
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              {attachments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-700 space-y-3">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                    Attached: {pictureCount} picture{pictureCount === 1 ? '' : 's'} · {documentCount} document{documentCount === 1 ? '' : 's'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {attachments.map((att, idx) => {
                      const isImg = att.mimeType.startsWith('image/');
                      return (
                        <div
                          key={`${att.name}-${idx}`}
                          className="flex items-center justify-between gap-2.5 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isImg ? (
                              <img
                                src={att.data}
                                alt={att.name}
                                className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{att.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {isImg ? 'Picture' : att.mimeType === 'application/pdf' ? 'PDF Document' : 'Text Document'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="p-1 text-slate-400 hover:text-rose-500 shrink-0 cursor-pointer"
                            aria-label={`Remove ${att.name}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Question Count + Language + Time Limit */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Number of Questions
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(['20', '30', '50', 'custom'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCountPreset(opt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        countPreset === opt
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {opt === 'custom' ? 'Custom' : `${opt} Qs`}
                    </button>
                  ))}
                </div>
                {countPreset === 'custom' && (
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={customCount}
                    onChange={(e) => setCustomCount(Number(e.target.value))}
                    className="mt-2 w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Paper Language
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguage(lang)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        language === lang
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Exam Time Limit (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            {/* Question Types */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Question Types (Select one or more)
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_QUESTION_TYPES.map((qt) => {
                  const active = selectedTypes.includes(qt);
                  return (
                    <button
                      key={qt}
                      type="button"
                      onClick={() => toggleQuestionType(qt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {qt}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={generating}
              className={`w-full py-3 px-6 rounded-xl ${theme.primaryBg} ${theme.primaryHover} text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60`}
            >
              <GraduationCap className="w-4.5 h-4.5" />
              {generating
                ? 'Analyzing Materials & Generating Paper with Gemini AI...'
                : `Generate ${countPreset === 'custom' ? customCount : countPreset}-Question ${language} Paper & Start Exam`}
            </button>
          </form>

          {/* Right Exam Hall Card */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="h-44 relative overflow-hidden">
                <img
                  src={siteSettings?.examBannerUrl || '/src/assets/images/banner_exam_hall_1795360852847.jpg'}
                  alt="University examination reading hall"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <div className="font-display text-base font-bold">Real Examination Mode</div>
                  <p className="text-xs text-slate-200 mt-0.5">
                    Live countdown timer, question palette, auto-save, and instant AI grading.
                  </p>
                </div>
              </div>
              <div className="p-5 space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>Generated Papers</span>
                  <span className="font-mono font-semibold tabular-nums">{papers.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Completed Attempts</span>
                  <span className="font-mono font-semibold tabular-nums">{attempts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Multimodal Inputs</span>
                  <span className="font-medium">Pictures + PDFs + Notes</span>
                </div>
                <div className="flex justify-between">
                  <span>Languages Supported</span>
                  <span className="font-medium">Sinhala · English · Tamil</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* 2. SAVED PAPERS & PAST ATTEMPTS */}
      {subView === 'library' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            <h3 className="font-display text-base font-bold">Your Generated Question Papers</h3>
            {papers.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500">
                No generated question papers yet. Create one in the AI Paper Generator tab.
              </div>
            ) : (
              papers.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <h4 className="font-display text-sm font-bold">{p.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {p.subject} · {p.lessonName} · {p.language} · {p.questions.length} Qs · {p.totalMarks} marks · {p.timeLimitMinutes}m
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void exportQuestionPaperPdf(p, student, appName || siteSettings?.appName)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      title="Download Paper as PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => startExam(p)}
                      className={`px-4 py-2 rounded-xl ${theme.primaryBg} text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      Take Exam
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePaper(p.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-500 cursor-pointer"
                      aria-label="Delete paper"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="lg:col-span-5 space-y-3">
            <h3 className="font-display text-base font-bold">Past Exam Results</h3>
            {attempts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
                Complete an exam to see your score history and analysis.
              </div>
            ) : (
              attempts.map((a) => (
                <div
                  key={a.id}
                  onClick={() => {
                    setLatestAttempt(a);
                    setSubView('results');
                  }}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{a.paperTitle}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {a.subject} · {new Date(a.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="font-mono text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums shrink-0">
                      {a.percentage}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 3. REAL EXAMINATION INTERFACE */}
      {subView === 'exam' && activePaper && activeQuestion && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activePaper.subject} · {activePaper.lessonName} · {activePaper.language} · {activePaper.totalMarks} Total Marks
              </p>
              <h2 className="font-display text-lg font-bold">{activePaper.title}</h2>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <span className="text-xs text-slate-400 hidden md:inline">{autoSaveLabel}</span>
              <div
                className={`px-3.5 py-2 rounded-xl border font-mono text-base font-bold tabular-nums flex items-center gap-2 ${
                  remainingSeconds < 120
                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                {formatCountdown(remainingSeconds)}
              </div>
              <button
                type="button"
                disabled={submittingExam}
                onClick={() => handleSubmitExam(false)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {submittingExam ? 'Grading...' : 'Submit Paper'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between min-h-[380px]">
              <div className="space-y-5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold tabular-nums">
                    Question {currentIndex + 1} of {activePaper.questions.length}
                  </span>
                  <span>
                    {activeQuestion.type} · {activeQuestion.marks} {activeQuestion.marks === 1 ? 'mark' : 'marks'}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-semibold leading-relaxed">
                  {activeQuestion.question}
                </h3>

                {(activeQuestion.type === 'MCQ' || activeQuestion.type === 'True or False') && (
                  <div className="space-y-2.5">
                    {activeQuestion.options.map((opt) => {
                      const selected = answers[activeQuestion.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAnswerForQuestion(activeQuestion.id, opt)}
                          className={`w-full text-left p-3.5 rounded-xl border text-sm transition-colors cursor-pointer ${
                            selected
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 font-semibold text-indigo-800 dark:text-indigo-200'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeQuestion.type === 'Multiple Answer' && (
                  <div className="space-y-2.5">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Select all matching options:</p>
                    {activeQuestion.options.map((opt) => {
                      const currentArr = Array.isArray(answers[activeQuestion.id])
                        ? (answers[activeQuestion.id] as string[])
                        : [];
                      const checked = currentArr.includes(opt);
                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm cursor-pointer ${
                            checked
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? currentArr.filter((x) => x !== opt)
                                : [...currentArr, opt];
                              setAnswerForQuestion(activeQuestion.id, next);
                            }}
                            className="accent-indigo-600"
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {(activeQuestion.type === 'Single Answer' || activeQuestion.type === 'Fill in the Blanks') && (
                  <input
                    type="text"
                    value={String(answers[activeQuestion.id] ?? '')}
                    onChange={(e) => setAnswerForQuestion(activeQuestion.id, e.target.value)}
                    placeholder="Type your exact answer..."
                    className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}

                {(activeQuestion.type === 'Short Answer' || activeQuestion.type === 'Structured') && (
                  <textarea
                    rows={activeQuestion.type === 'Structured' ? 6 : 3}
                    value={String(answers[activeQuestion.id] ?? '')}
                    onChange={(e) => setAnswerForQuestion(activeQuestion.id, e.target.value)}
                    placeholder="Write your detailed answer..."
                    className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>

              <div className="flex items-center justify-between pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                {currentIndex < activePaper.questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((i) => Math.min(activePaper.questions.length - 1, i + 1))}
                    className={`px-4 py-2 rounded-xl ${theme.primaryBg} text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer`}
                  >
                    Next Question
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submittingExam}
                    onClick={() => handleSubmitExam(false)}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    {submittingExam ? 'Grading...' : 'Finish & Submit Paper'}
                  </button>
                )}
              </div>
            </div>

            <aside className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 h-fit">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold">Question Navigator</h3>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {Object.keys(answers).filter((k) => {
                    const v = answers[k];
                    return Array.isArray(v) ? v.length > 0 : String(v).trim().length > 0;
                  }).length}/{activePaper.questions.length} answered
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {activePaper.questions.map((q, idx) => {
                  const val = answers[q.id];
                  const answered = Array.isArray(val) ? val.length > 0 : String(val ?? '').trim().length > 0;
                  const isCurrent = idx === currentIndex;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`py-2 rounded-lg font-mono text-xs font-semibold tabular-nums border cursor-pointer ${
                        isCurrent
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : answered
                            ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setSubView('library')}
                className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Exit Exam Without Submitting
              </button>
            </aside>
          </div>
        </div>
      )}

      {/* 4. RESULTS & PERFORMANCE ANALYSIS PAGE */}
      {subView === 'results' && latestAttempt && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {latestAttempt.subject} · {latestAttempt.lessonName} · Submitted {new Date(latestAttempt.submittedAt).toLocaleString()}
                </p>
                <h2 className="font-display text-2xl font-bold mt-1">{latestAttempt.paperTitle}</h2>
              </div>

              <div className="flex items-center gap-2.5">
                {(() => {
                  const matchedPaper = papers.find((p) => p.id === latestAttempt.paperId);
                  return matchedPaper ? (
                    <button
                      type="button"
                      onClick={() =>
                        void exportQuestionPaperPdf(matchedPaper, student, appName || siteSettings?.appName)
                      }
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Paper PDF
                    </button>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={() => setSubView('generator')}
                  className={`px-4 py-2 rounded-xl ${theme.primaryBg} text-white text-xs font-semibold cursor-pointer`}
                >
                  Generate Another Paper
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Marks</div>
                <div className="font-mono text-2xl font-bold tabular-nums mt-1">
                  {latestAttempt.score} / {latestAttempt.totalMarks}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500 dark:text-slate-400">Percentage</div>
                <div className="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums mt-1">
                  {latestAttempt.percentage}%
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500 dark:text-slate-400">Correct Answers</div>
                <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
                  {latestAttempt.correctCount}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500 dark:text-slate-400">Incorrect Answers</div>
                <div className="font-mono text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums mt-1">
                  {latestAttempt.incorrectCount}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-500" />
              <h3 className="font-display text-base font-bold">Answer Sheet, Explanations &amp; Performance Review</h3>
            </div>

            {latestAttempt.results.map((r) => (
              <div
                key={r.questionId}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    {r.isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Q{r.number} · {r.type}
                      </p>
                      <h4 className="text-sm font-semibold mt-0.5">{r.question}</h4>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold tabular-nums shrink-0">
                    {r.marksAwarded} / {r.maxMarks}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Your Answer</span>
                    <span className="font-medium">
                      {Array.isArray(r.userAnswer)
                        ? r.userAnswer.join(', ') || 'Not answered'
                        : r.userAnswer || 'Not answered'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30">
                    <span className="text-emerald-700 dark:text-emerald-400 block mb-0.5">Correct / Model Answer</span>
                    <span className="font-medium text-emerald-900 dark:text-emerald-200">{r.correctAnswer}</span>
                  </div>
                </div>

                {(r.explanation || r.aiFeedback) && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 pt-1 leading-relaxed">
                    {r.aiFeedback && <p className="font-medium text-indigo-600 dark:text-indigo-400 mb-1">AI Marker Feedback: {r.aiFeedback}</p>}
                    {r.explanation && <p>Explanation: {r.explanation}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
