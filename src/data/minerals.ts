import type { RawGoodId } from '../sim/world/types';

/** A raw good as a find: its specimen label and the colour it glints in. */
export interface Mineral {
  name: string;
  formula: string;
  /** sRGB hex. For finds only: deposits, seams, ore on belts, the gem of a raw good. */
  color: string;
  note: string;
}

export const MINERALS: Record<RawGoodId, Mineral> = {
  regolith: {
    name: 'Regolith',
    formula: 'glass and dust',
    color: '#b9ae9c',
    note: 'The loose grey cover of the Moon. Sintered, it becomes concrete.',
  },
  ilmenite: {
    name: 'Ilmenite',
    formula: 'FeTiO₃',
    color: '#7d93c7',
    note: 'Black grains with a blue-steel shine. Iron, titanium, and oxygen when you bake it.',
  },
  anorthite: {
    name: 'Anorthite',
    formula: 'CaAl₂Si₂O₈',
    color: '#e6dcf0',
    note: 'The white feldspar of the highlands. Aluminium and glass come from it.',
  },
  helium3: {
    name: 'Helium-3',
    formula: '³He',
    color: '#b48cf0',
    note: 'A light gas that the solar wind left in the dust. Fusion plants pay well for it.',
  },
  kreep: {
    name: 'KREEP',
    formula: 'K, REE, P',
    color: '#e4688e',
    note: 'Potassium, rare earths and phosphorus in one dark rock. The rose glint of the Moon.',
  },
  polarVolatiles: {
    name: 'Polar ice',
    formula: 'H₂O and more',
    color: '#6fd3e8',
    note: 'Ice in craters the sun never reaches. Water, air and fuel.',
  },
};

/** The glint of Luna's seams from orbit: KREEP rose. */
export const LUNA_ORE: RawGoodId = 'kreep';
