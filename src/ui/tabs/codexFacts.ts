import { BUILDINGS, RECIPES, SKILLS, type BuildingTypeId } from '../../data/buildings';
import { SKILL_NAME, SKILL_NAMES } from '../../data/copy';
import { GOODS, type GoodId } from '../../data/goods';
import { formatMoney, formatNumber } from '../format';

export interface Fact {
  label: string;
  value: string;
}

const BUILDABLE: BuildingTypeId[] = (Object.keys(BUILDINGS) as BuildingTypeId[]).filter(
  (id) => id !== 'depot' && id !== 'contractSite',
);
const names = (ids: BuildingTypeId[]): string[] => ids.map((id) => BUILDINGS[id].name);
const tonnes = (t: number): string => `${formatNumber(t, 0)} t`;

function goodFacts(g: GoodId): Fact[] {
  const makers = BUILDABLE.filter(
    (id) =>
      (BUILDINGS[id].depositGoods as readonly GoodId[]).includes(g) ||
      BUILDINGS[id].recipes.some((r) => RECIPES[r]?.outputs[g]),
  );
  const users = names(
    BUILDABLE.filter((id) => BUILDINGS[id].recipes.some((r) => RECIPES[r]?.inputs[g])),
  );
  if (BUILDABLE.some((id) => BUILDINGS[id].cost.materials[g])) users.push('Construction');
  if (GOODS[g].necessity) users.push('Residents');
  return [
    { label: 'Base price', value: `${formatMoney(GOODS[g].basePriceCents)}/t` },
    { label: 'Made by', value: names(makers).join(', ') || 'Bought on the market' },
    { label: 'Used by', value: users.join(', ') || 'Sold on the market' },
  ];
}

function buildingFacts(id: BuildingTypeId): Fact[] {
  const b = BUILDINGS[id];
  const materials = (Object.keys(b.cost.materials) as GoodId[]).map(
    (g) => `${tonnes(b.cost.materials[g] ?? 0)} ${GOODS[g].name}`,
  );
  const jobs = SKILLS.flatMap((s) => {
    const n = b.jobs[s];
    return n ? [`${n} ${(n === 1 ? SKILL_NAME[s] : SKILL_NAMES[s]).toLowerCase()}`] : [];
  });
  const facts: Fact[] = [
    { label: 'Cost', value: [formatMoney(b.cost.cents), ...materials].join(', ') },
  ];
  if (jobs.length) facts.push({ label: 'Jobs per shift', value: jobs.join(', ') });
  facts.push({ label: 'Power', value: `${b.powerKw > 0 ? '+' : '−'}${Math.abs(b.powerKw)} kW` });
  if (b.depositGoods.length) {
    facts.push({ label: 'Extracts', value: b.depositGoods.map((g) => GOODS[g].name).join(', ') });
  }
  if (b.recipes.length) {
    facts.push({ label: 'Recipes', value: b.recipes.map((r) => RECIPES[r]?.name).join(', ') });
  }
  if (b.housing) facts.push({ label: 'Houses', value: `${b.housing.capacity} people` });
  if (b.storageT) facts.push({ label: 'Storage', value: tonnes(b.storageT) });
  return facts;
}

/** The data table under a Codex entry: prices and trade for goods; cost, crew and work for buildings. */
export function codexFacts(entryId: string): Fact[] {
  const [kind, id] = entryId.split('.');
  if (kind === 'good' && id && id in GOODS) return goodFacts(id as GoodId);
  if (kind === 'building' && id && BUILDABLE.includes(id as BuildingTypeId)) {
    return buildingFacts(id as BuildingTypeId);
  }
  return [];
}
