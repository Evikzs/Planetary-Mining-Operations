import { signal } from '@preact/signals';
import type { IconName } from '../icons';

export type TabId = 'build' | 'people' | 'trade' | 'finance' | 'contracts' | 'codex' | 'settings';

export const TABS: { id: TabId; label: string; key: string; icon: IconName }[] = [
  { id: 'build', label: 'Build', key: '1', icon: 'build' },
  { id: 'people', label: 'People', key: '2', icon: 'people' },
  { id: 'trade', label: 'Trade', key: '3', icon: 'trade' },
  { id: 'finance', label: 'Finance', key: '4', icon: 'finance' },
  { id: 'contracts', label: 'Contracts', key: '5', icon: 'contracts' },
  { id: 'codex', label: 'Codex', key: '6', icon: 'codex' },
  { id: 'settings', label: 'Settings', key: '7', icon: 'settings' },
];

export const activeTab = signal<TabId | null>(null);

export function toggleTab(id: TabId): void {
  activeTab.value = activeTab.value === id ? null : id;
}
