/**
 * 行動選択 (SPEC §5.1)。技・交代・選択を伴う技をまとめて扱う。
 *
 * **合法手はエンジンから受け取ったものだけを並べる。** 使い切った技 (SPEC §10.11) や
 * 控え全滅時の選択技 (SPEC §10.13) の扱いは `getLegalActions` が既に持っている。
 *
 * 選択を伴う技 (器の回復対象 / 魔球の交代先) は、同じ `slotIndex` の候補が
 * 複数返ってくる。技を選ぶ → 対象を選ぶ の2段にする (PLAN §298)。
 */

import { useState } from 'react';
import { getMove, getUnit, type UnitId } from '../../data/units';
import type { Action, BattleState, Side, SlotIndex } from '../../engine/types';

interface Props {
  battle: BattleState;
  side: Side;
  actions: Action[];
  onDeclare: (action: Action) => void;
}

interface MoveGroup {
  slotIndex: SlotIndex;
  name: string;
  text: string;
  /** 1件なら即決、複数なら対象選択が要る */
  candidates: Action[];
}

function unitIdAt(battle: BattleState, side: Side, partyIndex: number): UnitId | null {
  const unit = battle.sides[side].party[partyIndex];
  return unit ? (unit.unitId as UnitId) : null;
}

export function ActionPanel({ battle, side, actions, onDeclare }: Props) {
  /** 対象選択の途中。null なら技の一覧を出す */
  const [pending, setPending] = useState<MoveGroup | null>(null);

  const activeIndex = battle.sides[side].activeIndex;
  const activeId = unitIdAt(battle, side, activeIndex);
  if (!activeId) return null;
  const activeDef = getUnit(activeId);

  // 技を slotIndex でまとめる。選択肢つきの技はここで複数候補になる
  const groups: MoveGroup[] = [];
  for (const action of actions) {
    if (action.kind !== 'move') continue;
    const existing = groups.find((g) => g.slotIndex === action.slotIndex);
    if (existing) {
      existing.candidates.push(action);
      continue;
    }
    const move = getMove(activeDef, action.slotIndex);
    groups.push({
      slotIndex: action.slotIndex,
      name: move.name,
      text: move.text,
      candidates: [action],
    });
  }

  const switches = actions.filter((action) => action.kind === 'switch');

  if (pending) {
    return (
      <div className="actions">
        <div className="actions__head">
          <h3>{pending.name} の対象</h3>
          <button type="button" className="btn btn--ghost" onClick={() => setPending(null)}>
            戻る
          </button>
        </div>
        <div className="actions__grid">
          {pending.candidates.map((action) => {
            const target = action.kind === 'move' ? action.selection : undefined;
            const id = target ? unitIdAt(battle, target.side, target.partyIndex) : null;
            const unit = target ? battle.sides[target.side].party[target.partyIndex] : undefined;
            if (!id || !unit) return null;
            const def = getUnit(id);
            return (
              <button
                key={target?.partyIndex}
                type="button"
                className="btn btn--action"
                onClick={() => {
                  setPending(null);
                  onDeclare(action);
                }}
              >
                <span className="btn__title">{def.name}</span>
                <span className="btn__sub">
                  HP {unit.hp} / {def.maxHp}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="actions">
      <div className="actions__group">
        <h3>技</h3>
        <div className="actions__grid">
          {groups.map((group) => (
            <button
              key={group.slotIndex}
              type="button"
              className="btn btn--action"
              onClick={() => {
                const only = group.candidates[0];
                if (group.candidates.length === 1 && only) onDeclare(only);
                else setPending(group);
              }}
            >
              <span className="btn__title">{group.name}</span>
              <span className="btn__sub">{group.text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="actions__group">
        <h3>交代</h3>
        {switches.length === 0 ? (
          <p className="actions__empty">控えに生存ユニットがいません</p>
        ) : (
          <div className="actions__grid">
            {switches.map((action) => {
              if (action.kind !== 'switch') return null;
              const id = unitIdAt(battle, side, action.toPartyIndex);
              const unit = battle.sides[side].party[action.toPartyIndex];
              if (!id || !unit) return null;
              const def = getUnit(id);
              return (
                <button
                  key={action.toPartyIndex}
                  type="button"
                  className="btn btn--action"
                  onClick={() => onDeclare(action)}
                >
                  <span className="btn__title">{def.name}</span>
                  <span className="btn__sub">
                    HP {unit.hp} / {def.maxHp}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
