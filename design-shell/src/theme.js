// One source of colour for the 3D scene. hud.css mirrors the same values as CSS tokens.

export const INK = {
  pit: '#0c0d11', // deepest surface
  slate: '#1b1e25', // raised surface
  chalk: '#ece6da', // primary text
  dust: '#a39a8c', // secondary text
  lamp: '#f2a93b', // work light: the colour of everything people built
  brass: '#b08d4c', // hairlines, orbit lines
  verdant: '#58c7a3', // life support
  hazard: '#e2542b', // alerts
};

// The glimmer. A mineral colour is used for finds only, never for ordinary UI.
export const MINERALS = {
  rhodonite: { name: 'Rhodonite', color: '#e4688e', formula: 'MnSiO₃', note: 'Rose-pink manganese silicate with black veins. The reason people came to Gossan.' },
  pyrite: { name: 'Pyrite', color: '#d9b65a', formula: 'FeS₂', note: 'Brass-yellow cubes. Worth less than it looks, but the smelters run on it.' },
  malachite: { name: 'Malachite', color: '#3fb58a', formula: 'Cu₂CO₃(OH)₂', note: 'Banded green copper carbonate. It marks the copper below.' },
  azurite: { name: 'Azurite', color: '#3f7be0', formula: 'Cu₃(CO₃)₂(OH)₂', note: 'Deep blue copper carbonate, found in the cold seams.' },
};

// Paint and light for the colony kit.
export const KIT = {
  ceramic: '#b5ac9c', ceramicDark: '#8a8276', steel: '#5d6166', steelDark: '#32353a',
  orange: '#d2622a', ochre: '#c28a2c', rust: '#7c4a34', teal: '#2f6f6a', glass: '#18222b',
  roof: '#c6beaf', road: '#1d1d23', ground: '#45444c',
  glowWindow: ['#ffc56e', 1.25], glowWork: ['#ffab3d', 2.3], glowCool: ['#cfe6ff', 1.3],
  glowLife: ['#63e0b0', 1.3], glowRed: ['#ff3b2f', 2.2], glowFurnace: ['#ff7a2a', 1.6],
  suits: ['#e06a26', '#e06a26', '#c9a13a', '#3f8f8a', '#6f86a8', '#a89f8d', '#8f4f3b'],
};
