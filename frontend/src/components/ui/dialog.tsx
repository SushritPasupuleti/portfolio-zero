import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  describedBy?: string;
};

export function Dialog({ open, onOpenChange, children, className, labelledBy, describedBy }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog
    ref={dialogRef}
    className={cn('ui-dialog', className)}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onClose={() => onOpenChange(false)}
    onClick={event => { if (event.target === event.currentTarget) onOpenChange(false); }}
  >{children}</dialog>;
}
