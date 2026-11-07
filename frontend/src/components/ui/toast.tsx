import { CircleAlert, CircleCheck, LoaderCircle, X } from 'lucide-react';
import { Progress } from './progress';

export type ToastItem = {
  id: number;
  message: string;
  variant: 'default' | 'destructive' | 'progress';
  progressLabel?: string;
};

export function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const Icon = item.variant === 'destructive' ? CircleAlert : CircleCheck;
  return (
    <section
      className={`ui-toast ${item.variant === 'destructive' ? 'ui-toast-destructive' : ''}`}
      role={item.variant === 'destructive' ? 'alert' : 'status'}
      aria-live={item.variant === 'destructive' ? 'assertive' : 'polite'}
    >
      {item.variant === 'progress' ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Icon size={17} aria-hidden="true" />}
      <div className="ui-toast-content">
        <p>{item.message}</p>
        {item.progressLabel && <Progress label={item.progressLabel} />}
      </div>
      <button className="ui-toast-dismiss" type="button" aria-label="Dismiss notification" onClick={() => onDismiss(item.id)}><X size={16} /></button>
    </section>
  );
}

export function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <aside className="ui-toast-viewport" aria-label="Notifications">
      {items.map(item => <Toast key={item.id} item={item} onDismiss={onDismiss} />)}
    </aside>
  );
}
