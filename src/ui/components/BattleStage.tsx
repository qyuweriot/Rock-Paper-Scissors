/**
 * 対面ステージ。上に相手、下に自分を置き、中央で向かい合わせる。
 *
 * 表示する盤面は**再生中のコマ**でありうる (→ flow.ts の displayBattle)。
 * ここは渡されたものを描くだけで、どちらの盤面かは判断しない。
 */

import type { BattleState, Side } from '../../engine/types';
import type { Effect } from '../playback';
import { BenchDots } from './BenchDots';
import { HazardBadge } from './StatusBadges';
import { StageUnit } from './StageUnit';

interface Props {
  battle: BattleState;
  labels: Record<Side, string>;
  /** いま再生中のエフェクト */
  effect: Effect | null;
  effectKey: number;
  /** 中身を見せてよいか (SPEC §11) */
  isVisible: (side: Side, partyIndex: number) => boolean;
  /** 中央帯に出す文言。再生中はいま起きていることを出す */
  caption: string | null;
}

export function BattleStage({ battle, labels, effect, effectKey, isVisible, caption }: Props) {
  /** そのユニットが場にいて、かつエフェクトの対象なら渡す */
  const effectFor = (side: Side): Effect | null => {
    if (!effect || effect.target.side !== side) return null;
    return effect.target.partyIndex === battle.sides[side].activeIndex ? effect : null;
  };

  return (
    <div className="stage">
      {(['p2', 'p1'] as Side[]).map((side, order) => (
        <div key={side} className={`stage__side stage__side--${side}`}>
          <div className="stage__meta">
            <span className="stage__label">{labels[side]}</span>
            <BenchDots battle={battle} side={side} isVisible={(index) => isVisible(side, index)} />
            <HazardBadge stacks={battle.sides[side].hazardStacks} />
          </div>

          <StageUnit
            battle={battle}
            side={side}
            facing={order === 0 ? 'top' : 'bottom'}
            effect={effectFor(side)}
            effectKey={effectKey}
          />

          {order === 0 && (
            <div className="stage__divider">
              <span className="stage__vs">VS</span>
              {caption && <span className="stage__caption">{caption}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
