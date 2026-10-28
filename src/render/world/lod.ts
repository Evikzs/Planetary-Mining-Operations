/** Which world layers draw at a camera altitude. */
export function visibleLayers(alt: number): {
  walkers: boolean;
  crates: boolean;
  rovers: boolean;
  traffic: boolean;
  plotMarkers: boolean;
  buildings: boolean;
} {
  return {
    walkers: alt < 4,
    crates: alt < 8,
    rovers: alt < 30,
    traffic: alt >= 30,
    plotMarkers: alt < 30,
    buildings: alt < 60,
  };
}
