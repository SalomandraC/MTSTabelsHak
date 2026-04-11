import { WorkspacePage } from '../pages/workspace/index';
import { AuthGate } from '../features/auth';

export function App() {
  return (
    <AuthGate>
      <WorkspacePage />
    </AuthGate>
  );
}

export default App;
