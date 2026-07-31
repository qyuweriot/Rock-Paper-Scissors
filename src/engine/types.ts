/**
 * エンジンの語彙。React・DOM・ブラウザAPIに依存しない (PLAN §3.1)。
 * 仕様の参照先は docs/SPEC.md。
 */

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
  /** 枠ごとの使用回数。魔球の減衰とハサミムシの増強に使う。交代でリセット (SPEC §7.3) */
  moveUseCounts: [number, number];
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
  /** 決着していなければ null。相打ちは 'draw' (SPEC §8) */
  result: BattleResult | null;
}

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
 *
 * Phase 1 では**フック名の骨組みのみ**を定義している。引数の正確な形は
 * battle.ts の解決文脈 (Phase 2) が定まらないと決められないため、
 * シグネチャの確定と実装は Phase 3 で行う。
 *
 * ゴール: 新ユニットの追加が、エンジン本体を触らずデータ追加だけで済む状態 (PLAN §84)。
 */
export interface EffectHooks {
  /** 魔球の減衰、ハサミムシの増強、鉄拳の追い討ち判定 */
  onModifyPower?: unknown;
  /** 攻勢修正 */
  onModifyDamageDealt?: unknown;
  /** 守勢修正 */
  onModifyDamageTaken?: unknown;
  /** 山嵐の反射。攻撃ダメージ限定 (SPEC §10.7) */
  onAfterDamageTaken?: unknown;
  /** ハサミムシの回復無効 (SPEC §10.6) */
  onHeal?: unknown;
  /** 粉砕の全回復 (SPEC §10.1) */
  onKill?: unknown;
  /** ゴーストの瀕死時反射 (SPEC §10.12) */
  onFaint?: unknown;
  /** 設置の踏み判定、修正値・累積カウントのリセット (PLAN §347) */
  onSwitchIn?: unknown;
  /** 毒、堅牢の回復 (SPEC §5.6) */
  onTurnEnd?: unknown;
  /** 使用回数カウント (SPEC §7.3) */
  onMoveUsed?: unknown;
}
