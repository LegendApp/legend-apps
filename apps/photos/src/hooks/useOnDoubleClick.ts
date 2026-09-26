import { useRef } from 'react';

interface UseOnDoubleClickParams {
  identity?: string;
  onClick?: () => void;
  onDoubleClick: () => void;
}

const DOUBLE_PRESS_DELAY = 300;

export function useOnDoubleClick({ onClick, onDoubleClick, identity }: UseOnDoubleClickParams) {
  const refLastTap = useRef({time: 0, identity});

  const handlePress = () => {
    const now = Date.now();

    if (refLastTap.current.identity === identity && now - refLastTap.current.time < DOUBLE_PRESS_DELAY) {
      // Double tap detected
      onDoubleClick();
    } else {
      onClick?.();
    }

    refLastTap.current = {time: now, identity};
  };

  return handlePress;
}
