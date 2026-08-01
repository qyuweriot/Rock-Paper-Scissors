/**
 * ターン解決の状態機械 (SPEC §5〜§8)。
 *
 * 設計の要:
 * - 公開関数はすべて純粋。入口で複製し、内部で書き換えて返す
 * - 死に出しは交代先の選択が要るため、phase を返して呼び出し側に委ねる
 * - **段の間では対象の生死を見る (§5.5)、段の中では見ない (同時処理 §5.3)**
 * - **HPの増減をすべて済ませてから、まとめて瀕死処理する**(理由は resolveBand を参照)
 * - 効果は EffectHooks 経由でのみ状態に触る。エンジン本体はユニットを知らない (PLAN §84)
 */

import {
  HAZARD_DAMAGE,
  HAZARD_MAX_STACKS,
  PERSISTENT_MODIFIER_CAP,
  POISON_DAMAGE,
  POISON_MAX_STACKS,
  SPEED_VALUE,
  TEAM_SIZE,
} from './constants';
import { computeDamage } from './damage';
import { pick } from './rng';
import { getMove, getUsableSlotIndices, UNITS, type UnitId } from '../data/units';
import type { EffectApi, EffectHooks } from './effects/context';
import type {
  Action,
  BattleEvent,
  BattleResult,
  BattleState,
  DamageSource,
  ModifierAxis,
  ModifierDuration,
  MoveDef,
  Side,
  SideState,
  SlotIndex,
  SwitchReason,
  UnitDef,
  UnitRef,
  UnitState,
} from './types';

const SIDES: readonly Side[] = ['p1', 'p2'];

export interface TurnResult {
  state: BattleState;
  events: BattleEvent[];
}

// --- 生成 -------------------------------------------------------------------

/**
 * 試合を開始する。
 *
 * 本戦の選出は3体 (SPEC §1) だが、テストを書きやすくするため 1〜3 体を許容する。
 * UI・シミュレータからは常に3体を渡すこと。
 */
export function createBattle(p1Team: UnitId[], p2Team: UnitId[], seed = 0): BattleState {
  return {
    sides: { p1: makeSide(p1Team), p2: makeSide(p2Team) },
    turn: 1,
    rngSeed: seed,
    phase: { kind: 'awaitingActions' },
  };
}

function makeSide(team: UnitId[]): SideState {
  if (team.length < 1 || team.length > TEAM_SIZE) {
    throw new Error(
      `選出は1〜${String(TEAM_SIZE)}体である必要があります (指定: ${String(team.length)})`,
    );
  }
  return { party: team.map((id) => makeUnitState(id)), activeIndex: 0, hazardStacks: 0 };
}

function makeUnitState(id: UnitId): UnitState {
  return {
    unitId: id,
    hp: UNITS[id].maxHp,
    fainted: false,
    poisonStacks: 0,
    modifiers: { atk: 0, def: 0 },
    turnModifiers: { atk: 0, def: 0 },
    moveUseCounts: [0, 0],
    totalMoveUses: [0, 0],
  };
}

// --- 参照 -------------------------------------------------------------------

export function getActiveUnit(state: BattleState, side: Side): UnitState {
  return unitAt(state, activeRef(state, side));
}

export function getUnitDef(unit: UnitState): UnitDef {
  const def = UNITS[unit.unitId as UnitId] as UnitDef | undefined;
  if (!def) throw new Error(`未知のユニットID: ${unit.unitId}`);
  return def;
}

function unitAt(state: BattleState, ref: UnitRef): UnitState {
  const unit = state.sides[ref.side].party[ref.partyIndex];
  if (!unit) throw new Error(`存在しないユニット: ${ref.side}[${String(ref.partyIndex)}]`);
  return unit;
}

function activeRef(state: BattleState, side: Side): UnitRef {
  return { side, partyIndex: state.sides[side].activeIndex };
}

function opponentOf(side: Side): Side {
  return side === 'p1' ? 'p2' : 'p1';
}

/** 修正値の合計 (SPEC §4.3)。UI のダメージ表示も同じ式を通す */
export function totalModifier(unit: UnitState, axis: ModifierAxis): number {
  return unit.modifiers[axis] + unit.turnModifiers[axis];
}

function hasLivingUnit(state: BattleState, side: Side): boolean {
  return state.sides[side].party.some((u) => !u.fainted);
}

/** 控えにいる生存ユニットの party 添字 */
function livingBench(state: BattleState, side: Side): number[] {
  const sideState = state.sides[side];
  const result: number[] = [];
  sideState.party.forEach((unit, index) => {
    if (index !== sideState.activeIndex && !unit.fainted) result.push(index);
  });
  return result;
}

/**
 * 場にいるユニットの特性フック。
 * **特性は場に出ている間のみ発動する (SPEC §3)** ため、呼ぶ側は場のユニットを渡すこと。
 */
function abilityHooks(state: BattleState, ref: UnitRef): EffectHooks | undefined {
  for (const slot of getUnitDef(unitAt(state, ref)).slots) {
    if (slot.kind === 'ability') return slot.ability.hooks;
  }
  return undefined;
}

// --- 合法手 -----------------------------------------------------------------

/** 宣言できる行動 (SPEC §5.1)。AI (Phase 5) と UI (Phase 6) が使う */
export function getLegalActions(state: BattleState, side: Side): Action[] {
  const actions: Action[] = [];
  const sideState = state.sides[side];
  const active = getActiveUnit(state, side);
  const def = getUnitDef(active);

  for (const slotIndex of getUsableSlotIndices(def)) {
    const move = getMove(def, slotIndex);

    // 使用回数を使い切った技は選べない (SPEC §10.11)。
    // 全技が枯れると行動不能になるため、上限は必ず一部の枠にだけ設けること
    if (move.maxUses !== undefined && active.totalMoveUses[slotIndex] >= move.maxUses) continue;

    const bench = move.selection ? livingBench(state, side) : [];

    if (move.selection && bench.length > 0) {
      // 器の回復対象・魔球の交代先は選択肢ごとに別の行動として並べる
      for (const partyIndex of bench) {
        actions.push({ kind: 'move', slotIndex, selection: { side, partyIndex } });
      }
    } else {
      // 控えが全滅していても技自体は使用できる (SPEC §10.13 / §10.3)
      actions.push({ kind: 'move', slotIndex });
    }
  }

  sideState.party.forEach((unit, index) => {
    if (index !== sideState.activeIndex && !unit.fainted) {
      actions.push({ kind: 'switch', toPartyIndex: index });
    }
  });

  return actions;
}

function sameAction(a: Action, b: Action): boolean {
  if (a.kind === 'move' && b.kind === 'move') {
    return a.slotIndex === b.slotIndex && a.selection?.partyIndex === b.selection?.partyIndex;
  }
  if (a.kind === 'switch' && b.kind === 'switch') return a.toPartyIndex === b.toPartyIndex;
  return false;
}

function assertLegal(state: BattleState, side: Side, action: Action): void {
  if (!getLegalActions(state, side).some((candidate) => sameAction(candidate, action))) {
    throw new Error(`${side} の行動が不正です: ${JSON.stringify(action)}`);
  }
}

// --- 効果の予約キュー -------------------------------------------------------

/**
 * 効果が要求した変更の置き場。
 * SPEC §5.3 が「数値を確定させてから同時に適用する」としているため、
 * 効果は直接 HP を触らず、ここに積んで battle.ts が定めた時点で流し込む。
 */
interface BandQueue {
  heals: { target: UnitRef; amount: number }[];
  damages: { target: UnitRef; amount: number; source: DamageSource }[];
  statuses: ({ kind: 'poison'; target: UnitRef } | { kind: 'hazard'; side: Side })[];
  switches: { side: Side; reason: 'forced' | 'selfSwitch'; to: number | undefined }[];
}

function emptyQueue(): BandQueue {
  return { heals: [], damages: [], statuses: [], switches: [] };
}

function makeApi(state: BattleState, queue: BandQueue, events: BattleEvent[]): EffectApi {
  return {
    damage: (target, amount, source) => queue.damages.push({ target, amount, source }),
    heal: (target, amount) => queue.heals.push({ target, amount }),
    applyPoison: (target) => queue.statuses.push({ kind: 'poison', target }),
    addHazard: (side) => queue.statuses.push({ kind: 'hazard', side }),
    requestSwitch: (side, reason, to) => queue.switches.push({ side, reason, to }),
    addModifier: (target, axis, value, duration) =>
      addModifier(state, target, axis, value, duration, events),
    noEffect: (reason) => events.push({ type: 'noEffect', reason }),
    unit: (ref) => unitAt(state, ref),
    def: (ref) => getUnitDef(unitAt(state, ref)),
    activeRef: (side) => activeRef(state, side),
    opponentOf,
    livingBench: (side) => livingBench(state, side),
  };
}

// --- 状態の変更 -------------------------------------------------------------

/**
 * 修正値の付与 (SPEC §4.3)。
 * 'untilSwitch' には累積上限 +20 があり、超えた分は無効(ターンは消費される)。
 */
function addModifier(
  state: BattleState,
  target: UnitRef,
  axis: ModifierAxis,
  value: number,
  duration: ModifierDuration,
  events: BattleEvent[],
): void {
  const unit = unitAt(state, target);

  if (duration === 'turn') {
    unit.turnModifiers[axis] += value;
    events.push({ type: 'modifier', target, axis, value, duration });
    return;
  }

  const current = unit.modifiers[axis];
  const capped = Math.min(
    PERSISTENT_MODIFIER_CAP,
    Math.max(-PERSISTENT_MODIFIER_CAP, current + value),
  );
  if (capped === current) {
    events.push({ type: 'noEffect', reason: '修正値が累積上限に達している' });
    return;
  }
  unit.modifiers[axis] = capped;
  events.push({ type: 'modifier', target, axis, value: capped - current, duration });
}

/** HPを減らす。**瀕死処理はしない**(processFaints が後でまとめて行う) */
function dealDamage(
  state: BattleState,
  ref: UnitRef,
  amount: number,
  source: DamageSource,
  events: BattleEvent[],
): void {
  const unit = unitAt(state, ref);
  if (unit.fainted) return;
  const dealt = Math.min(Math.max(amount, 0), unit.hp);
  unit.hp -= dealt;
  events.push({ type: 'damage', target: ref, amount: dealt, source });
}

/**
 * HPを回復する。相手の場のユニットが無効化しうる (カマキリ SPEC §10.6)。
 * HPが満タンなら何も起こらないが、ターンは消費される (SPEC §10.11)。
 */
function applyHeal(
  state: BattleState,
  target: UnitRef,
  amount: number,
  api: EffectApi,
  events: BattleEvent[],
): void {
  const unit = unitAt(state, target);
  if (unit.fainted) return;

  const blockerRef = activeRef(state, opponentOf(target.side));
  const blocker = unitAt(state, blockerRef);
  const onModifyHeal = abilityHooks(state, blockerRef)?.onModifyHeal;
  const final =
    !blocker.fainted && onModifyHeal
      ? onModifyHeal({ api, self: blockerRef, target, amount })
      : amount;

  if (final <= 0) {
    events.push({ type: 'healBlocked', target });
    return;
  }

  const healed = Math.min(final, getUnitDef(unit).maxHp - unit.hp);
  if (healed <= 0) {
    events.push({ type: 'noEffect', reason: 'HPが満タンのため回復しない' });
    return;
  }
  unit.hp += healed;
  events.push({ type: 'heal', target, amount: healed });
}

function faint(state: BattleState, ref: UnitRef, events: BattleEvent[]): void {
  const unit = unitAt(state, ref);
  if (unit.fainted) return;
  unit.hp = 0;
  unit.fainted = true;
  resetVolatile(unit); // 瀕死で修正値・累積カウントがリセットされる (SPEC §4.3)
  events.push({ type: 'faint', target: ref });
}

/**
 * 交代・瀕死で消えるものを消す (SPEC §6 / §7.3)。
 * **毒はユニット単位で保持され、交代しても維持される (SPEC §7.1)** ので触らない。
 */
function resetVolatile(unit: UnitState): void {
  unit.modifiers = { atk: 0, def: 0 };
  unit.turnModifiers = { atk: 0, def: 0 };
  unit.moveUseCounts = [0, 0];
}

/**
 * 場にユニットを出す。通常交代・強制交代・死に出しのすべてがここを通る。
 * 設置踏みをこの1箇所に集約することで、SPEC §7.2「すべてで発動」が構造的に保証される。
 */
function switchIn(
  state: BattleState,
  side: Side,
  toPartyIndex: number,
  reason: SwitchReason,
  events: BattleEvent[],
): void {
  const sideState = state.sides[side];
  const from: UnitRef = { side, partyIndex: sideState.activeIndex };
  const to: UnitRef = { side, partyIndex: toPartyIndex };

  sideState.activeIndex = toPartyIndex;
  resetVolatile(unitAt(state, to));
  events.push({ type: 'switch', side, from, to, reason });

  if (sideState.hazardStacks > 0) {
    dealDamage(state, to, HAZARD_DAMAGE * sideState.hazardStacks, 'hazard', events);
  }
}

// --- キューの流し込み -------------------------------------------------------

function flushHeals(
  state: BattleState,
  queue: BandQueue,
  api: EffectApi,
  events: BattleEvent[],
): void {
  const pending = queue.heals.splice(0);
  for (const entry of pending) applyHeal(state, entry.target, entry.amount, api, events);
}

/** 何か適用したら true。瀕死処理のループ継続判定に使う */
function flushDamages(state: BattleState, queue: BandQueue, events: BattleEvent[]): boolean {
  const pending = queue.damages.splice(0);
  for (const entry of pending) dealDamage(state, entry.target, entry.amount, entry.source, events);
  return pending.length > 0;
}

function flushStatuses(state: BattleState, queue: BandQueue, events: BattleEvent[]): void {
  for (const entry of queue.statuses.splice(0)) {
    if (entry.kind === 'poison') {
      const unit = unitAt(state, entry.target);
      if (unit.poisonStacks >= POISON_MAX_STACKS) {
        events.push({
          type: 'noEffect',
          reason: `毒は既に${String(POISON_MAX_STACKS)}重で、これ以上重ならない`,
        });
        continue;
      }
      unit.poisonStacks += 1;
      events.push({ type: 'poisonApplied', target: entry.target, stacks: unit.poisonStacks });
    } else {
      const sideState = state.sides[entry.side];
      if (sideState.hazardStacks >= HAZARD_MAX_STACKS) {
        events.push({
          type: 'noEffect',
          reason: `設置は既に${String(HAZARD_MAX_STACKS)}枚で、これ以上置けない`,
        });
        continue;
      }
      sideState.hazardStacks += 1;
      events.push({ type: 'hazardSet', side: entry.side, stacks: sideState.hazardStacks });
    }
  }
}

/**
 * HPが0以下のユニットをまとめて瀕死にする。
 * 瀕死時フック(ゴーストの反射)が新たなダメージを生むため、収束するまで繰り返す。
 */
function processFaints(
  state: BattleState,
  queue: BandQueue,
  api: EffectApi,
  events: BattleEvent[],
): void {
  for (;;) {
    let progressed = false;

    for (const side of SIDES) {
      const sideState = state.sides[side];
      for (let index = 0; index < sideState.party.length; index++) {
        const ref: UnitRef = { side, partyIndex: index };
        const unit = unitAt(state, ref);
        if (unit.fainted || unit.hp > 0) continue;

        const wasActive = sideState.activeIndex === index;
        faint(state, ref, events);
        // 特性は場に出ている間のみ発動する (SPEC §3)
        if (wasActive) abilityHooks(state, ref)?.onFaint?.({ api, self: ref });
        progressed = true;
      }
    }

    // ゴーストの反射で新たに倒れる可能性がある
    if (flushDamages(state, queue, events)) progressed = true;
    if (!progressed) return;
  }
}

/**
 * ステップ3。強制交代と自己交代 (SPEC §5.3)。
 *
 * 現行データでは魔球=中・団扇=遅で段が分かれるため同段にはならないが、
 * 同段になった場合は**強制交代を先**に解決する。
 */
function resolveQueuedSwitches(state: BattleState, queue: BandQueue, events: BattleEvent[]): void {
  const ordered = queue.switches
    .splice(0)
    .sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'forced' ? -1 : 1));

  for (const request of ordered) {
    // 既に倒れていれば死に出しの領分
    if (getActiveUnit(state, request.side).fainted) continue;

    const bench = livingBench(state, request.side);
    if (bench.length === 0) {
      events.push({ type: 'noEffect', reason: '控えに生存ユニットがいないため交代しない' });
      continue;
    }

    let to = request.to;
    if (to === undefined || !bench.includes(to)) {
      // 団扇の交代先はランダム。本ゲームで乱数を使う唯一の箇所 (SPEC §10.14)
      const rolled = pick(state.rngSeed, bench);
      state.rngSeed = rolled.seed;
      to = rolled.value;
    }
    switchIn(state, request.side, to, request.reason, events);
  }
}

// --- 勝敗 -------------------------------------------------------------------

function checkResult(state: BattleState): BattleResult | null {
  const p1Alive = hasLivingUnit(state, 'p1');
  const p2Alive = hasLivingUnit(state, 'p2');
  if (!p1Alive && !p2Alive) return 'draw'; // 最後の1体同士の相打ち
  if (!p1Alive) return 'p2';
  if (!p2Alive) return 'p1';
  return null;
}

function finalizePhase(state: BattleState, events: BattleEvent[]): void {
  const result = checkResult(state);
  if (result !== null) {
    state.phase = { kind: 'ended', result };
    events.push({ type: 'battleEnd', result });
    return;
  }

  const needsReplacement = SIDES.filter((side) => getActiveUnit(state, side).fainted);
  state.phase =
    needsReplacement.length > 0
      ? { kind: 'awaitingReplacement', sides: needsReplacement }
      : { kind: 'awaitingActions' };
}

// --- 優先度 -----------------------------------------------------------------

/**
 * 行動の段 (SPEC §5.2)。同じ段に入った行動は同時に処理される。
 *   0: 交代 / 1: 先制技(速度に関係なく同段) / 2〜4: 通常技(速 → 中 → 遅)
 */
function bandOf(state: BattleState, side: Side, action: Action): number {
  if (action.kind === 'switch') return 0;
  const def = getUnitDef(getActiveUnit(state, side));
  if (getMove(def, action.slotIndex).priority === 'first') return 1;
  return 2 + (3 - SPEED_VALUE[def.speed]);
}

// --- ターン解決 -------------------------------------------------------------

interface Plan {
  side: Side;
  action: Action;
  band: number;
}

export function resolveTurn(state: BattleState, actions: Record<Side, Action>): TurnResult {
  if (state.phase.kind !== 'awaitingActions') {
    throw new Error(`行動を宣言できる状態ではありません: ${state.phase.kind}`);
  }

  const next = structuredClone(state);
  const events: BattleEvent[] = [];

  for (const side of SIDES) assertLegal(next, side, actions[side]);

  // 鉄拳の追い討ちは「相手がそのターンに交代を宣言していたか」を見る (SPEC §10.2)。
  // 強制交代・自己交代・死に出しは宣言ではないので、ここには現れない
  const declaredSwitch: Record<Side, boolean> = {
    p1: actions.p1.kind === 'switch',
    p2: actions.p2.kind === 'switch',
  };

  const plans: Plan[] = SIDES.map((side) => ({
    side,
    action: actions[side],
    band: bandOf(next, side, actions[side]),
  }));

  for (const band of [...new Set(plans.map((p) => p.band))].sort((a, b) => a - b)) {
    resolveBand(
      next,
      plans.filter((p) => p.band === band),
      declaredSwitch,
      events,
    );
  }

  endOfTurn(next, events);
  next.turn += 1;
  finalizePhase(next, events);

  return { state: next, events };
}

interface PendingHit {
  attacker: UnitRef;
  target: UnitRef;
  slotIndex: SlotIndex;
  move: MoveDef;
  /** ダメージを与えない技は null。攻撃技ではないので反射も誘発しない */
  amount: number | null;
  recoil: number;
}

/**
 * 同じ段に入った行動を「同時に」解決する (SPEC §5.3)。
 *
 * **瀕死処理を後ろにずらしてある。** SPEC §5.4 は「HPの変化があるたびに瀕死判定」と
 * するが、§10.1 は粉砕について
 *   相手にダメージ → 相手の瀕死判定 → 倒していれば反動を無効化 → 自分の瀕死判定
 * という順序を明示している。撃破の成否が反動より先に決まっていないと成り立たないため、
 * より具体的な §10.1 を優先し、HPの増減をすべて済ませてから瀕死処理する。
 */
function resolveBand(
  state: BattleState,
  plans: Plan[],
  declaredSwitch: Record<Side, boolean>,
  events: BattleEvent[],
): void {
  // 段0 は交代のみ。相手の攻撃より先に場のユニットが入れ替わる (SPEC §6)
  for (const plan of plans) {
    if (plan.action.kind !== 'switch') continue;
    if (getActiveUnit(state, plan.side).fainted) continue;
    switchIn(state, plan.side, plan.action.toPartyIndex, 'manual', events);
  }

  const moves = plans.filter((p) => p.action.kind === 'move');
  if (moves.length === 0) return;

  const queue = emptyQueue();
  const api = makeApi(state, queue, events);

  // === ステップ1: 数値確定と修正値の付与 ===

  // 1a. 不発判定 (SPEC §5.5)
  const declared: { plan: Plan; attacker: UnitRef; target: UnitRef; slotIndex: SlotIndex }[] = [];
  for (const plan of moves) {
    if (plan.action.kind !== 'move') continue;
    const attacker = activeRef(state, plan.side);
    if (unitAt(state, attacker).fainted) continue; // 先の段で倒された

    events.push({ type: 'moveUsed', user: attacker, slotIndex: plan.action.slotIndex });

    const target = activeRef(state, opponentOf(plan.side));
    if (unitAt(state, target).fainted) {
      // 反動も発生しない (SPEC §10.5)
      events.push({ type: 'noEffect', reason: '対象が既に瀕死のため不発' });
      continue;
    }
    declared.push({ plan, attacker, target, slotIndex: plan.action.slotIndex });
  }

  // 1b〜1d. 技の副作用。修正値は即時反映され、同じ段のダメージ計算に間に合う。
  //         SPEC §5.3 の「守勢 → 回復 → 攻勢 の順に数値を確定させる」に対応する
  for (const entry of declared) {
    const move = getMove(getUnitDef(unitAt(state, entry.attacker)), entry.slotIndex);
    move.hooks?.onUse?.({
      api,
      self: entry.attacker,
      target: entry.target,
      slotIndex: entry.slotIndex,
      selection: entry.plan.action.kind === 'move' ? entry.plan.action.selection : undefined,
    });
  }

  // 1e〜1f. 威力補正 → ダメージと反動を確定
  const hits: PendingHit[] = [];
  for (const entry of declared) {
    const attacker = unitAt(state, entry.attacker);
    const attackerDef = getUnitDef(attacker);
    const move = getMove(attackerDef, entry.slotIndex);

    let spec = move.damage;
    if (spec.kind === 'normal' && move.hooks?.onModifyPower) {
      spec = {
        kind: 'normal',
        power: move.hooks.onModifyPower({
          api,
          self: entry.attacker,
          target: entry.target,
          slotIndex: entry.slotIndex,
          power: spec.power,
          useCount: attacker.moveUseCounts[entry.slotIndex],
          targetDeclaredSwitch: declaredSwitch[opponentOf(entry.plan.side)],
        }),
      };
    }

    // 使用回数の加算。威力を確定させた後に行う (SPEC §7.3)。
    // totalMoveUses は maxUses の判定用で、交代でも瀕死でもリセットされない (SPEC §10.11)
    attacker.moveUseCounts[entry.slotIndex] += 1;
    attacker.totalMoveUses[entry.slotIndex] += 1;

    const target = unitAt(state, entry.target);
    const amount =
      spec.kind === 'none'
        ? null
        : computeDamage({
            damage: spec,
            attacker: { attribute: attackerDef.attribute, atkMod: totalModifier(attacker, 'atk') },
            defender: {
              attribute: getUnitDef(target).attribute,
              defMod: totalModifier(target, 'def'),
            },
          });

    hits.push({
      attacker: entry.attacker,
      target: entry.target,
      slotIndex: entry.slotIndex,
      move,
      amount,
      recoil: move.recoil ?? 0,
    });
  }

  // 1g. 反射の確定。攻撃技を受けた事実がトリガーなので、ダメージ0でも発動する (SPEC §10.7)
  for (const hit of hits) {
    if (hit.amount === null) continue;
    abilityHooks(state, hit.target)?.onAfterDamageTaken?.({
      api,
      self: hit.target,
      attacker: hit.attacker,
      amount: hit.amount,
      source: 'move',
    });
  }

  // === ステップ2: 同時適用 ===

  flushHeals(state, queue, api, events);
  for (const hit of hits) {
    if (hit.amount !== null) dealDamage(state, hit.target, hit.amount, 'move', events);
  }

  /**
   * 「自分の攻撃で倒したか」を、反動と反射が入る前に確定させる。
   *
   * 特性の条件は「**相手を倒した場合**」(SPEC §10.1)。相手が自分の反動で自滅したり、
   * 反射で落ちたりした場合は撃破に含めない。ここで判定せず後段の HP だけを見ると、
   * 粉砕ミラーで互いに「相手が(自分の反動で)倒れた」と誤認する。
   */
  const killedByAttack = hits.map(
    (hit) => hit.amount !== null && unitAt(state, hit.target).hp <= 0,
  );

  // 反動。撃破の成否が決まった後に適用するので、粉砕は無効化に間に合う (SPEC §10.1)
  hits.forEach((hit, index) => {
    if (hit.amount === null) return;
    const onModifyRecoil = abilityHooks(state, hit.attacker)?.onModifyRecoil;
    const recoil = onModifyRecoil
      ? onModifyRecoil({
          api,
          self: hit.attacker,
          victim: hit.target,
          recoil: hit.recoil,
          killed: killedByAttack[index] ?? false,
        })
      : hit.recoil;
    if (recoil > 0) dealDamage(state, hit.attacker, recoil, 'recoil', events);
  });

  flushDamages(state, queue, events); // 山嵐の反射

  processFaints(state, queue, api, events);
  flushStatuses(state, queue, events);

  // === ステップ3: 強制交代・自己交代 ===
  resolveQueuedSwitches(state, queue, events);
}

/**
 * ターン終了処理 (SPEC §5.6)。
 * **毒が回復より先。** 毒で瀕死になったユニットは回復されない。
 */
function endOfTurn(state: BattleState, events: BattleEvent[]): void {
  const queue = emptyQueue();
  const api = makeApi(state, queue, events);

  // 1. 毒 → 瀕死判定。場に出ているユニットのみが受ける (SPEC §7.1)
  for (const side of SIDES) {
    const unit = getActiveUnit(state, side);
    if (unit.fainted || unit.poisonStacks === 0) continue;
    dealDamage(state, activeRef(state, side), POISON_DAMAGE * unit.poisonStacks, 'poison', events);
  }
  processFaints(state, queue, api, events);

  // 2. 回復 → 瀕死判定。堅牢の特性など (SPEC §10.4)
  for (const side of SIDES) {
    const ref = activeRef(state, side);
    if (unitAt(state, ref).fainted) continue;
    abilityHooks(state, ref)?.onTurnEnd?.({ api, self: ref });
  }
  flushHeals(state, queue, api, events);
  processFaints(state, queue, api, events);

  // 'このターン' の修正値を落とす (SPEC §4.3)
  for (const side of SIDES) {
    for (const unit of state.sides[side].party) unit.turnModifiers = { atk: 0, def: 0 };
  }
}

// --- 死に出し ---------------------------------------------------------------

/**
 * 瀕死ユニットの交代 (SPEC §5.7)。
 * ターンを消費せず、設置を踏み、設置で即瀕死になった場合は連鎖する。
 */
export function resolveReplacements(
  state: BattleState,
  choices: Partial<Record<Side, number>>,
): TurnResult {
  if (state.phase.kind !== 'awaitingReplacement') {
    throw new Error(`死に出しの状態ではありません: ${state.phase.kind}`);
  }

  const next = structuredClone(state);
  const events: BattleEvent[] = [];
  const queue = emptyQueue();
  const api = makeApi(next, queue, events);

  for (const side of state.phase.sides) {
    const choice = choices[side];
    if (choice === undefined) throw new Error(`${side} の交代先が指定されていません`);

    const candidate = next.sides[side].party[choice];
    if (!candidate || candidate.fainted) {
      throw new Error(`${side} の交代先が不正です: ${String(choice)}`);
    }
    switchIn(next, side, choice, 'faint', events);
  }

  // 設置ダメージで即瀕死になることがある。ゴーストならそこで反射も起きる
  processFaints(next, queue, api, events);
  finalizePhase(next, events);
  return { state: next, events };
}
