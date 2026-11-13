// Demo data. This object is the data contract: replace it with data from the real game.
//
// Units: distances in metres (worlds are small on purpose, so a town shows from orbit).
// Times in real seconds at speed 1x. Angles in radians. Colours are sRGB hex.
// atmosphere.density: 0 = no air (stars show at noon), 1 = thick air (stars hidden all day).

export const DEMO_SYSTEM = {
  name: 'Halde',
  star: { name: 'Halde', radius: 3e4, color: '#ffd7a1' },
  planets: [
    {
      id: 'cinder', name: 'Cinder', kind: 'rock', blurb: 'First world of Halde. No air, hot ground, brass in the rock.',
      radius: 3400, orbit: 7.0e5, period: 1100, phase: 5.6, day: 420, tilt: 0.05, seed: 3.7,
      palette: { low: '#1a1513', high: '#4b3a2f', accent: '#7a4a2a' }, ore: 'pyrite',
      atmosphere: null,
      colony: { name: "Smelter's Rest", lat: 0.2, lon: 1.0, population: 310 },
    },
    {
      id: 'gossan', name: 'Gossan', kind: 'rock', home: true, blurb: 'Second world of Halde. Dark basalt, thin dusty air, rose seams.',
      radius: 5000, orbit: 1.2e6, period: 2400, phase: 4.8, day: 300, tilt: 0.2, seed: 11.2,
      palette: { low: '#1b1b21', high: '#4a4850', accent: '#5e423d' }, ore: 'rhodonite',
      atmosphere: { density: 0.92, height: 450, zenith: '#4a7da6', horizon: '#c9d2cf', sunset: '#f0894a', rim: '#86b6d8' },
      colony: { name: 'Adit One', lat: 0.32, lon: 0.6, population: 1840, outposts: [{ lat: -0.3, lon: 2.4 }, { lat: 0.7, lon: -1.2 }, { lat: -0.1, lon: -2.6 }] },
    },
    {
      id: 'tallow', name: 'Tallow', kind: 'rock', blurb: 'Third world of Halde. Thick yellow haze. You do not see stars here.',
      radius: 6200, orbit: 1.75e6, period: 4200, phase: 3.9, day: 520, tilt: 0.1, seed: 23.9,
      palette: { low: '#3a2f22', high: '#7d6a4a', accent: '#55502f' }, ore: 'malachite',
      atmosphere: { density: 1.0, height: 700, zenith: '#b98f4e', horizon: '#e6cf9a', sunset: '#d8643a', rim: '#e2b873' },
      colony: { name: 'Greenhollow', lat: -0.25, lon: 2.0, population: 620, outposts: [{ lat: 0.4, lon: 0.2 }] },
    },
    {
      id: 'brann', name: 'Brann', kind: 'gas', blurb: 'Fourth world of Halde. A gas giant. No ground to mine.',
      radius: 1.5e4, orbit: 2.5e6, period: 9000, phase: 3.0, day: 200, tilt: 0.35, seed: 5.1, rings: true,
      palette: { low: '#4f4238', high: '#a58a64', accent: '#3d3a44' }, ore: null,
      atmosphere: { density: 1.0, height: 900, zenith: '#a58a64', horizon: '#d9c39a', sunset: '#c2703f', rim: '#d1b98c' },
      colony: null,
    },
    {
      id: 'rime', name: 'Rime', kind: 'rock', blurb: 'Fifth world of Halde. Ice over stone. The air is too thin to hide the stars.',
      radius: 4200, orbit: 3.2e6, period: 15000, phase: 1.95, day: 260, tilt: 0.4, seed: 41.3,
      palette: { low: '#3b4654', high: '#b9c6cf', accent: '#6f8597' }, ore: 'azurite',
      atmosphere: { density: 0.3, height: 300, zenith: '#25405f', horizon: '#7f98a8', sunset: '#c98a6a', rim: '#9cc6e0' },
      colony: { name: 'Cold Drift', lat: 0.5, lon: -0.8, population: 140 },
    },
  ],
};
