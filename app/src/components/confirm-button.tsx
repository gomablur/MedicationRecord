import { useEffect, useRef, useState } from 'react';

import { Button, type ButtonProps } from '@/components/button';

type Props = Omit<ButtonProps, 'onPress' | 'title'> & {
  title: string;
  /** 1回目のタップ後に表示する確認文言 */
  confirmTitle?: string;
  /** 2回目のタップで実行される */
  onConfirm: () => void;
};

/**
 * 2タップ確認ボタン。iOS の PWA では window.confirm が動作しない事例があるため、
 * OS ダイアログに頼らず「もう一度タップ」で確定する。3秒で自動的に解除。
 */
export function ConfirmButton({ title, confirmTitle, onConfirm, ...rest }: Props) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handlePress = () => {
    if (armed) {
      if (timer.current) clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 3000);
  };

  return (
    <Button
      {...rest}
      title={armed ? (confirmTitle ?? `もう一度タップで${title}`) : title}
      onPress={handlePress}
    />
  );
}
