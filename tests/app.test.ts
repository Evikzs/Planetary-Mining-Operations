import { describe, expect, it } from 'vitest';
import { APP_TITLE } from '../src/ui/App';

describe('app', () => {
  it('has the game title', () => {
    expect(APP_TITLE).toBe('Planetary Mining Operations');
  });
});
