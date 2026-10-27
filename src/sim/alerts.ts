import type { System } from './engine';
import type { SimEvent } from './events';

/** An event worth the player's attention, stamped with when it happened. */
export type Alert = SimEvent & { tick: number };

const ALERT_TYPES = new Set<SimEvent['t']>([
  'shortage',
  'brownout',
  'beltJammed',
  'strike',
  'emigration',
  'contractFailed',
  'priceMove',
]);
const KEPT = 20;

/** Keeps the latest 20 alerts, newest first. */
export const alertsSystem: System = {
  id: 'alerts',
  step(state, ctx) {
    for (const e of ctx.events)
      if (ALERT_TYPES.has(e.t)) state.alerts.unshift({ ...e, tick: state.tick });
    if (state.alerts.length > KEPT) state.alerts.length = KEPT;
  },
};
