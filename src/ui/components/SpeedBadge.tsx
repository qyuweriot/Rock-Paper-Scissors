/**
 * 速度のバッジ。「速」「中」「遅」の1文字だけを出す。
 *
 * 速度は行動順を決める要 (SPEC §5.2) なのに、以前は「速度速」という
 * 読みにくい地の文で小さく出していた。1文字にして色を付け、一目で分かるようにする。
 *
 * ステージと編成カードの両方から使う ─ 表記が2か所でずれないように。
 */

import type { Speed } from '../../engine/types';
import { SPEED_LABELS } from '../labels';

interface Props {
  speed: Speed;
}

export function SpeedBadge({ speed }: Props) {
  return (
    <span className={`speed-badge speed-badge--${speed}`} title={`速度${SPEED_LABELS[speed]}`}>
      {SPEED_LABELS[speed]}
    </span>
  );
}
