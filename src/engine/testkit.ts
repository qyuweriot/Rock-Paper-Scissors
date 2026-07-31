/**
 * テスト用のヘルパ。Phase 3 の15種の効果テストでも使い回す。
 *
 * `*.test.ts` ではないのでテスト対象としては実行されない。
 * 本番コードからは import しないこと。
 */

import { createBattle, getLegalActions, resolveReplacements, resolveTurn } from './battle';
import type { UnitId } from '../data/units';
import type { Action, BattleEvent, BattleResult, BattleState, Side, SlotIndex } from './types';

export function makeBattle(p1: UnitId[], p2: UnitId[], seed = 0): BattleState {
  return createBattle(p1, p2, seed);
}

export const move = (slotIndex: SlotIndex): Action => ({ kind: 'move', slotIndex });
export const switchTo = (toPartyIndex: number): Action => ({ kind: 'switch', toPartyIndex });

/**
 * 何もしない相手。単体の効果を切り離して観察したいときに使う。
 *
 * 器は技2で控えを回復するが、**控えがいなければ空振りする** (SPEC §10.13)。
 * 1体だけで選出すればダメージも状態異常も一切発生しない。
 * バラは「ダメージなし」だが毒と設置を撒くので、この用途には使えない。
 *
 * **控えがいる場合は回復対象の選択が必須**になるため `inert()` は使えない。
 * その場合は満タンの控えを指定した行動を自分で組み立てること。
 */
export const INERT: UnitId = 'utsuwa';
export const inert = (): Action => ({ kind: 'move', slotIndex: 1 });

/** 状態を直接仕込む。resolveTurn に渡す前の state に対して使う */
export function setHp(state: BattleState, side: Side, partyIndex: number, hp: number): void {
  unit(state, side, partyIndex).hp = hp;
}

export function setPoison(
  state: BattleState,
  side: Side,
  partyIndex: number,
  stacks: number,
): void {
  unit(state, side, partyIndex).poisonStacks = stacks;
}

/** その陣営の場に設置を置く。踏むのはこの陣営のユニット (SPEC §7.2) */
export function setHazard(state: BattleState, side: Side, stacks: number): void {
  state.sides[side].hazardStacks = stacks;
}

/**
 * 修正値を直接仕込む (SPEC §4.3)。
 *
 * 現在のデータで守勢を上げられるのは はさみ の技2(自分にのみ)だけなので、
 * 「相手の守勢が高い」状況は通常の手順では作れない。
 * ダメージ下限0 の境界を試すために使う。
 */
export function setModifier(
  state: BattleState,
  side: Side,
  partyIndex: number,
  axis: 'atk' | 'def',
  value: number,
): void {
  unit(state, side, partyIndex).modifiers[axis] = value;
}

export function unit(state: BattleState, side: Side, partyIndex: number) {
  const found = state.sides[side].party[partyIndex];
  if (!found) throw new Error(`存在しないユニット: ${side}[${String(partyIndex)}]`);
  return found;
}

export function active(state: BattleState, side: Side) {
  return unit(state, side, state.sides[side].activeIndex);
}

// --- イベントの絞り込み -----------------------------------------------------

export function eventsOfType<T extends BattleEvent['type']>(
  events: BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

/** イベント種別の並びだけを取り出す。処理順の検証に使う */
export function eventTypes(events: BattleEvent[]): BattleEvent['type'][] {
  return events.map((e) => e.type);
}

// --- 試合の自動進行 ---------------------------------------------------------

export interface RunResult {
  result: BattleResult;
  /** 解決したターン数。死に出しは消費しない (SPEC §5.7) */
  turns: number;
  events: BattleEvent[];
  state: BattleState;
}

/** 既定の方針: 常に最初の技を使う */
export function firstMove(state: BattleState, side: Side): Action {
  const legal = getLegalActions(state, side).filter((a) => a.kind === 'move');
  const choice = legal[0];
  if (!choice) throw new Error(`${side} に選択できる技がありません`);
  return choice;
}

function firstLiving(state: BattleState, side: Side): number {
  const index = state.sides[side].party.findIndex((u) => !u.fainted);
  if (index < 0) throw new Error(`${side} に生存ユニットがいません`);
  return index;
}

/**
 * 決着まで自動で進める。死に出しは常に控えの先頭を選ぶ。
 * `maxTurns` を超えたら例外を投げるので、無限ループはテストで検出できる。
 */
export function runBattle(
  initial: BattleState,
  chooseAction: (state: BattleState, side: Side) => Action = firstMove,
  maxTurns = 200,
): RunResult {
  let state = initial;
  const events: BattleEvent[] = [];
  let turns = 0;

  while (state.phase.kind !== 'ended') {
    if (state.phase.kind === 'awaitingReplacement') {
      const choices: Partial<Record<Side, number>> = {};
      for (const side of state.phase.sides) choices[side] = firstLiving(state, side);
      const step = resolveReplacements(state, choices);
      state = step.state;
      events.push(...step.events);
      continue;
    }

    if (turns >= maxTurns) {
      throw new Error(`${String(maxTurns)} ターンで決着しませんでした`);
    }

    const step = resolveTurn(state, {
      p1: chooseAction(state, 'p1'),
      p2: chooseAction(state, 'p2'),
    });
    state = step.state;
    events.push(...step.events);
    turns += 1;
  }

  return { result: state.phase.result, turns, events, state };
}
