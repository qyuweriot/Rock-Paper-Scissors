/** カマキリ (SPEC §10.6) */

import { KAMAKIRI_POWER_GROWTH } from '../constants';
import type { EffectHooks } from './context';

/** 連撃の威力。解決と UI の表示が同じ式を通るよう、規則はここ1か所に置く */
const growth = (power: number, useCount: number): number =>
  power + KAMAKIRI_POWER_GROWTH * useCount;

/**
 * 技1「連撃」: 使うたびに威力+5。上限なし。
 * 交代でのリセットは battle.ts の resetVolatile が担う (SPEC §7.3)。
 */
export const kamakiriGrowth: EffectHooks = {
  onModifyPower: ({ power, useCount }) => growth(power, useCount),
  previewPower: growth,
};

/**
 * 特性「治癒封じ」: 場にいる間、相手側で発生するあらゆる回復を無効化する。
 *
 * 対象は3種:
 *   手のひら 技2 / 器 技2 / 堅牢の特性
 *
 * 技や特性自体は発動するが回復量が0になる(ターンは消費される)。
 *
 * **粉砕の特性は対象外** (SPEC §10.1 / §10.6)。反動の無効化であって回復ではないため、
 * 回復の経路を通らず、ここで止める余地がない。
 */
export const kamakiriHealBlock: EffectHooks = {
  onModifyHeal: () => 0,
};
