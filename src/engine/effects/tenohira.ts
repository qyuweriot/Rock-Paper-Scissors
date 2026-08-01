/** 手のひら (SPEC §10.11) */

import { TENOHIRA_HEAL } from '../constants';
import type { EffectHooks } from './context';

/**
 * 技2「整息」: 自分のHPを30回復。
 *
 * HPが満タンなら何も起こらないが、ターンは消費される。
 * その判定と、カマキリによる回復無効 (SPEC §10.6) は applyHeal 側にある。
 *
 * 技1の固定20 は DamageSpec の `fixed` で表現済みなのでフックは要らない。
 */
export const tenohiraRest: EffectHooks = {
  onUse: ({ api, self }) => {
    api.heal(self, TENOHIRA_HEAL);
  },
};
