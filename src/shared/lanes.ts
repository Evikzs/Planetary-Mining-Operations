/**
 * Arc-length positions of the crates on a belt lane, oldest first. A jammed lane queues crates
 * back from the end, one spacing apart.
 */
export function cratePositions(
  lane: { batches: readonly { enterTick: number }[]; jammed: boolean },
  gameTime: number,
  transitTicks: number,
  length: number,
  spacing: number,
): number[] {
  return lane.batches.map((b, i) => {
    let s = Math.min(length, ((gameTime - b.enterTick) / transitTicks) * length);
    if (lane.jammed) s = Math.min(s, length - i * spacing);
    return Math.max(0, Math.min(length, s));
  });
}
