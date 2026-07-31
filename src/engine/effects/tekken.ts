/** 鉄拳 (SPEC §10.2) */

import { TEKKEN_PURSUIT_BONUS } from '../constants';
import type { EffectHooks } from './context';

/**
 * 技2「追い討ち」: 相手がそのターンに「交代」を宣言していた場合、威力+20。
 *
 * 通常技優先度(中)のまま。交代は優先度[1]で先に解決されるため、
 * **ダメージは交代後に出てきたユニットに入り、相性判定も交代後のユニットに対して行う。**
 *
 * 発動しないケース:
 * - 団扇の強制交代 / 魔球の自己交代 — どちらもステップ3で解決され、鉄拳の攻撃より後になる
 * - 死に出し — ターンの全処理が終わった後の交代であり、宣言ではない
 *
 * `targetDeclaredSwitch` は resolveTurn が宣言された行動から直接作るので、
 * これらの交代は原理的に含まれない。
 */
export const tekkenPursuit: EffectHooks = {
  onModifyPower: ({ power, targetDeclaredSwitch }) =>
    targetDeclaredSwitch ? power + TEKKEN_PURSUIT_BONUS : power,
};
