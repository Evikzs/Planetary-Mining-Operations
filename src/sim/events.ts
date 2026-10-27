import type { GoodId } from '../data/goods';

// Later tasks add members to this union.
export type SimEvent =
  | { t: 'shiftChange'; shift: 0 | 1 | 2 }
  | { t: 'founded' }
  | { t: 'constructionStarted'; buildingId: number }
  | { t: 'buildingCompleted'; buildingId: number }
  | { t: 'sectionBought'; sectionId: number }
  | { t: 'brownout'; sectionId: number; factor: number }
  | { t: 'beltJammed'; beltId: number }
  | { t: 'shortage'; sectionId: number; need: 'air' | 'water' | 'food'; daysLeft: number }
  | { t: 'arrivals'; sectionId: number; count: number }
  | { t: 'emigration'; count: number }
  | { t: 'strike'; buildingId: number }
  | { t: 'strikeEnded'; buildingId: number }
  | { t: 'trade'; orderId: number; goodId: GoodId; side: 'buy' | 'sell'; kg: number; cents: number }
  | { t: 'income'; plotId: number | null; cents: number; source: 'trade' | 'contract' }
  | { t: 'priceMove'; goodId: GoodId; pct24h: number };
