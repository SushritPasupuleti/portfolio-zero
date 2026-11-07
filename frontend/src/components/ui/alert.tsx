import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'warning' | 'destructive';
};

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return <div role={variant === 'destructive' ? 'alert' : 'status'} className={cn('ui-alert', `ui-alert-${variant}`, className)} {...props} />;
}

export function AlertTitle(props: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('ui-alert-title', props.className)} {...props} />;
}

export function AlertDescription(props: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ui-alert-description', props.className)} {...props} />;
}
