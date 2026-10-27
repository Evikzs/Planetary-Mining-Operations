// Later tasks add members to this union.
export type SimEvent = { t: 'shiftChange'; shift: 0 | 1 | 2 } | { t: 'founded' };
