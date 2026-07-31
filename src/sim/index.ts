/**
 * バランス検証CLI (PLAN Phase 4)。**1コマンドでバランスレポートが出る**のが完了条件 (§259)。
 *
 *   npm run sim -- [options]
 *
 *     --mode 1v1|3v3     既定 3v3。1v1 は15×15の素の対面表
 *     --sample N         3v3 の抽出試合数。既定 20000
 *     --full             455×455 の全 103,740 試合(約3分)
 *     --seed N           既定 0。同じシードなら結果は完全に再現される
 *     --ai1 / --ai2 N    1=ランダム / 2=貪欲 / 3=先読み。既定 2 (PLAN §271)
 *     --max-turns N      既定 300。超過は未決着として記録する
 *     --out DIR          既定 reports
 *     --quiet            進捗を出さない
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createAi, isAiLevel, type AiLevel } from '../ai';
import { allSelectionPairs, allSelections, sampleSelectionPairs, singlesPairs } from './matchups';
import { runGame, type GameResult } from './runner';
import { buildMatchupTable, buildReport } from './stats';
import {
  attributesCsv,
  consoleSummary,
  matchupsCsv,
  selectionsCsv,
  summaryMarkdown,
  unitsCsv,
  type RunConditions,
} from './report';
import type { MatchupCell } from './stats';

interface Options {
  mode: '1v1' | '3v3';
  sample: number;
  full: boolean;
  seed: number;
  ai1: AiLevel;
  ai2: AiLevel;
  maxTurns: number;
  out: string;
  quiet: boolean;
}

const DEFAULT_SAMPLE = 20000;

function parseOptions(argv: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      mode: { type: 'string', default: '3v3' },
      sample: { type: 'string' },
      full: { type: 'boolean', default: false },
      seed: { type: 'string', default: '0' },
      ai1: { type: 'string', default: '2' },
      ai2: { type: 'string', default: '2' },
      'max-turns': { type: 'string', default: '300' },
      out: { type: 'string', default: 'reports' },
      quiet: { type: 'boolean', default: false },
    },
  });

  if (values.mode !== '1v1' && values.mode !== '3v3') {
    throw new Error(`--mode は 1v1 か 3v3: ${String(values.mode)}`);
  }

  const level = (raw: string, flag: string): AiLevel => {
    const parsed = Number(raw);
    if (!isAiLevel(parsed)) throw new Error(`${flag} は 1〜3: ${raw}`);
    return parsed;
  };

  const positive = (raw: string, flag: string): number => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} は正の数: ${raw}`);
    return Math.floor(parsed);
  };

  return {
    mode: values.mode,
    sample: values.sample === undefined ? DEFAULT_SAMPLE : positive(values.sample, '--sample'),
    full: values.full,
    seed: Number(values.seed),
    ai1: level(values.ai1, '--ai1'),
    ai2: level(values.ai2, '--ai2'),
    maxTurns: positive(values['max-turns'], '--max-turns'),
    out: values.out,
    quiet: values.quiet,
  };
}

/**
 * 試合ごとに AI を作り直す。Lv1 は内部にシードを持つので、使い回すと
 * 「前の試合で何回引いたか」が次の試合に漏れて、1試合単位で再現できなくなる。
 */
function play(teams: { p1: string[]; p2: string[] }, options: Options, seed: number): GameResult {
  return runGame({
    teams: teams as Parameters<typeof runGame>[0]['teams'],
    ai: { p1: createAi(options.ai1, seed), p2: createAi(options.ai2, seed + 1) },
    seed,
    maxTurns: options.maxTurns,
  });
}

function progress(done: number, total: number, quiet: boolean): void {
  if (quiet || done % 5000 !== 0) return;
  console.log(`  ${String(done)} / ${String(total)} 試合`);
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const started = Date.now();

  const results: GameResult[] = [];
  let matchupCells: MatchupCell[] | null = null;
  let sampling: string;

  if (options.mode === '1v1') {
    const pairs = singlesPairs();
    sampling = `15×15 の全 ${String(pairs.length)} 対面 (向きを区別)`;
    if (!options.quiet) console.log(`1対1 総当たり: ${String(pairs.length)} 試合`);

    pairs.forEach(([a, b], i) => {
      results.push(play({ p1: [a], p2: [b] }, options, options.seed + i));
      progress(i + 1, pairs.length, options.quiet);
    });
    matchupCells = buildMatchupTable(results);
  } else {
    const selections = allSelections();
    const pairs = options.full
      ? allSelectionPairs()
      : sampleSelectionPairs(options.sample, options.seed);
    sampling = options.full
      ? `455 選出の全 ${String(pairs.length)} 対戦`
      : `455 選出の総当たり ${String(allSelectionPairs().length)} 件から ${String(pairs.length)} 件を抽出`;

    if (!options.quiet) console.log(`3v3: ${String(pairs.length)} 試合`);

    pairs.forEach(([i, j], index) => {
      const p1 = selections[i];
      const p2 = selections[j];
      if (!p1 || !p2) throw new Error(`選出の添字が不正です: ${String(i)}, ${String(j)}`);
      results.push(play({ p1, p2 }, options, options.seed + index));
      progress(index + 1, pairs.length, options.quiet);
    });
  }

  const report = buildReport(results);
  const conditions: RunConditions = {
    mode: options.mode,
    seed: options.seed,
    aiLevels: { p1: options.ai1, p2: options.ai2 },
    maxTurns: options.maxTurns,
    sampling,
    elapsedMs: Date.now() - started,
  };

  // モードごとにディレクトリを分ける。同じ場所に混ぜると、3v3 のサマリの隣に
  // 前回の 1v1 の対面表が残り、どの実行の数字なのか分からなくなる
  const outDir = join(options.out, options.mode);
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, body: string): void => {
    writeFileSync(join(outDir, name), body, 'utf8');
  };

  write('summary.md', summaryMarkdown(report, conditions, matchupCells));
  write('units.csv', unitsCsv(report));
  write('attributes.csv', attributesCsv(report));
  if (matchupCells) write('matchups.csv', matchupsCsv(matchupCells));
  else write('selections.csv', selectionsCsv(report));

  console.log('');
  console.log(consoleSummary(report));
  console.log('');
  console.log(`所要 ${((Date.now() - started) / 1000).toFixed(1)} 秒。レポート: ${outDir}/`);
}

main();
