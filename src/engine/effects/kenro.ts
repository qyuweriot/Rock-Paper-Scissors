/** 堅牢 (SPEC §10.4) */

import { KENRO_TURN_HEAL } from '../constants';
import type { EffectHooks } from './context';

/**
 * 特性「再生」: ターン終了時にHP5回復。
 *
 * 呼ばれるのは毒の処理より後 (SPEC §5.6)。毒で瀕死になったユニットは
 * この時点で除外されているため、ここでは順序を意識しなくてよい。
 * HPが満タンなら applyHeal 側で何も起こらない。
 */
export const kenroRegeneration: EffectHooks = {
  onTurnEnd: ({ api, self }) => {
    api.heal(self, KENRO_TURN_HEAL);
  },
};
