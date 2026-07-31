/**
 * 画面の切り替えだけを行う (PLAN §2「UI は engine を呼ぶだけ。ロジックを持たない」)。
 *
 * 遷移の判断は `flow.ts` にあり、ここは `state.screen` を見て描き分けるだけ。
 */

import { useReducer } from 'react';
import { gateMessage, HUMAN, initialState, reduce, sideLabels, type FlowState } from './flow';
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
  const labels = sideLabels(state.mode);
  const screen = state.screen;

  // 秘匿ゲートは画面の種類より優先する。前の入力を必ず隠す (SPEC §11)
  const gate = gateMessage(state);
  if (gate && (screen.kind === 'selectGate' || screen.kind === 'battle')) {
    return (
      <main className="app">
        <HandoffGate message={gate} onConfirm={() => dispatch({ type: 'confirmGate' })} />
      </main>
    );
  }

  return (
    <main className="app">
      {screen.kind === 'mode' && (
        <ModeScreen
          onStart={(mode, aiLevel) => dispatch({ type: 'chooseMode', mode, aiLevel })}
        />
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

      {screen.kind === 'battle' && state.battle && (
        <BattleScreen
          state={state}
          battle={state.battle}
          labels={labels}
          onDeclareAction={(action) => dispatch({ type: 'declareAction', action })}
          onDeclareReplacement={(partyIndex) =>
            dispatch({ type: 'declareReplacement', partyIndex })
          }
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
