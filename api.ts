let inMemoryToken: string | null = null;
let inMemoryAdminToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setAdminToken(token: string | null) {
  inMemoryAdminToken = token;
}

export function getAdminToken(): string | null {
  return inMemoryAdminToken;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Requested-With', 'SmartStudyAI');
  if (inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  if (inMemoryAdminToken && !headers.has('X-Admin-Token')) {
    headers.set('X-Admin-Token', inMemoryAdminToken);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    throw new Error(String(data.error || `Request failed (${res.status})`));
  }

  return data as T;
}

export interface FileAttachmentPayload {
  name: string;
  mimeType: string;
  data: string;
}

export function readFileAsAttachment(file: File, maxBytes = 8 * 1024 * 1024): Promise<FileAttachmentPayload> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`File "${file.name}" exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: result,
      });
    };
    reader.onerror = () => reject(new Error(`Could not read file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export function formatMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function computeDurationMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 60;
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return Math.max(5, diff);
}

export function addMinutesToTime(startTime: string, durationMinutes: number): string {
  const [sh, sm] = startTime.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm)) return '10:00';
  const total = (sh * 60 + sm + durationMinutes) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
