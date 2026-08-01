/**
 * 控えを丸で表す。
 *
 * 対人戦では相手の控えの中身を隠す (SPEC §11) が、**残り体数は盤面情報なので公開してよい**。
 * 中身が分かるものは名前を、分からないものは `?` を出す。
 *
 * 中身が分かるものは押せる。技と特性まで読めないと交代の判断ができないため。
 */

import { getUnit, type UnitId } from '../../data/units';
import type { BattleState, Side } from '../../engine/types';
import { HIDDEN_ICON, UNIT_ICONS } from '../icons';

interface Props {
  battle: BattleState;
  side: Side;
  /** party 添字 → 中身を見せてよいか (SPEC §11) */
  isVisible: (partyIndex: number) => boolean;
  /** 押したとき。中身が見えるものだけ呼ばれる */
  onSelect?: (partyIndex: number) => void;
}

export function BenchDots({ battle, side, isVisible, onSelect }: Props) {
  const sideState = battle.sides[side];

  return (
    <ul className="bench-dots">
      {sideState.party.map((unit, index) => {
        if (index === sideState.activeIndex) return null;

        const visible = isVisible(index);
        const id = unit.unitId as UnitId;
        const def = visible ? getUnit(id) : null;
        const state = unit.fainted ? 'fainted' : visible ? 'known' : 'hidden';

        const body = (
          <>
            <span className="bench-dot__icon">
              {unit.fainted ? '✕' : visible ? UNIT_ICONS[id] : HIDDEN_ICON}
            </span>
            {def && !unit.fainted && (
              <span className="bench-dot__hp">
                {unit.hp}
                {unit.poisonStacks > 0 && (
                  <em className="bench-dot__poison">毒{unit.poisonStacks}</em>
                )}
              </span>
            )}
            {def && <span className="bench-dot__name">{def.name}</span>}
          </>
        );

        return (
          <li key={index} className={`bench-dot bench-dot--${state}`}>
            {visible && onSelect ? (
              <button
                type="button"
                className="bench-dot__button"
                onClick={() => onSelect(index)}
                title={def ? `${def.name} の詳細` : undefined}
              >
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
