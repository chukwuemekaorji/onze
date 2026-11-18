import { useEffect, useEffectEvent, useRef } from 'react';
import type { MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';

// mark the element that should take focus on open; the first visible one wins
export const DRAWER_FOCUS_ATTRIBUTE = 'data-drawer-focus';

interface DrawerProps {
  id: string;
  open: boolean;
  title: string;
  onClose: () => void;
  /** the control that opened the drawer, refocused when it closes */
  returnFocusTo: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * a slide-over panel from the right, built on a modal <dialog>: the browser
 * handles escape, the focus trap and making the page behind it inert
 */
export function Drawer({
  id,
  open,
  title,
  onClose,
  returnFocusTo,
  children,
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const titleId = `${id}-title`;

  const focusFirstTarget = useEffectEvent((dialog: HTMLDialogElement) => {
    const target = [
      ...dialog.querySelectorAll<HTMLElement>(`[${DRAWER_FOCUS_ATTRIBUTE}]`),
    ].find((element) => element.closest('[hidden]') === null);
    target?.focus();
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      focusFirstTarget(dialog);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleClose(): void {
    onClose();
    returnFocusTo.current?.focus();
  }

  // the dialog element itself only receives pointer events on its backdrop.
  // checking where the press started stops a text selection dragged out of the
  // panel from closing it
  function handlePointerDown(event: PointerEvent<HTMLDialogElement>): void {
    pressStartedOnBackdrop.current = event.target === event.currentTarget;
  }

  function handleClick(event: MouseEvent<HTMLDialogElement>): void {
    if (pressStartedOnBackdrop.current && event.target === event.currentTarget) {
      event.currentTarget.close();
    }
    pressStartedOnBackdrop.current = false;
  }

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className="ui-drawer"
      aria-labelledby={titleId}
      onClose={handleClose}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <div className="ui-drawer__panel">
        <div className="ui-drawer__header">
          <h2 id={titleId} className="ui-drawer__title">
            {title}
          </h2>
          <button
            type="button"
            className="ui-drawer__close"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3 3 L13 13 M13 3 L3 13" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
