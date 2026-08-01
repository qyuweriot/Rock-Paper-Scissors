/**
 * バトル画面 (PLAN §284)。対面ステージ + 行動選択 + ログ。
 *
 * **盤面は必ず flow.ts の表示用の派生から取る。** 再生中は組み直したコマを見せ、
 * 再生が終わればエンジンの権威ある状態に戻る。
 * ただし**合法手だけは権威ある状態から引く** (`legalActionsFor`)。
 */

import { useState } from 'react';
import { getUnit, type UnitId } from '../../data/units';
import type { Action, BattleState, Side } from '../../engine/types';
import { ActionPanel } from '../components/ActionPanel';
import { BattleLog } from '../components/BattleLog';
import { BattleStage } from '../components/BattleStage';
import { HpBar } from '../components/HpBar';
import { PanelGate } from '../components/PanelGate';
import { UnitDetail } from '../components/UnitDetail';
import {
  activeInputSide,
  currentFrame,
  displayLog,
  isAwaitingPlayback,
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
  /** 秘匿ゲートを通過する (対人戦) */
  onConfirmGate: () => void;
  onStartPlayback: () => void;
  onSkipPlayback: () => void;
}

export function BattleScreen({
  state,
  battle,
  labels,
  onDeclareAction,
  onDeclareReplacement,
  onConfirmGate,
  onStartPlayback,
  onSkipPlayback,
}: Props) {
  /** 控えの詳細。秘匿の判定は開く前に済ませてある (SPEC §11) */
  const [detail, setDetail] = useState<{ side: Side; partyIndex: number } | null>(null);

  const viewer = activeInputSide(state);
  const turn = state.turn;
  const frame = currentFrame(state);
  const playing = isPlaying(state);
  const awaiting = isAwaitingPlayback(state);
  const effect = frame ? effectOf(frame) : null;

  const detailUnit = detail ? battle.sides[detail.side].party[detail.partyIndex] : undefined;

  return (
    <div className="screen screen--battle">
      <header className="battle-head">
        <span className="battle-head__turn">{battle.turn} ターン目</span>
        {playing && !awaiting && (
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
        onSelectBench={(side, partyIndex) => setDetail({ side, partyIndex })}
        caption={frame?.entry.text ?? null}
      />

      {/* 再生中は画面全体がスキップ用の当たり判定になる。開始待ちは対象外 */}
      {playing && !awaiting && (
        <button
          type="button"
          className="playback-skip-layer"
          aria-label="再生をスキップ"
          onClick={onSkipPlayback}
        />
      )}

      <div className="panel">
        {/*
          対人戦は、片方が宣言した直後に再生を始めるともう一方が解決を見逃す。
          盤面は解決前のまま止まっているので、隠さず出したまま確認だけ取る。
        */}
        {awaiting && (
          <PanelGate
            title="2人とも画面を見ていますか?"
            hint="行動を公開してターンを解決します"
            label="再生する"
            onConfirm={onStartPlayback}
          />
        )}

        {/*
          入力の受け渡し (SPEC §11)。**盤面は消さない。**
          全面で覆うと、解決を見終わった瞬間に結果が画面から消えてしまう。
          隠すべき行動宣言は、下の ActionPanel を出さないことで既に隠れている。
        */}
        {turn?.kind === 'actionGate' && (
          <PanelGate
            title={`${labels[turn.side]} の入力です`}
            hint="相手に見えないことを確認してから進んでください"
            label="進む"
            onConfirm={onConfirmGate}
          />
        )}

        {turn?.kind === 'replacementGate' && (
          <PanelGate
            title={`${labels[turn.side]} の交代先の選択です`}
            hint="相手に見えないことを確認してから進んでください"
            label="進む"
            onConfirm={onConfirmGate}
          />
        )}

        {!playing && turn?.kind === 'awaitAction' && (
          <>
            <p className="panel__prompt">{labels[turn.side]} の行動を選んでください</p>
            <ActionPanel
              key={turn.side}
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
                    <span className="btn__sub">{def.slots.map(slotLabel).join(' / ')}</span>
                    <HpBar hp={unit.hp} maxHp={def.maxHp} poisonStacks={unit.poisonStacks} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <BattleLog entries={displayLog(state)} />

      {detail && detailUnit && (
        <UnitDetail
          unitId={detailUnit.unitId as UnitId}
          state={detailUnit}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

/** 交代先ボタンに出す一行。何ができる相手か分からないと選べない */
function slotLabel(slot: ReturnType<typeof getUnit>['slots'][number]): string {
  return slot.kind === 'move' ? slot.move.name : slot.ability.name;
}
