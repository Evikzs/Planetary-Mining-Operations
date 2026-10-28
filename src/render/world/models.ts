import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS, type BuildingTypeId } from '../../data/buildings';
import type { Asset } from '../../sim/contracts/contracts';
import { bodyAccent, palette } from '../../ui/tokens';

/** Every model fits in a circle of this radius around its plot, so pick spheres cover it. */
export const MODEL_FOOTPRINT = 0.45;

export type ModelKey = BuildingTypeId | `asset:${Asset}`;

const ASSETS: Asset[] = ['landingPad', 'commMast', 'roadDepot', 'publicSolar'];
export const ALL_MODEL_KEYS: ModelKey[] = [
  ...(Object.keys(BUILDINGS) as BuildingTypeId[]),
  ...ASSETS.map((a) => `asset:${a}` as const),
];

const { navy, burntOrange, mustard, teal, cream, rust, offBlack, dustyPink } = palette;
const LUNA = bodyAccent.luna;
type V3 = [number, number, number];
type Turn = ['x' | 'y' | 'z', number];

/** One flat-coloured primitive: turned in the given order, then moved to `at`. */
function part(
  geo: BufferGeometry,
  color: string,
  at: V3 = [0, 0, 0],
  turns: Turn[] = [],
): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  for (const [axis, a] of turns) {
    if (axis === 'x') g.rotateX(a);
    else if (axis === 'y') g.rotateY(a);
    else g.rotateZ(a);
  }
  g.translate(...at);
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  return g;
}

/** A box standing on y. */
const box = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): BufferGeometry =>
  part(new BoxGeometry(w, h, d), color, [x, y + h / 2, z]);

/** An upright cylinder (or frustum) standing on y. */
const cyl = (
  top: number,
  bottom: number,
  h: number,
  color: string,
  x = 0,
  y = 0,
  z = 0,
  seg = 12,
): BufferGeometry => part(new CylinderGeometry(top, bottom, h, seg), color, [x, y + h / 2, z]);

/** An upper half sphere sitting on y. */
const dome = (r: number, color: string, x = 0, y = 0, z = 0, seg = 16): BufferGeometry =>
  part(new SphereGeometry(r, seg, seg / 2, 0, Math.PI * 2, 0, Math.PI / 2), color, [x, y, z]);

/** A wheel on its side, axle along z. */
const wheel = (r: number, w: number, x: number, y: number, z: number): BufferGeometry =>
  part(new CylinderGeometry(r, r, w, 10), offBlack, [x, y, z], [['x', Math.PI / 2]]);

/** A half cylinder lying down with its arch up; the axis runs along x, or z when `alongZ`. */
const arch = (r: number, length: number, color: string, alongZ = false): BufferGeometry =>
  part(
    new CylinderGeometry(r, r, length, 12, 1, false, 0, Math.PI),
    color,
    [0, 0, 0],
    [['z', Math.PI / 2], ...(alongZ ? ([['y', Math.PI / 2]] as Turn[]) : [])],
  );

/** A tilted panel on a post. */
function panel(w: number, d: number, x: number, z: number): BufferGeometry[] {
  return [
    box(0.02, 0.12, 0.02, offBlack, x, 0, z),
    part(new BoxGeometry(w, 0.012, d), navy, [x, 0.13, z], [['z', 0.4]]),
  ];
}

const SCAFFOLD_HEIGHT = 0.5;

/** Posts and rings of a building site, 0.5 high. */
export function scaffoldGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const e = 0.29;
  for (const [x, z] of [
    [-e, -e],
    [e, -e],
    [-e, e],
    [e, e],
  ] as const) {
    parts.push(box(0.02, SCAFFOLD_HEIGHT, 0.02, offBlack, x, 0, z));
  }
  for (const y of [0.1, 0.25, 0.4]) {
    parts.push(box(0.6, 0.02, 0.02, mustard, 0, y, -e), box(0.6, 0.02, 0.02, mustard, 0, y, e));
    parts.push(box(0.02, 0.02, 0.56, mustard, -e, y, 0), box(0.02, 0.02, 0.56, mustard, e, y, 0));
  }
  return mergeGeometries(parts);
}

/** The tower crane over a building site; it turns about its mast. */
export function craneGeometry(): BufferGeometry {
  return mergeGeometries([
    box(0.03, 0.7, 0.03, mustard),
    box(0.5, 0.03, 0.03, mustard, 0.12, 0.7, 0),
    box(0.08, 0.06, 0.06, offBlack, -0.12, 0.64, 0),
  ]);
}

const MODELS: Record<ModelKey, () => BufferGeometry[]> = {
  depot: () => [
    box(0.6, 0.2, 0.36, cream, 0, 0, -0.08),
    box(0.62, 0.04, 0.38, burntOrange, 0, 0.2, -0.08),
    cyl(0.14, 0.14, 0.03, offBlack, 0, 0, 0.28, 16),
    cyl(0.07, 0.07, 0.035, mustard, 0, 0, 0.28, 12),
  ],
  regolithScoop: () => [
    box(0.5, 0.08, 0.1, offBlack, 0, 0, -0.16),
    box(0.5, 0.08, 0.1, offBlack, 0, 0, 0.16),
    box(0.4, 0.14, 0.3, mustard, -0.02, 0.08, 0),
    box(0.14, 0.1, 0.18, cream, -0.12, 0.22, 0),
    box(0.08, 0.1, 0.34, rust, 0.28, 0.02, 0),
  ],
  mine: () => [
    box(0.3, 0.16, 0.3, cream, -0.12, 0, 0.05),
    cyl(0.11, 0.04, 0.14, mustard, -0.12, 0.16, 0.05, 4),
    cyl(0.05, 0.13, 0.62, rust, 0.12, 0, -0.1, 4),
    part(
      new CylinderGeometry(0.07, 0.07, 0.025, 12),
      offBlack,
      [0.12, 0.64, -0.1],
      [['x', Math.PI / 2]],
    ),
  ],
  iceDrill: () => [
    box(0.24, 0.04, 0.24, offBlack, -0.12, 0, 0),
    cyl(0.025, 0.12, 0.72, rust, -0.12, 0.04, 0, 4),
    cyl(0.14, 0.14, 0.3, cream, 0.18, 0, 0.05),
    cyl(0.145, 0.145, 0.06, teal, 0.18, 0.12, 0.05),
  ],
  he3Harvester: () => [
    box(0.62, 0.16, 0.36, mustard, 0, 0.12, 0),
    box(0.1, 0.12, 0.3, rust, 0.33, 0.06, 0),
    cyl(0.015, 0.015, 0.2, offBlack, -0.2, 0.28, 0, 6),
    ...[-0.22, 0, 0.22].flatMap((x) => [
      wheel(0.08, 0.05, x, 0.08, -0.2),
      wheel(0.08, 0.05, x, 0.08, 0.2),
    ]),
  ],
  smelter: () => [
    box(0.56, 0.24, 0.4, cream, -0.04, 0, 0),
    box(0.58, 0.04, 0.42, rust, -0.04, 0.24, 0),
    box(0.02, 0.12, 0.16, burntOrange, 0.25, 0, 0),
    cyl(0.045, 0.055, 0.3, offBlack, 0.14, 0.28, -0.09, 10),
    cyl(0.045, 0.055, 0.3, offBlack, 0.14, 0.28, 0.09, 10),
    cyl(0.047, 0.047, 0.04, burntOrange, 0.14, 0.54, -0.09, 10),
    cyl(0.047, 0.047, 0.04, burntOrange, 0.14, 0.54, 0.09, 10),
  ],
  waferFab: () => [
    box(0.6, 0.22, 0.5, cream),
    box(0.61, 0.03, 0.51, navy, 0, 0.08, 0),
    box(0.12, 0.08, 0.1, teal, -0.15, 0.22, -0.1),
    box(0.12, 0.08, 0.1, teal, 0.05, 0.22, -0.1),
    box(0.12, 0.08, 0.1, teal, 0.15, 0.22, 0.12),
  ],
  chemicalRefinery: () => [
    box(0.6, 0.04, 0.4, offBlack),
    cyl(0.07, 0.07, 0.5, teal, -0.18, 0.04, 0),
    cyl(0.06, 0.06, 0.42, cream, 0, 0.04, 0.05),
    cyl(0.055, 0.055, 0.34, rust, 0.18, 0.04, -0.05),
    box(0.4, 0.03, 0.03, mustard, 0, 0.3, 0),
  ],
  electrolysisPlant: () => [
    box(0.6, 0.04, 0.36, offBlack),
    cyl(0.11, 0.11, 0.34, cream, -0.15, 0.04, 0),
    cyl(0.11, 0.11, 0.34, cream, 0.15, 0.04, 0),
    dome(0.11, cream, -0.15, 0.38, 0, 12),
    dome(0.11, cream, 0.15, 0.38, 0, 12),
    box(0.3, 0.03, 0.03, teal, 0, 0.3, 0),
    box(0.03, 0.2, 0.03, teal, 0, 0.04, 0.12),
  ],
  airPlant: () => [
    cyl(0.3, 0.3, 0.04, offBlack, 0, 0, 0, 16),
    dome(0.28, cream, 0, 0.04, 0, 14),
    ...[0, 1, 2].map((k) => {
      const a = (k * 2 * Math.PI) / 3;
      return cyl(0.07, 0.07, 0.04, teal, 0.34 * Math.cos(a), 0, 0.34 * Math.sin(a), 10);
    }),
  ],
  waterPlant: () => [
    box(0.5, 0.03, 0.5, offBlack),
    ...[0, 1, 2].flatMap((k) => {
      const a = Math.PI / 2 + (k * 2 * Math.PI) / 3;
      const [x, z] = [0.2 * Math.cos(a), 0.2 * Math.sin(a)];
      return [cyl(0.11, 0.11, 0.26, teal, x, 0.03, z), cyl(0.115, 0.115, 0.03, cream, x, 0.29, z)];
    }),
  ],
  hydroponicsFarm: () => [box(0.78, 0.03, 0.4, cream), arch(0.19, 0.74, teal)],
  assemblyWorks: () => [
    box(0.6, 0.18, 0.46, cream),
    box(0.02, 0.12, 0.2, offBlack, 0.3, 0, 0),
    ...[-0.2, 0, 0.2].map((x) =>
      part(
        new CylinderGeometry(0.1, 0.1, 0.46, 3),
        rust,
        [x, 0.18 + 0.05, 0],
        [['x', -Math.PI / 2]],
      ),
    ),
  ],
  solarArray: () =>
    [0, 1, 2, 3].flatMap((i) =>
      [0, 1, 2].flatMap((j) => panel(0.16, 0.11, -0.27 + i * 0.18, -0.15 + j * 0.15)),
    ),
  crewQuarters: () => [
    box(0.46, 0.12, 0.3, cream),
    box(0.47, 0.03, 0.31, navy, 0, 0.05, 0),
    box(0.4, 0.12, 0.28, dustyPink, 0.03, 0.12, 0.02),
    box(0.34, 0.12, 0.26, cream, -0.02, 0.24, -0.01),
  ],
  habitatDome: () => [
    cyl(0.4, 0.42, 0.06, cream, 0, 0, 0, 20),
    dome(0.36, teal, 0, 0.06, 0, 16),
    cyl(0.06, 0.06, 0.03, cream, 0, 0.41, 0, 8),
  ],
  warehouse: () => [
    box(0.78, 0.2, 0.34, cream),
    box(0.8, 0.03, 0.36, rust, 0, 0.2, 0),
    box(0.02, 0.12, 0.1, offBlack, 0.4, 0, -0.08),
    box(0.02, 0.12, 0.1, offBlack, 0.4, 0, 0.08),
  ],
  roverGarage: () => [
    arch(0.24, 0.62, cream, true),
    box(0.36, 0.18, 0.02, offBlack, 0, 0, 0.31),
    box(0.36, 0.03, 0.025, mustard, 0, 0.18, 0.31),
  ],
  contractSite: () => [scaffoldGeometry()],
  'asset:landingPad': () => [
    cyl(0.43, 0.44, 0.03, offBlack, 0, 0, 0, 24),
    part(new TorusGeometry(0.3, 0.02, 4, 24), mustard, [0, 0.035, 0], [['x', Math.PI / 2]]),
    box(0.03, 0.01, 0.2, mustard, -0.06, 0.03, 0),
    box(0.03, 0.01, 0.2, mustard, 0.06, 0.03, 0),
    box(0.12, 0.01, 0.03, mustard, 0, 0.03, 0),
  ],
  'asset:commMast': () => [
    box(0.24, 0.04, 0.24, offBlack),
    cyl(0.02, 0.08, 0.9, rust, 0, 0.04, 0, 4),
    part(
      new SphereGeometry(0.12, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      cream,
      [0, 0.7, 0.04],
      [['x', Math.PI / 2]],
    ),
    cyl(0.025, 0.025, 0.04, mustard, 0, 0.94, 0, 8),
  ],
  'asset:roadDepot': () => [
    box(0.72, 0.02, 0.5, LUNA),
    box(0.24, 0.16, 0.2, cream, -0.18, 0.02, -0.1),
    box(0.26, 0.03, 0.22, burntOrange, -0.18, 0.18, -0.1),
    box(0.1, 0.08, 0.1, mustard, 0.15, 0.02, 0.1),
  ],
  'asset:publicSolar': () => [-0.3, -0.1, 0.1, 0.3].flatMap((x) => panel(0.18, 0.14, x, 0)),
};

/** The model for a building type or client asset; height grows 5% per level above 1. */
export function buildModel(key: ModelKey, level: number): BufferGeometry {
  const g = mergeGeometries(MODELS[key]());
  return g.scale(1, levelHeight(level), 1);
}

export const levelHeight = (level: number): number => 1 + 0.05 * (level - 1);
