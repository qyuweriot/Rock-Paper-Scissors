/**
 * レポートの整形 (PLAN §257「結果を CSV / Markdown で出力する」)。
 *
 * ファイル書き込みは index.ts が行い、ここは文字列を返すだけにする。
 * こうしておくとテストがファイルシステムに触らずに済む。
 */

import { getUnit, UNIT_IDS } from '../data/units';
import { ATTRIBUTE_LABELS } from './stats';
import type { MatchupCell, Report } from './stats';
import type { GameResult } from './runner';

export interface RunConditions {
  mode: '1v1' | '3v3';
  seed: number;
  aiLevels: { p1: number; p2: number };
  maxTurns: number;
  /** 総当たり全件か抽出か */
  sampling: string;
  elapsedMs: number;
}

// --- CSV --------------------------------------------------------------------

/** カンマ・引用符・改行を含む値を安全に包む (RFC 4180) */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

const pct = (value: number): string => (value * 100).toFixed(1);
const num = (value: number, digits = 2): string => value.toFixed(digits);

export function unitsCsv(report: Report): string {
  return toCsv(
    ['id', '名前', '属性', '試合数', '勝', '敗', '分', '未決着', '勝率(%)', '平均決着ターン'],
    report.units.map((u) => [
      u.id,
      u.name,
      ATTRIBUTE_LABELS[u.attribute],
      u.games,
      u.wins,
      u.losses,
      u.draws,
      u.stalls,
      pct(u.winRate),
      num(u.avgTurns),
    ]),
  );
}

export function attributesCsv(report: Report): string {
  return toCsv(
    ['属性', '試合数', '勝率(%)'],
    report.attributes.map((a) => [a.label, a.games, pct(a.winRate)]),
  );
}

export function selectionsCsv(report: Report): string {
  return toCsv(
    ['選出', '試合数', '勝率(%)'],
    report.selections.map((s) => [s.label, s.games, pct(s.winRate)]),
  );
}

/**
 * 1対1の対面表。行=p1側、列=p2側。
 * セルは p1 側から見た結果 (`勝` / `負` / `分` / `-`) と決着ターン数。
 */
export function matchupsCsv(cells: MatchupCell[]): string {
  const index = new Map(cells.map((c) => [`${c.attacker},${c.defender}`, c]));
  const symbol: Record<GameResult['result'], string> = {
    p1: '勝',
    p2: '負',
    draw: '分',
    stall: '-',
  };

  return toCsv(
    ['p1＼p2', ...UNIT_IDS.map((id) => getUnit(id).name)],
    UNIT_IDS.map((attacker) => [
      getUnit(attacker).name,
      ...UNIT_IDS.map((defender) => {
        const cell = index.get(`${attacker},${defender}`);
        return cell ? `${symbol[cell.result]}${String(cell.turns)}T` : '';
      }),
    ]),
  );
}

// --- Markdown ---------------------------------------------------------------

function mdTable(header: string[], rows: (string | number)[][]): string {
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function funsaiVsKamakiriCell(cells: MatchupCell[]): string {
  const forward = cells.find((c) => c.attacker === 'funsai' && c.defender === 'kamakiri');
  const reverse = cells.find((c) => c.attacker === 'kamakiri' && c.defender === 'funsai');
  if (!forward || !reverse) return '(1v1 モードでのみ出力)';

  const describe = (cell: MatchupCell, funsaiSide: 'p1' | 'p2'): string => {
    if (cell.result === 'stall') return '未決着';
    if (cell.result === 'draw') return `引き分け (${String(cell.turns)}T)`;
    return `${cell.result === funsaiSide ? '粉砕' : 'カマキリ'}の勝ち (${String(cell.turns)}T)`;
  };

  return [
    `- 粉砕が先手: ${describe(forward, 'p1')}`,
    `- カマキリが先手: ${describe(reverse, 'p2')}`,
  ].join('\n');
}

const TOP_N = 10;

export function summaryMarkdown(
  report: Report,
  conditions: RunConditions,
  matchupCells: MatchupCell[] | null,
): string {
  const sections: string[] = [];

  sections.push(
    `# バランスレポート

\`npm run sim\` の出力 (PLAN Phase 4)。**このファイルは生成物なので手で編集しない。**

## 実行条件

${mdTable(
  ['項目', '値'],
  [
    ['モード', conditions.mode],
    ['対戦の範囲', conditions.sampling],
    ['シード', conditions.seed],
    ['AI (p1 / p2)', `Lv${String(conditions.aiLevels.p1)} / Lv${String(conditions.aiLevels.p2)}`],
    ['ターン上限', conditions.maxTurns],
    ['所要時間', `${(conditions.elapsedMs / 1000).toFixed(1)} 秒`],
  ],
)}

同じシード・同じ条件なら結果は完全に再現される (PLAN §237)。

## 勝率の定義

- **引き分けは 0.5勝**として数える。相打ちによる引き分けは SPEC §8 が認めた結果であり、無効試合ではない
- **未決着は勝率の分母から外す。** ターン上限まで決着しなかった試合は勝敗の情報を持たない
- ${
    conditions.mode === '3v3'
      ? 'ユニット別勝率は「そのユニットを**選出に含む陣営**が勝ったか」を数える。個体の撃破数ではないので、強いユニットでも組み合わせが悪ければ下がる'
      : '1体ずつの対面なので、ユニット別勝率はそのユニット自身の勝敗そのもの'
  }`,
  );

  sections.push(
    `## 全体

${mdTable(
  ['指標', '値'],
  [
    ['総試合数', report.games],
    ['決着した試合', report.decided],
    ['引き分け', `${String(report.draws)} (${pct(report.drawRate)}%)`],
    ['**未決着**', report.stalls],
    ['平均決着ターン数', num(report.avgTurns)],
    ['1体目撃破までの平均ターン数', num(report.avgTurnsToFirstFaint)],
    [
      `p1 (Lv${String(conditions.aiLevels.p1)}) の勝率`,
      `${pct(report.p1WinRate)}%${
        conditions.aiLevels.p1 === conditions.aiLevels.p2
          ? ' ← 同じAI同士なので手番の有利さ'
          : ` ← p2 は Lv${String(conditions.aiLevels.p2)}。AIの強さの差`
      }`,
    ],
  ],
)}`,
  );

  sections.push(
    `## ユニット別勝率 (PLAN §244)

${mdTable(
  ['#', 'ユニット', '属性', '試合数', '勝率', '平均決着ターン'],
  report.units.map((u, i) => [
    i + 1,
    u.name,
    ATTRIBUTE_LABELS[u.attribute],
    u.games,
    `${pct(u.winRate)}%`,
    num(u.avgTurns),
  ]),
)}`,
  );

  sections.push(
    `## 属性別勝率 (PLAN §245)

三竦みが機能していれば3属性とも 50% 付近に落ち着く。

${mdTable(
  ['属性', '試合数', '勝率'],
  report.attributes.map((a) => [a.label, a.games, `${pct(a.winRate)}%`]),
)}`,
  );

  // 1v1 では「選出」が単体ユニットになり、上のユニット別表と同じ内容になる。
  // 上位・下位を切り出しても重なるだけなので出さない
  if (conditions.mode === '3v3' && report.selections.length >= TOP_N * 2) {
    const top = report.selections.slice(0, TOP_N);
    const bottom = report.selections.slice(-TOP_N).reverse();
    sections.push(
      `## 選出3体の勝率 (PLAN §248)

全 ${String(report.selections.length)} 通り。全件は \`selections.csv\` を参照。

### 上位 ${String(top.length)}

${mdTable(
  ['#', '選出', '試合数', '勝率'],
  top.map((s, i) => [i + 1, s.label, s.games, `${pct(s.winRate)}%`]),
)}

### 下位 ${String(bottom.length)}

${mdTable(
  ['#', '選出', '試合数', '勝率'],
  bottom.map((s, i) => [report.selections.length - i, s.label, s.games, `${pct(s.winRate)}%`]),
)}`,
    );
  }

  // --- 監視項目 (PLAN §250-255) ---
  const funsai = report.units.find((u) => u.id === 'funsai');
  const bara = report.units.find((u) => u.id === 'bara');
  const issenUnit = report.units.find((u) => u.id === 'issen');
  const kamakiri = report.units.find((u) => u.id === 'kamakiri');

  const issenDiff =
    report.issen.stacked.games > 0 && report.issen.notStacked.games > 0
      ? `${pct(report.issen.stacked.winRate - report.issen.notStacked.winRate)} ポイント`
      : '(データ不足)';

  sections.push(
    `## 特に監視すべき項目 (PLAN §250-255)

### 1. 粉砕の勝率 — 有利対面で無限に殴れる設計 (SPEC §12-1)

勝率 **${funsai ? pct(funsai.winRate) : '-'}%** / 平均決着 ${funsai ? num(funsai.avgTurns) : '-'} ターン

### 2. 一閃 — 積み成功時と失敗時を分ける (PLAN §253)

合算するとHP40の脆さで平均され、累積上限 (SPEC §12-5) の判断材料にならない。

${mdTable(
  ['層', '試合数', '勝率'],
  [
    ['積み成功', report.issen.stacked.games, `${pct(report.issen.stacked.winRate)}%`],
    ['積み失敗', report.issen.notStacked.games, `${pct(report.issen.notStacked.winRate)}%`],
    ['合算', issenUnit?.games ?? 0, `${issenUnit ? pct(issenUnit.winRate) : '-'}%`],
  ],
)}

積みの成否による差: **${issenDiff}**

### 3. バラ — 毒・設置による決着ターン数 (PLAN §254)

ターン上限がないため、膠着が実際に解消されているかを見る。

バラを含む試合の平均決着ターン **${bara ? num(bara.avgTurns) : '-'}** (全体平均 ${num(report.avgTurns)})
未決着 ${bara?.stalls ?? 0} 件 / 勝率 ${bara ? pct(bara.winRate) : '-'}%

### 4. カマキリ × 粉砕 — 回復無効が三竦みを逆転させていないか (SPEC §12-2)

3v3 で両者が敵味方に分かれた ${String(report.kamakiriVsFunsai.games)} 試合における
**粉砕側の勝率: ${pct(report.kamakiriVsFunsai.funsaiWinRate)}%**

カマキリ単体の勝率 ${kamakiri ? pct(kamakiri.winRate) : '-'}%

1対1の直接対決:

${funsaiVsKamakiriCell(matchupCells ?? [])}

### 5. 未決着 — ターン上限の要否 (SPEC §12-3)

**${String(report.stalls)} 件 / ${String(report.games)} 試合** (${pct(report.games === 0 ? 0 : report.stalls / report.games)}%)

0 件ならターン上限は不要。`,
  );

  if (matchupCells) {
    sections.push(
      `## 1対1の対面表

行が先手 (p1)、列が後手 (p2)。全体は \`matchups.csv\` を参照。`,
    );
  }

  return sections.join('\n\n---\n\n') + '\n';
}

// --- 標準出力向けの要約 -----------------------------------------------------

export function consoleSummary(report: Report): string {
  const lines: string[] = [];
  const top = report.units.slice(0, 5);
  const bottom = report.units.slice(-5).reverse();

  lines.push(
    `試合数 ${String(report.games)} / 決着 ${String(report.decided)} / 引き分け ${String(report.draws)} (${pct(report.drawRate)}%) / 未決着 ${String(report.stalls)}`,
  );
  lines.push(
    `平均決着 ${num(report.avgTurns)} ターン / 1体目撃破まで ${num(report.avgTurnsToFirstFaint)} ターン`,
  );
  lines.push(`p1 勝率 ${pct(report.p1WinRate)}%`);
  lines.push('');
  lines.push('属性別勝率: ' + report.attributes.map((a) => `${a.label} ${pct(a.winRate)}%`).join(' / '));
  lines.push('');
  lines.push('勝率 上位5: ' + top.map((u) => `${u.name} ${pct(u.winRate)}%`).join(' / '));
  lines.push('勝率 下位5: ' + bottom.map((u) => `${u.name} ${pct(u.winRate)}%`).join(' / '));

  return lines.join('\n');
}
