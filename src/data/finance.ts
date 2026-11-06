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
