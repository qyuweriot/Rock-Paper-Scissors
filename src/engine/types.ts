/**
 * エンジンの語彙。React・DOM・ブラウザAPIに依存しない (PLAN §3.1)。
 * 仕様の参照先は docs/SPEC.md。
 */

// 型のみの相互参照。実行時の import は生じないので循環にはならない
import type { EffectHooks } from './effects/context';

// --- 基本 -------------------------------------------------------------------

/** 属性。グー > チョキ > パー > グー (SPEC §2) */
export type Attribute = 'gu' | 'choki' | 'pa';

/** 速度。内部値は constants.ts の SPEED_VALUE (速3 / 中2 / 遅1) */
export type Speed = 'fast' | 'mid' | 'slow';

export type Side = 'p1' | 'p2';

/** 技枠の添字。枠は必ず2つ (SPEC §3) */
export type SlotIndex = 0 | 1;

/** 場にいるとは限らないユニットの指し先。partyIndex は選出3体内の位置 */
export interface UnitRef {
  side: Side;
  partyIndex: number;
}

// --- ダメージ ---------------------------------------------------------------

/**
 * ダメージの種別。「相性補正と修正値が乗るか」を型で分岐させる。
 * fixed に修正値を掛けてしまう実装ミス (SPEC §4.2) を防ぐのが狙い。
 */
export type DamageSpec =
  /** ダメージを与えない技。バラ両技・手のひら技2・一閃技2・器技2・団扇技2 */
  | { kind: 'none' }
  /** 通常ダメージ。相性補正・攻勢修正・守勢修正が乗る (SPEC §4.1) */
  | { kind: 'normal'; power: number }
  /** 固定ダメージ。相性補正・修正値をすべて無視する (SPEC §4.2) */
  | { kind: 'fixed'; amount: number };

/** ダメージの発生源。反射の発動条件が 'move' 限定であるため区別が要る (SPEC §7.4) */
export type DamageSource = 'move' | 'poison' | 'hazard' | 'recoil' | 'reflect';

/** 修正値の軸。SPEC §4.3 は攻勢・守勢の2軸と定める */
export type ModifierAxis = 'atk' | 'def';

/** 修正値の持続 (SPEC §4.3)。turn = このターン、untilSwitch = 交代または瀕死まで */
export type ModifierDuration = 'turn' | 'untilSwitch';

// --- 技と特性 ---------------------------------------------------------------

/** 技の使用時に選択を要する対象 (SPEC §10.13 / §10.3) */
export type SelectionKind =
  /** 控えの生存ユニット1体を選ぶ。器 技2 */
  | 'benchAlly'
  /** 自分の交代先を選ぶ。魔球 技2 */
  | 'switchTarget';

export interface MoveDef {
  name: string;
  /** UI に常時表示する効果テキスト。暗記を強いないため (PLAN §296) */
  text: string;
  damage: DamageSpec;
  /** first = 先制技。両者が先制なら速度に関係なく同時 (SPEC §5.2) */
  priority: 'first' | 'normal';
  /** 自分が受ける固定の反動。粉砕50 / 石15 / ゴースト5 (SPEC §10.5) */
  recoil?: number;
  /**
   * 1試合あたりの使用回数上限 (SPEC §10.11)。使い切ると合法手から外れる。
   * §7.3 の累積カウントと違い、**交代でリセットされない**。
   */
  maxUses?: number;
  selection?: SelectionKind;
  /** 特殊挙動。実装は Phase 3 */
  hooks?: EffectHooks;
}

/** 特性。場に出ている間のみ発動し、控えでは機能しない (SPEC §3) */
export interface AbilityDef {
  name: string;
  text: string;
  /** 特性の本体。実装は Phase 3 */
  hooks?: EffectHooks;
}

export type Slot = { kind: 'move'; move: MoveDef } | { kind: 'ability'; ability: AbilityDef };

export interface UnitDef {
  /** data/units.ts のキーと一致させる。UnitId 型はそこから導出される */
  id: string;
  name: string;
  attribute: Attribute;
  maxHp: number;
  speed: Speed;
  /** 技枠は必ず2つ。「技2つ」または「技1つ + 特性1つ」(SPEC §3) */
  slots: readonly [Slot, Slot];
}

// --- 状態 -------------------------------------------------------------------

export interface Modifiers {
  atk: number;
  def: number;
}

export interface UnitState {
  unitId: string;
  hp: number;
  fainted: boolean;
  /** 毒はユニット単位で保持され、交代しても維持される (SPEC §7.1) */
  poisonStacks: number;
  /** 持続 'untilSwitch' の修正値。一閃の積み。交代・瀕死でリセット (SPEC §4.3) */
  modifiers: Modifiers;
  /** 持続 'turn' の修正値。はさみ技2。ターン解決の終わりに消える (SPEC §4.3) */
  turnModifiers: Modifiers;
  /** 枠ごとの使用回数。魔球の減衰とカマキリの増強に使う。交代でリセット (SPEC §7.3) */
  moveUseCounts: [number, number];
  /**
   * 試合を通じた枠ごとの使用回数。MoveDef.maxUses の判定に使う。
   * **交代でも瀕死でもリセットされない** (SPEC §10.11)。
   */
  totalMoveUses: [number, number];
}

export interface SideState {
  /** 選出された3体 (SPEC §1) */
  party: UnitState[];
  activeIndex: number;
  /**
   * この陣営の場に置かれている設置の枚数。
   * 「相手側の場に設置」(SPEC §7.2) されたものなので、値を増やすのは相手のバラ。
   * 保持する側 = 踏む側。この向きを取り違えやすいので注意。
   */
  hazardStacks: number;
}

export interface BattleState {
  sides: Record<Side, SideState>;
  turn: number;
  /** 乱数は団扇の交代先抽選のみ。engine/rng.ts を経由する (PLAN §3.4) */
  rngSeed: number;
  phase: BattlePhase;
}

/**
 * 試合の進行段階。
 *
 * 死に出しは交代先をプレイヤーが選ぶ (SPEC §5.7) ため、ターン解決を
 * 途中で止めて呼び出し側に選択を求める必要がある。それを型で表したもの。
 * 設置ダメージで死に出したユニットが即瀕死になる連鎖も、
 * awaitingReplacement を再び返すことで表現される。
 */
export type BattlePhase =
  /** 両プレイヤーの行動宣言待ち (SPEC §5.1) */
  | { kind: 'awaitingActions' }
  /** 死に出しの交代先待ち。sides に選択が必要な陣営が入る */
  | { kind: 'awaitingReplacement'; sides: Side[] }
  | { kind: 'ended'; result: BattleResult };

/** 相打ちによる引き分けがありうる (SPEC §8) */
export type BattleResult = 'p1' | 'p2' | 'draw';

// --- 行動 -------------------------------------------------------------------

export type Action =
  | { kind: 'move'; slotIndex: SlotIndex; selection?: UnitRef }
  | { kind: 'switch'; toPartyIndex: number };

/** 交代の理由。追い討ちは 'manual' でのみ発動する (SPEC §10.2) */
export type SwitchReason = 'manual' | 'forced' | 'selfSwitch' | 'faint';

// --- イベント (PLAN §3.5) ---------------------------------------------------

/**
 * エンジンは状態ではなく構造化されたイベント列を返す。
 * UIのアニメーション・テストの検証・デバッグがすべてこれを見る。
 */
export type BattleEvent =
  | { type: 'moveUsed'; user: UnitRef; slotIndex: SlotIndex }
  | { type: 'damage'; target: UnitRef; amount: number; source: DamageSource }
  | { type: 'heal'; target: UnitRef; amount: number }
  | { type: 'healBlocked'; target: UnitRef }
  | { type: 'faint'; target: UnitRef }
  | {
      type: 'switch';
      side: Side;
      from: UnitRef | null;
      to: UnitRef;
      reason: SwitchReason;
    }
  | { type: 'poisonApplied'; target: UnitRef; stacks: number }
  | { type: 'hazardSet'; side: Side; stacks: number }
  | {
      type: 'modifier';
      target: UnitRef;
      axis: ModifierAxis;
      value: number;
      duration: ModifierDuration;
    }
  | { type: 'noEffect'; reason: string }
  | { type: 'battleEnd'; result: BattleResult };

// --- 効果フック (PLAN §3.2) -------------------------------------------------

/**
 * 効果を if 文の羅列で書くと15種でも破綻するため、ユニットをフックの集合として表現する。
 * 実体は effects/context.ts にある(型のみの再輸出なので実行時の循環は生じない)。
 *
 * PLAN §3.2 の10個から7個に整理してある。攻勢・守勢修正は SPEC §4.3 が数値状態として
 * 定めており `UnitState.modifiers` と `computeDamage` で実現済みのためフックにしない。
 * 設置踏みとリセットは battle.ts の switchIn に集約済み。使用回数カウントは全技共通。
 */
export type { EffectHooks } from './effects/context';
