# adk-chat

A React chat client for [Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/) backends. Connect it to any ADK agent and get a full-featured chat UI with text, voice, image, and carousel message support.

## Features

- **Text chat** with streaming responses and Markdown rendering (GFM)
- **Voice messages** — record and send audio; agent receives the audio blob
- **Image messages** — attach and send images with an optional caption
- **Carousel messages** — agent can return navigable card carousels
- **Agent-controlled themes** — agent can switch the UI theme mid-conversation
- **4 built-in themes**: `dark` (default), `light`, `ocean`, `sunset`
- **Smooth theme transitions** — 600ms CSS fade when switching themes
- **Theme persistence** — selected theme is saved to `localStorage`
- **Multi-agent support** — pick any app exposed by the ADK server at startup

## Prerequisites

- Node.js 18+
- A running ADK backend (default: `http://localhost:8000`)

## Setup

```bash
npm install
```

Copy the environment file and configure it:

```bash
cp .env.local.example .env.local   # or edit .env.local directly
```

**.env.local**
```
VITE_ADK_BASE_URL=http://localhost:8000
VITE_ADK_APP_NAME=my-agent
```

| Variable | Default | Description |
|---|---|---|
| `VITE_ADK_BASE_URL` | `http://localhost:8000` | Base URL of the ADK server |
| `VITE_ADK_APP_NAME` | `my-agent` | Fallback app name (overridden by the selector) |

## Development

```bash
npm run dev      # start dev server (Vite HMR)
npm run build    # type-check + production build
npm run preview  # preview production build locally
npm run lint     # run ESLint
```

## Agent protocol

The client communicates with agents via the ADK SSE streaming endpoint (`/run_sse`). Agents return plain text (rendered as Markdown) or any of the following structured JSON payloads.

### Carousel

```json
{ "type": "carousel", "items": [ { "id": "1", "content": "**Item**", "imageUrl": "...", "actionLabel": "Go", "actionUrl": "https://..." } ] }
```

When a carousel item is selected, the item's `id` is sent back to the agent as a text message.

### Theme switch

```json
{ "type": "theme", "name": "ocean" }
```

Valid theme names: `dark`, `light`, `ocean`, `sunset`. Unknown names are silently ignored.

The agent can also prefix a JSON control payload on the **first line** of a response, followed by plain Markdown text — both will be processed:

```
{"type":"theme","name":"sunset"}
Here's your answer in the new theme...
```

## Project structure

```
src/
├── components/
│   ├── AgentSelector/   # startup screen — pick an ADK app
│   ├── BlinkingFace/    # animated avatar
│   ├── Chat/            # ChatWindow, MessageList, ChatInput
│   ├── inputs/          # VoiceRecorder, ImageUploader
│   └── messages/        # TextMessage, VoiceMessage, ImageMessage, CarouselMessage
├── hooks/
│   ├── useADKSession.ts # session lifecycle, streaming, message state
│   ├── useTheme.ts      # theme state, localStorage, fade transition
│   └── useVoiceRecorder.ts
├── services/
│   └── adkClient.ts     # fetch wrapper for ADK REST + SSE
├── styles/
│   └── themes.css       # CSS custom property palettes
├── types/
│   ├── index.ts         # shared TypeScript types
│   └── adk.dto.ts       # ADK API request/response shapes
├── App.tsx
├── index.css
└── main.tsx
```
