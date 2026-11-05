import type { SaveFile } from './types';

export const SAVE_VERSION = 3;

export type Migrations = Record<number, (s: Record<string, unknown>) => Record<string, unknown>>;

/** MIGRATIONS[n] turns a version-n state into a version-(n+1) state. */
export const MIGRATIONS: Migrations = {
  // 1 → 2: bus trips get their own id counter, started above every id the save holds.
  1: (s) => ({ ...s, nextTripId: s.nextId }),
  // 2 → 3: the one company becomes companies[0]; owners, cash, orders and contracts name it.
  2: (s) => {
    const { company, reputation, wageLevel, payrollShortfall, ...rest } = s as V2State;
    const sections = rest.sections.map((x) => ({ ...x, owner: 0 }));
    const companies = company
      ? [
          {
            id: 0,
            name: company.name,
            kind: 'player',
            archetype: null,
            companionId: company.companionId,
            status: 'active',
            foundedTick: 0,
            charterSectionId: sections[0]?.id ?? 0,
            reputation: { group: reputation, luna: reputation },
            wageLevel,
            payrollShortfall,
          },
        ]
      : [];
    const { player, ...balances } = rest.ledger.balances;
    if (player !== undefined) balances['co:0'] = player;
    return {
      ...rest,
      companies,
      sections,
      ledger: { ...rest.ledger, balances },
      orders: rest.orders.map((o) => ({ ...o, companyId: 0 })),
      contracts: rest.contracts.map((c) => ({
        ...c,
        holder: c.status === 'offered' ? null : 0,
        tenderTo: c.status === 'offered' && c.type === 'infrastructure' ? 0 : null,
      })),
    };
  },
};

/** The fields migration 2 → 3 reads. */
interface V2State {
  company: { name: string; companionId: string } | null;
  reputation: number;
  wageLevel: unknown;
  payrollShortfall: boolean;
  sections: ({ id: number } & Record<string, unknown>)[];
  ledger: { balances: Record<string, number> };
  orders: Record<string, unknown>[];
  contracts: (Record<string, unknown> & { status: string; type: string })[];
  [key: string]: unknown;
}

export function migrate(file: SaveFile, registry = MIGRATIONS, target = SAVE_VERSION): SaveFile {
  let version = file.version;
  let state = file.state as Record<string, unknown>;
  while (version < target) {
    const fn = registry[version];
    if (!fn) throw new Error(`no migration from save version ${version}`);
    state = fn(state);
    version++;
  }
  return { ...file, version, state };
}
