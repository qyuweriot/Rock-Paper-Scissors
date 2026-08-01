/**
 * 効果が受け取る文脈。
 *
 * 効果の実装は `battle.ts` を import しない。すると
 * `battle.ts → data/units.ts → effects/*.ts → battle.ts` の循環になるため。
 * 代わりに `EffectApi` を受け取り、状態の書き換えはすべてそこに委ねる。
 *
 * **`api` の変更系メソッドは即座に反映されるとは限らない。** ダメージ・回復・毒・設置・交代は
 * いったん予約され、`battle.ts` が SPEC §5.3 の定める時点でまとめて適用する。
 * 修正値の付与だけは、同じ段のダメージ計算に間に合わせる必要があるため即時反映される。
 */

import type {
  DamageSource,
  ModifierAxis,
  ModifierDuration,
  Side,
  SlotIndex,
  UnitDef,
  UnitRef,
  UnitState,
} from '../types';

export interface EffectApi {
  // --- 変更系(予約される) ---

  damage(target: UnitRef, amount: number, source: DamageSource): void;
  heal(target: UnitRef, amount: number): void;
  /** 毒を1スタック付与。POISON_MAX_STACKS が上限で、超過分は無効 (SPEC §7.1) */
  applyPoison(target: UnitRef): void;
  /** 指定した陣営の場に設置を1枚追加。HAZARD_MAX_STACKS が上限 (SPEC §7.2) */
  addHazard(side: Side): void;
  /** 交代を予約。`to` を省略すると解決時にランダムで選ばれる(団扇) */
  requestSwitch(side: Side, reason: 'forced' | 'selfSwitch', to?: number): void;

  // --- 変更系(即時) ---

  /** 修正値を付与。上限 (+20) の判定は API 側で行う (SPEC §4.3) */
  addModifier(target: UnitRef, axis: ModifierAxis, value: number, duration: ModifierDuration): void;

  /** 技は成立したが何も起こらなかった。ターンは消費される */
  noEffect(reason: string): void;

  // --- 参照系 ---

  unit(ref: UnitRef): Readonly<UnitState>;
  def(ref: UnitRef): UnitDef;
  activeRef(side: Side): UnitRef;
  opponentOf(side: Side): Side;
  /** 控えにいる生存ユニットの party 添字 */
  livingBench(side: Side): number[];
}

export interface HookContext {
  api: EffectApi;
  /** この効果を持つユニット */
  self: UnitRef;
}

export interface PowerContext extends HookContext {
  target: UnitRef;
  slotIndex: SlotIndex;
  /** データ上の威力 */
  power: number;
  /** この技枠のこれまでの使用回数。今回の使用は含まない (SPEC §7.3) */
  useCount: number;
  /** 相手がこのターン「交代」を宣言していたか。鉄拳の追い討ち専用 (SPEC §10.2) */
  targetDeclaredSwitch: boolean;
}

export interface UseContext extends HookContext {
  /** 相手の場のユニット */
  target: UnitRef;
  slotIndex: SlotIndex;
  /** 器の回復対象・魔球の交代先 (SPEC §10.13 / §10.3) */
  selection: UnitRef | undefined;
}

export interface DamageTakenContext extends HookContext {
  attacker: UnitRef;
  amount: number;
  source: DamageSource;
}

export interface HealContext extends HookContext {
  /** 回復を受けるユニット。self の相手側にいる */
  target: UnitRef;
  amount: number;
}

export interface RecoilContext extends HookContext {
  /** 攻撃した相手 */
  victim: UnitRef;
  /** データ上の反動量 */
  recoil: number;
  /**
   * **自分の攻撃で**倒したか (SPEC §10.1)。
   * 相手が自分の反動で自滅した場合や、反射で落ちた場合は false。
   */
  killed: boolean;
}

/**
 * ユニットをフックの集合として表現する (PLAN §3.2)。
 * 新ユニットの追加が、エンジン本体を触らずデータ追加だけで済む状態を保つこと (PLAN §84)。
 */
export interface EffectHooks {
  /** 威力を書き換える。魔球の減衰 / カマキリの増強 / 鉄拳の追い討ち */
  onModifyPower?: (ctx: PowerContext) => number;
  /**
   * 使用回数だけで決まる現在の威力。**表示専用**で、解決には一切使わない。
   *
   * 累積で威力が変わる技 (魔球・カマキリ) は、データ上の初期値を出しても意味がない。
   * UI がユニットごとの分岐を持たずに現在値を引けるよう、規則をここに宣言する。
   *
   * **`onModifyPower` と同じ関数を渡すこと。** 規則を二重に書くとズレる
   * (両者が一致することは units.test.ts で固定してある)。
   * 相手の宣言に依存する補正 (鉄拳の追い討ち) は使用回数だけでは決まらないので宣言しない。
   */
  previewPower?: (power: number, useCount: number) => number;
  /** 技の副作用。修正値・回復・毒・設置・交代 */
  onUse?: (ctx: UseContext) => void;
  /** 攻撃技のダメージを受けた。山嵐の反射 (SPEC §10.7) */
  onAfterDamageTaken?: (ctx: DamageTakenContext) => void;
  /** 相手側の回復量を書き換える。カマキリの回復無効 (SPEC §10.6) */
  onModifyHeal?: (ctx: HealContext) => number;
  /** 自分が受ける反動を書き換える。粉砕の反動無効 (SPEC §10.1) */
  onModifyRecoil?: (ctx: RecoilContext) => number;
  /** 瀕死になった。ゴーストの反射。死因を問わない (SPEC §10.12) */
  onFaint?: (ctx: HookContext) => void;
  /** ターン終了時。毒の処理より後に呼ばれる。堅牢の回復 (SPEC §5.6 / §10.4) */
  onTurnEnd?: (ctx: HookContext) => void;
}
