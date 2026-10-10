import React from 'react';
import { Check, Copy, TriangleAlert } from 'lucide-react';

/**
 * Copy control for a provision card.
 *
 * The state lives in the reader, not here. Thousands of these can be mounted
 * at once, so a local useState plus a timer per card would mean thousands of
 * hooks and timers for a feedback message that is only ever visible on one.
 */
export type CopyStatus = 'copied' | 'failed';

interface CopyProvisionButtonProps {
  /** Full name of the provision, for the live-region announcement. */
  label: string;
  status: CopyStatus | null;
  onCopy: () => void;
  /** Top-level cards are larger, so they get a slightly larger hit target. */
  size?: 'sm' | 'md';
}

export const CopyProvisionButton: React.FC<CopyProvisionButtonProps> = ({
  label,
  status,
  onCopy,
  size = 'sm',
}) => {
  const failed = status === 'failed';
  const tone = failed
    ? 'text-rose-500 dark:text-rose-400'
    : status === 'copied'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200';

  const hit = size === 'md' ? 'p-1.5 rounded-lg' : 'p-1 rounded';
  const icon = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`${hit} ${tone} transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0`}
      title={
        failed
          ? 'Copy blocked by the browser. Select the text and copy manually.'
          : `Copy ${label}`
      }
      aria-label={status ? undefined : `Copy ${label}`}
    >
      <span className="sr-only">
        {status === 'copied' ? `${label} copied` : status === 'failed' ? `Copying ${label} failed` : ''}
      </span>
      {failed ? (
        <TriangleAlert className={icon} aria-hidden="true" />
      ) : status === 'copied' ? (
        <Check className={icon} aria-hidden="true" />
      ) : (
        <Copy className={icon} aria-hidden="true" />
      )}
    </button>
  );
};