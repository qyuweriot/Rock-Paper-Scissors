/** ゴースト (SPEC §10.12) */

import { GHOST_FAINT_REFLECT } from '../constants';
import type { EffectHooks } from './context';

/**
 * 特性「呪詛返し」: 瀕死になったとき、相手の場にいるユニットに固定30を与える。
 *
 * 山嵐の反射と違い、**死因を問わない**のが例外的な点 (SPEC §7.4)。
 * 通常攻撃・毒・設置・自分の反動のいずれで倒れても発動し、相打ちでも発動する。
 *
 * この反射で相手が瀕死になった場合、相手も死に出しを行う。
 * battle.ts の processFaints が収束するまで繰り返すことで連鎖が処理される。
 */
export const ghostCurse: EffectHooks = {
  onFaint: ({ api, self }) => {
    api.damage(api.activeRef(api.opponentOf(self.side)), GHOST_FAINT_REFLECT, 'reflect');
  },
};
