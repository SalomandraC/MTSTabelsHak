import { WorkspacePage } from '../pages/workspace/index';
import { AuthGate } from '../features/auth';
import { PluginsProvider } from '../features/plugins';
import { PublicReadOnlyPage } from '../pages/workspace/ui/public-readonly-page';
import { readWorkspaceRoute } from '../shared/lib/workspace-route';

export function App() {
  const route = readWorkspaceRoute();
  const shouldOpenPublicReadOnly = route.readOnly && Boolean(route.pageId);

  if (shouldOpenPublicReadOnly) {
    return <PublicReadOnlyPage />;
  }

  return (
    <AuthGate>
      <PluginsProvider>
        <WorkspacePage />
      </PluginsProvider>
    </AuthGate>
  );
}

export default App;
