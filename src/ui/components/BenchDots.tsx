/**
 * 控えを丸で表す。
 *
 * 対人戦では相手の控えの中身を隠す (SPEC §11) が、**残り体数は盤面情報なので公開してよい**。
 * 中身が分かるものは名前を、分からないものは `?` を出す。
 */

import { getUnit, type UnitId } from '../../data/units';
import type { BattleState, Side } from '../../engine/types';
import { UNIT_ICONS } from '../icons';

interface Props {
  battle: BattleState;
  side: Side;
  /** party 添字 → 中身を見せてよいか (SPEC §11) */
  isVisible: (partyIndex: number) => boolean;
}

export function BenchDots({ battle, side, isVisible }: Props) {
  const sideState = battle.sides[side];

  return (
    <ul className="bench-dots">
      {sideState.party.map((unit, index) => {
        if (index === sideState.activeIndex) return null;

        const visible = isVisible(index);
        const id = unit.unitId as UnitId;
        const def = visible ? getUnit(id) : null;
        const state = unit.fainted ? 'fainted' : visible ? 'known' : 'hidden';

        return (
          <li key={index} className={`bench-dot bench-dot--${state}`}>
            <span className="bench-dot__icon">
              {unit.fainted ? '✕' : visible ? UNIT_ICONS[id] : '?'}
            </span>
            {def && !unit.fainted && (
              <span className="bench-dot__hp">
                {unit.hp}
                {unit.poisonStacks > 0 && <em className="bench-dot__poison">毒{unit.poisonStacks}</em>}
              </span>
            )}
            {def && <span className="bench-dot__name">{def.name}</span>}
          </li>
        );
      })}
    </ul>
  );
}
