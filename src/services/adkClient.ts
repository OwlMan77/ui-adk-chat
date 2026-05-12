import type { ADKSession, ADKStreamEvent, AppInfo } from '../types';
import type { RunAgentRequest, EventOutput, PartInput } from '../types/adk.dto';

const ADK_BASE_URL = import.meta.env.VITE_ADK_BASE_URL ?? 'http://localhost:8000';
const APP_NAME = import.meta.env.VITE_ADK_APP_NAME ?? 'my-agent';

export async function createSession(userId: string, appName: string = APP_NAME): Promise<ADKSession> {
  const res = await fetch(`${ADK_BASE_URL}/apps/${appName}/users/${userId}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!res.ok) throw new Error(`Failed to create session: ${res.statusText}`);

  const data = await res.json();
  return {
    sessionId: data.id,
    userId,
    appName,
  };
}

export async function listApps(): Promise<AppInfo[]> {
  const res = await fetch(`${ADK_BASE_URL}/list-apps`);
  if (!res.ok) throw new Error(`Failed to fetch apps: ${res.statusText}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    return data.map((item: string | Partial<AppInfo>) =>
      typeof item === 'string'
        ? { name: item, live: false }
        : { name: item.name ?? '', live: item.live ?? false }
    );
  }
  return [];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function* streamMessage(
  session: ADKSession,
  message: string,
  audio?: Blob,
): AsyncGenerator<ADKStreamEvent> {
  const parts: PartInput[] = [];
  if (message) parts.push({ text: message });
  if (audio) parts.push({ inlineData: { mimeType: audio.type, data: await blobToBase64(audio) } });

  const body: RunAgentRequest = {
    appName: session.appName,
    userId: session.userId,
    sessionId: session.sessionId,
    newMessage: {
      role: 'user',
      parts,
    },
    streaming: true,
  };

  const res = await fetch(`${ADK_BASE_URL}/run_sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    yield { type: 'error', error: `HTTP ${res.status}: ${res.statusText}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const event = JSON.parse(raw) as EventOutput;
        for (const e of parseADKEvent(event)) yield e;
      } catch {
        // skip malformed lines
      }
    }
  }

  yield { type: 'done' };
}

type FnResponseHandler = (response: Record<string, unknown>) => ADKStreamEvent | null;

const functionResponseHandlers: Record<string, FnResponseHandler> = {
  set_theme:        (r) => typeof r.name === 'string'
                             ? { type: 'theme', themeName: r.name }
                             : null,
  set_custom_theme: (r) => ({ type: 'custom_theme', customThemeColors: r as import('../types').CustomThemeColors }),
  show_options:     (r) => typeof r.result === 'string'
                             ? { type: 'text', content: r.result }
                             : null,
  create_table:     (r) => typeof r.result === 'string'
                             ? { type: 'text', content: r.result }
                             : null,
  generate_image:   (r) => typeof r.mimeType === 'string' && typeof r.data === 'string'
                             ? { type: 'agent_image', imageData: { mimeType: r.mimeType, data: r.data } }
                             : null,
  show_carousel:    (r) => {
    try {
      const parsed = JSON.parse(r.result as string);
      if (parsed.type === 'carousel' && Array.isArray(parsed.items))
        return { type: 'carousel', items: parsed.items };
    } catch { /* not JSON */ }
    return null;
  },
};

function tryParseStructured(json: string): ADKStreamEvent | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.type === 'carousel' && Array.isArray(parsed.items))
      return { type: 'carousel', items: parsed.items };
    if (parsed.type === 'theme' && typeof parsed.name === 'string')
      return { type: 'theme', themeName: parsed.name };
  } catch { /* not JSON */ }
  return null;
}

// The agent may return pure JSON or prefix JSON on the first line followed by markdown.
function parseTextContent(text: string): ADKStreamEvent[] {
  const whole = tryParseStructured(text);
  if (whole) return [whole];

  const nl = text.indexOf('\n');
  if (nl !== -1) {
    const structured = tryParseStructured(text.slice(0, nl));
    if (structured) {
      const rest = text.slice(nl + 1).trim();
      return rest ? [structured, { type: 'text', content: rest }] : [structured];
    }
  }

  return [{ type: 'text', content: text }];
}

// ADK sends text events twice: partial:true (streaming chunk) then partial:false (final).
// We skip partial:true to avoid duplicating text, but still emit any function response events.
function parseADKEvent(event: EventOutput): ADKStreamEvent[] {
  const parts = event.content?.parts;
  if (!parts?.length) return [];

  const functionEvents = parts.flatMap((part) => {
    const fr = part.functionResponse;
    if (!fr?.name || !fr.response) return [];
    const event = functionResponseHandlers[fr.name]?.(fr.response as Record<string, unknown>);
    return event ? [event] : [];
  });

  if (event.partial === true) return functionEvents;

  const text = parts[0]?.text;
  if (!text) return functionEvents;

  return [...functionEvents, ...parseTextContent(text)];
}
