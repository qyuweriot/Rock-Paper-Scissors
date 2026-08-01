/**
 * ステージ上の1体。アイコン・HP・状態・技の効果テキスト・エフェクトを担う。
 *
 * **効果テキストは畳まない。** PLAN §296 が「ステータスと効果テキストは常に画面上に出す」と
 * 定めているので、相手側も含めて常時表示する。
 *
 * 技には**いま打ったら何ダメージか**を併記する (→ preview.ts)。
 * 表記どおりの威力が入ることはまずないので、暗算させない。
 */

import { getUnit, type UnitId } from '../../data/units';
import type { BattleState, Side } from '../../engine/types';
import { UNIT_ICONS } from '../icons';
import { ATTRIBUTE_LABELS, SPEED_LABELS } from '../labels';
import type { Effect } from '../playback';
import { breakdownText, previewMove } from '../preview';
import { HpBar } from './HpBar';
import { StatusBadges } from './StatusBadges';

interface Props {
  battle: BattleState;
  side: Side;
  /** この陣営を左右どちらに描くか。エフェクトの向きが変わる */
  facing: 'left' | 'right';
  /** いま再生中のエフェクト。この陣営の場のユニットが対象のときだけ渡ってくる */
  effect: Effect | null;
  /** エフェクトを再生し直すための鍵。コマが変わるたびに変える */
  effectKey: number;
}

export function StageUnit({ battle, side, facing, effect, effectKey }: Props) {
  const sideState = battle.sides[side];
  const unit = sideState.party[sideState.activeIndex];
  if (!unit) return null;

  const def = getUnit(unit.unitId as UnitId);
  // 相性も class に出す。有利対面は揺れを強くする
  const matchup = effect?.matchup && effect.matchup !== 'neutral' ? ` is-${effect.matchup}` : '';
  const animation = effect ? `is-${effect.kind}${matchup}` : '';

  return (
    <div className={`stage-unit stage-unit--${facing} ${unit.fainted ? 'is-fainted' : ''}`}>
      <div className="stage-unit__main">
        <div key={`${String(effectKey)}-icon`} className={`stage-unit__icon ${animation}`}>
          <span className={`stage-unit__emoji stage-unit__emoji--${def.attribute}`}>
            {UNIT_ICONS[unit.unitId as UnitId]}
          </span>
          {effect && <FloatingEffect effect={effect} effectKey={effectKey} />}
        </div>

        <div className="stage-unit__info">
          <div className="stage-unit__name-row">
            <span className="stage-unit__name">{def.name}</span>
            <span className="stage-unit__tags">
              {ATTRIBUTE_LABELS[def.attribute]} / 速度{SPEED_LABELS[def.speed]}
            </span>
          </div>
          <HpBar hp={unit.hp} maxHp={def.maxHp} poisonStacks={unit.poisonStacks} />
          <StatusBadges state={unit} />
        </div>
      </div>

      <ul className="stage-unit__slots">
        {def.slots.map((slot, index) => {
          const isMove = slot.kind === 'move';
          const entry = isMove ? slot.move : slot.ability;
          const max = isMove ? slot.move.maxUses : undefined;
          const used = isMove ? unit.totalMoveUses[index as 0 | 1] : 0;
          const preview = isMove && !unit.fainted ? previewMove(battle, side, index as 0 | 1) : null;

          const showDamage = preview !== null && preview.damage !== null;

          return (
            <li key={entry.name} className={isMove ? 'slot slot--move' : 'slot slot--ability'}>
              <span className="slot__kind">{isMove ? '技' : '特性'}</span>
              {/* バッジ以外は必ずこの中に入れる。grid の自動配置に任せると崩れる */}
              <div className="slot__body">
                <div className="slot__head">
                  <span className="slot__name">
                    {entry.name}
                    {max !== undefined && (
                      <span className="slot__uses">
                        {' '}
                        残り {Math.max(0, max - used)}/{max}
                      </span>
                    )}
                  </span>
                  {showDamage && (
                    <span className={`slot__damage slot__damage--${preview.matchup ?? 'fixed'}`}>
                      → {preview.damage}
                      {preview.uncertain && <em className="slot__uncertain">〜</em>}
                    </span>
                  )}
                </div>
                <span className="slot__text">{entry.text}</span>
                {showDamage && <span className="slot__breakdown">{breakdownText(preview)}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** ダメージ・回復・修正値を数値として浮かせる */
function FloatingEffect({ effect, effectKey }: { effect: Effect; effectKey: number }) {
  if (effect.kind === 'faint') {
    return (
      <span key={effectKey} className="floating floating--faint">
        倒れた
      </span>
    );
  }
  if (effect.kind === 'switch') return null;
  if (effect.amount === null) return null;

  const sign = effect.kind === 'damage' ? '−' : '+';
  const matchup = effect.matchup && effect.matchup !== 'neutral' ? effect.matchup : null;

  return (
    <span
      key={effectKey}
      className={`floating floating--${effect.kind} ${matchup ? `is-${matchup}` : ''}`}
    >
      {sign}
      {Math.abs(effect.amount)}
      {effect.note && <em className="floating__note">{effect.note}</em>}
      {matchup && (
        <em className="floating__matchup">
          {matchup === 'advantage' ? '効果ばつぐん' : 'いまひとつ'}
          {effect.typeModifier !== null &&
            ` ${effect.typeModifier > 0 ? '+' : '−'}${String(Math.abs(effect.typeModifier))}`}
        </em>
      )}
    </span>
  );
}
