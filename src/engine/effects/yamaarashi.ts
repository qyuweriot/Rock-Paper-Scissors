/** 山嵐 (SPEC §10.7) */

import { YAMAARASHI_REFLECT } from '../constants';
import type { EffectHooks } from './context';

/**
 * 特性「棘の反射」: 攻撃技によるダメージを受けたとき、攻撃してきたユニットに固定10を返す。
 *
 * - **毒・設置・反動によるダメージでは発動しない。** battle.ts は source が 'move' の
 *   ときだけこのフックを呼ぶが、意図を明示するためここでも確認する
 * - **反射ダメージは反射を誘発しない。** 返すダメージの source は 'reflect' なので、
 *   山嵐同士が対面してもループしない(構造的な保証)
 * - **ダメージが0だった場合も反射する。** 攻撃技を受けた事実がトリガー
 * - **この攻撃で倒された場合も反射する。** 反射量は SPEC §5.3 のステップ1で
 *   確定しており、HPの増減より前に決まっているため
 */
export const yamaarashiSpikes: EffectHooks = {
  onAfterDamageTaken: ({ api, attacker, source }) => {
    if (source !== 'move') return;
    api.damage(attacker, YAMAARASHI_REFLECT, 'reflect');
  },
};
