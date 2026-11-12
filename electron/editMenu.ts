// The right-click menu: Electron shows none on its own, so text fields would lose copy and paste.
type EditRole = 'cut' | 'copy' | 'paste' | 'selectAll';

/** Cut, copy, paste and select all in a text field; nothing over the game. */
export function editMenuTemplate(params: { isEditable: boolean }): { role: EditRole }[] {
  if (!params.isEditable) return [];
  return [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }];
}
