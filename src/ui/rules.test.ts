/**
 * ルール説明の検査。
 *
 * **一番の狙いは「画面が嘘をつくようになる」のを防ぐこと。**
 * 文章に数字を直に打ち込むと、バランス調整のたびに説明だけが古くなり、
 * しかも誰も気付かない。数値が engine の定数から来ていることを機械的に確かめる。
 *
 * 文章の善し悪し(読みやすさ・言い回し)はここでは見られない。人が読む担当。
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allRuleLines, RULE_SECTIONS } from './rules';
import * as constants from '../engine/constants';

/**
 * 「出てくる数字が定数の値と一致するか」では**守れない**。
 * 定数はどれも小さい数で、10 や 3 は複数の定数と偶然一致するため、
 * 直書きした数字がたまたま別の定数の値と重なって通ってしまう。
 *
 * そこで、より強くて単純な決まりを置く ─ **文章に数字を一切書かない。**
 * 数値はすべて `${String(定数)}` で差し込む。ソースを読んで直に検査する。
 */
const RULES_SOURCE = new URL('./rules.ts', import.meta.url);

/** コメントを落としてから、文字列リテラルの中身だけを取り出す */
function stringLiteralsOf(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return [...code.matchAll(/'([^']*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? '');
}

describe('数値が定数から来ている', () => {
  it('文章に数字が直に書かれていない', () => {
    const source = readFileSync(RULES_SOURCE, 'utf8');
    const withDigits = stringLiteralsOf(source).filter((text) => /\d/.test(text));

    // 落ちたら、その数字を engine/constants.ts から引いて差し込むように直す。
    // 定数に無い数 (「1体ずつ」など) は、数字を使わない言い回しにする
    expect(withDigits, '文章に数字が直書きされている').toEqual([]);
  });

  it('主要な定数が実際に文章へ出ている', () => {
    // 上の検査は「数字が無い」ことしか見ない。差し込み自体を消した場合はこちらで拾う
    const text = allRuleLines().join('\n');
    expect(text).toContain(String(constants.TYPE_ADVANTAGE));
    expect(text).toContain(String(constants.POISON_MAX_STACKS));
    expect(text).toContain(String(constants.PERSISTENT_MODIFIER_CAP));
    expect(text).toContain(String(constants.PARTY_SIZE));
    expect(text).toContain(String(constants.TEAM_SIZE));
  });
});

describe('構造', () => {
  it('4段あり、どの段にも項目がある', () => {
    expect(RULE_SECTIONS).toHaveLength(4);
    for (const section of RULE_SECTIONS) {
      expect(section.heading).not.toBe('');
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it('題も本文も空でない', () => {
    for (const section of RULE_SECTIONS) {
      for (const item of section.items) {
        expect(item.title, `${section.heading} に題のない項目がある`).not.toBe('');
        expect(item.lines.length, `${item.title} に本文がない`).toBeGreaterThan(0);
        for (const line of item.lines) expect(line.trim()).not.toBe('');
      }
    }
  });

  it('最初の段だけで対戦を始められると明示している', () => {
    // 読み進める義務がないことを伝えるのが段構成の狙い。註が消えたら意味が薄れる
    expect(RULE_SECTIONS[0]?.note).toBeTruthy();
  });
});

describe('落とせない項目', () => {
  const text = allRuleLines().join('\n');

  it('相打ちで引き分けになる (SPEC §8)', () => {
    // 見落とすと決着そのものが理解できない
    expect(text).toContain('引き分け');
  });

  it('交代したターンは交代先が被弾する (SPEC §6)', () => {
    // 初見が必ず事故る一点
    expect(text).toMatch(/交代したターンは交代先/);
  });

  it('同じ段は同時に処理される (SPEC §5.2)', () => {
    // 相打ちが起きる理由。ここが抜けると上の引き分けが唐突に見える
    expect(text).toMatch(/同じ段.*同時/);
  });

  it('反射は毒・設置・反動では発動しない (SPEC §7.4)', () => {
    expect(text).toMatch(/毒・設置・反動で受けたダメージでは反射しません/);
  });

  it('特性は場に出ているあいだだけ働く (SPEC §3)', () => {
    expect(text).toMatch(/控えにいるあいだは/);
  });
});
