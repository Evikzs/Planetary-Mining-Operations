/** Offers on the board at once. */
export const boardSize = (reputation: number) => Math.min(8, 3 + Math.floor(reputation / 20));

/** Contracts the player may hold at once. */
export const maxActive = (reputation: number) => Math.min(6, 2 + Math.floor(reputation / 25));

const urgency = (deadlineHours: number) =>
  1 + 0.2 * Math.min(1, Math.max(0, (48 - deadlineHours) / 48));

const repBonus = (reputation: number) => 1 + reputation / 500;

export function oreDeliveryReward(i: {
  amountT: number;
  pRefCents: number;
  margin: number;
  deadlineHours: number;
  reputation: number;
}): number {
  return Math.round(
    i.amountT * i.pRefCents * i.margin * urgency(i.deadlineHours) * repBonus(i.reputation),
  );
}

export function infrastructureReward(i: {
  materialsCents: number;
  labourCents: number;
  margin: number;
  deadlineHours: number;
  reputation: number;
}): number {
  return Math.round(
    (i.materialsCents + i.labourCents) *
      i.margin *
      urgency(i.deadlineHours) *
      repBonus(i.reputation),
  );
}
