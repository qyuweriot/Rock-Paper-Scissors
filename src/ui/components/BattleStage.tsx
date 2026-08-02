/**
 * 対面ステージ。**左が p1、右が p2 で固定**する。
 *
 * 席や手番で入れ替えない ─ 対人戦で端末を回すたびに配置が反転すると、
 * どちらが自分か毎回読み直すことになる。「左のプレイヤー / 右のプレイヤー」で通す。
 *
 * **陣営ごとのラッパーを作らず、grid の直接の子として並べる。**
 * ラッパーで包むと、控えの数や設置バッジの有無で meta の行数が変わったとき
 * 片側のカードだけ下にずれる。同じ grid 行に入れておけば高さが自動で揃う。
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
  /** 「編成」を押したとき。その陣営の5体を見せる */
  onShowParty?: (side: Side) => void;
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
  onShowParty,
  caption,
}: Props) {
  /** その陣営の場のユニットが指されているか */
  const isActiveTarget = (side: Side, ref: { side: Side; partyIndex: number } | null) =>
    ref !== null && ref.side === side && ref.partyIndex === battle.sides[side].activeIndex;

  /** そのユニットが場にいて、かつエフェクトの対象なら渡す */
  const effectFor = (side: Side): Effect | null =>
    effect && isActiveTarget(side, effect.target) ? effect : null;

  /** 攻撃を仕掛けた側か。踏み込む演出に使う */
  const isAttacking = (side: Side): boolean => isActiveTarget(side, effect?.attacker ?? null);

  return (
    <div className="stage">
      {ORDER.map((side, order) => {
        const hand = order === 0 ? 'left' : 'right';
        return (
          <div key={`${side}-meta`} className={`stage__meta stage__meta--${hand}`}>
            {/*
              **2行に固定する。** 1行目はラベルと設置の印、2行目は控え。
              1本の flex-wrap に並べていたときは、控えの幅次第で折り返す位置が変わり、
              片側だけラベルの横に残って左右で揃わなかった。
            */}
            <div className="stage__meta-head">
              {/* ラベルが陣営を言い切る (AI戦は「あなた/相手」、対人戦は「プレイヤーN」) */}
              <span className="stage__label">{labels[side]}</span>
              {onShowParty && (
                <button
                  type="button"
                  className="stage__party-button"
                  onClick={() => onShowParty(side)}
                >
                  編成
                </button>
              )}
              <HazardBadge stacks={battle.sides[side].hazardStacks} />
            </div>
            <BenchDots
              battle={battle}
              side={side}
              isVisible={(index) => isVisible(side, index)}
              onSelect={onSelectBench ? (index) => onSelectBench(side, index) : undefined}
            />
          </div>
        );
      })}

      {ORDER.map((side, order) => (
        <StageUnit
          key={`${side}-unit`}
          battle={battle}
          side={side}
          facing={order === 0 ? 'left' : 'right'}
          effect={effectFor(side)}
          attacking={isAttacking(side)}
          effectKey={effectKey}
        />
      ))}

      {/* 左右を分ける線 */}
      <div className="stage__divider">
        <span className="stage__vs">VS</span>
      </div>

      {/*
        いま何が起きているかを全幅で出す。再生を目で追うための主役なので大きく取る。
        **再生していないときも要素を残して高さを確保する** ─ 出たり消えたりすると
        下の操作欄が毎コマ跳ねる。
      */}
      <div className="stage__caption-row">
        {caption && (
          <span key={`${String(effectKey)}-caption`} className="stage__caption">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
