import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { ui } from '../../client/store';
import { SKILLS } from '../../data/buildings';
import { ERROR_COPY, SKILL_NAMES } from '../../data/copy';
import { GOOD_IDS, GOODS } from '../../data/goods';
import type { Contract, Stage } from '../../sim/contracts/contracts';
import { maxActive } from '../../sim/contracts/rewards';
import type { Command } from '../../sim/commands';
import type { UiSnapshot } from '../../sim/views';
import { ErrorText, useCommand } from '../components/command';
import { formatGameDuration, formatMass, formatMoney, formatRealFromGame } from '../format';

type Run = (cmd: Command) => Promise<boolean>;

const TYPE_NAME: Record<Contract['type'], string> = {
  oreDelivery: 'Ore delivery',
  infrastructure: 'Infrastructure',
};
const ASSET_NAME = {
  landingPad: 'a landing pad',
  commMast: 'a comm mast',
  roadDepot: 'a road depot',
  publicSolar: 'a public solar array',
} as const;
const STATUS_NAME = { completed: 'Completed', failed: 'Failed', abandoned: 'Abandoned' } as const;
const SHIFT_NAMES = ['06:00', '14:00', '22:00'] as const;

/** 'Deliver 42.0 t Polar volatiles', '96 engineer-hours of building', ... */
function stageText(stage: Stage): string {
  switch (stage.kind) {
    case 'deliver': {
      const goods = GOOD_IDS.filter((g) => stage.needKg[g]);
      return `Deliver ${goods.map((g) => `${formatMass(stage.needKg[g]!)} ${GOODS[g].name}`).join(' and ')}`;
    }
    case 'build':
      return `${stage.engineerHours} engineer-hours of building`;
    case 'staff':
      return `${stage.technicians} technicians on site for ${formatGameDuration(stage.hours * 60)}`;
  }
}

/** How far a stage has come, 0..1. */
function stageShare(stage: Stage): number {
  switch (stage.kind) {
    case 'deliver': {
      let need = 0;
      let done = 0;
      for (const g of GOOD_IDS) {
        need += stage.needKg[g] ?? 0;
        done += Math.min(stage.doneKg[g] ?? 0, stage.needKg[g] ?? 0);
      }
      return need ? done / need : 1;
    }
    case 'build':
      return Math.min(1, stage.done / stage.engineerHours);
    case 'staff':
      return Math.min(1, stage.done / stage.hours);
  }
}

/** Game time and its real-time equivalent: '2 d 9 h (≈ 57 min)'. */
const span = (minutes: number) => `${formatGameDuration(minutes)} (${formatRealFromGame(minutes)})`;

function Card(props: { c: Contract; children?: ComponentChildren; status?: string }) {
  const { c } = props;
  return (
    <article class="contract">
      <header>
        <span class={`stamp ${c.type}`}>{TYPE_NAME[c.type]}</span>
        {props.status && <span class="stamp status">{props.status}</span>}
        <span class="issuer">{c.issuer}</span>
      </header>
      <p class="job">{c.stages.map(stageText).join(', then ')}</p>
      {c.asset && <p>For {ASSET_NAME[c.asset]} on a public plot.</p>}
      {props.children}
    </article>
  );
}

function Reward({ c }: { c: Contract }) {
  return (
    <p>
      Pays <span class="num">{formatMoney(c.rewardCents)}</span> and {c.repGain} reputation; failing
      costs {c.repLoss}.
    </p>
  );
}

function Offer(props: { c: Contract; snap: UiSnapshot; full: boolean; run: Run }) {
  const { c, snap } = props;
  return (
    <Card c={c}>
      <Reward c={c} />
      <p>
        Due {span(c.hours * 60)} after you accept. The offer ends in{' '}
        {formatGameDuration(c.deadlineTick - snap.tick)}.
      </p>
      <button
        type="button"
        class="action small"
        disabled={props.full}
        onClick={() => void props.run({ t: 'acceptContract', contractId: c.id })}
      >
        Accept
      </button>
      {props.full && <p class="meta">{ERROR_COPY.CONTRACT_LIMIT}</p>}
    </Card>
  );
}

function Crew({ site }: { site: UiSnapshot['sites'][number] | undefined }) {
  if (!site) return <p>The site is getting ready.</p>;
  const short = Object.values(site.crew).some((c) => c.shifts.some((n) => n < c.slots));
  return (
    <>
      <ul class="shifts">
        {SKILLS.flatMap((skill) => {
          const crew = site.crew[skill];
          if (!crew) return [];
          const name = SKILL_NAMES[skill].toLowerCase();
          return [
            ...crew.shifts.map((n, s) => (
              <li key={`${skill}-${s}`}>
                {SHIFT_NAMES[s]} shift:{' '}
                <span class="num">
                  {n} of {crew.slots}
                </span>{' '}
                {name}
              </li>
            )),
            <li key={`${skill}-now`}>
              At work now: <span class="num">{crew.present}</span> {name}
            </li>,
          ];
        })}
      </ul>
      {short && (
        <p class="meta">
          Short of crew? In the People tab, pick a worker and choose Contract site {site.buildingId}
          .
        </p>
      )}
    </>
  );
}

function Abandon({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" class="action small quiet" onClick={() => setAsking(true)}>
        Abandon
      </button>
    );
  }
  return (
    <div class="confirm" role="group" aria-label="Abandon">
      <p>Abandon this contract? You lose 4 reputation and keep nothing you delivered.</p>
      <button type="button" class="action small danger" onClick={onConfirm}>
        Abandon
      </button>{' '}
      <button type="button" class="action small quiet" onClick={() => setAsking(false)}>
        Keep it
      </button>
    </div>
  );
}

function Active(props: { c: Contract; snap: UiSnapshot; run: Run }) {
  const { c, snap, run } = props;
  const [depot, setDepot] = useState(snap.sections[0]?.id ?? 0);
  const stage = c.stages[c.stageIndex];
  const share = stage ? stageShare(stage) : 1;
  const pct = Math.round(((c.stageIndex + share) / c.stages.length) * 100);
  const held = snap.sections.find((s) => s.id === depot)?.stockKg ?? {};
  return (
    <Card c={c}>
      <p>Due in {span(Math.max(0, c.deadlineTick - snap.tick))}.</p>
      <Reward c={c} />
      <p class="meta">
        Step {Math.min(c.stageIndex + 1, c.stages.length)} of {c.stages.length}
        {stage ? `: ${stageText(stage)}` : ': done, paying out'}
      </p>
      <div
        class="bar"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      {stage?.kind === 'deliver' && (
        <div class="deliver">
          <p class="meta">
            Still needed:{' '}
            {GOOD_IDS.filter((g) => (stage.needKg[g] ?? 0) > (stage.doneKg[g] ?? 0))
              .map(
                (g) =>
                  `${formatMass((stage.needKg[g] ?? 0) - (stage.doneKg[g] ?? 0))} ${GOODS[g].name} (depot holds ${formatMass(held[g] ?? 0)})`,
              )
              .join(', ')}
            .
          </p>
          <label class="field">
            Depot
            <select value={depot} onChange={(e) => setDepot(Number(e.currentTarget.value))}>
              {snap.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.id}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            class="action small"
            onClick={() => void run({ t: 'deliverContract', contractId: c.id, sectionId: depot })}
          >
            Deliver
          </button>
        </div>
      )}
      {(stage?.kind === 'build' || stage?.kind === 'staff') && (
        <Crew site={snap.sites.find((s) => s.contractId === c.id)} />
      )}
      <Abandon onConfirm={() => void run({ t: 'abandonContract', contractId: c.id })} />
    </Card>
  );
}

/** Work for the Lunar Authority and the colonies: offers, contracts under way, and the record. */
export function ContractsTab() {
  const { error, run } = useCommand();
  const snap = ui.value;
  if (!snap?.company) return <p>{ERROR_COPY.NOT_FOUNDED}</p>;
  const active = snap.contracts.filter((c) => c.status === 'active');
  const offers = snap.contracts.filter((c) => c.status === 'offered');
  const finished = snap.contracts.filter(
    (c): c is Contract & { status: keyof typeof STATUS_NAME } => c.status in STATUS_NAME,
  );
  const full = active.length >= maxActive(snap.reputation);
  return (
    <div class="contracts-tab">
      <section aria-labelledby="contracts-active">
        <h3 id="contracts-active">Active contracts</h3>
        {active.length === 0 && <p>None yet. Accept an offer below.</p>}
        {active.map((c) => (
          <Active key={c.id} c={c} snap={snap} run={run} />
        ))}
      </section>
      <section aria-labelledby="contracts-offers">
        <h3 id="contracts-offers">Offers</h3>
        {offers.length === 0 && <p>No offers right now. New ones come in every few hours.</p>}
        {offers.map((c) => (
          <Offer key={c.id} c={c} snap={snap} full={full} run={run} />
        ))}
      </section>
      <section aria-labelledby="contracts-finished">
        <h3 id="contracts-finished">Finished contracts</h3>
        {finished.length === 0 && <p>Nothing finished yet.</p>}
        {finished
          .slice(-10)
          .reverse()
          .map((c) => (
            <Card key={c.id} c={c} status={STATUS_NAME[c.status]} />
          ))}
      </section>
      <ErrorText error={error} />
    </div>
  );
}
