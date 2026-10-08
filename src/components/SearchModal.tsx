import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IndexedAknData, cleanStatuteText } from '../services/aknLoader';
import { Provision } from '../types/akn';
import { Search, X, BookOpen, ArrowRight, CornerDownLeft } from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  indexData: IndexedAknData;
  onSelectProvision: (eid: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  indexData,
  onSelectProvision,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Global keyboard shortcuts (Ctrl+K, Cmd+K, /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Trigger open handled in App
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

// Two-pass search.
  //
  // The previous single pass capped at 40 matches while walking
  // `indexData.provisions`, and promoted exact section-number hits with
  // `unshift`. Searching "10" therefore filled the cap with earlier
  // text matches and never reached section 10 at all: a search for a section
  // by number could return nothing. Number and title matches are collected
  // first, so they always win regardless of where they sit in the array.
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();

    interface Hit {
      provision: Provision;
      matchType: 'section' | 'title' | 'text';
      snippet: string;
    }

    const primary: Hit[] = [];
    const secondary: Hit[] = [];
    const TEXT_CAP = 40;

    for (const prov of indexData.provisions) {
      const num = (prov.num || '').toLowerCase();
      const text = prov.text || '';

      if (num && (num === q || `section ${num}` === q || num === q.replace(/^section\s*/, ''))) {
        primary.push({ provision: prov, matchType: 'section', snippet: cleanStatuteText(text).slice(0, 140) });
        continue;
      }

      const title = prov.title;
      if (title.toLowerCase().includes(q)) {
        primary.push({ provision: prov, matchType: 'title', snippet: cleanStatuteText(text).slice(0, 140) });
        continue;
      }

      if (secondary.length < TEXT_CAP && text) {
        const idx = text.toLowerCase().indexOf(q);
        if (idx >= 0) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(text.length, idx + q.length + 80);
          secondary.push({
            provision: prov,
            matchType: 'text',
            snippet:
              (start > 0 ? '...' : '') +
              cleanStatuteText(text.substring(start, end)) +
              (end < text.length ? '...' : ''),
          });
        }
      }
    }

    // Stable within each band so document order is preserved.
    return [...primary, ...secondary];
  }, [query, indexData]);

  // Handle arrow key navigation in results
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        onSelectProvision(results[selectedIndex].provision.eid);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/50 ">
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-slate-50/80 dark:bg-slate-900/80">
          <Search className="w-5 h-5 text-amber-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search by section (e.g., 37), topic (e.g., invoice), or phrase..."
            className="flex-1 bg-transparent border-none text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-500 rounded border border-slate-300 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/60">
          {query.trim() === '' ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium">Type to search across sections, sub-sections, clauses and provisos</p>
              <p className="text-xs text-slate-400">
                Quick jump: "37" &bull; "input tax credit" &bull; "registration" &bull; "proviso"
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="text-sm font-medium">No provisions matching "{query}"</p>
              <p className="text-xs mt-1">Try another keyword or section number.</p>
            </div>
          ) : (
            results.map((res, i) => {
              const isSelected = i === selectedIndex;
              return (
                <div
                  key={res.provision.eid}
                  onClick={() => {
                    onSelectProvision(res.provision.eid);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`pt-2 p-3 rounded-xl cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-slate-900 dark:text-slate-100'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-amber-800 dark:text-amber-300 shrink-0">
                        {res.provision.num ? `§ ${res.provision.num}` : res.provision.kind}
                      </span>
                      <span className="font-serif font-semibold text-sm truncate">
                        {res.provision.title}
                      </span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                        {res.matchType}
                      </span>
                    </div>
                    {res.snippet && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-serif line-clamp-2 leading-relaxed">
                        {res.snippet}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-slate-400 shrink-0 mt-1">
                    {isSelected ? (
                      <CornerDownLeft className="w-4 h-4 text-amber-600" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5 opacity-40" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>&uarr;&darr; Navigate</span>
            <span>&crarr; Jump</span>
          </div>
          <span>Showing up to {results.length} matches</span>
        </div>
      </div>
    </div>
  );
};
