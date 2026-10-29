import { describe, expect, it } from 'vitest';
import { codexFacts } from '../../src/ui/tabs/codexFacts';

describe('codex facts', () => {
  it('a good lists its price, who makes it and who uses it', () => {
    expect(codexFacts('good.steel')).toEqual([
      { label: 'Base price', value: 'LM 400.00/t' },
      { label: 'Made by', value: 'Smelter' },
      { label: 'Used by', value: 'Assembly works' },
    ]);
    expect(codexFacts('good.oxygen')).toContainEqual({
      label: 'Used by',
      value: 'Residents',
    });
    expect(codexFacts('good.electronics')).toContainEqual({
      label: 'Made by',
      value: 'Bought on the market',
    });
  });

  it('a building lists its cost, crew, power and work', () => {
    expect(codexFacts('building.mine')).toEqual([
      { label: 'Cost', value: 'LM 6,000.00, 20 t Prefab structures, 2 t Machinery' },
      { label: 'Jobs per shift', value: '6 miners, 1 technician' },
      { label: 'Power', value: '−250 kW' },
      { label: 'Extracts', value: 'Ilmenite, Anorthite, KREEP ore' },
    ]);
    expect(codexFacts('building.solarArray')).toContainEqual({ label: 'Power', value: '+400 kW' });
    expect(codexFacts('building.smelter')).toContainEqual({
      label: 'Recipes',
      value: 'Steel, Titanium alloy, Aluminium, Glass, Sintered concrete',
    });
  });

  it('other entries have no data table', () => {
    expect(codexFacts('mech.sections')).toEqual([]);
  });
});
