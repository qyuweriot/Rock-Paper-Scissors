/**
 * 画面の切り替えと、再生の時間管理だけを行う。
 *
 * 遷移の判断は `flow.ts` にあり、ここは `state.screen` を見て描き分けるのと、
 * 再生を一定間隔で進めることに徹する。**時間を扱うのはこのファイルだけ**なので、
 * flow.ts は純粋なままテストできる。
 */

import { useEffect, useReducer } from 'react';
import {
  currentFrame,
  displayBattle,
  gateMessage,
  HUMAN,
  initialState,
  isPlaying,
  reduce,
  sideLabels,
  type FlowState,
} from './flow';
import { playbackDurationOf } from './constants';
import { HandoffGate } from './components/HandoffGate';
import { BattleScreen } from './screens/BattleScreen';
import { ModeScreen } from './screens/ModeScreen';
import { PartyScreen } from './screens/PartyScreen';
import { ResultScreen } from './screens/ResultScreen';
import { RevealScreen } from './screens/RevealScreen';
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

  const labels = sideLabels(state.mode);
  const screen = state.screen;
  const battle = displayBattle(state);

  /**
   * 秘匿ゲートは画面の種類より優先する。前の入力を必ず隠す (SPEC §11)。
   * 再生中はゲートを出さない ─ 出すと解決の様子が見えなくなる。
   */
  const gate = gateMessage(state);
  if (gate && !isPlaying(state) && (screen.kind === 'selectGate' || screen.kind === 'battle')) {
    return (
      <main className="app">
        <HandoffGate message={gate} onConfirm={() => dispatch({ type: 'confirmGate' })} />
      </main>
    );
  }

  return (
    <main className="app">
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

      {screen.kind === 'reveal' && (
        <RevealScreen
          parties={state.parties}
          labels={labels}
          onConfirm={() => dispatch({ type: 'confirmGate' })}
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
