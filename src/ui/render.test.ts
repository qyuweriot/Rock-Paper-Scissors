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
import { PartyDetail } from './components/PartyDetail';
import { RulesOverlay } from './components/RulesOverlay';
import { RULE_SECTIONS } from './rules';
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
import { UNIT_DISPLAY_ORDER } from './order';

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
    onAdvancePlayback: noop,
    onSkipPlayback: noop,
  };
};

describe('画面の描画', () => {
  it('モード選択', () => {
    const html = renderToStaticMarkup(h(ModeScreen, { onStart: noop, onShowRules: noop }));
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

/**
 * 並び順は UNIT_IDS ではなく UNIT_DISPLAY_ORDER で決まる。
 * **押した順に左右されない**ことが要件なので、順序そのものを検査する。
 */
describe('ユニットの並び順', () => {
  /** 名前が HTML に現れる順番を返す */
  const orderOf = (html: string, ids: readonly UnitId[]): UnitId[] =>
    [...ids].sort((a, b) => html.indexOf(getUnit(a).name) - html.indexOf(getUnit(b).name));

  it('編成画面は表示順に15種を並べる', () => {
    const html = renderToStaticMarkup(h(PartyScreen, { side: 'p1', showSide: true, onSubmit: noop }));
    expect(orderOf(html, UNIT_DISPLAY_ORDER)).toEqual([...UNIT_DISPLAY_ORDER]);
  });

  it('選出画面は押した順ではなく表示順に並べる', () => {
    // わざと表示順と逆に近い順で渡す
    const picked: UnitId[] = ['magyu', 'utsuwa', 'kami', 'kenro', 'ishi'];
    const html = renderToStaticMarkup(
      h(SelectionScreen, {
        side: 'p1',
        own: picked,
        opponent: PARTY_B,
        labels: sideLabels('hotseat'),
        showSide: true,
        onSubmit: noop,
      }),
    );

    const mine = html.slice(html.indexOf('select-column--left'), html.indexOf('select-column--right'));
    expect(orderOf(mine, picked)).toEqual(['ishi', 'kenro', 'magyu', 'kami', 'utsuwa']);
  });
});

describe('今回足した表示', () => {
  it('左右のステージ。左が p1、右が p2 で固定 (手番で入れ替わらない)', () => {
    for (const mode of ['ai', 'hotseat'] as const) {
      const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle(mode), mode)));
      const left = html.indexOf('stage-unit--left');
      const right = html.indexOf('stage-unit--right');

      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThan(right);
      // 左のカードに p1 の場のユニット (石) が入る
      expect(html.slice(left, right)).toContain('石');
    }
  });

  /**
   * 設置バッジや控えの数で meta の行数が変わっても、カードの上端がずれないこと。
   * **meta と カードが同じ grid 行に入っている**ことで高さが揃う ─
   * 陣営ごとのラッパーで包んでいたときはずれていた。
   */
  it('meta とカードが grid の別々の行にある (上端のずれ防止)', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));

    // 2つの meta が並んでから、2つのカードが並ぶ
    expect(html.indexOf('stage__meta--left')).toBeLessThan(html.indexOf('stage__meta--right'));
    expect(html.indexOf('stage__meta--right')).toBeLessThan(html.indexOf('stage-unit--left'));
    // 陣営ごとのラッパーは残っていない
    expect(html).not.toContain('stage__side');
  });

  it('技に「いま打ったら何ダメージか」が出る', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));
    // 石 gu 技0 威力25 → はさみ choki は有利 (+25)
    expect(html).toContain('→ 50');
    expect(html).toContain('基本25 相性+25');
  });

  it('速度が「速度速」ではなく1文字のバッジで出る', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));

    // バッジの中身は1文字だけ。「速度」は title 属性にだけ残す
    const badges = [...html.matchAll(/class="speed-badge[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(badges.length).toBeGreaterThan(0);
    for (const text of badges) {
      expect(['速', '中', '遅']).toContain(text);
    }

    // 地の文としての「速度速」表記は残っていない
    expect(html).not.toContain('>速度');
    expect(html).not.toContain('速度速<');
  });

  it('対戦中のカードにも属性の色クラスが付く', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));
    // 石 (グー) が場にいる
    expect(html).toContain('stage-unit--gu');
    expect(html).toContain('attr-label--gu');
  });

  it('交代ボタンが控えの詳細と同じカードになっている', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));
    const switches = html.slice(html.indexOf('actions__grid--cards'));

    // 控えは 器 と 魔球。カードなので効果テキストまで入る
    expect(switches).toContain('unit-card');
    expect(switches).toContain('器');
    expect(switches).toContain('控えの生存ユニット1体を選択し、HPを15回復する。');
    expect(switches).toContain('hp__track'); // HPバーも出る
  });

  /**
   * 控えの位置が「ラベルの横」と「1行下」で揺れていた。
   * flex-wrap に任せず、**1行目=ラベル+設置、2行目=控え** に固定してある。
   */
  it('控えは必ずラベルの1行下に出る', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));

    // meta の中で「見出し行」が閉じてから控えが始まる
    const meta = html.slice(html.indexOf('stage__meta--left'), html.indexOf('stage__meta--right'));
    expect(meta).toContain('stage__meta-head');
    expect(meta.indexOf('stage__meta-head')).toBeLessThan(meta.indexOf('bench-dots'));
    // 控えは見出し行の外にある (中に入っていると横並びに戻る)
    expect(meta.indexOf('</div>')).toBeLessThan(meta.indexOf('bench-dots'));
  });

  it('再生中はタップの案内とスキップが両方出る', () => {
    const state = toBattle('ai');
    const action = legalActionsFor(state, 'p1')[0];
    if (!action) throw new Error('合法手がありません');
    const html = renderToStaticMarkup(
      h(BattleScreen, battleProps(reduce(state, { type: 'declareAction', action }), 'ai')),
    );

    expect(html).toContain('画面をタップで次へ');
    expect(html).toContain('スキップ');
    // 全画面のタップ層は「1コマ進める」
    expect(html).toContain('aria-label="1コマ進める"');
  });

  /**
   * 編成5体はいつでも見返せる (SPEC §1 で相互公開)。ただし
   * **どの3体を選出したかは分からないままにする** (SPEC §11)。
   * `UnitState` を渡さない形にしてあるので、HPも状態も出ない。
   */
  it('相手の編成5体を開ける。選出の印は付かない', () => {
    const state = toBattle('hotseat');
    const html = renderToStaticMarkup(
      h(PartyDetail, { label: 'プレイヤー2', party: PARTY_B, onClose: noop }),
    );

    // 5体すべてが読める
    for (const id of PARTY_B) {
      expect(html).toContain(getUnit(id).name);
    }
    expect(html).toContain('プレイヤー2 の編成');

    // 選出3体を絞り込む手掛かりを出さない
    expect(html).not.toContain('hp__track'); // HPバー = 場に出た証拠になる
    expect(html).not.toContain('is-selected');
    expect(html).not.toContain('badges');

    // 盤面側にも入口がある
    const stage = renderToStaticMarkup(h(BattleScreen, battleProps(state, 'hotseat')));
    expect(stage).toContain('stage__party-button');
  });

  /**
   * ルール説明 (SPEC §1〜§8)。**中身の検証は rules.test.ts** が受け持つので、
   * ここは描画経路が通ることと、タイトル画面から開けることだけを見る。
   */
  it('ルール説明が描け、タイトルに入口がある', () => {
    const html = renderToStaticMarkup(h(RulesOverlay, { onClose: noop }));

    for (const section of RULE_SECTIONS) {
      expect(html).toContain(section.heading);
    }

    const title = renderToStaticMarkup(h(ModeScreen, { onStart: noop, onShowRules: noop }));
    expect(title).toContain('ルールを見る');
  });

  /**
   * アイコン・名前・属性・速度は1行に収める。
   * **折り返しが起きると、その下のHPバーの高さがカードごとにずれる**ので、
   * 1行に収まる構造であることを検査する(高さそのものは CSS の話)。
   */
  it('ステージの名前・属性・速度が1行に並ぶ', () => {
    const html = renderToStaticMarkup(h(BattleScreen, battleProps(toBattle('ai'), 'ai')));

    const rows = html.split('stage-unit__name-row').slice(1);
    expect(rows.length).toBe(2); // 左右2体
    for (const row of rows) {
      const head = row.slice(0, row.indexOf('</div>'));
      expect(head.indexOf('stage-unit__name')).toBeLessThan(head.indexOf('stage-unit__tags'));
      expect(head).toContain('attr-label');
      expect(head).toContain('speed-badge');
    }
  });

  it('カードの見出しが「アイコン + 名前」と「属性 + 速度」の1行になっている', () => {
    const html = renderToStaticMarkup(h(PartyScreen, { side: 'p1', showSide: true, onSubmit: noop }));

    const heads = html.split('unit-card__head').slice(1);
    expect(heads.length).toBe(15);
    for (const head of heads) {
      // 左のかたまりにアイコンと名前が入り、属性・速度はその兄弟として続く
      expect(head.indexOf('unit-card__title')).toBeLessThan(head.indexOf('unit-card__icon'));
      expect(head.indexOf('unit-card__icon')).toBeLessThan(head.indexOf('unit-card__name'));
      expect(head.indexOf('unit-card__name')).toBeLessThan(head.indexOf('unit-card__tags'));
    }
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
    // バーの色分けは残す (何点消えるかを目で見る仕掛け)
    expect(html).toContain('hp__fill--poison');
    // **文字はバッジ側だけ。** HP数値の横に重ねて出さない
    expect(html).toContain('毒 2重 (20/ターン)');
    expect(html).not.toContain('毒 −20');
    expect(html).not.toContain('hp__poison');
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
    expect(html).toContain('stage-unit--left');
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
