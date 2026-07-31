/**
 * 「交代 → 設置ダメージ → 攻撃 → 反射 → 瀕死」のような連鎖が
 * **1コマずつ順番に**見えることを固定する。ユーザーの要望の核。
 *
 * 仮のスモークではなく、狙った盤面を作って順序そのものを検査する。
 */

import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildFrames, effectOf } from './playback';
import { HOTSEAT_LABELS } from './log';
import { BattleStage } from './components/BattleStage';
import { resolveTurn } from '../engine/battle';
import { makeBattle, move, setHazard, setHp, switchTo } from '../engine/testkit';
import { sideLabels } from './flow';
import type { Side } from '../engine/types';

const noRevealed = (): Record<Side, number[]> => ({ p1: [0], p2: [0] });

describe('連鎖が1コマずつ見える', () => {
  it('交代 → 設置ダメージ → 攻撃 の順にコマが並ぶ (SPEC §7.2)', () => {
    // p1 側に設置2枚。石が引っ込んでバラが出てきて設置を踏み、そこへ堅牢の攻撃
    const state = makeBattle(['ishi', 'bara'], ['kenro']);
    setHazard(state, 'p1', 2);

    const { events } = resolveTurn(state, { p1: switchTo(1), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    const at = (predicate: (i: number) => boolean) => frames.findIndex((_, i) => predicate(i));
    const switchAt = at((i) => frames[i]?.event.type === 'switch');
    const hazardAt = at((i) => {
      const e = frames[i]?.event;
      return e?.type === 'damage' && e.source === 'hazard';
    });
    const attackAt = at((i) => {
      const e = frames[i]?.event;
      return e?.type === 'damage' && e.source === 'move';
    });

    expect(switchAt).toBeGreaterThanOrEqual(0);
    expect(hazardAt).toBeGreaterThan(switchAt);
    expect(attackAt).toBeGreaterThan(hazardAt);

    // 設置のコマでは「設置で」と注記が出る
    expect(effectOf(frames[hazardAt]!)?.note).toBe('設置');
    expect(frames[hazardAt]?.entry.text).toContain('設置で');
  });

  it('攻撃 → 反射 の順に見え、反射には注記が付く (SPEC §10.7)', () => {
    // 山嵐は攻撃技で被弾すると固定10を返す
    const state = makeBattle(['yamaarashi'], ['ishi']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    const attackAt = frames.findIndex(
      (f) => f.event.type === 'damage' && f.event.source === 'move' && f.event.target.side === 'p1',
    );
    const reflectAt = frames.findIndex(
      (f) => f.event.type === 'damage' && f.event.source === 'reflect',
    );

    expect(attackAt).toBeGreaterThanOrEqual(0);
    expect(reflectAt).toBeGreaterThan(attackAt);
    expect(effectOf(frames[reflectAt]!)?.note).toBe('反射');
  });

  it('ダメージ → 瀕死 が別のコマになる。倒れる瞬間が見える', () => {
    const state = makeBattle(['ishi'], ['issen']);
    setHp(state, 'p2', 0, 5); // 一撃で落ちる

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    const damageAt = frames.findIndex(
      (f) => f.event.type === 'damage' && f.event.target.side === 'p2',
    );
    const faintAt = frames.findIndex((f) => f.event.type === 'faint');

    expect(damageAt).toBeGreaterThanOrEqual(0);
    expect(faintAt).toBeGreaterThan(damageAt);

    // ダメージのコマではまだ倒れていない。瀕死のコマで倒れる
    expect(frames[damageAt]?.battle.sides.p2.party[0]?.fainted).toBe(false);
    expect(frames[faintAt]?.battle.sides.p2.party[0]?.fainted).toBe(true);
  });

  it('反動は攻撃とは別のコマで、自分に入る (SPEC §10.5)', () => {
    // 石の技2は威力35 + 自分に固定15の反動
    const state = makeBattle(['ishi'], ['kenro']);
    const { events } = resolveTurn(state, { p1: move(1), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    const recoilAt = frames.findIndex(
      (f) => f.event.type === 'damage' && f.event.source === 'recoil',
    );
    expect(recoilAt).toBeGreaterThanOrEqual(0);

    const effect = effectOf(frames[recoilAt]!);
    expect(effect?.note).toBe('反動');
    expect(effect?.target.side).toBe('p1'); // 自分に入る
  });

  it('各コマがステージとして描画でき、対象にエフェクトが乗る', () => {
    const state = makeBattle(['yamaarashi', 'bara'], ['ishi']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    let withEffect = 0;
    frames.forEach((frame, index) => {
      const effect = effectOf(frame);
      const html = renderToStaticMarkup(
        h(BattleStage, {
          battle: frame.battle,
          labels: sideLabels('hotseat'),
          effect,
          effectKey: index,
          isVisible: () => true,
          caption: frame.entry.text,
        }),
      );
      expect(html.length).toBeGreaterThan(0);
      // 中央にいま起きていることが出る
      expect(html).toContain(frame.entry.text);

      if (effect) {
        withEffect += 1;
        expect(html).toContain(`is-${effect.kind}`);
      }
    });

    expect(withEffect).toBeGreaterThan(0);
  });

  it('ダメージの数値が画面に出る', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    const hit = frames.find((f) => f.event.type === 'damage' && f.event.target.side === 'p2');
    if (!hit || hit.event.type !== 'damage') throw new Error('ダメージのコマがない');

    const html = renderToStaticMarkup(
      h(BattleStage, {
        battle: hit.battle,
        labels: sideLabels('hotseat'),
        effect: effectOf(hit),
        effectKey: 0,
        isVisible: () => true,
        caption: null,
      }),
    );

    expect(html).toContain(String(hit.event.amount));
    expect(html).toContain('floating--damage');
  });
});
