// Later tasks add members to this union.
export type SimEvent =
  | { t: 'shiftChange'; shift: 0 | 1 | 2 }
  | { t: 'founded' }
  | { t: 'constructionStarted'; buildingId: number }
  | { t: 'buildingCompleted'; buildingId: number }
  | { t: 'sectionBought'; sectionId: number }
  | { t: 'brownout'; sectionId: number; factor: number };
