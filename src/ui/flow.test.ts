import { describe, expect, it } from 'vitest';
import {
  activeInputSide,
  currentFrame,
  displayBattle,
  displayLog,
  gateMessage,
  initialState,
  isAwaitingPlayback,
  isPlaying,
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

/** 再生中なら飛ばして本編に戻す。遷移だけを見たいテストで使う */
const settle = (state: FlowState): FlowState =>
  isPlaying(state) ? reduce(state, { type: 'skipPlayback' }) : state;

/**
 * 決着まで自動で進める。再生・ゲート・行動・死に出しをすべて捌く。
 * `onState` で各段階を覗ける。
 */
function playOut(initial: FlowState, onState?: (s: FlowState) => void, limit = 1000): FlowState {
  let state = initial;
  for (let i = 0; i < limit && state.screen.kind === 'battle'; i++) {
    onState?.(state);

    if (isPlaying(state)) {
      state = reduce(state, { type: 'advancePlayback' });
      continue;
    }
    const turn = state.turn;
    if (!turn) throw new Error('入力待ちも再生も立っていません');

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
  return state;
}

/** バトル画面まで進める */
function toBattle(mode: 'ai' | 'hotseat', seed = 1234): FlowState {
  const events: FlowEvent[] =
    mode === 'ai'
      ? [
          { type: 'setParty', party: PARTY_A },
          { type: 'setTeam', team: TEAM_A },
        ]
      : [
          { type: 'setParty', party: PARTY_A },
          { type: 'setParty', party: PARTY_B },
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
  /**
   * 相互公開 (SPEC §1) は選出画面が兼ねる。専用の公開画面は置かない ─
   * 選出画面が両者の編成を並べるので、同じ内容を二度見せることになるため。
   */
  it('編成すると相手の編成が自動で決まり、そのまま選出へ進む', () => {
    const state = reduce(start('ai'), { type: 'setParty', party: PARTY_A });

    expect(state.screen).toEqual({ kind: 'select', side: 'p1' });
    expect(state.parties.p1).toEqual(PARTY_A);
    expect(state.parties.p2).toHaveLength(PARTY_SIZE);
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

  it('人間が宣言すると、AIも宣言してターンが解決され、再生が始まる', () => {
    const state = toBattle('ai');
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');

    const after = reduce(state, { type: 'declareAction', action });

    // ターンは解決済みだが、再生中なので入力は受け付けない
    expect(after.battle?.turn).toBeGreaterThan(state.battle?.turn ?? 0);
    expect(isPlaying(after)).toBe(true);
    expect(activeInputSide(after)).toBeNull();
    expect(after.declared).toEqual({});

    // 再生を飛ばすと次の入力待ちに戻る
    const settled = reduce(after, { type: 'skipPlayback' });
    expect(isPlaying(settled)).toBe(false);
    expect(activeInputSide(settled)).toBe('p1');
    expect(settled.log.length).toBeGreaterThan(0);
  });

  it('決着まで進めると結果画面になる', () => {
    const state = playOut(toBattle('ai'));

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
    expect(second.screen).toEqual({ kind: 'selectGate', side: 'p1' });
    expect(second.parties).toEqual({ p1: PARTY_A, p2: PARTY_B });
  });

  it('選出は ゲート → P1 → ゲート → P2 の順に進む', () => {
    let state = run(start('hotseat'), [
      { type: 'setParty', party: PARTY_A },
      { type: 'setParty', party: PARTY_B },
    ]);
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
    expect(activeInputSide(state)).toBeNull(); // ゲート中は入力を受け付けない
    // バトル中のゲートは全画面にしない。盤面を残したまま操作欄に出す
    expect(gateMessage(state)).toBeNull();

    state = reduce(state, { type: 'confirmGate' });
    expect(state.turn).toEqual({ kind: 'awaitAction', side: 'p1' });

    const a1 = legalActionsFor(state, 'p1')[0];
    if (!a1) throw new Error('合法手がありません');
    state = reduce(state, { type: 'declareAction', action: a1 });

    // P1 の宣言は保持されたまま、P2 のゲートへ
    expect(state.turn).toEqual({ kind: 'actionGate', side: 'p2' });
    expect(state.declared.p1).toEqual(a1);

    state = reduce(state, { type: 'confirmGate' });
    expect(state.turn).toEqual({ kind: 'awaitAction', side: 'p2' });

    const a2 = legalActionsFor(state, 'p2')[0];
    if (!a2) throw new Error('合法手がありません');
    const resolved = reduce(state, { type: 'declareAction', action: a2 });

    // 両者揃ったのでターンが解決され、まず再生が始まる
    expect(resolved.declared).toEqual({});
    expect(isPlaying(resolved)).toBe(true);
    expect(resolved.turn).toBeNull();

    // 再生が終わると次のターンの P1 ゲートに戻る
    const settled = settle(resolved);
    expect(settled.log.length).toBeGreaterThan(0);
    expect(settled.turn).toEqual({ kind: 'actionGate', side: 'p1' });
  });

  it('ゲート中は行動宣言を受け付けない', () => {
    const state = toBattle('hotseat');
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');

    expect(reduce(state, { type: 'declareAction', action })).toBe(state);
  });

  it('対人戦を決着まで進められる (PLAN §301)', () => {
    expect(playOut(toBattle('hotseat')).screen.kind).toBe('result');
  });
});

describe('flow — 相手の控えの秘匿 (SPEC §11)', () => {
  /**
   * 以前はAI戦で無条件に公開しており、開始時点で相手の選出が読めてしまっていた。
   * 選出画面で公開されるのはパーティー5体であって、選ばれた3体ではない (SPEC §11)。
   */
  it('AI戦でも相手の控えは隠す。場に出ている先頭だけ見える', () => {
    const state = toBattle('ai');

    expect(isUnitVisible(state, 'p2', 0, 'p1')).toBe(true);
    expect(isUnitVisible(state, 'p2', 1, 'p1')).toBe(false);
    expect(isUnitVisible(state, 'p2', 2, 'p1')).toBe(false);
  });

  it('AI戦では自分の陣営が全部見える。観戦者を渡さなくても人間側と分かる', () => {
    const state = toBattle('ai');
    for (let i = 0; i < TEAM_SIZE; i++) {
      expect(isUnitVisible(state, 'p1', i, null)).toBe(true);
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

    // p2 が控えへ交代するまで進める
    for (let i = 0; i < 60 && state.screen.kind === 'battle'; i++) {
      if (isPlaying(state)) {
        state = reduce(state, { type: 'advancePlayback' });
      } else {
        const turn = state.turn;
        if (!turn) break;
        if (turn.kind === 'actionGate' || turn.kind === 'replacementGate') {
          state = reduce(state, { type: 'confirmGate' });
        } else if (turn.kind === 'awaitAction') {
          const actions = legalActionsFor(state, turn.side);
          // p2 は交代を、p1 は技を選ぶ
          const action =
            turn.side === 'p2'
              ? (actions.find((a) => a.kind === 'switch') ?? actions[0])
              : actions[0];
          if (!action) throw new Error('合法手がありません');
          state = reduce(state, { type: 'declareAction', action });
        } else {
          const choice = replacementOptions(state, turn.side)[0];
          if (choice === undefined) break;
          state = reduce(state, { type: 'declareReplacement', partyIndex: choice });
        }
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

describe('flow — ターン解決の再生', () => {
  /** 1ターン解決して再生中の状態にする */
  const playing = (): FlowState => {
    const state = toBattle('ai');
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');
    return reduce(state, { type: 'declareAction', action });
  };

  it('解決直後は再生の先頭で止まる', () => {
    const state = playing();
    expect(state.playback?.index).toBe(0);
    expect(state.playback?.frames.length).toBeGreaterThan(0);
  });

  it('再生中は行動宣言も死に出しも受け付けない', () => {
    const state = playing();
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');

    expect(reduce(state, { type: 'declareAction', action })).toBe(state);
    expect(reduce(state, { type: 'declareReplacement', partyIndex: 1 })).toBe(state);
  });

  it('advancePlayback で1コマずつ進む', () => {
    let state = playing();
    const total = state.playback?.frames.length ?? 0;
    expect(total).toBeGreaterThan(1);

    for (let i = 1; i < total; i++) {
      state = reduce(state, { type: 'advancePlayback' });
      expect(state.playback?.index).toBe(i);
    }

    // 末尾を過ぎたら本編が再開する
    state = reduce(state, { type: 'advancePlayback' });
    expect(isPlaying(state)).toBe(false);
  });

  it('ログは再生済みのぶんだけ出る', () => {
    let state = playing();
    const total = state.playback?.frames.length ?? 0;
    const before = displayLog(state).length;

    state = reduce(state, { type: 'advancePlayback' });
    expect(displayLog(state).length).toBe(before + 1);

    // 全部再生し終えると、コマの数だけログが増えている
    const settled = settle(state);
    expect(settled.log.length).toBeGreaterThanOrEqual(total);
  });

  it('表示用の盤面は再生の進みに追従し、最後はエンジンの状態に戻る', () => {
    let state = playing();
    const authoritative = state.battle;

    // 先頭のコマは解決前に近い盤面。エンジンの最終状態とは限らない
    expect(displayBattle(state)).toEqual(state.playback?.frames[0]?.battle);

    state = settle(state);
    // 再生後は権威ある状態そのもの
    expect(displayBattle(state)).toBe(state.battle);
    expect(state.battle).toBe(authoritative);
  });

  it('currentFrame がエフェクトの元になるコマを返す', () => {
    const state = playing();
    expect(currentFrame(state)).toBe(state.playback?.frames[0]);
    expect(currentFrame(settle(state))).toBeNull();
  });

  it('skipPlayback は残りを飛ばして本編を再開する', () => {
    const state = playing();
    const skipped = reduce(state, { type: 'skipPlayback' });

    expect(isPlaying(skipped)).toBe(false);
    // 飛ばしてもログは全部残る。見逃しても後から読める
    expect(skipped.log.length).toBeGreaterThanOrEqual(state.playback?.frames.length ?? 0);
  });

  /**
   * 画面タップ = 1コマ送り / 上部のボタン = 最後まで飛ばす、と役割を分けてある。
   * **両者が同じ結果になってしまっては分けた意味がない。**
   */
  it('1コマ送りと全飛ばしは別の結果になる', () => {
    const state = playing();
    expect(state.playback?.frames.length).toBeGreaterThan(2);

    const stepped = reduce(state, { type: 'advancePlayback' });
    const skipped = reduce(state, { type: 'skipPlayback' });

    // 1コマ送りは再生中のまま次のコマへ
    expect(isPlaying(stepped)).toBe(true);
    expect(stepped.playback?.index).toBe(1);

    // 全飛ばしは再生を終えて本編に戻る
    expect(isPlaying(skipped)).toBe(false);
    // 飛ばしてもログは全部残る。見逃しても後から読める
    expect(skipped.log.length).toBeGreaterThan(displayLog(stepped).length);
  });

  it('再生していないときの再生イベントは無視される', () => {
    const state = settle(playing());
    expect(reduce(state, { type: 'advancePlayback' })).toBe(state);
    expect(reduce(state, { type: 'skipPlayback' })).toBe(state);
  });

  it('死に出しの解決も再生される (SPEC §5.7)', () => {
    let sawReplacementPlayback = false;
    let previousTurn: FlowState['turn'] = null;

    playOut(toBattle('ai'), (state) => {
      // 直前が死に出しの入力で、いま再生中なら、それは死に出しの再生
      if (previousTurn?.kind === 'awaitReplacement' && isPlaying(state)) {
        sawReplacementPlayback = true;
      }
      if (!isPlaying(state)) previousTurn = state.turn;
    });

    expect(sawReplacementPlayback).toBe(true);
  });

  it('AI戦は確認を挟まずすぐ再生を始める', () => {
    expect(isAwaitingPlayback(playing())).toBe(false);
  });

  it('決着のターンも最後まで再生してから結果画面へ行く', () => {
    let lastBattleState: FlowState | null = null;
    const final = playOut(toBattle('ai'), (state) => {
      lastBattleState = state;
    });

    expect(final.screen.kind).toBe('result');
    // バトル画面の最後の状態は再生中だった = 決着の様子を見せてから遷移している
    expect(lastBattleState).not.toBeNull();
  });
});

/**
 * 対人戦は片方が宣言した直後に再生を始めると、端末を持っていないもう一方が解決を見逃す。
 * **確認で止まっている間に解決後の盤面を見せてはいけない** ─ 結果が先に出てしまう。
 */
describe('flow — 再生前の共有確認 (対人戦)', () => {
  /** 対人戦で両者が宣言し、再生の開始待ちになった状態 */
  const awaiting = (): FlowState => {
    let state = toBattle('hotseat');
    for (let i = 0; i < 4 && !isAwaitingPlayback(state); i++) {
      const turn = state.turn;
      if (turn?.kind === 'actionGate') {
        state = reduce(state, { type: 'confirmGate' });
      } else if (turn?.kind === 'awaitAction') {
        const action = legalActionsFor(state, turn.side)[0];
        if (!action) throw new Error('合法手がありません');
        state = reduce(state, { type: 'declareAction', action });
      }
    }
    return state;
  };

  it('両者の宣言が揃うと、再生を始めずに確認で止まる', () => {
    const state = awaiting();

    expect(isAwaitingPlayback(state)).toBe(true);
    expect(isPlaying(state)).toBe(true); // 入力は受け付けない
    expect(state.turn).toBeNull();
    expect(currentFrame(state)).toBeNull();
  });

  it('確認中の盤面は解決前のまま。結果が先に見えない', () => {
    const state = awaiting();

    expect(displayBattle(state)).toBe(state.playback?.before);
    expect(displayBattle(state)).not.toBe(state.battle);
    // 解決前なのでターン数もまだ増えていない
    expect(displayBattle(state)?.turn).toBeLessThan(state.battle?.turn ?? 0);
  });

  it('確認中はログも増えない。見出しだけが出ている', () => {
    const state = awaiting();
    expect(displayLog(state)).toBe(state.log);
    expect(displayLog(state).every((entry) => entry.type === 'turnHeading')).toBe(true);
  });

  it('確認中も行動宣言は受け付けない', () => {
    const state = awaiting();
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');

    expect(reduce(state, { type: 'declareAction', action })).toBe(state);
  });

  it('advancePlayback で再生が始まる。コマは先頭から', () => {
    const started = reduce(awaiting(), { type: 'advancePlayback' });

    expect(isAwaitingPlayback(started)).toBe(false);
    expect(started.playback?.index).toBe(0);
    expect(currentFrame(started)).toBe(started.playback?.frames[0]);
  });

  it('死に出しの解決前にも確認が入る (SPEC §5.7)', () => {
    let sawReplacementGate = false;
    let previousTurn: FlowState['turn'] = null;

    playOut(toBattle('hotseat'), (state) => {
      if (previousTurn?.kind === 'awaitReplacement' && isAwaitingPlayback(state)) {
        sawReplacementGate = true;
      }
      if (!isPlaying(state)) previousTurn = state.turn;
    });

    expect(sawReplacementGate).toBe(true);
  });
});

/**
 * 全画面で覆うゲートは選出前だけ。バトル中に盤面まで消すと、
 * 解決を見終わった瞬間に結果が画面から消えてしまう (SPEC §11)。
 */
describe('flow — 全画面ゲートは選出前だけ', () => {
  it('選出前のゲートは文言を返す', () => {
    const state = run(start('hotseat'), [
      { type: 'setParty', party: PARTY_A },
      { type: 'setParty', party: PARTY_B },
    ]);
    expect(gateMessage(state)).toBe('プレイヤー1 の選出です');
  });

  it('バトル中はどの段でも null。操作欄に出すため', () => {
    let state = toBattle('hotseat');
    let sawActionGate = false;
    let sawReplacementGate = false;

    for (let i = 0; i < 400 && state.screen.kind === 'battle'; i++) {
      expect(gateMessage(state)).toBeNull();

      if (isPlaying(state)) {
        state = reduce(state, { type: 'advancePlayback' });
        continue;
      }
      const turn = state.turn;
      if (!turn) break;
      if (turn.kind === 'actionGate') sawActionGate = true;
      if (turn.kind === 'replacementGate') sawReplacementGate = true;

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

    // ゲートの段を実際に通っていることを確かめる (素通りしていたら意味がない)
    expect(sawActionGate).toBe(true);
    expect(sawReplacementGate).toBe(true);
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
