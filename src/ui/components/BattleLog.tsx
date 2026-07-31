/**
 * バトルログ (PLAN §285)。
 * イベント列をそのまま描画する。整形は log.ts が済ませている。
 */

import { useEffect, useRef } from 'react';
import type { LogEntry } from '../log';

interface Props {
  entries: LogEntry[];
}

export function BattleLog({ entries }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // 新しい行が増えたら末尾へ送る
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  return (
    <div className="log">
      <h3 className="log__title">バトルログ</h3>
      <ol className="log__list">
        {entries.map((entry, index) => (
          <li
            key={index}
            className={[
              'log__line',
              `log__line--${entry.type}`,
              entry.side ? `log__line--${entry.side}` : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {entry.text}
          </li>
        ))}
        <div ref={endRef} />
      </ol>
    </div>
  );
}
