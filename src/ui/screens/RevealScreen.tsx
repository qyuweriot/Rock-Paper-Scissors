/**
 * パーティーの相互公開 (SPEC §1「両者のパーティー5体を相互に公開する」)。
 * ここまでは秘匿しない。隠すのは選出内容から。
 */

import type { UnitId } from '../../data/units';
import type { Side } from '../../engine/types';
import { UnitCard } from '../components/UnitCard';

interface Props {
  parties: Record<Side, UnitId[]>;
  labels: Record<Side, string>;
  onConfirm: () => void;
}

export function RevealScreen({ parties, labels, onConfirm }: Props) {
  return (
    <div className="screen screen--reveal">
      <header className="screen__head">
        <h2>編成の公開</h2>
        <p className="screen__sub">
          両者の5体を公開します。これを見てから3体を選出してください(選出内容は相手に見えません)。
        </p>
        <div className="screen__actions">
          <button type="button" className="btn btn--primary" onClick={onConfirm}>
            選出へ進む
          </button>
        </div>
      </header>

      {(['p1', 'p2'] as Side[]).map((side) => (
        <section key={side} className="reveal-block">
          <h3>{labels[side]}</h3>
          <div className="unit-grid unit-grid--compact">
            {parties[side].map((id) => (
              <UnitCard key={id} unitId={id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
