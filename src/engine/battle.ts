/**
 * ターン解決の状態機械 (SPEC §5〜§8)。
 *
 * Phase 2 の範囲は「素の殴り合い」。効果 (EffectHooks) は載っていない。
 * 毒・設置は**消費側**のみ実装してある(付与するのはバラ = Phase 3)。
 *
 * 設計の要:
 * - 公開関数はすべて純粋。入口で複製し、内部で書き換えて返す
 * - 死に出しは交代先の選択が要るため、phase を返して呼び出し側に委ねる
 * - **段の間では対象の生死を見る (§5.5)、段の中では見ない (同時処理 §5.3)**
 */

import { HAZARD_DAMAGE, POISON_DAMAGE, SPEED_VALUE, TEAM_SIZE } from './constants';
import { computeDamage } from './damage';
import { getMove, getUsableSlotIndices, UNITS, type UnitId } from '../data/units';
import type {
  Action,
  BattleEvent,
  BattleResult,
  BattleState,
  DamageSource,
  ModifierAxis,
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
  return {
    party: team.map((id) => makeUnitState(id)),
    activeIndex: 0,
    hazardStacks: 0,
  };
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

/** 攻勢・守勢の合計。'交代まで' と 'このターン' を足す (SPEC §4.3) */
function totalModifier(unit: UnitState, axis: ModifierAxis): number {
  return unit.modifiers[axis] + unit.turnModifiers[axis];
}

/** その陣営に生存ユニットが残っているか */
function hasLivingUnit(state: BattleState, side: Side): boolean {
  return state.sides[side].party.some((u) => !u.fainted);
}

// --- 合法手 -----------------------------------------------------------------

/** 宣言できる行動 (SPEC §5.1)。AI (Phase 5) と UI (Phase 6) が使う */
export function getLegalActions(state: BattleState, side: Side): Action[] {
  const actions: Action[] = [];
  const sideState = state.sides[side];
  const active = getActiveUnit(state, side);

  // 特性枠のユニットは選択できる技が1つだけになる
  for (const slotIndex of getUsableSlotIndices(getUnitDef(active))) {
    actions.push({ kind: 'move', slotIndex });
  }

  // 控えに生存ユニットがいなければ交代は選べない (SPEC §6)
  sideState.party.forEach((unit, index) => {
    if (index !== sideState.activeIndex && !unit.fainted) {
      actions.push({ kind: 'switch', toPartyIndex: index });
    }
  });

  return actions;
}

function assertLegal(state: BattleState, side: Side, action: Action): void {
  const legal = getLegalActions(state, side).some((candidate) => {
    if (candidate.kind === 'move' && action.kind === 'move') {
      return candidate.slotIndex === action.slotIndex;
    }
    if (candidate.kind === 'switch' && action.kind === 'switch') {
      return candidate.toPartyIndex === action.toPartyIndex;
    }
    return false;
  });
  if (!legal) throw new Error(`${side} の行動が不正です: ${JSON.stringify(action)}`);
}

// --- 共有ルーチン -----------------------------------------------------------

/**
 * HPを減らし、0になったら瀕死処理を行う (SPEC §5.4)。
 *
 * `amount` は実際に減ったHP量としてイベントに載せる(過剰ダメージは切り詰める)。
 * 既に瀕死のユニットには何も起こらない。
 */
function applyDamage(
  state: BattleState,
  ref: UnitRef,
  amount: number,
  source: DamageSource,
  events: BattleEvent[],
): void {
  const unit = unitAt(state, ref);
  if (unit.fainted) return;

  const dealt = Math.min(amount, unit.hp);
  unit.hp -= dealt;
  events.push({ type: 'damage', target: ref, amount: dealt, source });

  if (unit.hp <= 0) faint(state, ref, events);
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

  // 自陣の設置を踏む (SPEC §6 / §7.2)
  if (sideState.hazardStacks > 0) {
    applyDamage(state, to, HAZARD_DAMAGE * sideState.hazardStacks, 'hazard', events);
  }
}

/** 勝敗判定 (SPEC §8)。決着していなければ null */
function checkResult(state: BattleState): BattleResult | null {
  const p1Alive = hasLivingUnit(state, 'p1');
  const p2Alive = hasLivingUnit(state, 'p2');
  if (!p1Alive && !p2Alive) return 'draw'; // 最後の1体同士の相打ち
  if (!p1Alive) return 'p2';
  if (!p2Alive) return 'p1';
  return null;
}

/** 決着・死に出し待ち・行動待ちのいずれかに遷移させる */
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
 *
 *   0: 交代
 *   1: 先制技 (速度に関係なく同段)
 *   2〜4: 通常技 (速 → 中 → 遅)
 */
function bandOf(state: BattleState, side: Side, action: Action): number {
  if (action.kind === 'switch') return 0;

  const def = getUnitDef(getActiveUnit(state, side));
  if (getMove(def, action.slotIndex).priority === 'first') return 1;

  // 速3 → 2、中2 → 3、遅1 → 4
  return 2 + (3 - SPEED_VALUE[def.speed]);
}

// --- ターン解決 -------------------------------------------------------------

export function resolveTurn(state: BattleState, actions: Record<Side, Action>): TurnResult {
  if (state.phase.kind !== 'awaitingActions') {
    throw new Error(`行動を宣言できる状態ではありません: ${state.phase.kind}`);
  }

  const next = structuredClone(state);
  const events: BattleEvent[] = [];

  for (const side of SIDES) assertLegal(next, side, actions[side]);

  // 段を先に決める。決めた後で場のユニットが変わっても段は動かない
  const plans = SIDES.map((side) => ({
    side,
    action: actions[side],
    band: bandOf(next, side, actions[side]),
  }));

  for (const band of [...new Set(plans.map((p) => p.band))].sort((a, b) => a - b)) {
    resolveBand(
      next,
      plans.filter((p) => p.band === band),
      events,
    );
  }

  endOfTurn(next, events);
  next.turn += 1;
  finalizePhase(next, events);

  return { state: next, events };
}

interface Plan {
  side: Side;
  action: Action;
  band: number;
}

/** 同じ段に入った行動を「同時に」解決する (SPEC §5.3) */
function resolveBand(state: BattleState, plans: Plan[], events: BattleEvent[]): void {
  // 段0 は交代のみ。相手の攻撃より先に場のユニットが入れ替わる (SPEC §6)
  const switches = plans.filter((p) => p.action.kind === 'switch');
  for (const plan of switches) {
    if (plan.action.kind !== 'switch') continue;
    if (getActiveUnit(state, plan.side).fainted) continue;
    switchIn(state, plan.side, plan.action.toPartyIndex, 'manual', events);
  }

  const moves = plans.filter((p) => p.action.kind === 'move');
  if (moves.length === 0) return;

  // ステップ1: ダメージを確定させる。この時点ではHPを動かさない
  const pending: PendingHit[] = [];
  for (const plan of moves) {
    if (plan.action.kind !== 'move') continue;
    const hit = planHit(state, plan.side, plan.action.slotIndex, events);
    if (hit) pending.push(hit);
  }

  // ステップ2: 確定した数値を同時に適用する。相手へのダメージが先、反動が後 (SPEC §10.1)
  for (const hit of pending) {
    applyDamage(state, hit.target, hit.amount, 'move', events);
  }
  for (const hit of pending) {
    if (hit.recoil > 0) applyDamage(state, hit.attacker, hit.recoil, 'recoil', events);
  }

  // ステップ3: 強制交代処理 (団扇の強制交代・魔球の自己交代)。Phase 3 で実装する
}

interface PendingHit {
  attacker: UnitRef;
  target: UnitRef;
  amount: number;
  recoil: number;
}

/**
 * ステップ1。技1回分のダメージと反動を確定させる。
 * 行動できない・不発の場合は null を返す。
 */
function planHit(
  state: BattleState,
  side: Side,
  slotIndex: SlotIndex,
  events: BattleEvent[],
): PendingHit | null {
  const attackerRef = activeRef(state, side);
  const attacker = unitAt(state, attackerRef);

  // 先の段で自分が倒されていれば、そもそも行動しない (SPEC §5.5)
  if (attacker.fainted) return null;

  events.push({ type: 'moveUsed', user: attackerRef, slotIndex });

  const defenderSide = opponentOf(side);
  const targetRef = activeRef(state, defenderSide);
  const target = unitAt(state, targetRef);

  // 先の段で対象が瀕死になっていれば不発。**反動も発生しない** (SPEC §5.5 / §10.5)
  if (target.fainted) {
    events.push({ type: 'noEffect', reason: '対象が既に瀕死のため不発' });
    return null;
  }

  const attackerDef = getUnitDef(attacker);
  const move = getMove(attackerDef, slotIndex);

  const amount = computeDamage({
    damage: move.damage,
    attacker: { attribute: attackerDef.attribute, atkMod: totalModifier(attacker, 'atk') },
    defender: { attribute: getUnitDef(target).attribute, defMod: totalModifier(target, 'def') },
  });

  return { attacker: attackerRef, target: targetRef, amount, recoil: move.recoil ?? 0 };
}

/**
 * ターン終了処理 (SPEC §5.6)。
 * **毒が回復より先。** 逆にすると耐久ユニットの生存率が大きく変わる。
 */
function endOfTurn(state: BattleState, events: BattleEvent[]): void {
  // 1. 毒 → 瀕死判定。場に出ているユニットのみが受ける (SPEC §7.1)
  for (const side of SIDES) {
    const unit = getActiveUnit(state, side);
    if (unit.fainted || unit.poisonStacks === 0) continue;
    applyDamage(state, activeRef(state, side), POISON_DAMAGE * unit.poisonStacks, 'poison', events);
  }

  // 2. 回復 → 瀕死判定。堅牢の特性など。Phase 3 で実装する
  //    毒より後であることが仕様上の要点 (SPEC §5.6)

  // 'このターン' の修正値を落とす (SPEC §4.3)
  for (const side of SIDES) {
    for (const unit of state.sides[side].party) {
      unit.turnModifiers = { atk: 0, def: 0 };
    }
  }
}

// --- 死に出し ---------------------------------------------------------------

/**
 * 瀕死ユニットの交代 (SPEC §5.7)。
 *
 * - ターンを消費しない
 * - 死に出しでも設置を踏む
 * - 設置で即瀕死になった場合は再び awaitingReplacement を返す(連鎖)
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

  for (const side of state.phase.sides) {
    const choice = choices[side];
    if (choice === undefined) throw new Error(`${side} の交代先が指定されていません`);

    const candidate = next.sides[side].party[choice];
    if (!candidate || candidate.fainted) {
      throw new Error(`${side} の交代先が不正です: ${String(choice)}`);
    }
    switchIn(next, side, choice, 'faint', events);
  }

  finalizePhase(next, events);
  return { state: next, events };
}
