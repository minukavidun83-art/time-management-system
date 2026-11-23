import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { apiRequest, formatMinutes } from '../lib/api.ts';
import { PROFILE_THEMES } from '../lib/theme.ts';
import type {
  DashboardAnalytics,
  StudentProfile,
  StudySession,
  SubjectItem,
  TimerMode,
} from '../types/shared.ts';

interface StudyTimerViewProps {
  student: StudentProfile;
  subjects: SubjectItem[];
  analytics: DashboardAnalytics | null;
  sessions: StudySession[];
  presetRequest?: { subject: string; minutes: number } | null;
  onConsumePreset?: () => void;
  onSessionLogged: () => void;
}

const PRESETS: { mode: TimerMode; label: string; minutes: number }[] = [
  { mode: 'focus_25', label: '25m Focus', minutes: 25 },
  { mode: 'break_5', label: '5m Break', minutes: 5 },
  { mode: 'long_break_15', label: '15m Long Break', minutes: 15 },
  { mode: 'custom', label: 'Custom Session', minutes: 45 },
];

export const StudyTimerView: React.FC<StudyTimerViewProps> = ({
  student,
  subjects,
  analytics,
  sessions,
  presetRequest,
  onConsumePreset,
  onSessionLogged,
}) => {
  const theme = PROFILE_THEMES[student.profileTheme] || PROFILE_THEMES.indigo;

  const [mode, setMode] = useState<TimerMode>('focus_25');
  const [customMinutes, setCustomMinutes] = useState<number>(45);
  const [selectedSubject, setSelectedSubject] = useState<string>(subjects[0]?.name || 'Mathematics');
  const [totalSeconds, setTotalSeconds] = useState<number>(25 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedSubject && subjects.length > 0) {
      setSelectedSubject(subjects[0].name);
    }
  }, [subjects, selectedSubject]);

  useEffect(() => {
    if (presetRequest) {
      const safeMins = Math.max(1, Math.min(240, presetRequest.minutes));
      setIsRunning(false);
      setHasStarted(false);
      setMode('custom');
      setCustomMinutes(safeMins);
      setTotalSeconds(safeMins * 60);
      setRemainingSeconds(safeMins * 60);
      if (presetRequest.subject) setSelectedSubject(presetRequest.subject);
      setStatusMessage(`Ready for ${presetRequest.subject || 'Focus'} (${safeMins}m). Press Start Session.`);
      onConsumePreset?.();
    }
  }, [presetRequest, onConsumePreset]);

  const handleSelectMode = (nextMode: TimerMode, defaultMins: number) => {
    setIsRunning(false);
    setHasStarted(false);
    setMode(nextMode);
    const mins = nextMode === 'custom' ? customMinutes : defaultMins;
    setTotalSeconds(mins * 60);
    setRemainingSeconds(mins * 60);
    setStatusMessage('');
  };

  const handleCustomMinutesChange = (mins: number) => {
    const safe = Math.max(1, Math.min(240, mins));
    setCustomMinutes(safe);
    if (mode === 'custom' && !isRunning) {
      setTotalSeconds(safe * 60);
      setRemainingSeconds(safe * 60);
    }
  };

  const logCompletedSession = async (minutesCompleted: number) => {
    if (minutesCompleted < 1) return;
    setSaving(true);
    try {
      await apiRequest('/study-sessions', {
        method: 'POST',
        body: JSON.stringify({
          subject: selectedSubject || 'General',
          mode,
          durationMinutes: minutesCompleted,
          sessionDate: new Date().toISOString().slice(0, 10),
        }),
      });
      setStatusMessage(`Logged ${minutesCompleted}m ${mode.includes('break') ? 'break' : `for ${selectedSubject}`}.`);
      onSessionLogged();
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to save study session.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalRef.current!);
          setIsRunning(false);
          setHasStarted(false);
          const mins = Math.max(1, Math.round(totalSeconds / 60));
          void logCompletedSession(mins);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [isRunning, totalSeconds]);

  const handleStartOrResume = () => {
    if (remainingSeconds === 0) {
      setRemainingSeconds(totalSeconds);
    }
    setIsRunning(true);
    setHasStarted(true);
    setStatusMessage('');
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setHasStarted(false);
    setRemainingSeconds(totalSeconds);
    setStatusMessage('');
  };

  const handleCompleteEarly = async () => {
    const elapsedSeconds = totalSeconds - remainingSeconds;
    const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    setIsRunning(false);
    setHasStarted(false);
    setRemainingSeconds(totalSeconds);
    await logCompletedSession(elapsedMinutes);
  };

  const minsDisplay = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const secsDisplay = String(remainingSeconds % 60).padStart(2, '0');
  const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;
  const radius = 112;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col items-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
            {PRESETS.map((p) => (
              <button
                key={p.mode}
                type="button"
                onClick={() => handleSelectMode(p.mode, p.minutes)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === p.mode
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Current Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
                {!subjects.some((s) => s.name === selectedSubject) && selectedSubject && (
                  <option value={selectedSubject}>{selectedSubject}</option>
                )}
                <option value="General Revision">General Revision</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Custom Duration (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={240}
                value={mode === 'custom' ? customMinutes : Math.round(totalSeconds / 60)}
                disabled={mode !== 'custom' || isRunning}
                onChange={(e) => handleCustomMinutesChange(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="relative w-64 h-64 flex items-center justify-center my-2">
            <svg className="w-64 h-64 -rotate-90" viewBox="0 0 256 256">
              <circle
                cx="128"
                cy="128"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                className="text-slate-100 dark:text-slate-800"
              />
              <circle
                cx="128"
                cy="128"
                r={radius}
                fill="none"
                stroke="url(#timerGradient)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
              />
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4F46E5" />
                  <stop offset="100%" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {mode.includes('break') ? 'Break Time' : selectedSubject}
              </span>
              <span className="font-mono text-5xl font-bold tracking-tight tabular-nums mt-1">
                {minsDisplay}:{secsDisplay}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                {isRunning ? 'Session in progress' : hasStarted ? 'Paused' : 'Ready to start'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleStartOrResume}
                className={`px-6 py-2.5 rounded-xl ${theme.primaryBg} ${theme.primaryHover} text-white font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer`}
              >
                <Play className="w-4 h-4" />
                {hasStarted ? 'Resume' : 'Start Session'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePause}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>

            {hasStarted && totalSeconds - remainingSeconds >= 60 && (
              <button
                type="button"
                disabled={saving}
                onClick={handleCompleteEarly}
                className="px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Save &amp; Finish
              </button>
            )}
          </div>

          {statusMessage && (
            <p className="mt-4 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {statusMessage}
            </p>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="font-display text-base font-semibold mb-4">Study Time Breakdown</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500 dark:text-slate-400">Daily Study Time</div>
                <div className="font-mono text-xl font-bold tabular-nums mt-1">
                  {formatMinutes(analytics?.todayStudyMinutes ?? 0)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500 dark:text-slate-400">Weekly Study Time</div>
                <div className="font-mono text-xl font-bold tabular-nums mt-1">
                  {formatMinutes(analytics?.weeklyStudyMinutes ?? 0)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500 dark:text-slate-400">Monthly Study Time</div>
                <div className="font-mono text-xl font-bold tabular-nums mt-1">
                  {formatMinutes(analytics?.monthlyStudyMinutes ?? 0)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Study Time</div>
                <div className="font-mono text-xl font-bold tabular-nums mt-1">
                  {formatMinutes(analytics?.totalStudyMinutes ?? 0)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold">Recent Sessions</h2>
              <Timer className="w-4 h-4 text-slate-400" />
            </div>

            {sessions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                Complete a study session to build your focus history.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {sessions.slice(0, 10).map((s) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.subject}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {s.sessionDate} · {s.mode.replace('_', ' ')}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold tabular-nums text-indigo-600 dark:text-indigo-400 shrink-0">
                      {formatMinutes(s.durationMinutes)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
