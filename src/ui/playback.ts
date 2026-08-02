/**
 * ターンの解決を1ステップずつ見せるための「コマ」を作る。
 *
 * エンジンは1ターンぶんのイベントをまとめて返し、**最終状態しか持たない**。
 * 「交代 → 設置ダメージ → 攻撃 → 反射 → 瀕死」の連鎖を順に見せるには、
 * イベント列から途中の盤面を組み直す必要がある。
 *
 * **ここで作る盤面は表示専用。** 合法手の取得や行動の解決には使わない。
 * 再生が終わったらエンジンの権威ある状態に戻す (flow.ts)。
 *
 * 実測(3v3・Lv2同士・5,063ターン)で、HP・瀕死・毒・設置・場のユニット・修正値は
 * イベント列だけで完全に再現できることを確認済み。ただし**使用回数は再現できない**
 * (→ `applyEvent` の moveUsed のコメント)。
 */

import { getUnitDef } from '../engine/battle';
import { getMatchup, getTypeModifier, type Matchup } from '../engine/damage';
import { getMove } from '../data/units';
import type { BattleEvent, BattleState, Side, SlotIndex, UnitRef } from '../engine/types';
import { formatEvent, type LogEntry, type SideLabels } from './log';

/** 宣言された技。`damage` イベントだけでは誰の何が当たったのか分からない */
export interface InFlight {
  attacker: UnitRef;
  slotIndex: SlotIndex;
}

export interface Frame {
  /** このステップ時点の盤面。**表示専用** */
  battle: BattleState;
  /** 直前に適用したイベント。エフェクトの種類と対象はここから導く */
  event: BattleEvent;
  entry: LogEntry;
  /**
   * 公開済みユニットの party 添字 (SPEC §11)。
   * 解決時に一括更新すると、交代のコマが再生される前に相手の控えが見えてしまう。
   */
  revealed: Record<Side, number[]>;
  /**
   * このターンに宣言された技を陣営ごとに引く。相性補正を出すのに使う。
   *
   * **「直近の moveUsed」では取り違える。** 同じ段で両者が動くと
   * `moveUsed(p1) → moveUsed(p2) → damage(p2へ) → damage(p1へ)` の順に並ぶため、
   * p2 が受けたダメージの直前にあるのは p2 自身の技になってしまう。
   * 1ターンに1陣営1回しか技を使わない (SPEC §5.1) ので、陣営で引けば一意に定まる。
   */
  moves: Partial<Record<Side, InFlight>>;
}

function unitAt(state: BattleState, ref: UnitRef) {
  const unit = state.sides[ref.side].party[ref.partyIndex];
  if (!unit) throw new Error(`存在しないユニット: ${ref.side}[${String(ref.partyIndex)}]`);
  return unit;
}

/** 交代・瀕死で消えるもの (SPEC §4.3 / §7.3)。毒は残る (SPEC §7.1) */
function resetVolatile(unit: ReturnType<typeof unitAt>): void {
  unit.modifiers = { atk: 0, def: 0 };
  unit.turnModifiers = { atk: 0, def: 0 };
  unit.moveUseCounts = [0, 0];
}

/**
 * イベント1件ぶんだけ盤面を進める。
 * 引数は破壊せず、複製を返す。
 */
export function applyEvent(state: BattleState, event: BattleEvent): BattleState {
  const next = structuredClone(state);

  switch (event.type) {
    case 'damage': {
      const unit = unitAt(next, event.target);
      unit.hp = Math.max(0, unit.hp - event.amount);
      break;
    }

    case 'heal': {
      const unit = unitAt(next, event.target);
      // イベントの amount は実際に回復した量なので、最大HPは超えない
      unit.hp = Math.min(getUnitDef(unit).maxHp, unit.hp + event.amount);
      break;
    }

    case 'faint': {
      const unit = unitAt(next, event.target);
      unit.hp = 0;
      unit.fainted = true;
      resetVolatile(unit);
      break;
    }

    case 'switch': {
      next.sides[event.side].activeIndex = event.to.partyIndex;
      resetVolatile(unitAt(next, event.to));
      break;
    }

    case 'poisonApplied':
      // stacks は付与後の絶対値
      unitAt(next, event.target).poisonStacks = event.stacks;
      break;

    case 'hazardSet':
      next.sides[event.side].hazardStacks = event.stacks;
      break;

    case 'modifier': {
      const unit = unitAt(next, event.target);
      // value は実際に乗った差分 (上限で削られた後の値)
      if (event.duration === 'turn') unit.turnModifiers[event.axis] += event.value;
      else unit.modifiers[event.axis] += event.value;
      break;
    }

    /**
     * **使用回数は加算しない。**
     *
     * 対象が既に瀕死で不発になった技 (SPEC §5.5) も `moveUsed` を出すが、
     * エンジン側では使用回数が増えない。イベントからは両者を区別できないため、
     * ここで加算すると手のひらの「残り N/3」がズレる。
     * 再生が終わればエンジンの権威ある状態で正しい値に戻る。
     */
    case 'moveUsed':
    case 'healBlocked':
    case 'noEffect':
    case 'battleEnd':
      break;
  }

  return next;
}

/** 交代で場に出たユニットを公開済みに加える (SPEC §11) */
function withRevealed(
  revealed: Record<Side, number[]>,
  event: BattleEvent,
): Record<Side, number[]> {
  if (event.type !== 'switch') return revealed;
  const current = revealed[event.side];
  if (current.includes(event.to.partyIndex)) return revealed;
  return { ...revealed, [event.side]: [...current, event.to.partyIndex] };
}

/**
 * イベント列をコマ列に展開する。
 *
 * `before` はターン解決**前**の盤面。`events` を1件ずつ適用したものが各コマになる。
 * 状態を変えないイベント (noEffect など) もコマになる ─ ログの1行として見せたいため。
 */
export function buildFrames(
  before: BattleState,
  events: BattleEvent[],
  revealed: Record<Side, number[]>,
  labels: SideLabels,
): Frame[] {
  const frames: Frame[] = [];
  let battle = before;
  let seen = revealed;
  let moves: Partial<Record<Side, InFlight>> = {};

  for (const event of events) {
    // 技の宣言はダメージより先に出る。誰の技が当たったのかを陣営ごとに覚えておく
    if (event.type === 'moveUsed') {
      moves = { ...moves, [event.user.side]: { attacker: event.user, slotIndex: event.slotIndex } };
    }

    battle = applyEvent(battle, event);
    seen = withRevealed(seen, event);
    // ログの整形にはそのコマ時点の盤面を渡す。unitId は変わらないので名前は正しく引ける
    frames.push({
      battle,
      event,
      entry: formatEvent(event, battle, labels),
      revealed: seen,
      moves,
    });
  }

  return frames;
}

// --- エフェクト -------------------------------------------------------------

/** 画面に出す演出。コンポーネントはこれだけを見る */
export interface Effect {
  target: UnitRef;
  /**
   * 攻撃を仕掛けた側。**攻撃技によるダメージのときだけ**入る。
   * 反動・反射・毒・設置は null ─ 自傷や場の効果に「踏み込み」の絵は合わない。
   */
  attacker: UnitRef | null;
  kind: 'damage' | 'heal' | 'faint' | 'switch' | 'poison' | 'modifier';
  /** ダメージ量・回復量・修正値。演出だけのものは null */
  amount: number | null;
  /** ダメージの発生源。毒/設置/反動/反射を数値の脇に出す */
  note: string | null;
  /**
   * 相性補正 (SPEC §2)。**通常ダメージの攻撃技だけ**が持つ。
   * 固定ダメージ・毒・設置・反動・反射は相性の対象外 (SPEC §4.2 / §7.4)。
   */
  matchup: Matchup | null;
  /** 相性補正の値 (+25 / −10)。互角と対象外は null */
  typeModifier: number | null;
}

/** ダメージの発生源を数値の脇に出す。通常攻撃は注記なし */
const SOURCE_NOTES = {
  move: null,
  poison: '毒',
  hazard: '設置',
  recoil: '反動',
  reflect: '反射',
} as const;

/** 攻撃でも相性でもない演出の共通部分 */
const PASSIVE = { attacker: null, matchup: null, typeModifier: null } as const;

/**
 * そのダメージを与えた技を引く。**攻撃技によるダメージだけ**が対象。
 *
 * **攻撃者は「被弾側の相手が宣言した技」から引く。** 直近の moveUsed で引くと、
 * 同じ段で両者が動いたとき `moveUsed(p1) → moveUsed(p2) → damage → damage` の順に
 * 並ぶせいで取り違える。1ターンに1陣営1回しか技を使わない (SPEC §5.1) ので、
 * 陣営で引けば一意に定まる。
 *
 * 反動は自分が対象になるが、`source === 'move'` で先に弾いているのでここには来ない。
 */
function inFlightOf(frame: Frame): InFlight | null {
  const { event, moves } = frame;
  if (event.type !== 'damage' || event.source !== 'move') return null;
  return moves[event.target.side === 'p1' ? 'p2' : 'p1'] ?? null;
}

/**
 * そのダメージに相性補正が乗っていたか (SPEC §2)。乗っていなければ null。
 *
 * 乗るのは**攻撃技による通常ダメージだけ**。固定ダメージ (手のひら技1) と
 * 毒・設置・反動・反射は相性を無視する (SPEC §4.2)。
 * 判定に `source` と `damage.kind` の両方が要るのはそのため。
 */
function matchupOf(frame: Frame): { matchup: Matchup; typeModifier: number } | null {
  const { event, battle } = frame;
  const inFlight = inFlightOf(frame);
  if (event.type !== 'damage' || !inFlight) return null;

  const target = event.target;
  const attacker = battle.sides[inFlight.attacker.side].party[inFlight.attacker.partyIndex];
  const defender = battle.sides[target.side].party[target.partyIndex];
  if (!attacker || !defender) return null;

  const attackerDef = getUnitDef(attacker);
  if (getMove(attackerDef, inFlight.slotIndex).damage.kind !== 'normal') return null;

  const defenderDef = getUnitDef(defender);
  return {
    matchup: getMatchup(attackerDef.attribute, defenderDef.attribute),
    typeModifier: getTypeModifier(attackerDef.attribute, defenderDef.attribute),
  };
}

/** コマから演出を導く。演出のないイベントは null */
export function effectOf(frame: Frame): Effect | null {
  const { event } = frame;

  switch (event.type) {
    case 'damage': {
      const type = matchupOf(frame);
      return {
        target: event.target,
        // 固定ダメージ (手のひら技1) も攻撃なので踏み込む。相性の有無とは別
        attacker: inFlightOf(frame)?.attacker ?? null,
        kind: 'damage',
        amount: event.amount,
        note: SOURCE_NOTES[event.source],
        matchup: type?.matchup ?? null,
        // 互角は 0 なので出さない。見せたいのは「なぜ数値が動いたか」だけ
        typeModifier: type && type.matchup !== 'neutral' ? type.typeModifier : null,
      };
    }

    case 'heal':
      return { target: event.target, kind: 'heal', amount: event.amount, note: null, ...PASSIVE };

    case 'faint':
      return { target: event.target, kind: 'faint', amount: null, note: null, ...PASSIVE };

    case 'switch':
      return { target: event.to, kind: 'switch', amount: null, note: null, ...PASSIVE };

    case 'poisonApplied':
      return {
        target: event.target,
        kind: 'poison',
        amount: event.stacks,
        note: '毒',
        ...PASSIVE,
      };

    case 'modifier':
      return {
        target: event.target,
        kind: 'modifier',
        amount: event.value,
        note: event.axis === 'atk' ? '攻勢' : '守勢',
        ...PASSIVE,
      };

    default:
      return null;
  }
}
