/**
 * 入力秘匿の確認画面 (SPEC §11)。
 *
 * 「プレイヤーNの番です」を全面に出して、**前のプレイヤーの入力を画面から消す**。
 * 端末を渡してからタップする、という運用を前提にしている。
 */

interface Props {
  message: string;
  hint?: string;
  onConfirm: () => void;
}

export function HandoffGate({ message, hint, onConfirm }: Props) {
  return (
    <button type="button" className="gate" onClick={onConfirm}>
      <span className="gate__message">{message}</span>
      <span className="gate__hint">{hint ?? '相手に見えないことを確認してからタップ'}</span>
    </button>
  );
}
