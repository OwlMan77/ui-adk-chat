import { useState } from 'react';
import AgentSelector from './components/AgentSelector/AgentSelector';
import ChatWindow from './components/Chat/ChatWindow';
import { useTheme } from './hooks/useTheme';
import DevHarness from './face/DevHarness';
import ShapeSheet from './face/ShapeSheet';

const USER_ID = 'user-001'; // replace with real auth later

interface ChatConfig {
  appName: string;
  live: boolean;
  starterMessage?: string;
}

export default function App() {
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const { setTheme } = useTheme();

  // Dev-only face tuning tools, stripped from production builds:
  //   ?facedev=1  drive the face from synthetic speech and fire cues by hand
  //   ?sheet=1    render the rig at fixed states to eyeball every mouth shape
  if (import.meta.env.DEV && location.search.includes('sheet')) return <ShapeSheet />;
  if (import.meta.env.DEV && location.search.includes('facedev')) return <DevHarness />;

  if (!config) {
    return (
      <AgentSelector
        onSelect={(appName, live, starterMessage) => setConfig({ appName, live, starterMessage })}
      />
    );
  }

  return (
    <ChatWindow
      userId={USER_ID}
      appName={config.appName}
      live={config.live}
      initialMessage={config.starterMessage}
      onChangeAgent={() => setConfig(null)}
      onThemeChange={setTheme}
    />
  );
}
