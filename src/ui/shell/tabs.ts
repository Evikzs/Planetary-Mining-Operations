import { signal } from '@preact/signals';
import type { IconName } from '../icons';

export type TabId = 'build' | 'people' | 'trade' | 'finance' | 'contracts' | 'codex' | 'settings';

export const TABS: { id: TabId; label: string; key: string; icon: IconName }[] = [
  { id: 'build', label: 'Build', key: 'b', icon: 'build' },
  { id: 'people', label: 'People', key: 'p', icon: 'people' },
  { id: 'trade', label: 'Trade', key: 't', icon: 'trade' },
  { id: 'finance', label: 'Finance', key: 'f', icon: 'finance' },
  { id: 'contracts', label: 'Contracts', key: 'c', icon: 'contracts' },
  { id: 'codex', label: 'Codex', key: 'k', icon: 'codex' },
  { id: 'settings', label: 'Settings', key: 'o', icon: 'settings' },
];

/** The clock and camera keys besides the tabs, as Settings lists them. */
export const OTHER_KEYS: [string, string][] = [
  ['Space', 'Pause or resume'],
  ['1–4', 'Speed 1×, 2×, 4×, 8×'],
  ['W A S D', 'Pan'],
  ['Q E', 'Turn'],
  ['N', 'Lock north'],
  ['+ -', 'Zoom'],
  ['Esc', 'Close the panel, cancel the tool, or clear the selection'],
];

export const activeTab = signal<TabId | null>(null);

export function toggleTab(id: TabId): void {
  activeTab.value = activeTab.value === id ? null : id;
}
