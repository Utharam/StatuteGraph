import React, { useState, useRef, useEffect } from 'react';
import { Footnote } from '../types/akn';
import { BookOpen, Calendar, ShieldAlert } from 'lucide-react';

interface FootnotePopoverProps {
  footnote: Footnote;
  children: React.ReactNode;
}

export const FootnotePopover: React.FC<FootnotePopoverProps> = ({ footnote, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const amendment = footnote.amendment;
  let actionColor = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300';
  if (amendment?.action.toLowerCase().includes('omit')) {
    actionColor = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300';
  } else if (amendment?.action.toLowerCase().includes('insert')) {
    actionColor = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300';
  }

  return (
    <span className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center font-mono text-xs font-semibold px-1 py-0.5 mx-0.5 rounded text-amber-700 bg-amber-100/80 hover:bg-amber-200 dark:text-amber-300 dark:bg-amber-950/70 dark:hover:bg-amber-900 border border-amber-300/60 dark:border-amber-700/60 transition-colors cursor-pointer select-none"
        title={`Footnote [${footnote.number}]: Click to inspect amendment history`}
      >
        {children}
      </button>

      {isOpen && (
        <div className="fixed sm:absolute z-50 bottom-4 inset-x-4 sm:inset-x-auto sm:bottom-full sm:left-1/2 sm:-translate-x-1/2 sm:mb-2 w-auto sm:w-96 p-4 rounded-xl shadow-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm animate-in fade-in zoom-in-95 duration-150">
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
              Official Gazette CGST
            </span>
          </div>
        </div>
      )}
    </span>
  );
};
