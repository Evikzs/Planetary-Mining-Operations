import { signal } from '@preact/signals';
import type { UiSnapshot } from '../worker/protocol';

export const ui = signal<UiSnapshot | null>(null);
