/**
 * 毒スタック数・修正値のバッジ。
 * **数値として明示する** (PLAN §299)。bool 表示にしない。
 */

import { POISON_DAMAGE } from '../../engine/constants';
import type { UnitState } from '../../engine/types';

interface Props {
  state: UnitState;
}

export function StatusBadges({ state }: Props) {
  const atk = state.modifiers.atk + state.turnModifiers.atk;
  const def = state.modifiers.def + state.turnModifiers.def;
  const badges: { key: string; label: string; tone: string }[] = [];

  if (state.poisonStacks > 0) {
    badges.push({
      key: 'poison',
      label: `毒 ${state.poisonStacks}重 (${String(POISON_DAMAGE * state.poisonStacks)}/ターン)`,
      tone: 'poison',
    });
  }
  if (atk !== 0) {
    badges.push({ key: 'atk', label: `攻勢 ${atk > 0 ? '+' : ''}${String(atk)}`, tone: 'atk' });
  }
  if (def !== 0) {
    badges.push({ key: 'def', label: `守勢 ${def > 0 ? '+' : ''}${String(def)}`, tone: 'def' });
  }

  if (badges.length === 0) return null;

  return (
    <ul className="badges">
      {badges.map((badge) => (
        <li key={badge.key} className={`badge badge--${badge.tone}`}>
          {badge.label}
        </li>
      ))}
    </ul>
  );
}

/** 設置は陣営に紐づくので別コンポーネントにする (SPEC §7.2) */
export function HazardBadge({ stacks }: { stacks: number }) {
  if (stacks <= 0) return null;
  return <span className="badge badge--hazard">設置 {stacks}枚</span>;
}
