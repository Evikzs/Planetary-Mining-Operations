import type { GoodId } from '../data/goods';
import { PLAYER, type CompanyId } from './companies';
import type { Rating } from './finance/credit';

/** Events about one company's sections, buildings, workers, orders or contracts name it. */
type Of<E> = E & { companyId: CompanyId };

// Later tasks add members to this union.
export type SimEvent =
  | { t: 'shiftChange'; shift: 0 | 1 | 2 }
  | Of<{ t: 'founded' }>
  | Of<{ t: 'constructionStarted'; buildingId: number }>
  | Of<{ t: 'buildingCompleted'; buildingId: number }>
  | Of<{ t: 'sectionBought'; sectionId: number }>
  | Of<{ t: 'brownout'; sectionId: number; factor: number }>
  | Of<{ t: 'beltJammed'; beltId: number }>
  | Of<{ t: 'shortage'; sectionId: number; need: 'air' | 'water' | 'food'; daysLeft: number }>
  | Of<{ t: 'arrivals'; sectionId: number; count: number }>
  | Of<{ t: 'emigration'; count: number }>
  | Of<{ t: 'strike'; buildingId: number }>
  | Of<{ t: 'strikeEnded'; buildingId: number }>
  | Of<{
      t: 'trade';
      orderId: number;
      goodId: GoodId;
      side: 'buy' | 'sell';
      kg: number;
      cents: number;
    }>
  | Of<{ t: 'income'; plotId: number | null; cents: number; source: 'trade' | 'contract' }>
  | { t: 'priceMove'; goodId: GoodId; pct24h: number }
  | { t: 'contractOffered'; contractId: number; tenderTo: CompanyId | null }
  | Of<{ t: 'contractCompleted' | 'contractFailed'; contractId: number }>
  | Of<{ t: 'monthClosed'; label: string; netIncomeCents: number }>
  | Of<{ t: 'ratingChanged'; from: Rating; to: Rating }>
  | Of<{ t: 'defaulted'; owedCents: number }>
  | Of<{ t: 'defaultCured' }>
  | Of<{
      t: 'shareTrade';
      orderId: number;
      target: CompanyId;
      side: 'buy' | 'sell';
      qty: number;
      cents: number;
    }>
  | { t: 'stakeDisclosed'; holder: CompanyId; companyId: CompanyId; pct: number }
  | Of<{ t: 'dividendPaid'; perShareCents: number }>;

/** Whether the player should hear of an event: its own, a public offer, or market-wide news. */
export function forPlayer(e: SimEvent): boolean {
  if (e.t === 'contractOffered') return e.tenderTo === null || e.tenderTo === PLAYER;
  return !('companyId' in e) || e.companyId === PLAYER;
}
