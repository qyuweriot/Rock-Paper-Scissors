/**
 * 全画面のスモークテスト。
 *
 * **コンポーネントテストではない。** 検証するのは「描画経路が例外なく通り、
 * 主要な文言が出ること」だけで、操作は行わない。react-dom/server を使うので
 * jsdom も testing-library も要らず、**依存追加ゼロ**で済む。
 *
 * 遷移そのものは flow.test.ts、文言の生成は log.test.ts が受け持つ。
 * ここは「画面に繋いだときに落ちない」ことを押さえる。
 */

import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ModeScreen } from './screens/ModeScreen';
import { PartyScreen } from './screens/PartyScreen';
import { SelectionScreen } from './screens/SelectionScreen';
import { BattleScreen } from './screens/BattleScreen';
import { ResultScreen } from './screens/ResultScreen';
import { HandoffGate } from './components/HandoffGate';
import {
  currentFrame,
  displayBattle,
  initialState,
  isAwaitingPlayback,
  isPlaying,
  legalActionsFor,
  reduce,
  replacementOptions,
  sideLabels,
  type FlowEvent,
  type FlowState,
} from './flow';
import { getUnit, type UnitId } from '../data/units';
import { UNIT_ICONS } from './icons';

const PARTY_A: UnitId[] = ['ishi', 'kenro', 'kami', 'utsuwa', 'magyu'];
const PARTY_B: UnitId[] = ['hasami', 'ghost', 'bara', 'uchiwa', 'tenohira'];
const TEAM_A: UnitId[] = ['ishi', 'utsuwa', 'magyu'];
const TEAM_B: UnitId[] = ['hasami', 'ghost', 'bara'];
const noop = () => undefined;

const run = (s: FlowState, events: FlowEvent[]) => events.reduce((c, e) => reduce(c, e), s);

function toBattle(mode: 'ai' | 'hotseat'): FlowState {
  const base = reduce(initialState(4242), { type: 'chooseMode', mode, aiLevel: 2 });
  const events: FlowEvent[] =
    mode === 'ai'
      ? [
          { type: 'setParty', party: PARTY_A },
          { type: 'confirmGate' },
          { type: 'setTeam', team: TEAM_A },
        ]
      : [
          { type: 'setParty', party: PARTY_A },
          { type: 'setParty', party: PARTY_B },
          { type: 'confirmGate' },
          { type: 'confirmGate' },
          { type: 'setTeam', team: TEAM_A },
          { type: 'confirmGate' },
          { type: 'setTeam', team: TEAM_B },
          { type: 'confirmGate' }, // p1 のゲートを通過して入力待ちにする
        ];
  return run(base, events);
}

const battleProps = (state: FlowState, mode: 'ai' | 'hotseat') => {
  // 画面が実際に使うのと同じ「表示用の盤面」を渡す。再生中はコマになる
  const battle = displayBattle(state);
  if (!battle) throw new Error('バトルが始まっていません');
  return {
    state,
    battle,
    labels: sideLabels(mode),
    onDeclareAction: noop,
    onDeclareReplacement: noop,
    onConfirmGate: noop,
    onStartPlayback: noop,
    onSkipPlayback: noop,
  };
};

describe('画面の描画', () => {
  it('モード選択', () => {
    const html = renderToStaticMarkup(h(ModeScreen, { onStart: noop }));
    expect(html).toContain('じゃんけんバトル');
    expect(html).toContain('AI戦');
    expect(html).toContain('対人戦');
    expect(html).toContain('Lv3'); // 難易度3段階が出ている
  });

  it('編成。15種のステータスと効果テキストが出る (PLAN §296)', () => {
    const html = renderToStaticMarkup(h(PartyScreen, { side: 'p1', showSide: true, onSubmit: noop }));
    expect(html).toContain('プレイヤー1 の編成');
    expect(html).toContain('粉砕');
    expect(html).toContain('不撓'); // 特性名
    expect(html).toContain('相手を倒した場合、この技の反動を受けない。'); // 効果テキスト
    expect(html).toContain('おまかせ');
  });

  it('選出。相手の編成を見ながら選べる', () => {
    const html = renderToStaticMarkup(
      h(SelectionScreen, {
        side: 'p1',
        own: PARTY_A,
        opponent: PARTY_B,
        labels: sideLabels('hotseat'),
        showSide: true,
        onSubmit: noop,
      }),
    );
    expect(html).toContain('プレイヤー1 の選出');
    // 左右に分かれ、自分の側に印が付く
    expect(html).toContain('select-column--left');
    expect(html).toContain('select-column--right');
    expect(html).toContain('あなた');
    // 公開画面をなくしたぶん、相手の技・特性までここで読める
    expect(html).toContain('はさみ');
    expect(html).toContain('受け切り'); // はさみ 技2 の名前
    expect(html).toContain('瀕死になったとき'); // ゴースト 特性の効果テキスト
  });

  /** 席が移っても配置が動かないこと。左は常に p1、右は常に p2 */
  it('選出画面の左右は、どちらの手番でも入れ替わらない', () => {
    const render = (side: 'p1' | 'p2') =>
      renderToStaticMarkup(
        h(SelectionScreen, {
          side,
          own: side === 'p1' ? PARTY_A : PARTY_B,
          opponent: side === 'p1' ? PARTY_B : PARTY_A,
          labels: sideLabels('hotseat'),
          showSide: true,
          onSubmit: noop,
        }),
      );

    for (const side of ['p1', 'p2'] as const) {
      // 見出しの「プレイヤーNの選出」を除き、2つの列だけを見る
      const stage = render(side).slice(render(side).indexOf('select-stage'));

      expect(stage.indexOf('select-column--left')).toBeLessThan(
        stage.indexOf('select-column--right'),
      );
      // 左の列がプレイヤー1、右の列がプレイヤー2
      expect(stage.indexOf('プレイヤー1')).toBeLessThan(stage.indexOf('プレイヤー2'));
    }
  });

  it('秘匿ゲート (SPEC §11)', () => {
    const html = renderToStaticMarkup(h(HandoffGate, { message: 'プレイヤー2 の入力です', onConfirm: noop }));
    expect(html).toContain('プレイヤー2 の入力です');
    expect(html).toContain('タップ');
  });

  it('バトル。HPバー・行動選択・ログが出る (PLAN §284)', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));
    expect(html).toContain('あなた');
    expect(html).toContain('相手');
    expect(html).toContain('の行動を選んでください');
    expect(html).toContain('バトルログ');
    expect(html).toContain('交代');
    expect(html).toContain('ターン目');
    expect(html).toContain('VS');
  });

  it('ステージにアイコンと効果テキストが出る (PLAN §296)', () => {
    const state = toBattle('ai');
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(state, 'ai')));

    // 先頭は石。アイコンと技の効果テキストが両方出ている
    expect(html).toContain(UNIT_ICONS.ishi);
    expect(html).toContain('威力25');
  });

  it('結果。勝ち負けと引き分けの両方 (SPEC §8)', () => {
    const win = renderToStaticMarkup(
      h(ResultScreen, { result: 'p1', labels: sideLabels('ai'), humanSide: 'p1', log: [], onRestart: noop, onToTitle: noop }),
    );
    expect(win).toContain('勝ち');
    expect(win).toContain('もう一度');

    const draw = renderToStaticMarkup(
      h(ResultScreen, { result: 'draw', labels: sideLabels('hotseat'), humanSide: null, log: [], onRestart: noop, onToTitle: noop }),
    );
    expect(draw).toContain('引き分け');
    expect(draw).toContain('相打ち');
  });
});

describe('対人戦の秘匿が描画にも効いている (SPEC §11)', () => {
  const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('hotseat'), 'hotseat')));

  it('相手の控えは伏せられる', () => {
    expect(html).toContain('bench-dot--hidden');
  });

  it('相手の控えの名前が漏れない', () => {
    // p2 の選出は はさみ / ゴースト / バラ。場に出ているのは先頭のみ
    expect(html).not.toContain('ゴースト');
    expect(html).not.toContain('バラ');
  });

  it('場に出ている相手は見える。盤面情報は公開してよい', () => {
    expect(html).toContain('はさみ');
  });
});

describe('AI戦を通しで完走できる (PLAN §301)', () => {
  it('決着まで進み、再生の全コマと死に出し画面を描画できる', () => {
    let state = toBattle('ai');
    let renderedReplacement = false;
    let renderedFrames = 0;

    for (let i = 0; i < 2000 && state.screen.kind === 'battle'; i++) {
      // どの段階でも描画できることを確かめる。再生の途中も含む
      expect(() => renderToStaticMarkup(h(BattleScreen, battleProps(state, 'ai')))).not.toThrow();

      if (isPlaying(state)) {
        renderedFrames += 1;
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
        const html = renderToStaticMarkup(h(BattleScreen, battleProps(state, 'ai')));
        expect(html).toContain('交代先を選んでください');
        renderedReplacement = true;

        const choice = replacementOptions(state, turn.side)[0];
        if (choice === undefined) throw new Error('交代先がありません');
        state = reduce(state, { type: 'declareReplacement', partyIndex: choice });
      }
    }

    expect(state.screen.kind).toBe('result');
    expect(renderedReplacement).toBe(true); // 死に出しを必ず通る
    expect(renderedFrames).toBeGreaterThan(20); // 再生のコマを大量に描いている
    expect(state.log.length).toBeGreaterThan(10);

    if (state.screen.kind === 'result') {
      const html = renderToStaticMarkup(
        h(ResultScreen, {
          result: state.screen.result,
          labels: sideLabels('ai'),
          humanSide: 'p1',
          log: state.log,
          onRestart: noop,
          onToTitle: noop,
        }),
      );
      expect(html).toContain('バトルログ');
    }
  });

  it('再生中はスキップが出て、行動選択は出ない', () => {
    const state = toBattle('ai');
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');
    const playing = reduce(state, { type: 'declareAction', action });
    expect(isPlaying(playing)).toBe(true);

    const html = renderToStaticMarkup(h(BattleScreen, battleProps(playing, 'ai')));
    expect(html).toContain('スキップ');
    expect(html).not.toContain('の行動を選んでください');
    // いま何が起きているかが中央に出る
    expect(html).toContain(currentFrame(playing)?.entry.text ?? '');
  });
});

describe('今回足した表示', () => {
  it('左右のステージ。左が p1、右が p2 で固定 (手番で入れ替わらない)', () => {
    for (const mode of ['ai', 'hotseat'] as const) {
      const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle(mode), mode)));
      const left = html.indexOf('stage__side--left');
      const right = html.indexOf('stage__side--right');

      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThan(right);
      // 左の列に p1 の場のユニット (石) が入る
      expect(html.slice(left, right)).toContain('石');
    }
  });

  it('技に「いま打ったら何ダメージか」が出る', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));
    // 石 gu 技0 威力25 → はさみ choki は有利 (+25)
    expect(html).toContain('→ 50');
    expect(html).toContain('基本25 相性+25');
  });

  it('控えを押せるようになっている', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));
    expect(html).toContain('bench-dot__button');
  });

  it('毒を受けているとHPバーに消えるぶんが出る (SPEC §7.1)', () => {
    const state = toBattle('ai');
    const battle = displayBattle(state);
    if (!battle) throw new Error('バトルが始まっていません');
    // 表示だけの検証なので、盤面を直接汚して描く
    const poisoned = structuredClone(battle);
    poisoned.sides.p1.party[poisoned.sides.p1.activeIndex]!.poisonStacks = 2;

    const html = renderToStaticMarkup(
      h(BattleScreen, { ...battleProps(state, 'ai'), battle: poisoned }),
    );
    expect(html).toContain('hp__fill--poison');
    expect(html).toContain('毒 −20');
  });

  it('対人戦は再生前に「2人とも画面を見ていますか?」で止まる', () => {
    let state = toBattle('hotseat');
    // 両者が宣言するまで進める
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
    expect(isAwaitingPlayback(state)).toBe(true);

    const html = renderToStaticMarkup(h(BattleScreen, battleProps(state, 'hotseat')));
    expect(html).toContain('2人とも画面を見ていますか');
    expect(html).toContain('再生する');
    // 確認中はスキップも行動選択も出ない
    expect(html).not.toContain('スキップ');
    expect(html).not.toContain('の行動を選んでください');
  });

  /**
   * `.slot` はバッジ + 中身の2列グリッド。**中身を直接並べると崩れる** ─
   * grid の自動配置に乗り、要素が増えたとき効果テキストが 2.4rem の列に
   * 押し込まれて1文字ずつ折り返す(実際に起きた)。
   */
  it('技リストの中身が slot__body にまとまっている(段組み崩れの再発防止)', () => {
    for (const html of [
      renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai'))),
      renderToStaticMarkup(
        h(SelectionScreen, {
          side: 'p1',
          own: PARTY_A,
          opponent: PARTY_B,
          labels: sideLabels('hotseat'),
          showSide: true,
          onSubmit: noop,
        }),
      ),
    ]) {
      // slot の直下に来てよいのは slot__kind と slot__body だけ
      const slots = html.split('class="slot ').slice(1);
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        const upToBody = slot.slice(0, slot.indexOf('slot__body'));
        expect(upToBody).toContain('slot__kind');
        // 本文や内訳がバッジと同列に並んでいない
        expect(upToBody).not.toContain('slot__text');
        expect(upToBody).not.toContain('slot__breakdown');
        expect(upToBody).not.toContain('slot__damage');
      }
    }
  });

  it('対人戦のゲート中も盤面が消えない(操作欄に出る)', () => {
    // p1 が宣言すると p2 のゲートになる
    const opened = toBattle('hotseat');
    const action = legalActionsFor(opened, 'p1')[0];
    if (!action) throw new Error('合法手がありません');
    const state = reduce(opened, { type: 'declareAction', action });
    expect(state.turn?.kind).toBe('actionGate');

    const html = renderToStaticMarkup(h(BattleScreen, battleProps(state, 'hotseat')));
    expect(html).toContain('panel-gate');
    expect(html).toContain('プレイヤー2 の入力です');
    // ステージ・HP・ログが出たまま
    expect(html).toContain('stage__side--left');
    expect(html).toContain('hp__track');
    expect(html).toContain('バトルログ');
    // ただし行動選択は出さない (SPEC §11)
    expect(html).not.toContain('の行動を選んでください');
  });

  it('AI戦でも相手の控えが伏せられている (SPEC §11)', () => {
    const state = toBattle('ai');
    const battle = displayBattle(state);
    if (!battle) throw new Error('バトルが始まっていません');
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(state, 'ai')));

    expect(html).toContain('bench-dot--hidden');

    // AI の選出は draftTeam が決めるので、盤面から名前を引いて突き合わせる
    const p2 = battle.sides.p2;
    p2.party.forEach((unit, index) => {
      const name = getUnit(unit.unitId as UnitId).name;
      if (index === p2.activeIndex) {
        expect(html).toContain(name); // 場に出ているものは見える
      } else {
        expect(html).not.toContain(name); // 控えは伏せる
      }
    });
  });
});
