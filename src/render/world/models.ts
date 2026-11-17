import { BufferAttribute, CylinderGeometry, IcosahedronGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS, type BuildingTypeId } from '../../data/buildings';
import type { Asset } from '../../sim/contracts/contracts';
import { kit as K, SUITS } from '../../ui/tokens';
import { ball, box, cyl, half, METRES_PER_UNIT, paint, put, TAU } from './kit';

// Every model in Fable's kit, built in metres and scaled to world units. Fable's own parts (the
// hab block, the headframe, the ore mill, the grow dome, the stores, the solar table, the pad,
// the mast, the bus, the walker, the crystals) are kept as Fable drew them, scaled to fit a plot.

/** Every model fits in a circle of this radius around its plot (18 m), so pick spheres cover it. */
export const MODEL_FOOTPRINT = 0.45;

export type ModelKey = BuildingTypeId | `asset:${Asset}`;

const ASSETS: Asset[] = ['landingPad', 'commMast', 'roadDepot', 'publicSolar'];
export const ALL_MODEL_KEYS: ModelKey[] = [
  ...(Object.keys(BUILDINGS) as BuildingTypeId[]),
  ...ASSETS.map((a) => `asset:${a}` as const),
];

const UNIT = 1 / METRES_PER_UNIT;
const W = K.glowWindow;
const WORK = K.glowWork;
const COOL = K.glowCool;
const LIFE = K.glowLife;

/** Fable's hab block: floors of homes with windows that light at random. 14 × 9 m. */
function hab(floors: number, x = 0, z = 0): BufferGeometry[] {
  const H = 3.1;
  const p = [box(14, 0.6, 9, x, 0, z, K.steelDark)];
  for (let f = 0; f < floors; f++) {
    const y = 0.6 + f * H;
    const inset = f % 2 ? 0.5 : 0;
    p.push(box(14 - inset, H - 0.15, 9 - inset, x, y, z, f % 2 ? K.ceramicDark : K.ceramic));
    for (const side of [-1, 1]) {
      for (let w = 0; w < 4; w++) {
        p.push(
          box(2.2, 1.2, 0.2, x - 5.1 + w * 3.4, y + 1.1, z + side * (4.5 - inset / 2), K.glass, {
            glow: W,
            gid: 1 + f * 8 + w + (side > 0 ? 4 : 0),
          }),
        );
      }
    }
  }
  const top = 0.6 + floors * H;
  p.push(
    box(14.3, 0.25, 9.3, x, top - 0.1, z, K.roof),
    box(3, 1.1, 2.4, x - 3.5, top + 0.15, z + 1, K.steel),
    box(0.15, 4, 0.15, x + 5, top, z - 2.5, K.steelDark),
    box(1.6, 2.3, 0.25, x + 4.6, 0.6, z + 4.55, K.orange),
  );
  return p;
}

/** Fable's solar table: one tilted panel on two posts. 12 × 5.4 m. */
const solarTable = (x: number, z: number): BufferGeometry[] => [
  box(12, 0.25, 5.4, x, 2.6, z, K.panel, { rx: 0.45 }),
  box(12.3, 0.12, 0.2, x, 3.86, z - 2.45, K.steel),
  box(0.3, 2.8, 0.3, x - 4, 0, z, K.steelDark),
  box(0.3, 2.8, 0.3, x + 4, 0, z, K.steelDark),
];

/** Fable's ore container. 6 × 2.4 m. */
const container = (x: number, y: number, z: number, hex: string = K.bone): BufferGeometry[] => [
  box(6, 2.6, 2.44, x, y, z, hex),
  box(0.1, 2.3, 2.1, x + 3.02, y + 0.15, z, K.lid),
];

/** A street lamp, the arm along +z. */
export function lampGeometry(): BufferGeometry {
  return scaled([
    cyl(0.1, 0.15, 7, 5, 0, 0, 0, K.steelDark),
    box(0.12, 0.12, 1.9, 0, 6.9, 0.9, K.steelDark),
    box(0.5, 0.16, 0.9, 0, 6.72, 1.6, K.steel, { glow: WORK }),
  ]);
}

const MODELS: Record<ModelKey, () => BufferGeometry[]> = {
  // The heart of a section: a hall with a tower, bus bays under a canopy.
  depot: () => {
    const p = [
      box(24, 0.6, 16, 0, 0, 0, K.steelDark),
      box(22, 8, 13, 0, 0.6, -1, K.ceramic),
      box(22.5, 0.7, 13.5, 0, 7.6, -1, K.ochre),
      box(22.4, 0.5, 13.4, 0, 8.3, -1, K.roof),
      box(6, 17, 6, 8, 0.6, -4, K.ceramicDark),
      box(6.1, 1.4, 6.1, 8, 14.6, -4, K.glass, { glow: COOL }),
      box(6.6, 0.8, 6.6, 8, 17.6, -4, K.ochre),
      box(0.2, 5, 0.2, -9, 8.8, -5, K.steelDark),
      box(4.2, 4.2, 0.3, -6, 0.6, 5.6, K.orange),
      box(4.2, 4.2, 0.3, 1, 0.6, 5.6, K.orange),
      box(10, 0.4, 5, -3, 5.2, 9, K.steel),
      box(0.3, 4.6, 0.3, -7.6, 0.6, 11.2, K.steelDark),
      box(0.3, 4.6, 0.3, 1.6, 0.6, 11.2, K.steelDark),
      box(1.4, 0.2, 0.5, -5, 5.0, 9, K.steel, { glow: WORK }),
      box(1.4, 0.2, 0.5, -1, 5.0, 9, K.steel, { glow: WORK }),
    ];
    for (let i = 0; i < 5; i++) {
      p.push(box(2.4, 1.4, 0.2, -9 + i * 3.4, 5.6, 5.55, K.glass, { glow: W, gid: 1 + i }));
    }
    return p;
  },
  // A tracked scoop: a drum at the front cuts the loose top of the ground into the hopper.
  regolithScoop: () => [
    box(3, 1.4, 12, -3.4, 0, 0, K.steelDark),
    box(3, 1.4, 12, 3.4, 0, 0, K.steelDark),
    box(7, 4, 8, 0, 1.4, -1, K.ochre),
    box(3, 2.6, 3, -1.6, 5.4, 2, K.ochre),
    box(2.6, 1, 0.2, -1.6, 6.4, 3.55, K.glass, { glow: W }),
    box(5, 3, 4, 0.5, 5.4, -3.5, K.steel),
    box(1.4, 1.4, 11, 0, 4.2, 7.4, K.steel, { rx: 0.38 }),
    cyl(2.6, 2.6, 6, 12, 0, -0.3, 13, K.orange, { rz: Math.PI / 2 }),
    box(1.2, 0.5, 0.4, -1.6, 8.0, 3.4, K.steelDark, { glow: WORK }),
  ],
  // Fable's headframe: it winds the cage down the shaft.
  mine: () => {
    const p = [box(9, 5, 7, -11, 0, 0, K.ceramicDark), box(9.4, 0.4, 7.4, -11, 5, 0, K.steelDark)];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.push(
          box(0.7, 34, 0.7, sx * 3.4, 0.05, sz * 3.4, K.rust, { rz: sx * 0.085, rx: -sz * 0.085 }),
        );
      }
    }
    for (const y of [9, 18, 27])
      p.push(box(7.6 - y * 0.16, 0.4, 7.6 - y * 0.16, 0, y, 0, K.steelDark));
    p.push(box(5, 0.5, 5, 0, 33, 0, K.steelDark));
    for (const z of [-1.2, 1.2]) {
      p.push(
        cyl(2.6, 2.6, 0.35, 14, 0, 36, z, K.orange, { rx: Math.PI / 2 }),
        box(0.2, 33, 0.2, -5.4, 3.6, z, K.steelDark, { rz: -0.32 }),
      );
    }
    p.push(box(0.9, 0.5, 0.9, 0, 32.3, 2.6, K.steelDark, { glow: WORK }));
    p.push(box(4, 3, 6, 8, 0, -6, K.steel), box(4.4, 0.6, 6.4, 8, 3, -6, K.orange));
    return p;
  },
  // A drill rig over a dark crater floor, with a heated tank for the melt.
  iceDrill: () => {
    const p = [cyl(9, 9.5, 0.6, 16, 0, 0, 0, K.steelDark)];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.push(
          box(0.5, 24, 0.5, sx * 2.8, 0.6, sz * 2.8, K.rust, { rz: sx * 0.09, rx: -sz * 0.09 }),
        );
      }
    }
    p.push(
      box(5.6, 0.4, 5.6, 0, 8.6, 0, K.steelDark),
      box(3.8, 0.4, 3.8, 0, 16.6, 0, K.steelDark),
      box(2.4, 1.2, 2.4, 0, 24.2, 0, K.orange),
      box(0.8, 0.4, 0.8, 0, 25.4, 0, K.steelDark, { glow: COOL }),
      cyl(0.35, 0.35, 25, 8, 0, 0.6, 0, K.steel),
      cyl(3.2, 3.2, 7, 14, 9, 0.6, 3, K.teal),
      half(3.2, 12, 9, 7.6, 3, K.ceramic),
      cyl(3.3, 3.3, 0.5, 14, 9, 5, 3, K.steelDark, { glow: COOL }),
      box(6, 4, 5, -9, 0.6, 3, K.ceramicDark),
      box(1.6, 2.4, 0.2, -9, 0.6, 5.55, K.orange),
      box(2.4, 1, 0.2, -7.6, 2.8, 5.55, K.glass, { glow: COOL }),
      box(9, 0.6, 0.6, 4.5, 3.2, 3, K.steel),
    );
    return p;
  },
  // A crawler that heats the dust and keeps the gas the solar wind left in it.
  he3Harvester: () => {
    const p: BufferGeometry[] = [];
    for (const x of [-8, 0, 8]) p.push(box(5, 2, 10, x, 0, 0, K.steelDark));
    p.push(
      box(26, 1.2, 9, 0, 2, 0, K.steelDark),
      box(16, 5, 8, -3, 3.2, 0, K.ochre),
      box(4, 3.6, 7, 9, 3.2, 0, K.ochre),
      box(0.2, 1.4, 5.6, 11.05, 4.8, 0, K.glass, { glow: W }),
      box(3, 2, 9, 13.4, 0.7, 0, K.orange, { rz: -0.25 }),
      cyl(1.2, 1.5, 6, 10, -6, 8.2, 2, K.rust),
      cyl(1.3, 1.3, 0.6, 10, -6, 14.2, 2, K.steelDark, { glow: K.glowFurnace }),
      ball(2.2, 12, -9, 10.4, -1.6, K.ceramic),
      ball(2.2, 12, -3.8, 10.4, -1.6, K.ceramic),
      box(0.5, 0.4, 1.6, 11.2, 7, 0, K.steel, { glow: WORK }),
    );
    return p;
  },
  // Fable's ore mill, made into a smelter: a sawtooth hall, two stacks, the furnace mouth.
  smelter: () => {
    const p = [box(28.4, 1.2, 16.4, 0, 0, 0, K.steelDark), box(28, 11, 16, 0, 0, 0, K.ceramicDark)];
    for (let i = 0; i < 4; i++) {
      const x = -10.5 + i * 7;
      p.push(
        box(7.2, 0.5, 16.2, x, 12.2, 0, K.roof, { rz: 0.3 }),
        box(0.3, 2.6, 15, x + 3.3, 11, 0, K.glass, { glow: W, gid: i + 1 }),
      );
    }
    p.push(
      cyl(1.4, 1.9, 24, 10, -9, 11, -4, K.rust),
      cyl(1.55, 1.55, 1.2, 10, -9, 35, -4, K.orange),
      cyl(1.2, 1.6, 18, 10, -3, 11, 4.5, K.rust),
      cyl(1.35, 1.35, 1.1, 10, -3, 29, 4.5, K.orange),
      box(5, 4, 0.3, 5, 1.2, 8.1, K.soot, { glow: K.glowFurnace }),
    );
    for (const x of [-9, 3, 11])
      p.push(box(1.4, 0.5, 0.5, x, 9.5, 8.3, K.steelDark, { glow: WORK }));
    return p;
  },
  // Clean rooms: a white block with a cool band of light and air handlers on the roof.
  waferFab: () => {
    const p = [
      box(26, 0.8, 18, 0, 0, 0, K.steelDark),
      box(24, 9, 16, 0, 0.8, 0, K.bone),
      box(22, 1.2, 0.2, 0, 4.4, 8.05, K.glass, { glow: COOL, gid: 1 }),
      box(22, 1.2, 0.2, 0, 4.4, -8.05, K.glass, { glow: COOL, gid: 2 }),
      box(24.2, 0.8, 16.2, 0, 7.6, 0, K.teal),
      box(24.4, 0.4, 16.4, 0, 9.8, 0, K.roof),
      box(4, 3, 0.2, -7, 0.8, 8.1, K.glass, { glow: W }),
      cyl(0.8, 0.8, 6, 8, 9, 10.2, 4, K.ceramic),
    ];
    for (let i = 0; i < 3; i++) {
      const x = -7 + i * 5.3;
      p.push(
        box(3.2, 2, 3.2, x, 10.2, -3, K.steel),
        cyl(1.2, 1.2, 0.3, 10, x, 12.2, -3, K.steelDark),
      );
    }
    return p;
  },
  // Columns, tanks, a pipe rack and a flare.
  chemicalRefinery: () => [
    box(28, 0.4, 20, 0, 0, 0, K.steelDark),
    cyl(1.8, 1.8, 22, 12, -8, 0.4, -4, K.ceramic),
    cyl(1.9, 1.9, 0.6, 12, -8, 8, -4, K.teal),
    cyl(1.9, 1.9, 0.6, 12, -8, 16, -4, K.teal),
    box(0.9, 0.4, 0.9, -8, 22.4, -4, K.steelDark, { glow: WORK }),
    cyl(1.4, 1.4, 16, 12, -3, 0.4, -5, K.steel),
    cyl(2.2, 2.2, 12, 12, 3, 0.4, -4, K.ceramicDark),
    ball(3, 12, 8, 3.4, 4, K.ceramic),
    cyl(2.4, 2.4, 3, 12, -8, 0.4, 6, K.teal),
    cyl(2.4, 2.4, 3, 12, -2, 0.4, 6, K.teal),
    box(22, 0.4, 0.4, 0, 6, 1.5, K.orange),
    box(22, 0.4, 0.4, 0, 6.6, 0.6, K.steelDark),
    box(0.4, 6, 0.4, -10, 0.4, 1, K.steelDark),
    box(0.4, 6, 0.4, 10, 0.4, 1, K.steelDark),
    cyl(0.4, 0.6, 18, 8, 11, 0.4, -7, K.rust),
    box(0.9, 0.9, 0.9, 11, 18.4, -7, K.steelDark, { glow: K.glowFurnace }),
  ],
  // A cell house and two spheres: oxygen and hydrogen.
  electrolysisPlant: () => {
    const p = [
      box(26, 0.4, 18, 0, 0, 0, K.steelDark),
      box(16, 6, 9, -4, 0.4, 3.5, K.ceramic),
      box(16.4, 0.4, 9.4, -4, 6.4, 3.5, K.roof),
      ball(4, 14, 7, 6.2, -3, K.ceramic),
      cyl(4.1, 4.1, 0.5, 14, 7, 5.9, -3, K.teal),
      ball(3, 12, -6, 4.6, -5, K.ceramic),
      cyl(3.1, 3.1, 0.4, 12, -6, 4.4, -5, K.teal),
      box(14, 0.5, 0.5, 1, 4, -4.5, K.teal),
      cyl(0.5, 0.5, 8, 8, -11, 0.4, -6, K.steel),
    ];
    for (const [x, z] of [
      [4, -6],
      [10, -6],
      [4, 0],
      [10, 0],
    ] as const) {
      p.push(box(0.4, 3, 0.4, x, 0.4, z, K.steelDark));
    }
    for (let i = 0; i < 4; i++) {
      p.push(box(2.4, 1, 0.2, -10 + i * 4, 3.2, 8.05, K.glass, { glow: COOL, gid: i + 1 }));
    }
    return p;
  },
  // Life support: a dome that bakes oxygen out of the rock, with green intake lights.
  airPlant: () => {
    const p = [
      cyl(12, 12.5, 1.2, 20, 0, 0, 0, K.steel),
      half(11, 16, 0, 1.2, 0, K.ceramic),
      cyl(11.2, 11.2, 0.6, 20, 0, 1.4, 0, K.steelDark, { glow: LIFE }),
      cyl(1.6, 1.6, 0.6, 10, 0, 11.6, 0, K.glass, { glow: LIFE }),
      box(3.4, 3, 3, 0, 0, 11.5, K.ceramicDark),
      box(1.4, 2.1, 0.2, 0, 0, 13.1, K.orange),
    ];
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + ((i + 0.5) * TAU) / 3;
      const [x, z] = [14 * Math.cos(a), 14 * Math.sin(a)];
      p.push(
        cyl(1.2, 1.4, 9, 10, x, 0, z, K.teal),
        cyl(1.5, 1.5, 0.6, 10, x, 9, z, K.ceramic, { glow: LIFE }),
      );
    }
    return p;
  },
  // Three tanks of melt water round a pump house.
  waterPlant: () => {
    const p = [box(26, 0.4, 22, 0, 0, 0, K.steelDark), box(7, 4, 5, 0, 0.4, 0, K.ceramicDark)];
    p.push(box(2.4, 1, 0.2, 0, 2.4, 2.55, K.glass, { glow: LIFE }));
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 3;
      const [x, z] = [8.5 * Math.cos(a), 8.5 * Math.sin(a)];
      p.push(
        cyl(4, 4, 9, 14, x, 0.4, z, K.teal),
        half(4, 12, x, 9.4, z, K.ceramic),
        cyl(4.1, 4.1, 0.5, 14, x, 6, z, K.steelDark, { glow: LIFE }),
        box(0.6, 0.6, 5, x * 0.55, 1.2, z * 0.55, K.steel, { ry: -a + Math.PI / 2 }),
      );
    }
    return p;
  },
  // Fable's grow dome, with a smaller one beside it.
  hydroponicsFarm: () => [
    cyl(11.4, 11.8, 1.2, 18, -2, 0, -2, K.steel),
    half(11, 14, -2, 1.2, -2, K.growGlass, { glow: ['#63e0b0', 0.5] }),
    box(4, 3, 3.5, -2, 0, 9.5, K.ceramic),
    box(1.4, 2.1, 0.2, -2, 0, 11.3, K.orange),
    cyl(5.2, 5.4, 0.8, 14, 9, 0, 8, K.steel),
    half(5, 12, 9, 0.8, 8, K.growGlass, { glow: ['#63e0b0', 0.5] }),
  ],
  // A hall with a gantry crane over the yard.
  assemblyWorks: () => [
    box(24, 10, 14, 0, 0, -3, K.ceramicDark),
    box(24.4, 0.5, 14.4, 0, 10, -3, K.roof),
    box(22, 1.2, 0.2, 0, 8, 4.05, K.glass, { glow: W, gid: 1 }),
    box(8, 7, 0.3, -5, 0, 4.1, K.orange),
    box(1.4, 0.5, 0.5, 5, 7.6, 4.3, K.steelDark, { glow: WORK }),
    box(0.8, 12, 0.8, -11, 0, 9.5, K.steelDark),
    box(0.8, 12, 0.8, 11, 0, 9.5, K.steelDark),
    box(23.6, 1.2, 1.2, 0, 12, 9.5, K.orange),
    box(2, 1.4, 2, 3, 10.6, 9.5, K.steelDark),
    box(0.6, 0.3, 0.6, 3, 10.3, 9.5, K.steel, { glow: WORK }),
    ...container(-4, 0, 10, K.teal),
  ],
  solarArray: () => [-6.6, 6.6].flatMap((x) => [-9, 0, 9].flatMap((z) => solarTable(x, z))),
  crewQuarters: () => hab(3),
  // Homes under a dome: a ring of windows, and a garden light at the crown.
  habitatDome: () => {
    const p = [
      cyl(13, 13.5, 2.6, 24, 0, 0, 0, K.ceramicDark),
      half(12.6, 18, 0, 2.6, 0, K.ceramic),
      cyl(2.4, 3, 1, 12, 0, 14.6, 0, K.glass, { glow: LIFE }),
      box(4, 3, 3.6, 0, 0, 14.4, K.ceramic),
      box(1.4, 2.1, 0.2, 0, 0, 16.25, K.orange),
    ];
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * TAU;
      p.push(
        box(2.2, 1.1, 0.2, 13.15 * Math.cos(a), 1.1, 13.15 * Math.sin(a), K.glass, {
          glow: W,
          gid: 1 + i,
          ry: -a + Math.PI / 2,
        }),
      );
    }
    return p;
  },
  // Fable's stores.
  warehouse: () => {
    const roof = paint(
      new CylinderGeometry(8.2, 8.2, 30, 10, 1, false, 0, Math.PI).scale(0.5, 1, 1),
      K.roof,
    );
    return [
      box(30, 7, 16, 0, 0, 0, K.ceramicDark),
      put(roof, 0, 7, 0, { rz: Math.PI / 2 }),
      box(0.3, 5.5, 8, 15.1, 0, 0, K.orange),
      box(0.3, 0.5, 9, 15.2, 6, 0, K.steelDark, { glow: WORK }),
    ];
  },
  // A shed with three bus bays, lamps over the doors.
  roverGarage: () => {
    const p = [
      box(24, 7, 12, 0, 0, -3, K.ceramic),
      box(24.5, 0.6, 12.5, 0, 6.2, -3, K.ochre),
      box(24.4, 0.5, 12.4, 0, 6.8, -3, K.roof),
      box(26, 0.1, 8, 0, 0, 7, K.road),
      box(0.3, 9, 0.3, 11.5, 0, 4, K.steelDark),
      box(1.2, 1.2, 0.3, 11.5, 9, 4, K.ochre, { glow: COOL }),
    ];
    for (let i = 0; i < 3; i++) {
      const x = -8 + i * 8;
      p.push(
        box(5.6, 5, 0.3, x, 0, 3.1, K.orange),
        box(1.2, 0.3, 0.5, x, 5.6, 3.6, K.steel, { glow: WORK }),
      );
    }
    return p;
  },
  // A client's site: a fenced slab, beams, a container and a site light.
  contractSite: () => {
    const p = [box(14, 0.4, 14, 0, 0, 0, K.pad), ...container(-6, 0, -9.6)];
    for (const s of [-1, 1]) {
      p.push(
        box(24, 0.2, 0.15, 0, 1.6, s * 12, K.orange),
        box(0.15, 0.2, 24, s * 12, 1.6, 0, K.orange),
      );
    }
    for (let i = -2; i <= 2; i++) {
      for (const [x, z] of [
        [i * 6, -12],
        [i * 6, 12],
        [-12, i * 6],
        [12, i * 6],
      ] as const) {
        p.push(box(0.3, 2, 0.3, x, 0, z, K.steelDark));
      }
    }
    for (let i = 0; i < 3; i++) p.push(box(8, 0.6, 0.6, 3, 0.4 + i * 0.6, -4 + i * 0.7, K.rust));
    p.push(
      cyl(0.12, 0.15, 7, 5, 8, 0, 8, K.steelDark),
      box(0.5, 0.16, 0.9, 8, 6.9, 8.8, K.steel, { glow: WORK }),
    );
    return p;
  },
  // Fable's landing pad, at the size of a plot.
  'asset:landingPad': () => {
    const p = [
      cyl(16.5, 17, 0.8, 24, 0, 0, 0, K.pad),
      cyl(13, 13, 0.04, 32, 0, 0.8, 0, K.ochre),
      cyl(12.2, 12.2, 0.04, 32, 0, 0.83, 0, K.pad),
      box(8, 0.04, 1.3, 0, 0.86, 0, K.ochre),
      box(1.3, 0.04, 8, 0, 0.86, 0, K.ochre),
    ];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      p.push(
        box(0.5, 0.35, 0.5, Math.cos(a) * 15.6, 0.8, Math.sin(a) * 15.6, K.steelDark, {
          glow: COOL,
        }),
      );
    }
    return p;
  },
  // Fable's signal mast.
  'asset:commMast': () => [
    cyl(0.3, 1.2, 48, 4, 0, 0, 0, K.rust),
    box(5, 3, 4, 3.5, 0, 0, K.ceramicDark),
    cyl(2.3, 0.4, 1, 10, 0.9, 34, 0, K.ceramic, { rz: -Math.PI / 2 }),
    cyl(1.6, 0.3, 0.8, 10, 0, 40, 0.8, K.ceramic, { rx: Math.PI / 2 }),
  ],
  // Graders and gravel for the public roads.
  'asset:roadDepot': () => [
    box(14, 6, 9, -4, 0, -5, K.ceramicDark),
    box(14.4, 0.5, 9.4, -4, 6, -5, K.roof),
    box(5, 4.4, 0.3, -6, 0, -0.4, K.orange),
    box(1.2, 0.3, 0.5, -2, 4.8, -0.1, K.steel, { glow: WORK }),
    cyl(0.4, 4.2, 3, 10, 8, 0, 6, K.spoil),
    cyl(0.4, 3.2, 2.4, 10, 2, 0, 9, K.spoil),
    box(8, 1.6, 3, 7, 0.6, -6, K.ochre),
    box(2.6, 2.2, 2.6, 9.4, 2.2, -6, K.ochre),
    box(0.6, 1, 4, 3, 0.2, -6, K.steel),
    box(1.6, 1.2, 1.2, 4.6, 0, -7.6, K.tyre),
    box(1.6, 1.2, 1.2, 9.4, 0, -7.6, K.tyre),
    box(1.6, 1.2, 1.2, 4.6, 0, -4.4, K.tyre),
    box(1.6, 1.2, 1.2, 9.4, 0, -4.4, K.tyre),
  ],
  'asset:publicSolar': () => [-6.6, 6.6].flatMap((x) => [-5, 5].flatMap((z) => solarTable(x, z))),
};

/** Metres to world units: the kit is drawn in metres. */
function scaled(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g.scale(UNIT, UNIT, UNIT);
}

/** The model for a building type or client asset; height grows 5% per level above 1. */
export function buildModel(key: ModelKey, level: number): BufferGeometry {
  return scaled(MODELS[key]()).scale(1, levelHeight(level), 1);
}

export const levelHeight = (level: number): number => 1 + 0.05 * (level - 1);

const SCAFFOLD_METRES = 20;

/** Posts, rails and a work lamp round a building site, 20 m high (0.5 units). */
export function scaffoldGeometry(): BufferGeometry {
  const p: BufferGeometry[] = [];
  const e = 11.6;
  for (const [x, z] of [
    [-e, -e],
    [e, -e],
    [-e, e],
    [e, e],
  ] as const) {
    p.push(box(0.6, SCAFFOLD_METRES, 0.6, x, 0, z, K.steelDark));
  }
  for (const y of [4, 10, 16]) {
    p.push(
      box(24, 0.5, 0.5, 0, y, -e, K.ochre),
      box(24, 0.5, 0.5, 0, y, e, K.ochre),
      box(0.5, 0.5, 22.4, -e, y, 0, K.ochre),
      box(0.5, 0.5, 22.4, e, y, 0, K.ochre),
    );
  }
  p.push(
    box(24, 1.2, 0.2, 0, 1, e + 0.4, K.orange),
    box(0.9, 0.5, 0.9, e, SCAFFOLD_METRES - 0.5, e, K.steel, { glow: WORK }),
  );
  return scaled(p);
}

/** The tower crane over a building site; it turns about its mast. 28 m high (0.7 units). */
export function craneGeometry(): BufferGeometry {
  return scaled([
    box(1.2, 26, 1.2, 0, 0, 0, K.ochre),
    box(20, 0.9, 0.9, 5, 26, 0, K.orange),
    box(3, 2, 2, -4.5, 24.5, 0, K.steelDark),
    box(1.6, 1.6, 1.6, 0.9, 24.4, 0, K.ochre, { glow: W }),
    box(0.4, 0.4, 0.4, 0, 26.9, 0, K.steelDark, { glow: K.glowRed }),
    box(0.1, 8, 0.1, 12, 18, 0, K.steelDark),
  ]);
}

/** Fable's bus, nose along +x: lit windows, headlights and tail lights. About 9 m long. */
export function busGeometry(): BufferGeometry {
  const p = [
    box(2.5, 2.4, 9, 0, 0.7, 0, K.coach),
    box(2.56, 0.5, 9.02, 0, 1.25, 0, K.ochre),
    box(2.7, 0.9, 1.1, 0, 0, 2.8, K.tyre),
    box(2.7, 0.9, 1.1, 0, 0, -2.8, K.tyre),
  ];
  for (const s of [-1, 1]) {
    p.push(
      box(0.1, 0.9, 7.2, s * 1.26, 1.95, -0.3, K.glass, { glow: ['#ffd9a0', 1.0] }),
      box(0.5, 0.3, 0.1, s * 0.8, 0.95, 4.52, K.steel, { glow: ['#fff1cf', 5] }),
      box(0.4, 0.25, 0.1, s * 0.9, 1, -4.52, K.steel, { glow: ['#ff3b2f', 2] }),
    );
  }
  return scaled(p).rotateY(Math.PI / 2);
}

/**
 * Fable's walker, 1.8 m tall, facing +z. `tintMask` marks the suit, which takes the walker's
 * colour; `limb` is (swing direction, pivot height) for arms and legs.
 */
export function walkerGeometry(): BufferGeometry {
  const part = (g: BufferGeometry, tint: number, limb: number, pivot: number): BufferGeometry => {
    const n = g.getAttribute('position').count;
    g.setAttribute('tintMask', new BufferAttribute(new Float32Array(n).fill(tint), 1));
    g.setAttribute(
      'limb',
      new BufferAttribute(
        new Float32Array(n * 2).map((_, i) => (i % 2 ? pivot : limb)),
        2,
      ),
    );
    return g;
  };
  const suit = '#ffffff';
  const p: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    p.push(
      part(box(0.17, 0.82, 0.2, s * 0.11, 0, 0, '#34373d'), 0, s, 0.82),
      part(box(0.13, 0.6, 0.15, s * 0.3, 0.82, 0, suit), 1, -s * 0.7, 1.42),
    );
  }
  p.push(
    part(box(0.44, 0.62, 0.27, 0, 0.82, 0, suit), 1, 0, 0),
    part(box(0.32, 0.42, 0.16, 0, 0.94, -0.2, '#4a4d52'), 0, 0, 0),
    part(ball(0.17, 7, 0, 1.62, 0, '#e6dfd0'), 0, 0, 0),
    part(box(0.22, 0.11, 0.06, 0, 1.58, 0.14, '#10161c', { glow: ['#bfe6ff', 0.9] }), 0, 0, 0),
  );
  const g = mergeGeometries(p);
  for (const x of p) x.dispose();
  // The limb pivots are in metres; the shader scales them with the model.
  return g.scale(UNIT, UNIT, UNIT);
}

/** Suit colours by skill, as Fable dressed the crews. */
export const SUIT_COLORS = SUITS;

/**
 * Fable's ore crystals: a dark rock with nine crystals on it. `gem` is 1 on the crystals, which
 * take the instance colour (the mineral) and glint. About 5 m across, seeded.
 */
export function crystalGeometry(rnd: () => number): BufferGeometry {
  const gem = (g: BufferGeometry, v: number, hex: string): BufferGeometry => {
    const q = paint(g, hex);
    q.setAttribute(
      'gem',
      new BufferAttribute(new Float32Array(q.getAttribute('position').count).fill(v), 1),
    );
    return q;
  };
  const parts = [gem(new IcosahedronGeometry(1.6, 0).scale(1.3, 0.45, 1.1), 0, K.rock)];
  for (let i = 0; i < 9; i++) {
    const h = 1.1 + rnd() * rnd() * 4;
    const r = 0.2 + rnd() * 0.32;
    const o = { rx: (rnd() - 0.5) * 0.9, rz: (rnd() - 0.5) * 0.9 };
    const x = (rnd() - 0.5) * 2.2;
    const z = (rnd() - 0.5) * 1.8;
    const shaft = new CylinderGeometry(r, r * 1.1, h, 6).translate(0, h / 2, 0);
    const tip = new CylinderGeometry(0, r, r * 2.4, 6).translate(0, h + r * 1.2, 0);
    parts.push(
      put(gem(shaft, 1, '#ffffff'), x, 0.2, z, o),
      put(gem(tip, 1, '#ffffff'), x, 0.2, z, o),
    );
  }
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g.scale(UNIT, UNIT, UNIT);
}

/** One metre of Fable's conveyor, along +z, its top at y = 0: scaled per segment. */
export function beltSegmentGeometry(): BufferGeometry {
  return mergeGeometries([
    box(1.5, 0.8, 1, 0, -1, 0, K.rust),
    box(2.2, 0.2, 1, 0, -0.2, 0, '#1b1b1e'),
    box(0.14, 0.55, 1, -1.1, -0.2, 0, K.orange),
    box(0.14, 0.55, 1, 1.1, -0.2, 0, K.orange),
  ]);
}

/** A belt pylon, one metre high: stretched to reach the belt. */
export const pylonGeometry = (): BufferGeometry => box(0.5, 1, 0.5, 0, 0, 0, K.steelDark);
