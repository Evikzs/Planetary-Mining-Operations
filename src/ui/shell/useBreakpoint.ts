import { signal } from '@preact/signals';

const QUERY = '(min-width: 1024px)';
const media = typeof matchMedia === 'undefined' ? null : matchMedia(QUERY);

/** True at desktop widths (1024 px and up). */
export const isDesktop = signal(media?.matches ?? true);
media?.addEventListener('change', (e) => (isDesktop.value = e.matches));
