/**
 * 画面の切り替えと、再生の時間管理だけを行う。
 *
 * 遷移の判断は `flow.ts` にあり、ここは `state.screen` を見て描き分けるのと、
 * 再生を一定間隔で進めることに徹する。**時間を扱うのはこのファイルだけ**なので、
 * flow.ts は純粋なままテストできる。
 *
 * 効果音の差し込み口もここに集約する (→ audio/)。コマが変わったら鳴らし、
 * ボタンの操作音は下の1か所で拾う ─ 各コンポーネントに書いて回らない。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  currentFrame,
  displayBattle,
  gateMessage,
  HUMAN,
  initialState,
  reduce,
  sideLabels,
  type FlowState,
} from './flow';
import { playbackDurationOf } from './constants';
import { playCue, playFrame, restoreMuted, toggleMuted, unlock } from './audio';
import type { Frame } from './playback';
import { HandoffGate } from './components/HandoffGate';
import { MuteButton } from './components/MuteButton';
import { BattleScreen } from './screens/BattleScreen';
import { ModeScreen } from './screens/ModeScreen';
import { PartyScreen } from './screens/PartyScreen';
import { ResultScreen } from './screens/ResultScreen';
import { SelectionScreen } from './screens/SelectionScreen';

/**
 * 初期シード。`Math.random()` は禁止されている (PLAN §3.4) ので時刻を使う。
 * 起動ごとに違う試合になり、かつ `rngSeed` が state に残るので再現もできる。
 */
function createInitialState(): FlowState {
  return initialState(Date.now() & 0x7fffffff);
}

export function App() {
  const [state, dispatch] = useReducer(reduce, undefined, createInitialState);

  // 再生を1コマずつ自動で進める。長さはイベントの重さで変える
  const frame = currentFrame(state);
  useEffect(() => {
    if (!frame) return;
    const timer = setTimeout(
      () => dispatch({ type: 'advancePlayback' }),
      playbackDurationOf(frame.event),
    );
    return () => clearTimeout(timer);
  }, [frame]);

  /**
   * コマが変わったら効果音を鳴らす。
   *
   * **同じコマで二度鳴らさない。** main.tsx は StrictMode なので開発時は
   * effect が2回走り、素直に書くと音が二重になって濁る (画面には出ないので気付きにくい)。
   * 直前に鳴らしたコマを**そのものの同一性**で覚えて弾く ─
   * 添字や種別で鍵を作ると、ターンをまたいで同じ鍵になったときに鳴り損ねる。
   */
  const humanSide = state.mode === 'ai' ? HUMAN : null;
  const soundedRef = useRef<Frame | null>(null);
  useEffect(() => {
    if (!frame || soundedRef.current === frame) return;
    soundedRef.current = frame;
    playFrame(frame, humanSide);
  }, [frame, humanSide]);

  /**
   * 消音の設定は localStorage に残っている。**初期化子で1度だけ読み出す** ─
   * effect で読むと、一瞬「音あり」で描いてから切り替わることになる。
   */
  const [muted, setMutedState] = useState(restoreMuted);

  /**
   * ボタンの操作音を1か所で拾う。
   *
   * 各コンポーネントの onClick に書いて回ると、ボタンを足すたびに忘れる。
   * **確定するボタンは `btn--primary`** と決まっているので、それを合図に音を変える。
   * 例外だけ `data-se` で上書きする (`none` で黙る)。
   *
   * **自動再生制限の解除もここで行う** ─ 最初の操作は必ずボタンなので、
   * ここを通れば以後の音が出るようになる。
   */
  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    unlock();
    const button = (event.target as HTMLElement).closest('button');
    if (!button || button.dataset.se === 'none') return;
    playCue(button.classList.contains('btn--primary') ? 'confirm' : 'tap');
  }, []);

  const labels = sideLabels(state.mode);
  const screen = state.screen;
  const battle = displayBattle(state);

  /**
   * 選出前の秘匿ゲートだけが全画面 (SPEC §11)。まだ盤面がないので隠すものがない。
   * **バトル中のゲートは全画面にしない** ─ 盤面まで消すと、解決を見終わった瞬間に
   * 結果が画面から消えてしまう。あちらは操作欄に出す (BattleScreen の PanelGate)。
   */
  const gate = gateMessage(state);
  const mute = <MuteButton muted={muted} onToggle={() => setMutedState(toggleMuted())} />;

  if (gate) {
    return (
      <main className="app" onClick={handleClick}>
        {mute}
        <HandoffGate message={gate} onConfirm={() => dispatch({ type: 'confirmGate' })} />
      </main>
    );
  }

  return (
    <main className="app" onClick={handleClick}>
      {mute}

      {screen.kind === 'mode' && (
        <ModeScreen onStart={(mode, aiLevel) => dispatch({ type: 'chooseMode', mode, aiLevel })} />
      )}

      {screen.kind === 'party' && (
        <PartyScreen
          key={screen.side}
          side={screen.side}
          showSide={state.mode === 'hotseat'}
          onSubmit={(party) => dispatch({ type: 'setParty', party })}
        />
      )}

      {screen.kind === 'select' && (
        <SelectionScreen
          key={screen.side}
          side={screen.side}
          own={state.parties[screen.side]}
          opponent={state.parties[screen.side === 'p1' ? 'p2' : 'p1']}
          labels={labels}
          showSide={state.mode === 'hotseat'}
          onSubmit={(team) => dispatch({ type: 'setTeam', team })}
        />
      )}

      {screen.kind === 'battle' && battle && (
        <BattleScreen
          state={state}
          battle={battle}
          labels={labels}
          onDeclareAction={(action) => dispatch({ type: 'declareAction', action })}
          onDeclareReplacement={(partyIndex) =>
            dispatch({ type: 'declareReplacement', partyIndex })
          }
          onConfirmGate={() => dispatch({ type: 'confirmGate' })}
          onAdvancePlayback={() => dispatch({ type: 'advancePlayback' })}
          onSkipPlayback={() => dispatch({ type: 'skipPlayback' })}
        />
      )}

      {screen.kind === 'result' && (
        <ResultScreen
          result={screen.result}
          labels={labels}
          humanSide={state.mode === 'ai' ? HUMAN : null}
          log={state.log}
          onRestart={() => dispatch({ type: 'restart' })}
          onToTitle={() => dispatch({ type: 'toTitle' })}
        />
      )}
    </main>
  );
}
