import { createContext, useContext, useId, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type TabsContextValue = { value: string; setValue: (value: string) => void; id: string };
const TabsContext = createContext<TabsContextValue | null>(null);
function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tabs components must be nested inside Tabs.');
  return context;
}

export function Tabs({ value, onValueChange, className, children }: {
  value: string; onValueChange: (value: string) => void; className?: string; children: ReactNode;
}) {
  const id = useId();
  return <TabsContext.Provider value={{ value, setValue: onValueChange, id }}><div className={cn('ui-tabs-root', className)}>{children}</div></TabsContext.Provider>;
}

export function TabsList({ className, children, 'aria-label': ariaLabel }: {
  className?: string; children: ReactNode; 'aria-label'?: string;
}) {
  const { value, setValue } = useTabs();
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next]?.focus();
    const nextValue = tabs[next]?.dataset.value;
    if (nextValue) setValue(nextValue);
  }
  return <div className={cn('ui-tabs-list', className)} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} data-value={value}>{children}</div>;
}

export function TabsTrigger({ value: tabValue, className, children }: {
  value: string; className?: string; children: ReactNode;
}) {
  const { value, setValue, id } = useTabs();
  const selected = value === tabValue;
  return <button type="button" role="tab" id={`${id}-tab-${tabValue}`} aria-controls={`${id}-panel-${tabValue}`} aria-selected={selected} tabIndex={selected ? 0 : -1} data-state={selected ? 'active' : 'inactive'} data-value={tabValue} className={cn('ui-tabs-trigger', className)} onClick={() => setValue(tabValue)} onFocus={() => setValue(tabValue)}>{children}</button>;
}

export function TabsContent({ value: tabValue, className, children }: {
  value: string; className?: string; children: ReactNode;
}) {
  const { value, id } = useTabs();
  const selected = value === tabValue;
  return <div role="tabpanel" id={`${id}-panel-${tabValue}`} aria-labelledby={`${id}-tab-${tabValue}`} tabIndex={0} hidden={!selected} className={cn('ui-tabs-content', className)}>{selected ? children : null}</div>;
}
