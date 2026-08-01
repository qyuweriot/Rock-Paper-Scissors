/**
 * 画面遷移・入力秘匿・ターン進行の状態機械 (PLAN §279-301 / SPEC §11)。
 *
 * **UI のロジックはすべてここに集約する。** コンポーネントは描画とディスパッチだけを行う。
 * バグが出るのは描画ではなく遷移(特に対人戦の秘匿フロー)なので、
 * ここを純粋関数にしておけば jsdom なしで vitest から押さえられる。
 *
 * リデューサは純粋。AI インスタンスは Lv1 だけ内部にシードを持つため使い回さず、
 * `FlowState.rngSeed` からその都度作って engine/rng.ts でシードを進める。
 * これにより **同じ操作列からは常に同じ試合になる**。
 */

import {
  createBattle,
  getLegalActions,
  resolveReplacements,
  resolveTurn,
} from '../engine/battle';
import { nextInt } from '../engine/rng';
import { createAi, type AiLevel } from '../ai';
import { draftParty, draftTeam } from '../ai/draft';
import { PARTY_SIZE, TEAM_SIZE } from '../engine/constants';
import type { UnitId } from '../data/units';
import type { Action, BattleEvent, BattleResult, BattleState, Side } from '../engine/types';
import { AI_LABELS, HOTSEAT_LABELS, turnHeading, type LogEntry } from './log';
import { buildFrames, type Frame } from './playback';

export type Mode = 'ai' | 'hotseat';

/** AI戦では p1 が人間、p2 が AI */
export const HUMAN: Side = 'p1';
export const OPPONENT: Side = 'p2';

const SIDES: readonly Side[] = ['p1', 'p2'];

// --- 画面 -------------------------------------------------------------------

export type Screen =
  | { kind: 'mode' }
  /** 15種から5体 (SPEC §1)。対人戦は p1 → p2 の順に2回 */
  | { kind: 'party'; side: Side }
  /**
   * 「プレイヤーNの選出です」(SPEC §11)。対人戦のみ。
   * パーティーの相互公開 (SPEC §1) は選出画面が両者を並べることで満たす ─
   * 専用の公開画面は同じ内容を二度見せるだけだったので置かない。
   */
  | { kind: 'selectGate'; side: Side }
  /** 5体から3体 (SPEC §1) */
  | { kind: 'select'; side: Side }
  | { kind: 'battle' }
  | { kind: 'result'; result: BattleResult };

/**
 * バトル中の入力の段。
 * 対人戦は Gate を挟み、AI戦は素通りする。
 */
export type TurnPhase =
  | { kind: 'actionGate'; side: Side }
  | { kind: 'awaitAction'; side: Side }
  | { kind: 'replacementGate'; side: Side }
  | { kind: 'awaitReplacement'; side: Side };

export interface Playback {
  /**
   * 解決**前**の盤面。`awaitingStart` の間はこれを見せる。
   * `frames[0]` は既に1件目のイベントを適用した後なので、解決前の絵はここにしかない。
   */
  before: BattleState;
  frames: Frame[];
  index: number;
  /**
   * 再生開始待ち。対人戦で「2人とも画面を見ているか」を確認するために挟む (PLAN §7)。
   * **待機中に解決後の盤面を見せてはいけない。** 確認画面に結果が先に出てしまう。
   */
  awaitingStart: boolean;
}

export interface FlowState {
  mode: Mode;
  aiLevel: AiLevel;
  parties: Record<Side, UnitId[]>;
  teams: Record<Side, UnitId[]>;
  screen: Screen;
  battle: BattleState | null;
  /** screen が battle のときのみ非 null */
  turn: TurnPhase | null;
  /** 宣言済みの行動。両者揃ったら resolveTurn に渡す */
  declared: Partial<Record<Side, Action>>;
  /** 死に出しの選択。phase.sides のぶんが揃ったら resolveReplacements に渡す */
  replacements: Partial<Record<Side, number>>;
  /**
   * 一度でも場に出たユニットの party 添字 (SPEC §11)。
   * **控えに戻っても公開し続ける**ため、現在の場のユニットとは別に持つ。
   */
  revealed: Record<Side, number[]>;
  /**
   * ターン解決の再生 (1ステップずつ見せる)。null なら再生していない。
   * **再生中は入力を受け付けない。** `turn` を立てるのは再生が終わってから。
   */
  playback: Playback | null;
  log: LogEntry[];
  /** 団扇の抽選とAIの編成に使う (PLAN §3.4) */
  rngSeed: number;
}

export type FlowEvent =
  | { type: 'chooseMode'; mode: Mode; aiLevel: AiLevel }
  | { type: 'setParty'; party: UnitId[] }
  | { type: 'confirmGate' }
  | { type: 'setTeam'; team: UnitId[] }
  | { type: 'declareAction'; action: Action }
  | { type: 'declareReplacement'; partyIndex: number }
  /** 再生を1コマ進める。開始待ちなら再生を始め、末尾まで来たら本編を再開する */
  | { type: 'advancePlayback' }
  /** 残りのコマを飛ばして本編を再開する */
  | { type: 'skipPlayback' }
  | { type: 'restart' }
  | { type: 'toTitle' };

// --- 生成 -------------------------------------------------------------------

export function initialState(seed: number): FlowState {
  return {
    mode: 'ai',
    aiLevel: 2,
    parties: { p1: [], p2: [] },
    teams: { p1: [], p2: [] },
    screen: { kind: 'mode' },
    battle: null,
    turn: null,
    declared: {},
    replacements: {},
    revealed: { p1: [], p2: [] },
    playback: null,
    log: [],
    rngSeed: seed,
  };
}

// --- 補助 -------------------------------------------------------------------

function opponentOf(side: Side): Side {
  return side === 'p1' ? 'p2' : 'p1';
}

export function sideLabels(mode: Mode) {
  return mode === 'ai' ? AI_LABELS : HOTSEAT_LABELS;
}

/** その陣営を人間が操作するか。AI戦では p2 が AI */
export function isHumanSide(state: FlowState, side: Side): boolean {
  return state.mode === 'hotseat' || side === HUMAN;
}

/** 死に出しの候補。生存している控えの party 添字 */
export function replacementOptions(state: FlowState, side: Side): number[] {
  const battle = state.battle;
  if (!battle) return [];
  const sideState = battle.sides[side];
  const options: number[] = [];
  sideState.party.forEach((unit, index) => {
    if (!unit.fainted && index !== sideState.activeIndex) options.push(index);
  });
  return options;
}

/**
 * 人間に見せてよい行動の一覧。
 *
 * **合法手を自分で組み立てない。** 使い切った技 (SPEC §10.11) や控え全滅時の
 * 選択技 (SPEC §10.13) の扱いはエンジンが既に持っている。
 */
export function legalActionsFor(state: FlowState, side: Side): Action[] {
  return state.battle ? getLegalActions(state.battle, side) : [];
}

// --- ターン進行 -------------------------------------------------------------

/**
 * 次に誰の入力を待つかを決める。AI の番なら勝手に決めて先へ進む。
 *
 * 行動宣言 → ターン解決 → 死に出し → 次のターン、が1本の再帰で流れる。
 * 途中で人間の入力が要るところだけ `turn` を立てて止まる。
 */
function advance(state: FlowState): FlowState {
  const battle = state.battle;
  if (!battle) return state;

  if (battle.phase.kind === 'ended') {
    return { ...state, screen: { kind: 'result', result: battle.phase.result }, turn: null };
  }

  if (battle.phase.kind === 'awaitingReplacement') return advanceReplacement(state, battle);
  return advanceAction(state, battle);
}

function advanceAction(state: FlowState, battle: BattleState): FlowState {
  // まだ宣言していない陣営を p1 → p2 の順に探す
  const pending = SIDES.find((side) => state.declared[side] === undefined);

  if (pending) {
    if (!isHumanSide(state, pending)) {
      const { ai, seed } = takeAi(state);
      return advance({
        ...state,
        rngSeed: seed,
        declared: { ...state.declared, [pending]: ai.chooseAction(battle, pending) },
      });
    }
    // 対人戦は宣言のたびにゲートを挟む (SPEC §11)。AI戦は自分だけなので不要
    const needsGate = state.mode === 'hotseat';
    return {
      ...state,
      turn: { kind: needsGate ? 'actionGate' : 'awaitAction', side: pending },
    };
  }

  // 両者の宣言が揃った
  const p1 = state.declared.p1;
  const p2 = state.declared.p2;
  if (!p1 || !p2) return state;

  const step = resolveTurn(battle, { p1, p2 });
  return startPlayback(
    { ...state, battle: step.state, declared: {} },
    battle,
    step.events,
    turnHeading(battle.turn),
  );
}

function advanceReplacement(state: FlowState, battle: BattleState): FlowState {
  if (battle.phase.kind !== 'awaitingReplacement') return state;
  const waiting = battle.phase.sides;

  const pending = waiting.find((side) => state.replacements[side] === undefined);

  if (pending) {
    if (!isHumanSide(state, pending)) {
      const { ai, seed } = takeAi(state);
      return advance({
        ...state,
        rngSeed: seed,
        replacements: { ...state.replacements, [pending]: ai.chooseReplacement(battle, pending) },
      });
    }
    /**
     * 死に出しの秘匿。SPEC §11 は選出と行動宣言しか規定していないが、
     * **両軍が同時に選ぶ場面で片方の選択を見せると情報が漏れる**ため同じ扱いにする。
     * 片方だけなら相手に選択肢がないので、ゲートは挟まない。
     */
    const needsGate = state.mode === 'hotseat' && waiting.length > 1;
    return {
      ...state,
      turn: { kind: needsGate ? 'replacementGate' : 'awaitReplacement', side: pending },
    };
  }

  const step = resolveReplacements(battle, state.replacements);
  return startPlayback({ ...state, battle: step.state, replacements: {} }, battle, step.events, null);
}

// --- 再生 -------------------------------------------------------------------

/**
 * ターン解決の結果を「1コマずつ見せる」状態にして止める。
 *
 * **ここで advance を呼ばない。** 呼ぶと次の入力待ちまで一気に進んでしまい、
 * 何が起きたのか見えないまま盤面だけが変わる。再生が終わってから再開する。
 *
 * イベントが1件もなければ再生することがないので、そのまま本編を進める。
 *
 * 対人戦は `awaitingStart` で一度止まる。片方が宣言した直後に再生を始めると、
 * 端末を持っていないもう一方が解決を見逃すため。
 */
function startPlayback(
  state: FlowState,
  before: BattleState,
  events: BattleEvent[],
  heading: LogEntry | null,
): FlowState {
  const log = heading ? [...state.log, heading] : state.log;
  if (events.length === 0) return advance({ ...state, log });

  const frames = buildFrames(before, events, state.revealed, sideLabels(state.mode));
  return {
    ...state,
    log,
    playback: { before, frames, index: 0, awaitingStart: state.mode === 'hotseat' },
    turn: null,
  };
}

/**
 * 再生を終えて本編を再開する。
 *
 * 再生中に見せていた盤面は**イベントから組み直した表示用のもの**なので、
 * ここでエンジンの権威ある状態 (`state.battle`) に戻す。
 * 表示用の再構成が本編に漏れないのはこの一手のおかげ。
 */
function finishPlayback(state: FlowState): FlowState {
  const playback = state.playback;
  if (!playback) return state;

  const last = playback.frames[playback.frames.length - 1];
  return advance({
    ...state,
    playback: null,
    revealed: last ? last.revealed : state.revealed,
    log: [...state.log, ...playback.frames.map((frame) => frame.entry)],
  });
}

/** AI を1体作り、シードを進めた状態を返す */
function takeAi(state: FlowState) {
  const rolled = nextInt(state.rngSeed, 0x7fffffff);
  return { ai: createAi(state.aiLevel, rolled.value), seed: rolled.seed };
}

// --- リデューサ -------------------------------------------------------------

export function reduce(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case 'chooseMode': {
      const fresh = initialState(state.rngSeed);
      return {
        ...fresh,
        mode: event.mode,
        aiLevel: event.aiLevel,
        screen: { kind: 'party', side: HUMAN },
      };
    }

    case 'setParty':
      return setParty(state, event.party);

    case 'confirmGate':
      return confirmGate(state);

    case 'setTeam':
      return setTeam(state, event.team);

    case 'declareAction': {
      if (state.playback) return state; // 再生中は受け付けない
      if (state.turn?.kind !== 'awaitAction') return state;
      const side = state.turn.side;
      return advance({
        ...state,
        turn: null,
        declared: { ...state.declared, [side]: event.action },
      });
    }

    case 'declareReplacement': {
      if (state.playback) return state; // 再生中は受け付けない
      if (state.turn?.kind !== 'awaitReplacement') return state;
      const side = state.turn.side;
      return advance({
        ...state,
        turn: null,
        replacements: { ...state.replacements, [side]: event.partyIndex },
      });
    }

    case 'advancePlayback': {
      const playback = state.playback;
      if (!playback) return state;
      // 開始待ちなら「再生する」の意味になる。コマは進めない
      if (playback.awaitingStart) {
        return { ...state, playback: { ...playback, awaitingStart: false } };
      }
      const next = playback.index + 1;
      // 末尾を過ぎたら本編を再開する
      if (next >= playback.frames.length) return finishPlayback(state);
      return { ...state, playback: { ...playback, index: next } };
    }

    case 'skipPlayback':
      return state.playback ? finishPlayback(state) : state;

    case 'restart':
      // 同じモード・同じ難易度で編成からやり直す
      return {
        ...initialState(state.rngSeed),
        mode: state.mode,
        aiLevel: state.aiLevel,
        screen: { kind: 'party', side: HUMAN },
      };

    case 'toTitle':
      return initialState(state.rngSeed);
  }
}

function setParty(state: FlowState, party: UnitId[]): FlowState {
  if (state.screen.kind !== 'party') return state;
  if (party.length !== PARTY_SIZE) return state;

  const side = state.screen.side;
  const parties = { ...state.parties, [side]: party };

  // 対人戦は p1 → p2 の順に編成する。パーティーは相互公開されるので秘匿は不要 (SPEC §1)
  if (state.mode === 'hotseat' && side === HUMAN) {
    return { ...state, parties, screen: { kind: 'party', side: OPPONENT } };
  }

  // 編成が揃ったら公開画面を挟まずに選出へ進む。相手の5体は選出画面に並ぶ
  if (state.mode === 'ai') {
    const drafted = draftParty(state.rngSeed);
    return {
      ...state,
      parties: { ...parties, [OPPONENT]: drafted.party },
      rngSeed: drafted.seed,
      screen: { kind: 'select', side: HUMAN },
    };
  }

  return { ...state, parties, screen: { kind: 'selectGate', side: HUMAN } };
}

function confirmGate(state: FlowState): FlowState {
  // 選出前のゲート
  if (state.screen.kind === 'selectGate') {
    return { ...state, screen: { kind: 'select', side: state.screen.side } };
  }

  // バトル中のゲート
  if (state.turn?.kind === 'actionGate') {
    return { ...state, turn: { kind: 'awaitAction', side: state.turn.side } };
  }
  if (state.turn?.kind === 'replacementGate') {
    return { ...state, turn: { kind: 'awaitReplacement', side: state.turn.side } };
  }

  return state;
}

function setTeam(state: FlowState, team: UnitId[]): FlowState {
  if (state.screen.kind !== 'select') return state;
  if (team.length !== TEAM_SIZE) return state;

  const side = state.screen.side;
  const teams = { ...state.teams, [side]: team };

  // 対人戦は p1 の選出を画面から消してから p2 へ (SPEC §11)
  if (state.mode === 'hotseat' && side === HUMAN) {
    return { ...state, teams, screen: { kind: 'selectGate', side: OPPONENT } };
  }

  const finalTeams =
    state.mode === 'ai'
      ? { ...teams, [OPPONENT]: draftTeam(state.parties[OPPONENT], state.parties[HUMAN]) }
      : teams;

  return advance({
    ...state,
    teams: finalTeams,
    battle: createBattle(finalTeams.p1, finalTeams.p2, state.rngSeed),
    screen: { kind: 'battle' },
    declared: {},
    replacements: {},
    // 試合開始時は双方の先頭が場に出ている
    revealed: { p1: [0], p2: [0] },
    log: [],
  });
}

// --- 表示用の派生 -----------------------------------------------------------

// --- 表示用の派生 -----------------------------------------------------------
//
// **コンポーネントは生の state.battle を見ない。** 再生中は組み直した盤面を見せ、
// 再生が終わったらエンジンの状態に戻る。この一枚を挟むことで、
// 「表示は途中、判定は最終」という取り違えが起きなくなる。

/** いま画面に出すべき盤面 */
export function displayBattle(state: FlowState): BattleState | null {
  const playback = state.playback;
  // 開始待ちは解決前の絵。state.battle は既に解決後なので、そのまま出すと結果が先に見える
  if (playback?.awaitingStart) return playback.before;
  const frame = currentFrame(state);
  return frame ? frame.battle : state.battle;
}

/** いま画面に出すべきログ。再生中は再生済みのぶんだけ */
export function displayLog(state: FlowState): LogEntry[] {
  const playback = state.playback;
  if (!playback || playback.awaitingStart) return state.log;
  return [...state.log, ...playback.frames.slice(0, playback.index + 1).map((f) => f.entry)];
}

/** いま公開されている相手のユニット (SPEC §11)。交代のコマで初めて増える */
export function displayRevealed(state: FlowState): Record<Side, number[]> {
  const frame = currentFrame(state);
  return frame ? frame.revealed : state.revealed;
}

/** 再生中のコマ。エフェクトの元になる。開始待ちの間は何も再生していない */
export function currentFrame(state: FlowState): Frame | null {
  const playback = state.playback;
  if (!playback || playback.awaitingStart) return null;
  return playback.frames[playback.index] ?? null;
}

/** 再生の最中、または開始待ち。どちらも行動入力は受け付けない */
export function isPlaying(state: FlowState): boolean {
  return state.playback !== null;
}

/** 「2人とも画面を見ていますか?」で止まっているか (対人戦のみ) */
export function isAwaitingPlayback(state: FlowState): boolean {
  return state.playback?.awaitingStart === true;
}

/**
 * 全画面のゲートに出す文言。**選出前だけ**。
 *
 * バトル中のゲートは全画面にしない (→ components/PanelGate)。
 * 盤面まで消してしまうと、解決を見終わった瞬間に結果が画面から消える。
 */
export function gateMessage(state: FlowState): string | null {
  if (state.screen.kind === 'selectGate') {
    return `${HOTSEAT_LABELS[state.screen.side]} の選出です`;
  }
  return null;
}

/** いま入力を求められている陣営。誰も待っていなければ null */
export function activeInputSide(state: FlowState): Side | null {
  if (state.turn?.kind === 'awaitAction' || state.turn?.kind === 'awaitReplacement') {
    return state.turn.side;
  }
  return null;
}

/**
 * そのユニットの中身を見せてよいか (SPEC §11)。
 *
 * 隠すのは「相手の控えの中身」だけ。次の場合は公開する:
 * - 自分の陣営
 * - **一度でも場に出たユニット**(控えに戻っても公開し続ける)
 *
 * **AI戦でも相手の控えは隠す。** 選出画面で公開されるのはパーティー5体であって、
 * そこから選ばれた3体ではない。以前はここで無条件に公開しており、
 * 試合開始時点で相手の選出が読めてしまっていた。
 */
export function isUnitVisible(
  state: FlowState,
  side: Side,
  partyIndex: number,
  viewer: Side | null,
): boolean {
  // AI戦の観戦者は常に人間 (p1)。対人戦は入力中の陣営が観戦者になる
  const seat = state.mode === 'ai' ? HUMAN : viewer;
  if (seat === side) return true;
  return displayRevealed(state)[side].includes(partyIndex);
}

export { opponentOf };
