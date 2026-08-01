/**
 * 対面ステージ。**左が p1、右が p2 で固定**する。
 *
 * 席や手番で入れ替えない ─ 対人戦で端末を回すたびに配置が反転すると、
 * どちらが自分か毎回読み直すことになる。「左のプレイヤー / 右のプレイヤー」で通す。
 *
 * 表示する盤面は**再生中のコマ**でありうる (→ flow.ts の displayBattle)。
 * ここは渡されたものを描くだけで、どちらの盤面かは判断しない。
 */

import type { BattleState, Side } from '../../engine/types';
import type { Effect } from '../playback';
import { BenchDots } from './BenchDots';
import { HazardBadge } from './StatusBadges';
import { StageUnit } from './StageUnit';

/** 左から右への並び。**この順序は動かさない** */
const ORDER: readonly Side[] = ['p1', 'p2'];

interface Props {
  battle: BattleState;
  labels: Record<Side, string>;
  /** いま再生中のエフェクト */
  effect: Effect | null;
  effectKey: number;
  /** 中身を見せてよいか (SPEC §11) */
  isVisible: (side: Side, partyIndex: number) => boolean;
  /** 控えを押したとき。中身が見えるものだけ呼ばれる */
  onSelectBench?: (side: Side, partyIndex: number) => void;
  /** 中央帯に出す文言。再生中はいま起きていることを出す */
  caption: string | null;
}

export function BattleStage({
  battle,
  labels,
  effect,
  effectKey,
  isVisible,
  onSelectBench,
  caption,
}: Props) {
  /** そのユニットが場にいて、かつエフェクトの対象なら渡す */
  const effectFor = (side: Side): Effect | null => {
    if (!effect || effect.target.side !== side) return null;
    return effect.target.partyIndex === battle.sides[side].activeIndex ? effect : null;
  };

  return (
    <div className="stage">
      {ORDER.map((side, order) => (
        <div key={side} className={`stage__side stage__side--${order === 0 ? 'left' : 'right'}`}>
          <div className="stage__meta">
            {/* ラベルが陣営を言い切る (AI戦は「あなた/相手」、対人戦は「プレイヤーN」) */}
            <span className="stage__label">{labels[side]}</span>
            <BenchDots
              battle={battle}
              side={side}
              isVisible={(index) => isVisible(side, index)}
              onSelect={onSelectBench ? (index) => onSelectBench(side, index) : undefined}
            />
            <HazardBadge stacks={battle.sides[side].hazardStacks} />
          </div>

          <StageUnit
            battle={battle}
            side={side}
            facing={order === 0 ? 'left' : 'right'}
            effect={effectFor(side)}
            effectKey={effectKey}
          />
        </div>
      ))}

      {/* 中央の帯。左右のあいだに挟まる */}
      <div className="stage__divider">
        <span className="stage__vs">VS</span>
        {caption && <span className="stage__caption">{caption}</span>}
      </div>
    </div>
  );
}
