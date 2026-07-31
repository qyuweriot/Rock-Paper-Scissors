import { describe, expect, it } from 'vitest';
import {
  activeInputSide,
  gateMessage,
  initialState,
  isUnitVisible,
  legalActionsFor,
  reduce,
  replacementOptions,
  type FlowEvent,
  type FlowState,
} from './flow';
import { PARTY_SIZE, TEAM_SIZE } from '../engine/constants';
import type { UnitId } from '../data/units';
import type { AiLevel } from '../ai';

const PARTY_A: UnitId[] = ['ishi', 'kenro', 'kami', 'bara', 'issen'];
const PARTY_B: UnitId[] = ['hasami', 'ghost', 'utsuwa', 'uchiwa', 'tenohira'];
const TEAM_A: UnitId[] = ['ishi', 'kenro', 'kami'];
const TEAM_B: UnitId[] = ['hasami', 'ghost', 'utsuwa'];

const run = (state: FlowState, events: FlowEvent[]): FlowState =>
  events.reduce((current, event) => reduce(current, event), state);

const start = (mode: 'ai' | 'hotseat', aiLevel: AiLevel = 2, seed = 1234): FlowState =>
  reduce(initialState(seed), { type: 'chooseMode', mode, aiLevel });

/** バトル画面まで進める */
function toBattle(mode: 'ai' | 'hotseat', seed = 1234): FlowState {
  const events: FlowEvent[] =
    mode === 'ai'
      ? [
          { type: 'setParty', party: PARTY_A },
          { type: 'confirmGate' }, // reveal → select
          { type: 'setTeam', team: TEAM_A },
        ]
      : [
          { type: 'setParty', party: PARTY_A },
          { type: 'setParty', party: PARTY_B },
          { type: 'confirmGate' }, // reveal → selectGate(p1)
          { type: 'confirmGate' }, // selectGate(p1) → select(p1)
          { type: 'setTeam', team: TEAM_A },
          { type: 'confirmGate' }, // selectGate(p2) → select(p2)
          { type: 'setTeam', team: TEAM_B },
        ];
  return run(start(mode, 2, seed), events);
}

describe('flow — 初期状態', () => {
  it('モード選択から始まる', () => {
    expect(initialState(0).screen).toEqual({ kind: 'mode' });
  });

  it('モードを選ぶと編成画面へ進む', () => {
    expect(start('ai').screen).toEqual({ kind: 'party', side: 'p1' });
    expect(start('hotseat').screen).toEqual({ kind: 'party', side: 'p1' });
  });

  it('難易度が保持される', () => {
    expect(start('ai', 3).aiLevel).toBe(3);
  });
});

describe('flow — AI戦の遷移 (PLAN §290)', () => {
  it('編成すると相手の編成が自動で決まり、公開画面へ進む', () => {
    const state = reduce(start('ai'), { type: 'setParty', party: PARTY_A });

    expect(state.screen).toEqual({ kind: 'reveal' });
    expect(state.parties.p1).toEqual(PARTY_A);
    expect(state.parties.p2).toHaveLength(PARTY_SIZE);
  });

  it('公開画面から選出へ直行する。秘匿ゲートは挟まない', () => {
    const state = run(start('ai'), [
      { type: 'setParty', party: PARTY_A },
      { type: 'confirmGate' },
    ]);
    expect(state.screen).toEqual({ kind: 'select', side: 'p1' });
  });

  it('選出すると相手の選出も自動で決まり、バトルが始まる', () => {
    const state = toBattle('ai');

    expect(state.screen).toEqual({ kind: 'battle' });
    expect(state.teams.p1).toEqual(TEAM_A);
    expect(state.teams.p2).toHaveLength(TEAM_SIZE);
    expect(state.battle).not.toBeNull();
  });

  it('バトル開始直後は人間の行動宣言を待つ。ゲートは出ない', () => {
    const state = toBattle('ai');
    expect(state.turn).toEqual({ kind: 'awaitAction', side: 'p1' });
    expect(gateMessage(state)).toBeNull();
  });

  it('人間が宣言すると、AIの宣言とターン解決まで一気に進む', () => {
    const state = toBattle('ai');
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');

    const after = reduce(state, { type: 'declareAction', action });

    // ターンが進み、ログが出て、また人間の入力待ちに戻っている
    expect(after.battle?.turn).toBeGreaterThan(state.battle?.turn ?? 0);
    expect(after.log.length).toBeGreaterThan(0);
    expect(activeInputSide(after)).toBe('p1');
    expect(after.declared).toEqual({});
  });

  it('決着まで進めると結果画面になる', () => {
    let state = toBattle('ai');

    for (let i = 0; i < 300 && state.screen.kind === 'battle'; i++) {
      if (state.turn?.kind === 'awaitAction') {
        const action = legalActionsFor(state, state.turn.side)[0];
        if (!action) throw new Error('合法手がありません');
        state = reduce(state, { type: 'declareAction', action });
      } else if (state.turn?.kind === 'awaitReplacement') {
        const options = replacementOptions(state, state.turn.side);
        const choice = options[0];
        if (choice === undefined) throw new Error('交代先がありません');
        state = reduce(state, { type: 'declareReplacement', partyIndex: choice });
      } else {
        throw new Error(`想定外の段: ${JSON.stringify(state.turn)}`);
      }
    }

    expect(state.screen.kind).toBe('result');
    if (state.screen.kind === 'result') {
      expect(['p1', 'p2', 'draw']).toContain(state.screen.result);
    }
  });
});

describe('flow — 対人戦の秘匿フロー (SPEC §11)', () => {
  it('両者が順に編成する。パーティーは相互公開なので秘匿しない', () => {
    const first = reduce(start('hotseat'), { type: 'setParty', party: PARTY_A });
    expect(first.screen).toEqual({ kind: 'party', side: 'p2' });

    const second = reduce(first, { type: 'setParty', party: PARTY_B });
    expect(second.screen).toEqual({ kind: 'reveal' });
    expect(second.parties).toEqual({ p1: PARTY_A, p2: PARTY_B });
  });

  it('選出は 公開 → ゲート → P1 → ゲート → P2 の順に進む', () => {
    let state = run(start('hotseat'), [
      { type: 'setParty', party: PARTY_A },
      { type: 'setParty', party: PARTY_B },
    ]);
    expect(state.screen).toEqual({ kind: 'reveal' });

    state = reduce(state, { type: 'confirmGate' });
    expect(state.screen).toEqual({ kind: 'selectGate', side: 'p1' });
    expect(gateMessage(state)).toBe('プレイヤー1 の選出です');

    state = reduce(state, { type: 'confirmGate' });
    expect(state.screen).toEqual({ kind: 'select', side: 'p1' });

    // P1 の選出を終えると、内容を画面から消して P2 のゲートへ
    state = reduce(state, { type: 'setTeam', team: TEAM_A });
    expect(state.screen).toEqual({ kind: 'selectGate', side: 'p2' });
    expect(gateMessage(state)).toBe('プレイヤー2 の選出です');

    state = reduce(state, { type: 'confirmGate' });
    expect(state.screen).toEqual({ kind: 'select', side: 'p2' });

    state = reduce(state, { type: 'setTeam', team: TEAM_B });
    expect(state.screen).toEqual({ kind: 'battle' });
  });

  it('各ターンは P1 ゲート → P1 入力 → P2 ゲート → P2 入力 の順', () => {
    let state = toBattle('hotseat');

    expect(state.turn).toEqual({ kind: 'actionGate', side: 'p1' });
    expect(gateMessage(state)).toBe('プレイヤー1 の入力です');
    expect(activeInputSide(state)).toBeNull(); // ゲート中は入力を受け付けない

    state = reduce(state, { type: 'confirmGate' });
    expect(state.turn).toEqual({ kind: 'awaitAction', side: 'p1' });

    const a1 = legalActionsFor(state, 'p1')[0];
    if (!a1) throw new Error('合法手がありません');
    state = reduce(state, { type: 'declareAction', action: a1 });

    // P1 の宣言は保持されたまま、P2 のゲートへ
    expect(state.turn).toEqual({ kind: 'actionGate', side: 'p2' });
    expect(state.declared.p1).toEqual(a1);
    expect(gateMessage(state)).toBe('プレイヤー2 の入力です');

    state = reduce(state, { type: 'confirmGate' });
    expect(state.turn).toEqual({ kind: 'awaitAction', side: 'p2' });

    const a2 = legalActionsFor(state, 'p2')[0];
    if (!a2) throw new Error('合法手がありません');
    const resolved = reduce(state, { type: 'declareAction', action: a2 });

    // 両者揃ったのでターンが解決され、次のターンの P1 ゲートに戻る
    expect(resolved.declared).toEqual({});
    expect(resolved.log.length).toBeGreaterThan(0);
    expect(resolved.turn).toEqual({ kind: 'actionGate', side: 'p1' });
  });

  it('ゲート中は行動宣言を受け付けない', () => {
    const state = toBattle('hotseat');
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');

    expect(reduce(state, { type: 'declareAction', action })).toBe(state);
  });

  it('対人戦を決着まで進められる (PLAN §301)', () => {
    let state = toBattle('hotseat');

    for (let i = 0; i < 1000 && state.screen.kind === 'battle'; i++) {
      const turn = state.turn;
      if (!turn) throw new Error('入力待ちが立っていません');

      if (turn.kind === 'actionGate' || turn.kind === 'replacementGate') {
        state = reduce(state, { type: 'confirmGate' });
      } else if (turn.kind === 'awaitAction') {
        const action = legalActionsFor(state, turn.side)[0];
        if (!action) throw new Error('合法手がありません');
        state = reduce(state, { type: 'declareAction', action });
      } else {
        const choice = replacementOptions(state, turn.side)[0];
        if (choice === undefined) throw new Error('交代先がありません');
        state = reduce(state, { type: 'declareReplacement', partyIndex: choice });
      }
    }

    expect(state.screen.kind).toBe('result');
  });
});

describe('flow — 相手の控えの秘匿 (SPEC §11)', () => {
  it('AI戦ではすべて公開する', () => {
    const state = toBattle('ai');
    for (let i = 0; i < TEAM_SIZE; i++) {
      expect(isUnitVisible(state, 'p2', i, 'p1')).toBe(true);
    }
  });

  it('対人戦では自分の陣営は全部見える', () => {
    const state = toBattle('hotseat');
    for (let i = 0; i < TEAM_SIZE; i++) {
      expect(isUnitVisible(state, 'p1', i, 'p1')).toBe(true);
    }
  });

  it('対人戦では相手の控えを隠す。場に出ている先頭だけ見える', () => {
    const state = toBattle('hotseat');

    expect(isUnitVisible(state, 'p2', 0, 'p1')).toBe(true); // 場に出ている
    expect(isUnitVisible(state, 'p2', 1, 'p1')).toBe(false);
    expect(isUnitVisible(state, 'p2', 2, 'p1')).toBe(false);
  });

  it('一度場に出たユニットは控えに戻っても公開し続ける (SPEC §11)', () => {
    let state = toBattle('hotseat');

    // p2 が控えの1番へ交代するまで進める
    for (let i = 0; i < 40 && state.screen.kind === 'battle'; i++) {
      const turn = state.turn;
      if (!turn) break;
      if (turn.kind === 'actionGate' || turn.kind === 'replacementGate') {
        state = reduce(state, { type: 'confirmGate' });
      } else if (turn.kind === 'awaitAction') {
        const actions = legalActionsFor(state, turn.side);
        // p2 は交代を、p1 は技を選ぶ
        const action =
          turn.side === 'p2' ? (actions.find((a) => a.kind === 'switch') ?? actions[0]) : actions[0];
        if (!action) throw new Error('合法手がありません');
        state = reduce(state, { type: 'declareAction', action });
      } else {
        const choice = replacementOptions(state, turn.side)[0];
        if (choice === undefined) break;
        state = reduce(state, { type: 'declareReplacement', partyIndex: choice });
      }
      if (state.revealed.p2.length > 1) break;
    }

    expect(state.revealed.p2.length).toBeGreaterThan(1);
    // 場に出た経験のあるユニットは、いま控えにいても見える
    for (const index of state.revealed.p2) {
      expect(isUnitVisible(state, 'p2', index, 'p1')).toBe(true);
    }
  });
});

describe('flow — やり直し', () => {
  it('restart は同じモード・難易度で編成からやり直す', () => {
    const state = reduce(toBattle('ai', 99), { type: 'restart' });

    expect(state.screen).toEqual({ kind: 'party', side: 'p1' });
    expect(state.mode).toBe('ai');
    expect(state.battle).toBeNull();
    expect(state.log).toEqual([]);
  });

  it('toTitle はモード選択に戻る', () => {
    expect(reduce(toBattle('ai'), { type: 'toTitle' }).screen).toEqual({ kind: 'mode' });
  });
});

describe('flow — 不正な入力を弾く', () => {
  it('体数が足りない編成は受け付けない', () => {
    const state = start('ai');
    expect(reduce(state, { type: 'setParty', party: ['ishi'] })).toBe(state);
  });

  it('体数が足りない選出は受け付けない', () => {
    const state = run(start('ai'), [
      { type: 'setParty', party: PARTY_A },
      { type: 'confirmGate' },
    ]);
    expect(reduce(state, { type: 'setTeam', team: ['ishi'] })).toBe(state);
  });

  it('編成画面で選出イベントが来ても無視する', () => {
    const state = start('ai');
    expect(reduce(state, { type: 'setTeam', team: TEAM_A })).toBe(state);
  });
});

describe('flow — 決定論 (PLAN §3.4)', () => {
  it('同じシード・同じ操作列なら同じ試合になる', () => {
    const play = () => {
      let state = toBattle('ai', 777);
      for (let i = 0; i < 30 && state.screen.kind === 'battle'; i++) {
        const turn = state.turn;
        if (!turn) break;
        if (turn.kind === 'awaitAction') {
          const action = legalActionsFor(state, turn.side)[0];
          if (!action) break;
          state = reduce(state, { type: 'declareAction', action });
        } else if (turn.kind === 'awaitReplacement') {
          const choice = replacementOptions(state, turn.side)[0];
          if (choice === undefined) break;
          state = reduce(state, { type: 'declareReplacement', partyIndex: choice });
        } else {
          state = reduce(state, { type: 'confirmGate' });
        }
      }
      return state;
    };

    expect(play().log).toEqual(play().log);
  });
});
