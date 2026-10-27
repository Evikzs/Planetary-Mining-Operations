import type { GameState } from './state';

/** Debug checks run after every tick in dev builds. Later tasks add orders. */
export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  let sum = 0;
  for (const [id, cents] of Object.entries(state.ledger.balances)) {
    if (!Number.isSafeInteger(cents))
      problems.push(`${id} balance is not a safe integer: ${cents}`);
    if (id !== 'world' && cents < 0) problems.push(`${id} balance is negative: ${cents}`);
    sum += cents;
  }
  if (sum !== 0) problems.push(`ledger does not balance: sum ${sum}`);
  const stocks = [
    ...state.sections.map((s) => [`depot ${s.id}`, s.depot] as const),
    ...state.buildings.flatMap((b) => [
      [`building ${b.id} input`, b.input] as const,
      [`building ${b.id} output`, b.output] as const,
    ]),
  ];
  for (const [where, inv] of stocks) {
    for (const [g, kg] of Object.entries(inv)) {
      if (!Number.isSafeInteger(kg) || kg < 0) problems.push(`${where} ${g} is invalid: ${kg}`);
    }
  }
  const p = state.people;
  const buildingIds = new Set(state.buildings.map((b) => b.id));
  for (let i = 0; i < p.count; i++) {
    const m = p.morale[i]!;
    if (!(m >= 0 && m <= 100)) problems.push(`worker ${p.id[i]} morale is invalid: ${m}`);
    const h = p.home[i]!;
    if (h !== -1 && !buildingIds.has(h))
      problems.push(`worker ${p.id[i]} lives in missing building ${h}`);
  }
  return problems;
}
