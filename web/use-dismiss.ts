import { useEffect } from 'react';
import type { RefObject } from 'react';

export type DismissReason = 'escape' | 'outside';

/** closes something open on escape or on a press anywhere outside `containerRef` */
export function useDismiss(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: (reason: DismissReason) => void,
): void {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onDismiss('escape');
    }
    function handlePointerDown(event: PointerEvent): void {
      const container = containerRef.current;
      if (
        container !== null &&
        event.target instanceof Node &&
        !container.contains(event.target)
      ) {
        onDismiss('outside');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, containerRef, onDismiss]);
}
