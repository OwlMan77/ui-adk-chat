import type { ADKSession, ADKStreamEvent } from '../types';
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

export async function listApps(): Promise<string[]> {
  const res = await fetch(`${ADK_BASE_URL}/list-apps`);
  if (!res.ok) throw new Error(`Failed to fetch apps: ${res.statusText}`);
  const data = await res.json();
  // ADK returns an array of app name strings or objects with a name field
  if (Array.isArray(data)) {
    return data.map((item: string | { name: string }) =>
      typeof item === 'string' ? item : item.name
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

// Maps a raw EventOutput from the ADK SSE stream to our internal ADKStreamEvent shape.
// ADK sends each text response twice: partial:true (streaming) then partial:false (final).
// We skip partial:true to avoid duplicating the text.
// The agent may prefix structured JSON (theme/carousel) on the first line of the text,
// followed by plain markdown — so we extract and yield both events when present.
function parseADKEvent(event: EventOutput): ADKStreamEvent[] {
  const parts = event.content?.parts;
  if (!parts?.[0]?.text) return [{ type: 'done' }];

  const text = parts[0].text;

  // Skip partial streaming events — ADK sends the full text again in the final partial:false event.
  if (event.partial === true) return [{ type: 'done' }];

  // Try the whole text as pure JSON first.
  try {
    const parsed = JSON.parse(text);
    if (parsed.type === 'carousel' && Array.isArray(parsed.items)) {
      return [{ type: 'carousel', items: parsed.items }];
    }
    if (parsed.type === 'theme' && typeof parsed.name === 'string') {
      return [{ type: 'theme', themeName: parsed.name }];
    }
  } catch { /* not pure JSON */ }

  // Agent may prefix a JSON object on the first line followed by plain text.
  const nl = text.indexOf('\n');
  if (nl !== -1) {
    try {
      const parsed = JSON.parse(text.slice(0, nl));
      const rest = text.slice(nl + 1);
      if (parsed.type === 'carousel' && Array.isArray(parsed.items)) {
        const events: ADKStreamEvent[] = [{ type: 'carousel', items: parsed.items }];
        if (rest.trim()) events.push({ type: 'text', content: rest });
        return events;
      }
      if (parsed.type === 'theme' && typeof parsed.name === 'string') {
        const events: ADKStreamEvent[] = [{ type: 'theme', themeName: parsed.name }];
        if (rest.trim()) events.push({ type: 'text', content: rest });
        return events;
      }
    } catch { /* first line not JSON */ }
  }

  return [{ type: 'text', content: text }];
}
