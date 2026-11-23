import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  ExamQuestion,
  PaperLanguage,
  QuestionType,
  TimetableEntry,
} from '../src/types/shared.ts';

const FAST_MODEL = 'gemini-4-hydrogen';

const AI_COLOR_PALETTE = [
  '#4F46E5',
  '#0284C7',
  '#10B981',
  '#8B5CF6',
  '#E11D48',
  '#F59E0B',
  '#0D9488',
  '#F97316',
];

function getColorForSubject(subject: string, category: string, index: number): string {
  if (category === 'school') return '#0284C7';
  if (category === 'tuition') return '#8B5CF6';
  const s = subject.toLowerCase();
  if (s.includes('math')) return '#4F46E5';
  if (s.includes('science') || s.includes('phys') || s.includes('chem') || s.includes('bio')) return '#0D9488';
  if (s.includes('english')) return '#8B5CF6';
  if (s.includes('sinhala') || s.includes('tamil')) return '#10B981';
  if (s.includes('history') || s.includes('geo')) return '#F59E0B';
  if (s.includes('ict') || s.includes('comp')) return '#0284C7';
  if (s.includes('break') || s.includes('rest')) return '#F97316';
  return AI_COLOR_PALETTE[index % AI_COLOR_PALETTE.length];
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;

  if (raw.includes('GEMINI_API_KEY')) {
    return new Error('AI API key is not configured. Please check Settings > Secrets.');
  }
  if (status === 403 || raw.includes('PERMISSION_DENIED')) {
    return new Error('Gemini API permission denied. Please verify your API key in Settings > Secrets.');
  }
  if (status === 400 && (raw.includes('API_KEY_INVALID') || raw.includes('API key not valid'))) {
    return new Error('Gemini API key is invalid. Please update GEMINI_API_KEY in Settings > Secrets.');
  }
  if (status === 429 || raw.includes('RESOURCE_EXHAUSTED') || raw.toLowerCase().includes('quota')) {
    return new Error('AI rate limit reached. Please wait a few seconds and send your message again.');
  }
  if (status === 404 || raw.includes('NOT_FOUND')) {
    return new Error('Selected AI model is currently unavailable. Please try again.');
  }
  if (raw.toLowerCase().includes('timeout') || raw.toLowerCase().includes('aborted')) {
    return new Error('AI response timed out. Please try a shorter prompt or retry in a moment.');
  }
  return new Error(raw || 'AI service encountered an unexpected error. Please try again.');
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 500 ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT');
      if (!isRetryable || attempt === maxAttempts) {
        throw formatGeminiError(err);
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw formatGeminiError(lastErr);
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
}

export interface UploadedAttachment {
  name: string;
  mimeType: string;
  data: string; // base64 or data URL
}

function buildAttachmentsParts(
  attachment?: UploadedAttachment | null,
  attachments?: UploadedAttachment[] | null
): {
  parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }>;
  attachedNames: string[];
} {
  const list: UploadedAttachment[] = [];
  if (Array.isArray(attachments)) {
    for (const item of attachments) {
      if (item && item.data) list.push(item);
    }
  }
  if (attachment && attachment.data) {
    list.push(attachment);
  }

  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
  const attachedNames: string[] = [];

  for (const item of list.slice(0, 10)) {
    const rawBase64 = item.data.includes(',') ? item.data.split(',')[1] ?? '' : item.data;
    const mime = item.mimeType || 'application/octet-stream';

    if (
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      item.name.toLowerCase().endsWith('.md') ||
      item.name.toLowerCase().endsWith('.txt') ||
      item.name.toLowerCase().endsWith('.csv')
    ) {
      try {
        const decoded = Buffer.from(rawBase64, 'base64').toString('utf8');
        parts.push({
          text: `\n--- Attached Document (${item.name}) ---\n${decoded.slice(0, 50000)}\n--- End Attached Document ---\n`,
        });
        attachedNames.push(item.name);
        continue;
      } catch {
        // fall through
      }
    }

    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      parts.push({
        inlineData: {
          mimeType: mime,
          data: rawBase64,
        },
      });
      attachedNames.push(item.name);
    }
  }

  return { parts, attachedNames };
}

function buildAssistantPayload(params: {
  mode: 'explain' | 'summarize' | 'study_plan' | 'practice' | 'qa';
  subject: string;
  prompt: string;
  notesText?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachment?: UploadedAttachment | null;
  attachments?: UploadedAttachment[] | null;
  studentName?: string;
  studentGrade?: string;
}) {
  const modeInstructions: Record<string, string> = {
    explain:
      'Explain the lesson or concept clearly step-by-step for the student. Use analogies, key formulas/definitions, and check understanding with 2 quick self-check questions at the end.',
    summarize:
      'Summarize the provided notes/document into a crisp, high-retention study guide with: Core Concepts, Key Definitions, Important Formulas/Facts, and Quick Revision Bullets.',
    study_plan:
      'Create an actionable, realistic study plan tailored to the student request with time blocks, milestones, active recall techniques, and spaced repetition checkpoints.',
    practice:
      'Generate targeted practice exercises with progressive difficulty (Easy, Medium, Challenge) strictly grounded in the provided study material, followed by an Answer Key & Explanations section.',
    qa:
      'Answer the student question clearly, patiently, and accurately using the provided notes or subject context. Reply in the same language (Sinhala, English, or Tamil) the student used.',
  };

  const systemInstruction = `You are SMART STUDY AI, a friendly, fast, rigorous academic tutor helping ${params.studentName || 'a student'}${params.studentGrade ? ` (${params.studentGrade})` : ''}.
Subject focus: ${params.subject || 'General Studies'}.
Task mode: ${modeInstructions[params.mode] || modeInstructions.qa}
If the student writes in Sinhala or Tamil, reply naturally in that language. Format your response cleanly with clear headings, bullet points, numbered steps, and bold key terms.`;

  const historyContext = (params.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n\n');

  const attachmentBundle = buildAttachmentsParts(params.attachment, params.attachments);

  const textPrompt = [
    historyContext ? `Previous Conversation:\n${historyContext}\n` : '',
    params.notesText ? `Student Study Material / Notes:\n${params.notesText}\n` : '',
    `Student Request:\n${params.prompt}`,
  ]
    .filter(Boolean)
    .join('\n');

  const parts = [...attachmentBundle.parts, { text: textPrompt }];
  return { systemInstruction, parts };
}

export async function runStudyAssistant(params: {
  mode: 'explain' | 'summarize' | 'study_plan' | 'practice' | 'qa';
  subject: string;
  prompt: string;
  notesText?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachment?: UploadedAttachment | null;
  attachments?: UploadedAttachment[] | null;
  studentName?: string;
  studentGrade?: string;
}): Promise<string> {
  const ai = getAiClient();
  const { systemInstruction, parts } = buildAssistantPayload(params);

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: FAST_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })
  );

  const output = response.text?.trim();
  if (!output) {
    throw new Error('The AI assistant returned an empty response. Please try again.');
  }
  return output;
}

export async function streamStudyAssistant(
  params: {
    mode: 'explain' | 'summarize' | 'study_plan' | 'practice' | 'qa';
    subject: string;
    prompt: string;
    notesText?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    attachment?: UploadedAttachment | null;
    attachments?: UploadedAttachment[] | null;
    studentName?: string;
    studentGrade?: string;
  },
  onChunk: (delta: string) => void
): Promise<string> {
  const ai = getAiClient();
  const { systemInstruction, parts } = buildAssistantPayload(params);

  try {
    const stream = await ai.models.generateContentStream({
      model: FAST_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    let fullText = '';
    for await (const chunk of stream) {
      const piece = chunk.text ?? '';
      if (piece) {
        fullText += piece;
        onChunk(piece);
      }
    }

    const trimmed = fullText.trim();
    if (!trimmed) {
      throw new Error('The AI assistant returned an empty response. Please try again.');
    }
    return trimmed;
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function generateQuestionPaper(params: {
  subject: string;
  lessonName: string;
  topic: string;
  notesText: string;
  questionCount: number;
  questionTypes: QuestionType[];
  language: PaperLanguage;
  timeLimitMinutes: number;
  attachment?: UploadedAttachment | null;
  attachments?: UploadedAttachment[] | null;
}): Promise<{
  paperTitle: string;
  sourceSummary: string;
  questions: ExamQuestion[];
}> {
  const ai = getAiClient();
  const count = Math.max(5, Math.min(60, Math.round(params.questionCount)));
  const selectedTypes: QuestionType[] =
    params.questionTypes.length > 0 ? params.questionTypes : ['MCQ', 'True or False', 'Short Answer'];

  const languageDirective =
    params.language === 'Sinhala'
      ? 'Write ALL questions, options, correct answers, acceptable answers, paper title, source summary, and explanations in natural, grammatically accurate Sinhala script (සිංහල).'
      : params.language === 'Tamil'
        ? 'Write ALL questions, options, correct answers, acceptable answers, paper title, source summary, and explanations in natural, grammatically accurate Tamil script (தமிழ்).'
        : 'Write ALL questions, options, correct answers, acceptable answers, paper title, source summary, and explanations in clear academic English.';

  const attachmentBundle = buildAttachmentsParts(params.attachment, params.attachments);

  const promptText = `Create a real, curriculum-grade examination paper strictly grounded in the actual study content provided below. Do NOT invent unrelated off-topic questions.

Subject: ${params.subject}
Lesson / Unit: ${params.lessonName}
Topic Focus: ${params.topic || params.lessonName}
Total Questions Required: EXACTLY ${count} questions.
Allowed Question Types (distribute thoughtfully across these selected types): ${selectedTypes.join(', ')}
Language: ${params.language}. ${languageDirective}

Rules for each question type:
1. "MCQ": Provide exactly 4 clear options in "options". "correctAnswer" must match one of the 4 options verbatim.
2. "Multiple Answer": Provide 4 or 5 options in "options". "acceptableAnswers" must list the exact correct options (2 or more), and "correctAnswer" must join them with " | ".
3. "True or False": Set "options" to ["True", "False"] (or localized equivalent in the chosen language: e.g. ["සත්‍ය", "අසත්‍ය"] or ["சரி", "தவறு"]). "correctAnswer" must match one of the two options verbatim.
4. "Single Answer": Provide an empty "options" array []. Ask for a concise factual answer (1-4 words). Populate "correctAnswer" and 1-3 valid synonyms/variants in "acceptableAnswers".
5. "Fill in the Blanks": Include "_____" in the question text where the missing word/phrase belongs. Empty "options" array []. Put the exact missing term in "correctAnswer" and variations in "acceptableAnswers".
6. "Short Answer": Empty "options" array []. Assign 2-3 marks. Provide a clear model answer in "correctAnswer" and key marking points in "acceptableAnswers".
7. "Structured": Empty "options" array []. Assign 4-5 marks. Multi-part or analytical question grounded in the lesson with a comprehensive marking scheme in "correctAnswer".

${params.notesText ? `Student Provided Notes & Content:\n${params.notesText.slice(0, 50000)}` : 'No raw text notes pasted; rely on the attached document or detailed topic/lesson specified above.'}`;

  const parts = [...attachmentBundle.parts, { text: promptText }];

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: FAST_MODEL,
      contents: { parts },
      config: {
        systemInstruction:
          'You are an expert academic examiner and question paper author. Every question must test genuine understanding of the exact lesson and source material provided. Output valid JSON matching the requested schema.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            paperTitle: {
              type: Type.STRING,
              description: 'Formal title for this question paper.',
            },
            sourceSummary: {
              type: Type.STRING,
              description: '1-2 sentence summary of the exact source material covered.',
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  number: { type: Type.INTEGER },
                  type: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctAnswer: { type: Type.STRING },
                  acceptableAnswers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  marks: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['number', 'type', 'question', 'options', 'correctAnswer', 'acceptableAnswers', 'marks', 'explanation'],
              },
            },
          },
          required: ['paperTitle', 'sourceSummary', 'questions'],
        },
      },
    })
  );

  const rawJson = stripJsonFences(response.text ?? '');
  if (!rawJson) {
    throw new Error('Failed to generate question paper from AI.');
  }

  const parsed = JSON.parse(rawJson) as {
    paperTitle: string;
    sourceSummary: string;
    questions: Array<Partial<ExamQuestion>>;
  };

  const normalizedQuestions: ExamQuestion[] = (parsed.questions ?? []).map((q, idx) => {
    const type = selectedTypes.includes(q.type as QuestionType)
      ? (q.type as QuestionType)
      : selectedTypes[idx % selectedTypes.length];
    return {
      id: `q_${idx + 1}`,
      number: idx + 1,
      type,
      question: String(q.question ?? ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctAnswer: String(q.correctAnswer ?? ''),
      acceptableAnswers: Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers.map(String) : [],
      marks: Math.max(1, Number(q.marks ?? (type === 'Structured' ? 4 : type === 'Short Answer' ? 2 : 1))),
      explanation: String(q.explanation ?? ''),
    };
  });

  if (normalizedQuestions.length === 0) {
    throw new Error('AI did not return any questions. Please provide clearer study content and try again.');
  }

  return {
    paperTitle: parsed.paperTitle || `${params.subject}: ${params.lessonName} Assessment`,
    sourceSummary: parsed.sourceSummary || `Covers ${params.lessonName}`,
    questions: normalizedQuestions,
  };
}

export async function gradeSubjectiveAnswersWithAI(params: {
  language: PaperLanguage;
  items: Array<{
    questionId: string;
    question: string;
    modelAnswer: string;
    maxMarks: number;
    studentAnswer: string;
  }>;
}): Promise<Record<string, { marksAwarded: number; feedback: string }>> {
  if (params.items.length === 0) return {};
  const ai = getAiClient();

  const prompt = `Grade the following student answers fairly against the model answers in ${params.language}.
Return JSON array with exact questionId, integer/half-point marksAwarded (0 to maxMarks), and concise constructive feedback (1-2 sentences in ${params.language}).

Items to grade:
${JSON.stringify(params.items, null, 2)}`;

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: FAST_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              questionId: { type: Type.STRING },
              marksAwarded: { type: Type.NUMBER },
              feedback: { type: Type.STRING },
            },
            required: ['questionId', 'marksAwarded', 'feedback'],
          },
        },
      },
    })
  );

  const text = stripJsonFences(response.text ?? '');
  if (!text) return {};
  const arr = JSON.parse(text) as Array<{ questionId: string; marksAwarded: number; feedback: string }>;
  const map: Record<string, { marksAwarded: number; feedback: string }> = {};
  for (const entry of arr) {
    map[entry.questionId] = {
      marksAwarded: Number(entry.marksAwarded ?? 0),
      feedback: String(entry.feedback ?? ''),
    };
  }
  return map;
}

export async function generateSmartTimetable(params: {
  subjects: string[];
  availableHoursPerDay: number;
  schoolTimes: string;
  tuitionTimes: string;
  freeTimes: string;
  examDates: string;
  studyGoals: string;
  scope: 'weekly' | 'daily';
  selectedEntries?: Array<{
    category: string;
    title: string;
    subject: string;
    dayOfWeek?: number | null;
    startTime: string;
    endTime: string;
    teacher?: string;
    location?: string;
    color?: string;
  }>;
}): Promise<{
  summary: string;
  entries: Array<Omit<TimetableEntry, 'id' | 'createdAt' | 'completed' | 'isAiGenerated'>>;
}> {
  const ai = getAiClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const selectedBlock =
    params.selectedEntries && params.selectedEntries.length > 0
      ? `\nSelected Timetable Entries Already Entered by Student (preserve, organize around, and build upon these exact selections):\n${params.selectedEntries
          .map(
            (e) =>
              `- [${e.category}] ${e.dayOfWeek !== null && e.dayOfWeek !== undefined ? weekdayNames[e.dayOfWeek] || 'Day' : 'Daily'} ${e.startTime}-${e.endTime}: ${e.title} (${e.subject || 'General'})${e.teacher ? ` with ${e.teacher}` : ''}${e.location ? ` at ${e.location}` : ''}`
          )
          .join('\n')}\n`
      : '';

  const prompt = `Create a balanced, realistic, conflict-free ${params.scope} student study timetable.
Constraints & Preferences:
- Subjects to cover: ${params.subjects.join(', ')}
- Target daily self-study hours: ${params.availableHoursPerDay} hours/day
- School hours (avoid scheduling self-study during these hours): ${params.schoolTimes || '07:30 - 13:30 Mon-Fri'}
- Tuition / extra classes (include as tuition entries or avoid conflicts): ${params.tuitionTimes || 'None specified'}
- Preferred free/study windows: ${params.freeTimes || '15:30 - 21:00 weekdays, flexible weekends'}
- Upcoming exam dates / priorities: ${params.examDates || 'General ongoing revision'}
- Student goals: ${params.studyGoals || 'Balanced mastery across all subjects with short breaks'}
${selectedBlock}
Rules:
- Use 24-hour HH:MM format for startTime and endTime.
- dayOfWeek is integer 0 (Monday) through 6 (Sunday).
- category must be one of: "school", "tuition", "self_study". Focus primarily on "self_study" sessions during free windows, plus any explicit tuition/school slots requested.
- Include realistic session durations (e.g. 45, 60, 90 minutes for 1h 30m deep work).
- ${params.scope === 'weekly' ? 'Generate 14 to 24 well-distributed entries across Monday (0) to Sunday (6).' : `Generate 4 to 8 entries for today (${todayStr}).`}`;

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: FAST_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          'You are an expert academic time-management coach. Design sustainable, realistic student study schedules with zero time overlaps.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Short explanation of how this timetable balances priorities and breaks.',
            },
            entries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  title: { type: Type.STRING },
                  subject: { type: Type.STRING },
                  teacher: { type: Type.STRING },
                  location: { type: Type.STRING },
                  dayOfWeek: { type: Type.INTEGER },
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  durationMinutes: { type: Type.INTEGER },
                  notes: { type: Type.STRING },
                },
                required: ['category', 'title', 'subject', 'dayOfWeek', 'startTime', 'endTime', 'durationMinutes', 'notes'],
              },
            },
          },
          required: ['summary', 'entries'],
        },
      },
    })
  );

  const raw = stripJsonFences(response.text ?? '');
  if (!raw) throw new Error('AI could not generate a timetable.');
  const parsed = JSON.parse(raw) as {
    summary: string;
    entries: Array<{
      category?: string;
      title?: string;
      subject?: string;
      teacher?: string;
      location?: string;
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      durationMinutes?: number;
      notes?: string;
    }>;
  };

  const validCats = new Set(['school', 'tuition', 'self_study']);
  const entries = (parsed.entries ?? []).map((e, idx) => {
    const category = (validCats.has(String(e.category)) ? e.category : 'self_study') as 'school' | 'tuition' | 'self_study';
    const subject = String(e.subject ?? 'General');
    return {
      category,
      scope: params.scope,
      title: String(e.title ?? `${subject || 'Study'} Session`),
      subject,
      teacher: String(e.teacher ?? ''),
      location: String(e.location ?? ''),
      dayOfWeek: Math.max(0, Math.min(6, Number(e.dayOfWeek ?? 0))),
      month: currentMonth,
      year: currentYear,
      specificDate: params.scope === 'daily' ? todayStr : null,
      startTime: String(e.startTime ?? '16:00'),
      endTime: String(e.endTime ?? '17:00'),
      durationMinutes: Math.max(15, Number(e.durationMinutes ?? 60)),
      notes: String(e.notes ?? ''),
      color: getColorForSubject(subject, category, idx),
    };
  });

  return {
    summary: parsed.summary || 'Balanced AI-generated study schedule.',
    entries,
  };
}

export async function summarizeSavedNote(params: {
  title: string;
  subject: string;
  lesson: string;
  content: string;
  attachment?: UploadedAttachment | null;
}): Promise<string> {
  const ai = getAiClient();
  const attachmentBundle = buildAttachmentsParts(params.attachment);
  const parts = [
    ...attachmentBundle.parts,
    {
      text: `Summarize this student study note into concise bullet points, key definitions, and 3 quick revision takeaways.
Title: ${params.title}
Subject: ${params.subject}
Lesson: ${params.lesson}
Content:
${params.content}`,
    },
  ];

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: FAST_MODEL,
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })
  );

  const text = response.text?.trim();
  if (!text) throw new Error('Could not summarize note.');
  return text;
}

export async function beautifyOwnTimetable(params: {
  rawTimetableText: string;
  scope: 'weekly' | 'daily';
  language: 'English' | 'Sinhala';
  optimizationGoal: string;
  attachments?: UploadedAttachment[] | null;
}): Promise<{
  summary: string;
  entries: Array<Omit<TimetableEntry, 'id' | 'createdAt' | 'completed' | 'isAiGenerated'>>;
}> {
  const ai = getAiClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const todayStr = new Date().toISOString().slice(0, 10);
  const attachmentBundle = buildAttachmentsParts(null, params.attachments);

  const langRule =
    params.language === 'Sinhala'
      ? 'Write the summary, titles, and helpful notes clearly in natural Sinhala (සිංහල) while keeping 24-hour HH:MM times and subject names neat and readable.'
      : 'Write the summary, titles, and helpful notes in crisp, motivational academic English.';

  const promptText = `The student entered or uploaded their OWN custom timetable below. Your job is to transform, organize, polish, and beautifully structure their own timetable into a conflict-free, clean ${params.scope} schedule without losing their entered subjects or classes.

Student's Entered Timetable:
${params.rawTimetableText || 'Refer to the attached picture or document of the student timetable.'}

Student Preferences:
- Target Scope: ${params.scope}
- Optimization / Polish Goal: ${params.optimizationGoal || 'Keep my classes and times accurate, fix any overlaps, add short 10-15m study breaks if needed, and format everything neatly.'}
- Language: ${langRule}

Strict Rules:
- Keep 24-hour HH:MM format for startTime and endTime.
- dayOfWeek is integer 0 (Monday) through 6 (Sunday). If scope is "daily", use today's dayOfWeek or 0.
- category must be one of: "school", "tuition", "self_study". Classify school hours as "school", extra/tuition classes as "tuition", and revision/homework/breaks as "self_study".
- Compute accurate integer durationMinutes between startTime and endTime.`;

  const parts = [...attachmentBundle.parts, { text: promptText }];

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: FAST_MODEL,
      contents: { parts },
      config: {
        systemInstruction:
          'You are an expert student time-management organizer. Take the student’s rough or handwritten/pasted timetable and turn it into a polished, balanced, conflict-free schedule ready for PDF printing.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Concise summary of how the user-entered timetable was polished and organized.',
            },
            entries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  title: { type: Type.STRING },
                  subject: { type: Type.STRING },
                  teacher: { type: Type.STRING },
                  location: { type: Type.STRING },
                  dayOfWeek: { type: Type.INTEGER },
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  durationMinutes: { type: Type.INTEGER },
                  notes: { type: Type.STRING },
                },
                required: ['category', 'title', 'subject', 'dayOfWeek', 'startTime', 'endTime', 'durationMinutes', 'notes'],
              },
            },
          },
          required: ['summary', 'entries'],
        },
      },
    })
  );

  const raw = stripJsonFences(response.text ?? '');
  if (!raw) throw new Error('AI could not process your timetable.');
  const parsed = JSON.parse(raw) as {
    summary: string;
    entries: Array<{
      category?: string;
      title?: string;
      subject?: string;
      teacher?: string;
      location?: string;
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      durationMinutes?: number;
      notes?: string;
    }>;
  };

  const validCats = new Set(['school', 'tuition', 'self_study']);
  const entries = (parsed.entries ?? []).map((e, idx) => {
    const category = (validCats.has(String(e.category)) ? e.category : 'self_study') as 'school' | 'tuition' | 'self_study';
    const subject = String(e.subject ?? 'General');
    return {
      category,
      scope: params.scope,
      title: String(e.title ?? `${subject || 'Study'} Block`),
      subject,
      teacher: String(e.teacher ?? ''),
      location: String(e.location ?? ''),
      dayOfWeek: Math.max(0, Math.min(6, Number(e.dayOfWeek ?? 0))),
      month: currentMonth,
      year: currentYear,
      specificDate: params.scope === 'daily' ? todayStr : null,
      startTime: String(e.startTime ?? '16:00'),
      endTime: String(e.endTime ?? '17:00'),
      durationMinutes: Math.max(5, Number(e.durationMinutes ?? 60)),
      notes: String(e.notes ?? ''),
      color: getColorForSubject(subject, category, idx),
    };
  });

  return {
    summary: parsed.summary || 'Your custom timetable has been organized and polished by AI.',
    entries,
  };
}
