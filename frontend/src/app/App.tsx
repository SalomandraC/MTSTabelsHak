import { WorkspacePage } from '../pages/workspace/index';
import { AuthGate } from '../features/auth';
import { PluginsProvider } from '../features/plugins';

export function App() {
  return (
    <AuthGate>
      <PluginsProvider>
        <WorkspacePage />
      </PluginsProvider>
    </AuthGate>
  );
}

export default App;
