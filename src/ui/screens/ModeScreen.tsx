/** モード選択 (PLAN §281)。AI戦なら難易度も選ぶ */

import { useState } from 'react';
import { AI_LEVELS, AI_LEVEL_LABELS, type AiLevel } from '../../ai';
import { PARTY_SIZE, TEAM_SIZE } from '../../engine/constants';
import { TYPE_TRIANGLE } from '../labels';
import type { Mode } from '../flow';

interface Props {
  onStart: (mode: Mode, aiLevel: AiLevel) => void;
}

export function ModeScreen({ onStart }: Props) {
  const [aiLevel, setAiLevel] = useState<AiLevel>(2);

  return (
    <div className="screen screen--mode">
      <header className="title">
        <h1>じゃんけんバトル</h1>
        <p className="lead">1対1交代制の2人対戦ゲーム</p>
      </header>

      <p className="rules">
        {TYPE_TRIANGLE} の相性で戦います。全15種から {PARTY_SIZE} 体を編成し、
        相手の編成を見てから {TEAM_SIZE} 体を選出します。
      </p>

      <section className="mode-block">
        <h2>AI戦</h2>
        <div className="mode-block__levels">
          {AI_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`btn btn--level ${aiLevel === level ? 'is-selected' : ''}`}
              onClick={() => setAiLevel(level)}
            >
              <span className="btn__title">Lv{level}</span>
              <span className="btn__sub">{AI_LEVEL_LABELS[level]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primary" onClick={() => onStart('ai', aiLevel)}>
          Lv{aiLevel} と対戦する
        </button>
      </section>

      <section className="mode-block">
        <h2>対人戦</h2>
        <p className="mode-block__note">
          同じ端末を交互に操作します。行動を宣言するたびに確認画面を挟むので、
          相手に入力が見えません。
        </p>
        <button type="button" className="btn btn--primary" onClick={() => onStart('hotseat', 2)}>
          2人で対戦する
        </button>
      </section>
    </div>
  );
}
