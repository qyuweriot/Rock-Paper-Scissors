/**
 * ユニット1体のカード。
 *
 * **ステータスと効果テキストを常に出す** (PLAN §296)。プレイヤーに暗記を強いない。
 */

import { getUnit, type UnitId } from '../../data/units';
import type { UnitState } from '../../engine/types';
import { HIDDEN_ICON, UNIT_ICONS } from '../icons';
import { ATTRIBUTE_LABELS, SPEED_LABELS } from '../labels';
import { HpBar } from './HpBar';
import { StatusBadges } from './StatusBadges';

interface Props {
  unitId: UnitId;
  /** 対戦中のみ。編成・選出画面では省く */
  state?: UnitState;
  /** クリックで選べるカードにする */
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** 対人戦で相手の控えを隠すとき (SPEC §11) */
  hidden?: boolean;
  compact?: boolean;
}

export function UnitCard({ unitId, state, onClick, selected, disabled, hidden, compact }: Props) {
  if (hidden) {
    return (
      <div className="unit-card unit-card--hidden">
        <span className="unit-card__unknown">{HIDDEN_ICON}</span>
      </div>
    );
  }

  const def = getUnit(unitId);
  const className = [
    'unit-card',
    `unit-card--${def.attribute}`,
    selected ? 'is-selected' : '',
    state?.fainted ? 'is-fainted' : '',
    compact ? 'unit-card--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <div className="unit-card__head">
        <span className={`unit-card__icon unit-card__icon--${def.attribute}`}>
          {UNIT_ICONS[unitId]}
        </span>
        <span className="unit-card__name">{def.name}</span>
        <span className="unit-card__tags">
          {ATTRIBUTE_LABELS[def.attribute]} / 速度{SPEED_LABELS[def.speed]}
        </span>
      </div>

      {state ? (
        <>
          <HpBar hp={state.hp} maxHp={def.maxHp} poisonStacks={state.poisonStacks} />
          <StatusBadges state={state} />
        </>
      ) : (
        <p className="unit-card__hp-plain">HP {def.maxHp}</p>
      )}

      {!compact && (
        <ul className="unit-card__slots">
          {def.slots.map((slot, index) => {
            const isMove = slot.kind === 'move';
            const entry = isMove ? slot.move : slot.ability;
            const used = isMove && state ? state.totalMoveUses[index as 0 | 1] : 0;
            const max = isMove ? slot.move.maxUses : undefined;
            return (
              <li key={entry.name} className={isMove ? 'slot slot--move' : 'slot slot--ability'}>
                <span className="slot__kind">{isMove ? '技' : '特性'}</span>
                {/* 構造は StageUnit と揃える。.slot の CSS は両者の共有物 */}
                <div className="slot__body">
                  <div className="slot__head">
                    <span className="slot__name">
                      {entry.name}
                      {max !== undefined && (
                        <span className="slot__uses">
                          {' '}
                          残り {Math.max(0, max - used)}/{max}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="slot__text">{entry.text}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (!onClick) return <div className={className}>{body}</div>;

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}
