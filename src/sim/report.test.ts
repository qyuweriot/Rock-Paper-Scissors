import { describe, expect, it } from 'vitest';
import { csvCell, matchupsCsv, summaryMarkdown, toCsv, unitsCsv } from './report';
import type { RunConditions } from './report';
import { buildReport } from './stats';
import type { GameResult } from './runner';
import { UNIT_IDS, type UnitId } from '../data/units';

const CONDITIONS: RunConditions = {
  mode: '3v3',
  seed: 0,
  aiLevels: { p1: 2, p2: 2 },
  maxTurns: 300,
  sampling: 'テスト',
  elapsedMs: 1234,
};

function game(p1: UnitId[], p2: UnitId[], result: GameResult['result']): GameResult {
  return {
    teams: { p1, p2 },
    result,
    turns: 10,
    turnsToFirstFaint: 3,
    issenStacked: { p1: false, p2: false },
  };
}

describe('csvCell — RFC 4180 のエスケープ', () => {
  it('普通の値はそのまま', () => {
    expect(csvCell('ishi')).toBe('ishi');
    expect(csvCell(42)).toBe('42');
  });

  it('カンマ・引用符・改行を含む値は引用符で包む', () => {
    expect(csvCell('石 / 堅牢, 紙')).toBe('"石 / 堅牢, 紙"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('引用符は二重にして埋め込む', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('toCsv', () => {
  it('ヘッダと行を並べ、末尾に改行を付ける', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a,b\n1,2\n');
  });
});

describe('unitsCsv', () => {
  it('15行 + ヘッダを出す', () => {
    const csv = unitsCsv(buildReport([game(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami'], 'p1')]));
    expect(csv.trim().split('\n')).toHaveLength(16);
    expect(csv).toContain('石');
  });
});

describe('matchupsCsv', () => {
  it('15×15 のマトリクスを出す。ヘッダ行と行見出しを含む', () => {
    const results = [game(['funsai'], ['hasamimushi'], 'p2'), game(['hasamimushi'], ['funsai'], 'p1')];
    const cells = results.map((r) => ({
      attacker: r.teams.p1[0] as UnitId,
      defender: r.teams.p2[0] as UnitId,
      result: r.result,
      turns: r.turns,
    }));

    const lines = matchupsCsv(cells).trim().split('\n');
    expect(lines).toHaveLength(16);
    expect(lines[0]?.startsWith('p1＼p2,粉砕')).toBe(true);
    // 粉砕(行) × ハサミムシ(列) は p2 の勝ち = 粉砕から見て負け
    expect(lines[1]).toContain('負10T');
  });
});

describe('summaryMarkdown', () => {
  const report = buildReport([
    game(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami'], 'p1'),
    game(['funsai', 'tekken', 'magyu'], ['hasamimushi', 'yamaarashi', 'ghost'], 'draw'),
  ]);

  it('勝率の定義を必ず書く。書かないと数字が比較できない', () => {
    const md = summaryMarkdown(report, CONDITIONS, null);
    expect(md).toContain('引き分けは 0.5勝');
    expect(md).toContain('未決着は勝率の分母から外す');
  });

  it('実行条件を書く。再現に必要な情報が揃っている', () => {
    const md = summaryMarkdown(report, CONDITIONS, null);
    expect(md).toContain('シード');
    expect(md).toContain('Lv2 / Lv2');
  });

  it('PLAN §239-248 の6指標をすべて含む', () => {
    // 選出の上位・下位は20通り以上ないと切り出せないので、十分な数を作る
    const many = buildReport(
      UNIT_IDS.flatMap((a) =>
        UNIT_IDS.map((b) => game([a, 'kenro', 'kami'], [b, 'bara', 'hasami'], 'p1')),
      ),
    );
    const md = summaryMarkdown(many, CONDITIONS, null);
    for (const heading of [
      'ユニット別勝率',
      '属性別勝率',
      '平均決着ターン数',
      '1体目撃破までの平均ターン数',
      '引き分け',
      '選出3体の勝率',
    ]) {
      expect(md).toContain(heading);
    }
  });

  it('1v1 では選出の節を出さない。ユニット別表と同じ内容になるため', () => {
    const md = summaryMarkdown(report, { ...CONDITIONS, mode: '1v1' }, []);
    expect(md).not.toContain('選出3体の勝率');
  });

  it('PLAN §250-255 の監視項目を含む', () => {
    const md = summaryMarkdown(report, CONDITIONS, null);
    for (const heading of ['粉砕の勝率', '一閃', 'バラ', 'ハサミムシ × 粉砕', '未決着']) {
      expect(md).toContain(heading);
    }
  });

  it('1v1 の対面表がなければその旨を書く', () => {
    expect(summaryMarkdown(report, CONDITIONS, null)).toContain('1v1 モードでのみ出力');
  });

  it('1v1 の対面表があれば直接対決の結果を書く', () => {
    const md = summaryMarkdown(report, { ...CONDITIONS, mode: '1v1' }, [
      { attacker: 'funsai', defender: 'hasamimushi', result: 'p2', turns: 4 },
      { attacker: 'hasamimushi', defender: 'funsai', result: 'p1', turns: 5 },
    ]);
    expect(md).toContain('ハサミムシの勝ち (4T)');
    expect(md).toContain('ハサミムシの勝ち (5T)');
  });

  it('空のレポートでも壊れない', () => {
    expect(() => summaryMarkdown(buildReport([]), CONDITIONS, null)).not.toThrow();
  });
});
