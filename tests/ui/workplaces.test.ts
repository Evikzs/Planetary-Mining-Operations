import { describe, expect, it } from 'vitest';
import type { Contract } from '../../src/sim/contracts/contracts';
import { applyCommand, createGame } from '../../src/sim/engine';
import { buildUiSnapshot, buildWorldView, queryPeople } from '../../src/sim/views';
import { worldOf } from '../../src/sim/world/luna';
import { workplaces } from '../../src/ui/tabs/PeopleTab';

describe('People tab workplaces', () => {
  it('a contract site that needs engineers is a workplace for an engineer', () => {
    const s = createGame(42);
    applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
    const w = worldOf(s);
    const plot = w.plots.find((p) => p.sectionId === w.foundingSectionId && p.kind === 'public')!;
    const c: Contract = {
      id: s.nextId++,
      type: 'infrastructure',
      issuer: 'Lunar Authority',
      status: 'offered',
      offeredTick: s.tick,
      deadlineTick: s.tick + 48 * 60,
      hours: 100,
      rewardCents: 100_000,
      repGain: 5,
      repLoss: 8,
      stages: [{ kind: 'build', engineerHours: 12, done: 0 }],
      stageIndex: 0,
      plotId: plot.id,
      asset: 'commMast',
    };
    s.contracts.push(c);
    applyCommand(s, { t: 'acceptContract', contractId: c.id });
    const site = s.buildings.find((b) => b.plotId === plot.id)!;
    const view = buildWorldView(s, 1);
    const plots = new Map(view.plots.map((p) => [p.id, p.sectionId]));
    const sectionOf = new Map(view.buildings.map((b) => [b.id, plots.get(b.plotId) ?? -1]));
    const engineer = queryPeople(s, { skill: 'engineer' }, 0, 1).rows[0]!;
    expect(workplaces(buildUiSnapshot(s), sectionOf, engineer)).toContainEqual({
      id: site.id,
      name: `Contract site ${site.id}`,
      open: 6,
    });
  });
});
