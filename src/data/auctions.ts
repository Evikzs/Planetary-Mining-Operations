/** Section auctions: timing, steps, fees and limits (spec 7.8). */
export const AUCTION = {
  /** 3 game hours. */
  durationTicks: 180,
  /** A bid in the last 30 game minutes pushes the end to 30 game minutes after it. */
  softCloseTicks: 30,
  /** No auction runs longer than 10 game hours. */
  maxDurationTicks: 600,
  minIncrementCents: 100_000,
  minIncrementPct: 0.05,
  listingFeeCents: 200_000,
  reserveCents: 3_000_000,
  /** Days of a section's best deposit margins that bidders count as its value. */
  valueHorizonDays: 10,
  scheduledEveryHours: 12,
  maxOpenLots: 6,
  maxOpenedPerCompany: 2,
  minReputation: 5,
  bidDefaultRep: 5,
  /** Closed lots kept on record. */
  closedKept: 20,
} as const;
