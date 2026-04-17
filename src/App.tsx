import { useState } from 'react';
import AgentSelector from './components/AgentSelector/AgentSelector';
import ChatWindow from './components/Chat/ChatWindow';
import { useTheme } from './hooks/useTheme';

const USER_ID = 'user-001'; // replace with real auth later

interface ChatConfig {
  appName: string;
  starterMessage?: string;
}

export default function App() {
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const { setTheme } = useTheme();

  if (!config) {
    return (
      <AgentSelector
        onSelect={(appName, starterMessage) => setConfig({ appName, starterMessage })}
      />
    );
  }

  return (
    <ChatWindow
      userId={USER_ID}
      appName={config.appName}
      initialMessage={config.starterMessage}
      onChangeAgent={() => setConfig(null)}
      onThemeChange={setTheme}
    />
  );
}
