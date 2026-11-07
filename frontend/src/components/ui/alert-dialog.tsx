import { useId, type ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

type AlertDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function AlertDialog({ open, title, description, confirmLabel, destructive = false, onOpenChange, onConfirm }: AlertDialogProps) {
  const id = useId();
  return <Dialog open={open} onOpenChange={onOpenChange} className="alert-dialog" labelledBy={`${id}-title`} describedBy={`${id}-description`}>
    <div className="alert-dialog-content">
      <div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}</p></div>
      <div className="alert-dialog-actions"><Button variant="outline" autoFocus onClick={() => onOpenChange(false)}>Cancel</Button><Button className={destructive ? 'button-destructive' : undefined} onClick={onConfirm}>{confirmLabel}</Button></div>
    </div>
  </Dialog>;
}
