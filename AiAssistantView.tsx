import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  FileText,
  FileUp,
  ImagePlus,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  apiRequest,
  getAuthToken,
  readFileAsAttachment,
  type FileAttachmentPayload,
} from '../lib/api.ts';
import { PROFILE_THEMES } from '../lib/theme.ts';
import type {
  AiChatMessage,
  AiChatThread,
  SiteSettings,
  StudentProfile,
  SubjectItem,
} from '../types/shared.ts';

interface AiAssistantViewProps {
  student: StudentProfile;
  subjects: SubjectItem[];
  threads: AiChatThread[];
  siteSettings?: SiteSettings;
  onRefreshChats: () => void;
  onRefreshNotes: () => void;
}

type AssistantMode = 'explain' | 'summarize' | 'study_plan' | 'practice' | 'qa';

const MODES: { id: AssistantMode; label: string; placeholder: string }[] = [
  { id: 'explain', label: 'Explain Lesson', placeholder: 'Which concept or lesson feels difficult? Ask me to break it down step-by-step...' },
  { id: 'summarize', label: 'Summarize Notes', placeholder: 'Paste notes below or upload pictures/PDFs and ask for a crisp study summary...' },
  { id: 'study_plan', label: 'Study Plan', placeholder: 'Tell me your exam date, subjects, and hours available to craft a study plan...' },
  { id: 'practice', label: 'Practice Exercises', placeholder: 'Enter a topic or attach notes/photos to generate step-by-step practice problems...' },
  { id: 'qa', label: 'Ask Tutor', placeholder: 'Ask any study question or upload homework photos/documents to review together...' },
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  student,
  subjects,
  threads,
  siteSettings,
  onRefreshChats,
  onRefreshNotes,
}) => {
  const theme = PROFILE_THEMES[student.profileTheme] || PROFILE_THEMES.indigo;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threads[0]?.id ?? null);
  const [mode, setMode] = useState<AssistantMode>('explain');
  const [subject, setSubject] = useState<string>(subjects[0]?.name || 'Mathematics');
  const [prompt, setPrompt] = useState('');
  const [notesText, setNotesText] = useState('');
  const [showNotesBox, setShowNotesBox] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachmentPayload[]>([]);
  const [sending, setSending] = useState(false);
  const [optimisticUserMsg, setOptimisticUserMsg] = useState<AiChatMessage | null>(null);
  const [streamingReply, setStreamingReply] = useState('');
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;
  const savedMessages: AiChatMessage[] = activeThread?.messages ?? [];

  const displayMessages: AiChatMessage[] = [...savedMessages];
  if (optimisticUserMsg) {
    displayMessages.push(optimisticUserMsg);
  }
  if (sending) {
    displayMessages.push({
      id: 'streaming_ai_preview',
      role: 'assistant',
      content: streamingReply,
      mode,
      createdAt: new Date().toISOString(),
    });
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, streamingReply]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError('');
    const next: FileAttachmentPayload[] = [];
    for (const file of Array.from(files)) {
      if (attachments.length + next.length >= 8) {
        setError('Maximum 8 pictures/documents per message.');
        break;
      }
      try {
        const att = await readFileAsAttachment(file, 8 * 1024 * 1024);
        next.push(att);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to attach file.');
      }
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
    e.target.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const trimmedPrompt = prompt.trim();
    const trimmedNotes = notesText.trim();
    if (!trimmedPrompt && !trimmedNotes && attachments.length === 0) return;

    const currentAttachments = [...attachments];
    const effectivePrompt =
      trimmedPrompt || (mode === 'summarize' ? 'Summarize the provided study materials.' : 'Help me study this material.');

    setSending(true);
    setError('');
    setStreamingReply('');
    setOptimisticUserMsg({
      id: `opt_${Date.now()}`,
      role: 'user',
      content:
        effectivePrompt +
        (trimmedNotes ? `\n\n[Attached Notes: ${trimmedNotes.slice(0, 160)}${trimmedNotes.length > 160 ? '...' : ''}]` : ''),
      mode,
      attachmentName: currentAttachments.length > 0 ? currentAttachments.map((a) => a.name).join(', ') : undefined,
      createdAt: new Date().toISOString(),
    });

    // Clear composer immediately so chat feels snappy & responsive
    setPrompt('');
    setNotesText('');
    setAttachments([]);
    setShowNotesBox(false);

    try {
      const headers = new Headers({
        'Content-Type': 'application/json',
        'X-Requested-With': 'SmartStudyAI',
      });
      const token = getAuthToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const res = await fetch('/api/ai/assistant/stream', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          mode,
          subject,
          prompt: trimmedPrompt,
          notesText: trimmedNotes,
          threadId: activeThreadId,
          attachments: currentAttachments,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `Request failed (${res.status})`;
        try {
          const parsed = JSON.parse(errText) as { error?: string };
          if (parsed.error) errMsg = parsed.error;
        } catch {
          if (errText) errMsg = errText;
        }
        throw new Error(errMsg);
      }

      if (!res.body) {
        throw new Error('Streaming response body is unavailable.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completedThreadId: string | null = null;
      let streamError = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const evt = JSON.parse(jsonStr) as {
                type: string;
                text?: string;
                threadId?: string;
                error?: string;
              };
              if (evt.type === 'delta' && evt.text) {
                setStreamingReply((prev) => prev + evt.text);
              } else if (evt.type === 'done' && evt.threadId) {
                completedThreadId = evt.threadId;
              } else if (evt.type === 'error' && evt.error) {
                streamError = evt.error;
              }
            } catch {
              // Ignore partial JSON line
            }
          }
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }

      if (completedThreadId) {
        setActiveThreadId(completedThreadId);
      }
      setOptimisticUserMsg(null);
      setStreamingReply('');
      onRefreshChats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI Study Assistant encountered an error.');
      // Restore composer text if the request failed before completion
      setPrompt(trimmedPrompt);
      setNotesText(trimmedNotes);
      setAttachments(currentAttachments);
      setOptimisticUserMsg(null);
      setStreamingReply('');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteThread = async (id: string) => {
    await apiRequest(`/ai/chats/${id}`, { method: 'DELETE' });
    if (activeThreadId === id) setActiveThreadId(null);
    onRefreshChats();
  };

  const handleSaveToNotes = async (content: string) => {
    await apiRequest('/notes', {
      method: 'POST',
      body: JSON.stringify({
        title: `AI Study Guide: ${subject}`,
        subject,
        lesson: mode.replace('_', ' '),
        content,
        isImportant: true,
      }),
    });
    setSavedNotice('Saved to your Notes & Study Library.');
    setTimeout(() => setSavedNotice(''), 3000);
    onRefreshNotes();
  };

  const activeModeConfig = MODES.find((m) => m.id === mode) || MODES[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[680px]">
      {/* Saved Chats Sidebar */}
      <aside className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between gap-4">
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setActiveThreadId(null);
              setError('');
            }}
            className={`w-full py-2.5 px-3 rounded-xl ${theme.primaryBg} ${theme.primaryHover} text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer`}
          >
            <Plus className="w-4 h-4" />
            New Study Session
          </button>

          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 pt-2">
            Recent Conversations
          </div>

          <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
            {threads.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No saved conversations yet.</p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setActiveThreadId(t.id);
                    setError('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                    activeThreadId === t.id
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40'
                      : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{t.subject}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteThread(t.id);
                    }}
                    className="text-slate-400 hover:text-rose-500 shrink-0 cursor-pointer"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <img
            src={siteSettings?.scholarAvatarUrl || '/src/assets/images/avatar_scholar_bot_1795360852131.jpg'}
            alt={`${siteSettings?.appName || 'Student Time Management System'} Tutor`}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
          />
          <div className="text-xs">
            <div className="font-semibold">AI Study Tutor</div>
            <div className="text-slate-500 dark:text-slate-400">Pictures, PDFs &amp; Instant Q&amp;A</div>
          </div>
        </div>
      </aside>

      {/* Main Chat & Workspace */}
      <section className="lg:col-span-9 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === m.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
            <option value="General Studies">General Studies</option>
          </select>
        </div>

        <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[480px]">
          {displayMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 max-w-lg mx-auto">
              <Sparkles className="w-8 h-8 text-indigo-500 mb-3" />
              <h2 className="font-display text-lg font-bold">How can I help you study today?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Ask any question in English, Sinhala, or Tamil — or upload study pictures and PDF documents for instant answers.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6 w-full text-left">
                {[
                  'Explain photosynthesis light reactions simply with an analogy',
                  'Build a 5-day revision plan for Quadratic Equations',
                  'Create 5 progressive practice problems on Newton’s Laws',
                  'Summarize key causes of World War I into bullet notes',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setPrompt(sample)}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            displayMessages.map((msg) => {
              const isStreamingPreview = msg.id === 'streaming_ai_preview';
              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {msg.attachmentName && (
                      <div className="text-xs opacity-80 mb-1.5 font-medium">
                        Attachments: {msg.attachmentName}
                      </div>
                    )}

                    {isStreamingPreview && !msg.content ? (
                      <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{siteSettings?.appName || 'Student Time Management System'} AI is replying...</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {msg.content}
                        {isStreamingPreview && (
                          <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-indigo-500 animate-pulse rounded-sm" />
                        )}
                      </div>
                    )}

                    {msg.role === 'assistant' && !isStreamingPreview && msg.content && (
                      <div className="mt-3 pt-2 border-t border-slate-200/70 dark:border-slate-700 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveToNotes(msg.content)}
                          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5" />
                          Save to Notes Library
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {(error || savedNotice) && (
          <div className="px-5 pb-2">
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                  aria-label="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {savedNotice && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs">
                {savedNotice}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSend} className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900">
          {showNotesBox && (
            <textarea
              rows={3}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Paste your textbook passage, class notes, or syllabus points here..."
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, idx) => (
                <div
                  key={`${att.name}-${idx}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300"
                >
                  {att.mimeType.startsWith('image/') ? (
                    <img src={att.data} alt={att.name} className="w-5 h-5 rounded object-cover" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                  <span className="max-w-[140px] truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={activeModeConfig.placeholder}
              className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setShowNotesBox(!showNotesBox)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap"
              >
                {showNotesBox ? 'Hide Notes' : 'Paste Notes'}
              </button>

              <label className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                <ImagePlus className="w-4 h-4 text-indigo-500" />
                Pictures
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              <label className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                <FileUp className="w-4 h-4 text-indigo-500" />
                Docs
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.csv"
                  multiple
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              <button
                type="submit"
                disabled={sending || (!prompt.trim() && !notesText.trim() && attachments.length === 0)}
                className={`px-4 py-2.5 rounded-xl ${theme.primaryBg} ${theme.primaryHover} text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap`}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Replying...' : 'Send'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
};
