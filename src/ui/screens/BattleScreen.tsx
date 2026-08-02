/**
 * バトル画面 (PLAN §284)。対面ステージ + 行動選択 + ログ。
 *
 * **盤面は必ず flow.ts の表示用の派生から取る。** 再生中は組み直したコマを見せ、
 * 再生が終わればエンジンの権威ある状態に戻る。
 * ただし**合法手だけは権威ある状態から引く** (`legalActionsFor`)。
 */

import { useState } from 'react';
import type { UnitId } from '../../data/units';
import type { Action, BattleState, Side } from '../../engine/types';
import { ActionPanel } from '../components/ActionPanel';
import { BattleLog } from '../components/BattleLog';
import { BattleStage } from '../components/BattleStage';
import { PanelGate } from '../components/PanelGate';
import { PartyDetail } from '../components/PartyDetail';
import { UnitCard } from '../components/UnitCard';
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
  /**
   * 再生を1コマ進める。**開始待ちなら再生を始める** ─
   * リデューサの advancePlayback が両方をこなすので、呼び口は1つでよい。
   */
  onAdvancePlayback: () => void;
  /** 残りを全部飛ばす。上部のボタン専用 */
  onSkipPlayback: () => void;
}

export function BattleScreen({
  state,
  battle,
  labels,
  onDeclareAction,
  onDeclareReplacement,
  onConfirmGate,
  onAdvancePlayback,
  onSkipPlayback,
}: Props) {
  /** 控えの詳細。秘匿の判定は開く前に済ませてある (SPEC §11) */
  const [detail, setDetail] = useState<{ side: Side; partyIndex: number } | null>(null);
  /** 編成5体の一覧。相互公開の情報なので誰の分でも開いてよい (SPEC §1) */
  const [partyOf, setPartyOf] = useState<Side | null>(null);

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
          <>
            <span className="battle-head__hint">画面をタップで次へ</span>
            <button type="button" className="btn btn--skip" onClick={onSkipPlayback}>
              スキップ ▸▸
            </button>
          </>
        )}
      </header>

      <BattleStage
        battle={battle}
        labels={labels}
        effect={effect}
        effectKey={state.playback?.index ?? -1}
        isVisible={(side, partyIndex) => isUnitVisible(state, side, partyIndex, viewer)}
        onSelectBench={(side, partyIndex) => setDetail({ side, partyIndex })}
        onShowParty={(side) => setPartyOf(side)}
        caption={frame?.entry.text ?? null}
      />

      {/*
        再生中は画面全体が「次へ」の当たり判定になる。開始待ちは対象外
        (確認せずに再生が始まってしまう)。
        **最後まで飛ばすのは上部のボタンの役割**で、ここは1コマずつ送る。
      */}
      {playing && !awaiting && (
        <button
          type="button"
          className="playback-skip-layer"
          aria-label="1コマ進める"
          // 送った先のコマが自分の音を鳴らす。操作音まで足すと二重に聞こえる
          data-se="none"
          onClick={onAdvancePlayback}
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
            onConfirm={onAdvancePlayback}
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
            {/* 控えを1体選ぶので、控えの詳細と同じカードで見せる */}
            <div className="actions__grid actions__grid--cards">
              {replacementOptions(state, turn.side).map((index) => {
                const unit = (state.battle ?? battle).sides[turn.side].party[index];
                if (!unit) return null;
                return (
                  <UnitCard
                    key={index}
                    unitId={unit.unitId as UnitId}
                    state={unit}
                    onClick={() => onDeclareReplacement(index)}
                  />
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

      {partyOf && (
        <PartyDetail
          label={labels[partyOf]}
          party={state.parties[partyOf]}
          onClose={() => setPartyOf(null)}
        />
      )}
    </div>
  );
}
