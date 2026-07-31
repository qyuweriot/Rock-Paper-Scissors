/** ハサミムシ (SPEC §10.6) */

import { HASAMIMUSHI_POWER_GROWTH } from '../constants';
import type { EffectHooks } from './context';

/**
 * 技1「連撃」: 使うたびに威力+5。上限なし。
 * 交代でのリセットは battle.ts の resetVolatile が担う (SPEC §7.3)。
 */
export const hasamimushiGrowth: EffectHooks = {
  onModifyPower: ({ power, useCount }) => power + HASAMIMUSHI_POWER_GROWTH * useCount,
};

/**
 * 特性「治癒封じ」: 場にいる間、相手側で発生するあらゆる回復を無効化する。
 *
 * 対象は4種すべて:
 *   手のひら 技2 / 器 技2 / 堅牢の特性 / **粉砕の特性(倒した場合の全回復)**
 *
 * 技や特性自体は発動するが回復量が0になる(ターンは消費される)。
 * 粉砕にとってはこれが致命的で、撃破に成功しても反動50で自滅する (SPEC §10.1)。
 */
export const hasamimushiHealBlock: EffectHooks = {
  onModifyHeal: () => 0,
};
