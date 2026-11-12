import { describe, expect, it } from 'vitest';
import { editMenuTemplate } from '../../electron/editMenu';

describe('the right-click menu in the app', () => {
  it('offers cut, copy, paste and select all in a text field', () => {
    expect(editMenuTemplate({ isEditable: true }).map((i) => i.role)).toEqual([
      'cut',
      'copy',
      'paste',
      'selectAll',
    ]);
  });

  it('offers nothing over the game', () => {
    expect(editMenuTemplate({ isEditable: false })).toEqual([]);
  });
});
