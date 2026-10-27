import { ui } from '../../client/store';
import { APP_TITLE } from '../App';

export function TopBar() {
  const snap = ui.value;
  return (
    <header class="topbar" data-testid="top-bar">
      <h1>{snap?.company?.name ?? APP_TITLE}</h1>
      <span class="slot">
        <span class="num" data-testid="game-date">
          {snap?.date ?? ''}
        </span>
      </span>
      <span class="slot">
        <span class="slot-label">Cash</span>
        <span class="num" data-testid="cash">
          –
        </span>
      </span>
    </header>
  );
}
