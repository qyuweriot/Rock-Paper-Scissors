/**
 * バトル画面 (PLAN §284)。
 *
 * 場の2体・HPバー・毒スタック・設置枚数・修正値・行動選択・ログを1画面に出す。
 * **盤面情報は両者に公開してよい** (SPEC §11)。隠すのは相手の控えの中身だけ。
 */

import { getUnit, type UnitId } from '../../data/units';
import type { BattleState, Side } from '../../engine/types';
import { ActionPanel } from '../components/ActionPanel';
import { BattleLog } from '../components/BattleLog';
import { HazardBadge } from '../components/StatusBadges';
import { UnitCard } from '../components/UnitCard';
import {
  activeInputSide,
  isUnitVisible,
  legalActionsFor,
  replacementOptions,
  type FlowState,
} from '../flow';
import type { Action } from '../../engine/types';

interface Props {
  state: FlowState;
  battle: BattleState;
  labels: Record<Side, string>;
  onDeclareAction: (action: Action) => void;
  onDeclareReplacement: (partyIndex: number) => void;
}

function unitIdAt(battle: BattleState, side: Side, partyIndex: number): UnitId | null {
  const unit = battle.sides[side].party[partyIndex];
  return unit ? (unit.unitId as UnitId) : null;
}

export function BattleScreen({
  state,
  battle,
  labels,
  onDeclareAction,
  onDeclareReplacement,
}: Props) {
  const viewer = activeInputSide(state);
  const turn = state.turn;

  return (
    <div className="screen screen--battle">
      <div className="field">
        {(['p2', 'p1'] as Side[]).map((side) => {
          const sideState = battle.sides[side];
          const activeIndex = sideState.activeIndex;
          const activeId = unitIdAt(battle, side, activeIndex);
          const activeUnit = sideState.party[activeIndex];

          return (
            <section key={side} className={`field__side field__side--${side}`}>
              <div className="field__head">
                <h3>{labels[side]}</h3>
                <HazardBadge stacks={sideState.hazardStacks} />
              </div>

              {activeId && activeUnit && (
                <UnitCard unitId={activeId} state={activeUnit} />
              )}

              <ul className="bench">
                {sideState.party.map((unit, index) => {
                  if (index === activeIndex) return null;
                  const id = unitIdAt(battle, side, index);
                  const visible = isUnitVisible(state, side, index, viewer);
                  if (!id) return null;
                  return (
                    <li key={index} className={`bench__item ${unit.fainted ? 'is-fainted' : ''}`}>
                      {visible ? (
                        <>
                          <span className="bench__name">{getUnit(id).name}</span>
                          <span className="bench__hp">
                            {unit.fainted ? '瀕死' : `HP ${unit.hp} / ${getUnit(id).maxHp}`}
                          </span>
                          {unit.poisonStacks > 0 && (
                            <span className="bench__poison">毒{unit.poisonStacks}</span>
                          )}
                        </>
                      ) : (
                        <span className="bench__name bench__name--hidden">? ? ?</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="panel">
        {turn?.kind === 'awaitAction' && (
          <>
            <p className="panel__prompt">{labels[turn.side]} の行動を選んでください</p>
            <ActionPanel
              battle={battle}
              side={turn.side}
              actions={legalActionsFor(state, turn.side)}
              onDeclare={onDeclareAction}
            />
          </>
        )}

        {turn?.kind === 'awaitReplacement' && (
          <>
            <p className="panel__prompt">{labels[turn.side]} の交代先を選んでください</p>
            <div className="actions__grid">
              {replacementOptions(state, turn.side).map((index) => {
                const id = unitIdAt(battle, turn.side, index);
                const unit = battle.sides[turn.side].party[index];
                if (!id || !unit) return null;
                const def = getUnit(id);
                return (
                  <button
                    key={index}
                    type="button"
                    className="btn btn--action"
                    onClick={() => onDeclareReplacement(index)}
                  >
                    <span className="btn__title">{def.name}</span>
                    <span className="btn__sub">
                      HP {unit.hp} / {def.maxHp}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <BattleLog entries={state.log} />
    </div>
  );
}
