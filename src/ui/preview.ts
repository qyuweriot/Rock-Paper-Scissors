/**
 * 「いまこの技を打ったら何ダメージか」を出す (PLAN §296 の延長)。
 *
 * 技のテキストに書いてあるのは**データ上の威力**で、実際に入る数値ではない。
 * 相性で±25 も動き、カマキリと魔球は使うたびに変わる。
 * 暗算を強いないために、内訳ごと画面に出す。
 *
 * **ここは表示専用。** 解決には一切使わない。エンジンと同じ式を通すため、
 * 威力の累積は `previewPower`、ダメージは `computeDamage`、修正値は `totalModifier` を
 * そのまま呼ぶ。自前で計算し直さないのが要点。
 */

import { totalModifier } from '../engine/battle';
import { computeDamage, getMatchup, getTypeModifier, type Matchup } from '../engine/damage';
import { getMove, getUnit, type UnitId } from '../data/units';
import type { BattleState, Side, SlotIndex } from '../engine/types';

export interface MovePreview {
  /** 実際に入るダメージ。ダメージを与えない技は null */
  damage: number | null;
  /** 累積を反映した現在の威力。固定ダメージはその値 */
  power: number;
  /** 相性補正 (+25 / 0 / −10)。固定ダメージは 0 (SPEC §4.2) */
  typeModifier: number;
  atkMod: number;
  defMod: number;
  /** 固定ダメージ・ダメージなしの技は相性を持たない */
  matchup: Matchup | null;
  /**
   * 数値が状況で変わりうるか。
   * 鉄拳の追い討ちは相手の宣言に依存するので、ここに出る値は「追い討ちなし」のもの。
   */
  uncertain: boolean;
}

/**
 * 場のユニットが持つ技1つぶんの見込みを出す。
 *
 * 反映されないもの:
 * - **鉄拳の追い討ち** — 相手がそのターン交代を宣言したかは、宣言前には分からない (SPEC §10.2)
 * - **はさみの守勢+10** — 自分が使うターンに乗るので、相手側の見込みには入らない (SPEC §10.10)
 *
 * どちらも `uncertain` で示し、技のテキスト側が条件を説明している。
 */
export function previewMove(
  battle: BattleState,
  side: Side,
  slotIndex: SlotIndex,
): MovePreview | null {
  const attackerSide = battle.sides[side];
  const attacker = attackerSide.party[attackerSide.activeIndex];
  const defenderSide = battle.sides[side === 'p1' ? 'p2' : 'p1'];
  const defender = defenderSide.party[defenderSide.activeIndex];
  if (!attacker || !defender) return null;

  const attackerDef = getUnit(attacker.unitId as UnitId);
  const defenderDef = getUnit(defender.unitId as UnitId);

  const slot = attackerDef.slots[slotIndex];
  if (!slot || slot.kind !== 'move') return null;
  const move = getMove(attackerDef, slotIndex);

  const atkMod = totalModifier(attacker, 'atk');
  const defMod = totalModifier(defender, 'def');
  // 追い討ちのように、使用回数だけでは決まらない補正を持つ技
  const uncertain = move.hooks?.onModifyPower !== undefined && move.hooks.previewPower === undefined;

  if (move.damage.kind === 'none') {
    return { damage: null, power: 0, typeModifier: 0, atkMod, defMod, matchup: null, uncertain };
  }

  if (move.damage.kind === 'fixed') {
    // 固定ダメージは相性補正・修正値をすべて無視する (SPEC §4.2)
    return {
      damage: move.damage.amount,
      power: move.damage.amount,
      typeModifier: 0,
      atkMod: 0,
      defMod: 0,
      matchup: null,
      uncertain,
    };
  }

  const power =
    move.hooks?.previewPower?.(move.damage.power, attacker.moveUseCounts[slotIndex]) ??
    move.damage.power;

  return {
    damage: computeDamage({
      damage: { kind: 'normal', power },
      attacker: { attribute: attackerDef.attribute, atkMod },
      defender: { attribute: defenderDef.attribute, defMod },
    }),
    power,
    typeModifier: getTypeModifier(attackerDef.attribute, defenderDef.attribute),
    atkMod,
    defMod,
    matchup: getMatchup(attackerDef.attribute, defenderDef.attribute),
    uncertain,
  };
}

/** 内訳を1行にする。`基本25 相性+25 攻勢+10 守勢−5` */
export function breakdownText(preview: MovePreview): string {
  const parts = [`基本${String(preview.power)}`];
  if (preview.typeModifier !== 0) parts.push(`相性${signed(preview.typeModifier)}`);
  if (preview.atkMod !== 0) parts.push(`攻勢${signed(preview.atkMod)}`);
  if (preview.defMod !== 0) parts.push(`守勢${signed(-preview.defMod)}`);
  return parts.join(' ');
}

function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : `−${String(Math.abs(value))}`;
}
