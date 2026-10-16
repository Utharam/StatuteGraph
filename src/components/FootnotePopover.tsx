import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Footnote } from '../types/akn';
import { BookOpen, Calendar, ShieldAlert } from 'lucide-react';
import { computePopoverPosition, PopoverPosition } from './footnotePlacement';

interface FootnotePopoverProps {
  footnote: Footnote;
  children: React.ReactNode;
}

/**
 * What the amendment did, taken from the record itself.
 * Keeps the badge meaningful for any statute rather than naming one.
 */
function actionLabel(footnote: Footnote): string {
  const action = footnote.amendment?.action?.trim();
  if (!action) return 'Amendment note';
  return action.charAt(0).toUpperCase() + action.slice(1);
}

export const FootnotePopover: React.FC<FootnotePopoverProps> = ({ footnote, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  // Measured after the panel is in the DOM, then kept correct while open: the
  // reader scrolls underneath an open popover, and a footnote that drifts away
  // from its popover is worse than no popover.
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    setPosition(
      computePopoverPosition(
        trigger.getBoundingClientRect(),
        { width: panel.offsetWidth, height: panel.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    reposition();
  }, [isOpen, reposition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen, reposition]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const amendment = footnote.amendment;
  let actionColor = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300';
  if (amendment?.action.toLowerCase().includes('omit')) {
    actionColor = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300';
  } else if (amendment?.action.toLowerCase().includes('insert')) {
    actionColor = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300';
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="inline-flex items-center justify-center font-mono text-xs font-semibold px-1 py-0.5 mx-0.5 rounded text-amber-700 bg-amber-100/80 hover:bg-amber-200 dark:text-amber-300 dark:bg-amber-950/70 dark:hover:bg-amber-900 border border-amber-300/60 dark:border-amber-700/60 transition-colors cursor-pointer select-none"
        title={`Footnote [${footnote.number}]: Click to inspect amendment history`}
      >
        {children}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={(node) => {
              panelRef.current = node;
              popoverRef.current = node;
            }}
            role="dialog"
            aria-label={`Footnote ${footnote.number}`}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              // Hidden until measured, so it never flashes at the wrong place.
              visibility: position ? 'visible' : 'hidden',
            }}
            className="fixed z-50 w-96 max-w-[calc(100vw-2rem)] p-4 rounded-xl shadow-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm pop-in-150"
          >
          <div className="flex items-start justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-mono text-xs font-bold">
                {footnote.number}
              </span>
              <span className="font-semibold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Statutory Amendment Note
              </span>
            </div>
            {amendment?.action && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${actionColor}`}>
                {amendment.action}
              </span>
            )}
          </div>

          {amendment?.amending_act && (
            <div className="flex items-start gap-2 mb-2 text-xs font-medium text-amber-900 dark:text-amber-300">
              <BookOpen className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>{amendment.amending_act}</span>
            </div>
          )}

          <div className="text-xs text-slate-600 dark:text-slate-300 statute-text bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-700/60 max-h-48 overflow-y-auto">
            {footnote.raw_text}
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
            {footnote.page_number && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Page {footnote.page_number}
              </span>
            )}
            <span className="flex items-center gap-1 ml-auto text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              {/*
                Derived from the record, not from a fixed statute. It used to
                read "Official Gazette CGST" regardless of which Act was open.
              */}
              {actionLabel(footnote)}
            </span>
          </div>
          </div>,
          document.body
        )}
    </>
  );
};
