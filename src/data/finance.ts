/** Months over which a building's cost is written down, one share at each close. */
export const DEPRECIATION_MONTHS = 24;

/** The Lunar Authority's policy rate, per game month: a game year is 146 real days. */
export const BASE_RATE_PER_MONTH = 0.02;
/** What each rating adds to the base rate. D gets no new credit. */
export const SPREAD = {
  AAA: 0.002,
  AA: 0.004,
  A: 0.007,
  BBB: 0.012,
  BB: 0.02,
  B: 0.035,
  CCC: 0.06,
} as const;
/** Credit line limit as a share of equity. */
export const LINE_FACTOR = {
  AAA: 1,
  AA: 0.8,
  A: 0.6,
  BBB: 0.4,
  BB: 0.25,
  B: 0.15,
  CCC: 0.05,
  D: 0,
};
/** Loans and credit together stay within this share of equity. */
export const LOAN_FACTOR = { AAA: 2, AA: 1.6, A: 1.2, BBB: 0.9, BB: 0.6, B: 0.35, CCC: 0.1, D: 0 };
export const MIN_LOAN_CENTS = 1_000_000;
/** Loan terms count 30-day months. */
export const DAYS_PER_LOAN_MONTH = 30;
/** Hours in default before the lender seizes assets (C11). */
export const DEFAULT_GRACE_HOURS = 24;
/** Closes a rating stays at D after a default is cured. */
export const D_RATING_CLOSES = 3;
/** C11: a bankrupt rival's successor comes 48 game hours later; a seized player loses 20
 * reputation; an assets lot's reserve is half the book value of the land and buildings in it. */
export const SOLVENCY = { replacementHours: 48, writeOffRepLoss: 20, assetsReserveShare: 0.5 };

/** Listed shares: how many, how the public trades them, and the issue and disclosure limits. */
export const SHARES = {
  outstandingAtListing: 100_000,
  /** Share of the float NPC investors trade each game hour at fair value. */
  npcTurnoverPerHour: 0.005,
  elasticity: 2,
  /** Prices stay within fair value / 5 and × 5. */
  boundsFactor: 5,
  maxIssuePerMonth: 0.2,
  disclosureStake: 0.2,
  /** A market buy holds cash for twice the last price. */
  marketBuyEscrowFactor: 2,
} as const;

/** Fair value: book value plus a few months of earnings, moved by reputation and mood. */
export const VALUATION = {
  earningsMonths: 3,
  bookFloor: 0.5,
  sentimentDecay: 0.95,
  sentimentSigma: 0.03,
  defaultShock: -0.5,
  notchShock: 0.1,
  dividendShock: 0.05,
} as const;
