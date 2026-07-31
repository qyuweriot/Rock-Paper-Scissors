/**
 * ステージ上の1体。アイコン・HP・状態・技の効果テキスト・エフェクトを担う。
 *
 * **効果テキストは畳まない。** PLAN §296 が「ステータスと効果テキストは常に画面上に出す」と
 * 定めているので、相手側も含めて常時表示する。
 */

import { getUnit, type UnitId } from '../../data/units';
import type { BattleState, Side } from '../../engine/types';
import { UNIT_ICONS } from '../icons';
import { ATTRIBUTE_LABELS, SPEED_LABELS } from '../labels';
import type { Effect } from '../playback';
import { HpBar } from './HpBar';
import { StatusBadges } from './StatusBadges';

interface Props {
  battle: BattleState;
  side: Side;
  /** この陣営を上に描くか(相手側)。エフェクトの向きが変わる */
  facing: 'top' | 'bottom';
  /** いま再生中のエフェクト。この陣営の場のユニットが対象のときだけ渡ってくる */
  effect: Effect | null;
  /** エフェクトを再生し直すための鍵。コマが変わるたびに変える */
  effectKey: number;
}

export function StageUnit({ battle, side, facing, effect, effectKey }: Props) {
  const sideState = battle.sides[side];
  const unit = sideState.party[sideState.activeIndex];
  if (!unit) return null;

  const def = getUnit(unit.unitId as UnitId);
  const animation = effect ? `is-${effect.kind}` : '';

  return (
    <div className={`stage-unit stage-unit--${facing} ${unit.fainted ? 'is-fainted' : ''}`}>
      <div className="stage-unit__main">
        <div key={`${String(effectKey)}-icon`} className={`stage-unit__icon ${animation}`}>
          <span className={`stage-unit__emoji stage-unit__emoji--${def.attribute}`}>
            {UNIT_ICONS[unit.unitId as UnitId]}
          </span>
          {effect && <FloatingEffect effect={effect} effectKey={effectKey} />}
        </div>

        <div className="stage-unit__info">
          <div className="stage-unit__name-row">
            <span className="stage-unit__name">{def.name}</span>
            <span className="stage-unit__tags">
              {ATTRIBUTE_LABELS[def.attribute]} / 速度{SPEED_LABELS[def.speed]}
            </span>
          </div>
          <HpBar hp={unit.hp} maxHp={def.maxHp} />
          <StatusBadges state={unit} />
        </div>
      </div>

      <ul className="stage-unit__slots">
        {def.slots.map((slot, index) => {
          const isMove = slot.kind === 'move';
          const entry = isMove ? slot.move : slot.ability;
          const max = isMove ? slot.move.maxUses : undefined;
          const used = isMove ? unit.totalMoveUses[index as 0 | 1] : 0;
          return (
            <li key={entry.name} className={isMove ? 'slot slot--move' : 'slot slot--ability'}>
              <span className="slot__kind">{isMove ? '技' : '特性'}</span>
              <span className="slot__name">
                {entry.name}
                {max !== undefined && (
                  <span className="slot__uses"> 残り {Math.max(0, max - used)}/{max}</span>
                )}
              </span>
              <span className="slot__text">{entry.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** ダメージ・回復・修正値を数値として浮かせる */
function FloatingEffect({ effect, effectKey }: { effect: Effect; effectKey: number }) {
  if (effect.kind === 'faint') {
    return (
      <span key={effectKey} className="floating floating--faint">
        倒れた
      </span>
    );
  }
  if (effect.kind === 'switch') return null;
  if (effect.amount === null) return null;

  const sign = effect.kind === 'damage' ? '−' : '+';
  return (
    <span key={effectKey} className={`floating floating--${effect.kind}`}>
      {sign}
      {Math.abs(effect.amount)}
      {effect.note && <em className="floating__note">{effect.note}</em>}
    </span>
  );
}
