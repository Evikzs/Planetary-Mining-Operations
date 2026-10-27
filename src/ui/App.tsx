import { ui } from '../client/store';

export const APP_TITLE = 'Planetary Mining Operations';

export function App() {
  return (
    <main data-testid="app">
      <h1>{APP_TITLE}</h1>
      <span data-testid="game-date">{ui.value?.date ?? ''}</span>
    </main>
  );
}
