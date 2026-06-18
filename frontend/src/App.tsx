import { HelloTaskFlow } from './components/HelloTaskFlow';

function App() {
  const value = 'unused-string-but-used';
  return (
    <div className="min-h-screen bg-background text-foreground">
      <HelloTaskFlow data-testid={value} />
    </div>
  );
}

export default App;
