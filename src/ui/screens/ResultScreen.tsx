/** 結果 (PLAN §286)。**引き分けを落とさない** (SPEC §8) */

import type { BattleResult, Side } from '../../engine/types';
import { BattleLog } from '../components/BattleLog';
import type { LogEntry } from '../log';

interface Props {
  result: BattleResult;
  labels: Record<Side, string>;
  /** AI戦では p1 が人間なので「勝ち / 負け」と出す */
  humanSide: Side | null;
  log: LogEntry[];
  onRestart: () => void;
  onToTitle: () => void;
}

export function ResultScreen({ result, labels, humanSide, log, onRestart, onToTitle }: Props) {
  const headline =
    result === 'draw'
      ? '引き分け'
      : humanSide
        ? result === humanSide
          ? '勝ち'
          : '負け'
        : `${labels[result]} の勝ち`;

  const tone = result === 'draw' ? 'draw' : humanSide && result !== humanSide ? 'lose' : 'win';

  return (
    <div className="screen screen--result">
      <header className={`result result--${tone}`}>
        <h2>{headline}</h2>
        {result === 'draw' && <p className="result__note">最後の1体同士が相打ちになりました</p>}
      </header>

      <div className="screen__actions">
        <button type="button" className="btn btn--primary" onClick={onRestart}>
          もう一度
        </button>
        <button type="button" className="btn btn--ghost" onClick={onToTitle}>
          モード選択へ
        </button>
      </div>

      <BattleLog entries={log} />
    </div>
  );
}
