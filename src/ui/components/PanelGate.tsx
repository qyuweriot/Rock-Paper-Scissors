/**
 * 操作欄に出す確認。**盤面を隠さないゲート**。
 *
 * バトル中は [HandoffGate] のような全面の覆いを使わない。
 * 隠す必要があるのは行動宣言の内容だけで、盤面(HP・毒・設置・場のユニット)は
 * 両者に公開してよい (SPEC §11)。全面で覆うと、解決を見終わった瞬間に結果が消えてしまう。
 *
 * 使うのは2か所:
 * - 再生の前 (対人戦)「2人とも画面を見ていますか?」
 * - 入力の前 (対人戦)「プレイヤーN の入力です」
 */

interface Props {
  title: string;
  hint: string;
  label: string;
  onConfirm: () => void;
}

export function PanelGate({ title, hint, label, onConfirm }: Props) {
  return (
    <div className="panel-gate">
      <p className="panel-gate__title">{title}</p>
      <p className="panel-gate__hint">{hint}</p>
      <button type="button" className="btn btn--primary" onClick={onConfirm}>
        {label}
      </button>
    </div>
  );
}
