import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
};

export function Progress({ label, className, ...props }: ProgressProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuetext="In progress"
      className={cn('ui-progress', className)}
      {...props}
    >
      <span className="ui-progress-indicator" aria-hidden="true" />
    </div>
  );
}
