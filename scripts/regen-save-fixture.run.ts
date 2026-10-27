import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { applyCommand, createGame } from '../src/sim/engine';
import { toSaveFile } from '../src/save/saveFile';

// Rewrites tests/fixtures/saves/v1-founding.json after a state-shape change (pre-release only).
it('regenerates the v1 save fixture', () => {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  writeFileSync(
    'tests/fixtures/saves/v1-founding.json',
    `${JSON.stringify(toSaveFile(s, 0), null, 2)}\n`,
  );
});
