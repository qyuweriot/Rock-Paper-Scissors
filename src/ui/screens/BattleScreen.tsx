/**
 * バトル画面 (PLAN §284)。対面ステージ + 行動選択 + ログ。
 *
 * **盤面は必ず flow.ts の表示用の派生から取る。** 再生中は組み直したコマを見せ、
 * 再生が終わればエンジンの権威ある状態に戻る。
 * ただし**合法手だけは権威ある状態から引く** (`legalActionsFor`)。
 */

import { getUnit, type UnitId } from '../../data/units';
import type { Action, BattleState, Side } from '../../engine/types';
import { ActionPanel } from '../components/ActionPanel';
import { BattleLog } from '../components/BattleLog';
import { BattleStage } from '../components/BattleStage';
import {
  activeInputSide,
  currentFrame,
  displayLog,
  isPlaying,
  isUnitVisible,
  legalActionsFor,
  replacementOptions,
  type FlowState,
} from '../flow';
import { effectOf } from '../playback';

interface Props {
  state: FlowState;
  /** 表示用の盤面。再生中はコマ、そうでなければ権威ある状態 */
  battle: BattleState;
  labels: Record<Side, string>;
  onDeclareAction: (action: Action) => void;
  onDeclareReplacement: (partyIndex: number) => void;
  onSkipPlayback: () => void;
}

export function BattleScreen({
  state,
  battle,
  labels,
  onDeclareAction,
  onDeclareReplacement,
  onSkipPlayback,
}: Props) {
  const viewer = activeInputSide(state);
  const turn = state.turn;
  const frame = currentFrame(state);
  const playing = isPlaying(state);
  const effect = frame ? effectOf(frame) : null;

  return (
    <div className="screen screen--battle">
      <header className="battle-head">
        <span className="battle-head__turn">{battle.turn} ターン目</span>
        {playing && (
          <button type="button" className="btn btn--skip" onClick={onSkipPlayback}>
            スキップ ▸▸
          </button>
        )}
      </header>

      <BattleStage
        battle={battle}
        labels={labels}
        effect={effect}
        effectKey={state.playback?.index ?? -1}
        isVisible={(side, partyIndex) => isUnitVisible(state, side, partyIndex, viewer)}
        caption={playing ? (frame?.entry.text ?? null) : null}
      />

      {/* 再生中は画面全体がスキップ用の当たり判定になる */}
      {playing && (
        <button
          type="button"
          className="playback-skip-layer"
          aria-label="再生をスキップ"
          onClick={onSkipPlayback}
        />
      )}

      <div className="panel">
        {!playing && turn?.kind === 'awaitAction' && (
          <>
            <p className="panel__prompt">{labels[turn.side]} の行動を選んでください</p>
            <ActionPanel
              battle={state.battle ?? battle}
              side={turn.side}
              actions={legalActionsFor(state, turn.side)}
              onDeclare={onDeclareAction}
            />
          </>
        )}

        {!playing && turn?.kind === 'awaitReplacement' && (
          <>
            <p className="panel__prompt">{labels[turn.side]} の交代先を選んでください</p>
            <div className="actions__grid">
              {replacementOptions(state, turn.side).map((index) => {
                const unit = (state.battle ?? battle).sides[turn.side].party[index];
                if (!unit) return null;
                const def = getUnit(unit.unitId as UnitId);
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

      <BattleLog entries={displayLog(state)} />
    </div>
  );
}
