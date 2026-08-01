/**
 * HPバー。数値も併記する(バーだけだと残量が読み取れない)。
 *
 * 毒を持つユニットは、**ターン終了時に消えるぶんを別色で塗り分ける** (SPEC §7.1)。
 * 「毒2」バッジから −20 を暗算させないため。
 */

import { POISON_DAMAGE } from '../../engine/constants';

interface Props {
  hp: number;
  maxHp: number;
  /** 毒のスタック数。ターン終了時に POISON_DAMAGE × これだけ減る */
  poisonStacks?: number;
}

export function HpBar({ hp, maxHp, poisonStacks = 0 }: Props) {
  const current = Math.max(0, hp);
  const ratio = maxHp > 0 ? current / maxHp : 0;
  // 残量で色を変える。しきい値は見た目だけの話なのでゲーム定数には出さない
  const level = ratio > 0.5 ? 'high' : ratio > 0.2 ? 'mid' : 'low';

  // 毒で消えるぶん。残HPを超えることはある(その場合は次のターン終了で倒れる)
  const poison = Math.min(current, POISON_DAMAGE * poisonStacks);
  const lethal = poison > 0 && poison >= current;
  const survive = current - poison;

  return (
    <div className="hp">
      <div className="hp__track">
        <div
          className={`hp__fill hp__fill--${lethal ? 'low' : level}`}
          style={{ width: `${String(pct(survive, maxHp))}%` }}
        />
        {poison > 0 && (
          <div
            className={`hp__fill hp__fill--poison ${lethal ? 'is-lethal' : ''}`}
            style={{ width: `${String(pct(poison, maxHp))}%` }}
          />
        )}
      </div>
      <span className="hp__text">
        {current} / {maxHp}
        {poison > 0 && (
          <em className="hp__poison">
            {lethal ? '毒で瀕死' : `毒 −${String(poison)}`}
          </em>
        )}
      </span>
    </div>
  );
}

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0;
}
