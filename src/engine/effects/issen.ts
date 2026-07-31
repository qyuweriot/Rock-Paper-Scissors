/** 一閃 (SPEC §10.9) */

import { ISSEN_ATK_UP } from '../constants';
import type { EffectHooks } from './context';

/**
 * 技2「構え」: 攻勢+10。交代または瀕死までの永続。
 *
 * 累積上限 (+20 = 2回分) と、上限到達時に「無効だがターンは消費する」挙動は
 * EffectApi.addModifier 側が持つ。ここで上限を判定すると、同じ判定が
 * 修正値を持つ技ごとに散らばって必ずどこかで漏れる。
 *
 * リセットは battle.ts の resetVolatile が担う(交代・瀕死の両方)。
 */
export const issenFocus: EffectHooks = {
  onUse: ({ api, self }) => {
    api.addModifier(self, 'atk', ISSEN_ATK_UP, 'untilSwitch');
  },
};
