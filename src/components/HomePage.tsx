import React, { useRef } from 'react';
import {
  StatuteDocument,
  formatBytes,
  relativeTime,
  recents,
} from '../services/documentLibrary';
import {
  BookOpen,
  FolderOpen,
  Upload,
  FileJson,
  Trash2,
  Clock,
  AlertCircle,
  Scale,
  ArrowRight,
  Library,
  X,
} from 'lucide-react';

import {
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  PRODUCT_DESCRIPTION,
  AUTHOR_NAME,
  AUTHOR_URL,
  PARSER_NAME,
  PARSER_URL,
} from '../branding';

interface HomePageProps {
  documents: StatuteDocument[];
  isLoadingLibrary: boolean;
  storageAvailable: boolean;
  isOpeningId: string | null;
  error: { title: string; detail?: string } | null;
  onOpen: (document: StatuteDocument) => void;
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onDismissError: () => void;
}

/** Cover art per document, chosen by index so a library looks varied. */
const COVERS = [
  'from-amber-600 via-amber-500 to-rose-500',
  'from-indigo-600 via-indigo-500 to-sky-500',
  'from-emerald-600 via-teal-500 to-cyan-600',
  'from-violet-600 via-purple-500 to-fuchsia-500',
  'from-rose-600 via-pink-500 to-orange-500',
];

function coverFor(document: StatuteDocument): string {
  const hash = Array.from(document.id).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return COVERS[hash % COVERS.length];
}

const DocumentCard: React.FC<{
  document: StatuteDocument;
  isOpening: boolean;
  onOpen: () => void;
  onRemove?: () => void;
}> = ({ document, isOpening, onOpen, onRemove }) => (
  <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm transition-shadow hover:shadow-md">
    <button
      type="button"
      onClick={onOpen}
      disabled={isOpening}
      className="flex-1 text-left p-4 pb-3 disabled:opacity-60 disabled:cursor-wait"
    >
      <div
        className={`h-24 rounded-lg bg-gradient-to-br ${coverFor(document)} relative overflow-hidden mb-3 flex items-end p-3`}
      >
        <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_15%,white,transparent_55%)]" />
        <div className="relative">
          <Scale className="w-5 h-5 text-white/90 mb-1" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
            {document.origin === 'builtin' ? 'Legislation' : 'Opened'}
          </p>
        </div>
      </div>

      <h3 className="font-serif font-bold text-sm leading-snug text-slate-900 dark:text-slate-100 line-clamp-2">
        {document.title}
      </h3>

      <div className="mt-1.5 space-y-0.5">
        {document.subtitle && (
          <p className="text-xs text-slate-600 dark:text-slate-400">{document.subtitle}</p>
        )}
        {document.source && (
          <p className="text-[11px] text-slate-500 dark:text-slate-500">{document.source}</p>
        )}
        {document.summary ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {document.summary.provisions.toLocaleString()} provisions · {document.summary.citations} refs ·{' '}
            {document.summary.footnotes} notes
          </p>
        ) : document.sizeBytes ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {formatBytes(document.sizeBytes)}
            {document.lastOpenedAt ? ` · ${relativeTime(document.lastOpenedAt)}` : ''}
          </p>
        ) : null}
      </div>
    </button>

    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        title={`Remove ${document.shortTitle} from this browser`}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/30 text-white/80 hover:bg-red-600 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

/**
 * Document library.
 *
 * Modelled on a desktop PDF reader's start screen: a top bar with an Open
 * action, a recent row, then a grid. The drop target spans the whole page so a
 * user can drag a file anywhere.
 */
export const HomePage: React.FC<HomePageProps> = ({
  documents,
  isLoadingLibrary,
  storageAvailable,
  isOpeningId,
  error,
  onOpen,
  onAddFiles,
  onRemove,
  onDismissError,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const builtin = documents.filter((d) => d.origin === 'builtin');
  const local = documents.filter((d) => d.origin === 'local');
  const recentList = recents(documents.filter((d) => d.lastOpenedAt), 4);

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      onDragEnter={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) setIsDragging(true);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const files = Array.from(event.dataTransfer?.files ?? []).filter(
          (f) => /\.json$/i.test(f.name) || f.type === 'application/json'
        );
        if (files.length > 0) onAddFiles(files);
      }}
    >
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-indigo-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
<h1 className="text-sm font-bold leading-tight">{PRODUCT_NAME}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              {PRODUCT_TAGLINE}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Open</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) onAddFiles(files);
                // Reset so re-picking the same file fires change again.
                event.target.value = '';
              }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Hero / drop target */}
        <section
          className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
          }`}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center mb-4">
            <Upload className={`w-6 h-6 text-indigo-600 dark:text-indigo-400 ${isDragging ? 'animate-bounce' : ''}`} />
          </div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold mb-1.5">
            {isDragging ? 'Drop to open' : 'Open a statute document'}
          </h2>
<p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mb-5">{PRODUCT_DESCRIPTION}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mb-5">
            Drag a parsed JSON file anywhere on this page, or choose one from your computer. Documents are stored in
            this browser, so they stay in your library between visits.
          </p>
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Choose a JSON file
          </button>
<p className="mt-4 text-[11px] text-slate-400">
            Expects the export produced by{' '}
            <a
              href={PARSER_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {PARSER_NAME}
            </a>
            , the PDF&nbsp;to&nbsp;JSON converter built for this reader: a JSON object with{' '}
            <code className="font-mono">provisions</code>, <code className="font-mono">citations</code> and{' '}
            <code className="font-mono">footnotes</code>.
          </p>
        </section>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">{error.title}</p>
              {error.detail && (
                <p className="text-xs text-red-800 dark:text-red-300 mt-0.5">{error.detail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onDismissError}
              className="p-1 rounded-md text-red-400 hover:text-red-600 dark:hover:text-red-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Recent */}
        {recentList.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Recent
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recentList.map((document) => (
                <RecentTile
                  key={document.id}
                  document={document}
                  isOpening={isOpeningId === document.id}
                  onOpen={() => onOpen(document)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Built-in */}
        {builtin.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Library className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Legislation
              </h3>
              <span className="text-[11px] text-slate-400">{builtin.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {builtin.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  isOpening={isOpeningId === document.id}
                  onOpen={() => onOpen(document)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Local */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FileJson className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Your documents
            </h3>
            <span className="text-[11px] text-slate-400">{local.length}</span>
          </div>

          {isLoadingLibrary ? (
            <p className="text-sm text-slate-400 py-6 text-center">Reading your library…</p>
          ) : local.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nothing here yet. Open a parsed statute JSON to add it to your library.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {local.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  isOpening={isOpeningId === document.id}
                  onOpen={() => onOpen(document)}
                  onRemove={() => onRemove(document.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          {storageAvailable ? (
            <span>Documents you open are stored locally in this browser only.</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Browser storage is unavailable, so documents you open will be forgotten when you close this tab.
            </span>
          )}
          <span>
            Created by{' '}
            <a
              href={AUTHOR_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {AUTHOR_NAME}
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
};

const RecentTile: React.FC<{
  document: StatuteDocument;
  isOpening: boolean;
  onOpen: () => void;
}> = ({ document, isOpening, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    disabled={isOpening}
    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors text-left disabled:opacity-60 disabled:cursor-wait"
  >
    <div className={`w-10 h-12 rounded bg-gradient-to-br ${coverFor(document)} shrink-0`} />
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
        {document.shortTitle}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
        {document.lastOpenedAt ? relativeTime(document.lastOpenedAt) : document.source}
      </p>
    </div>
    <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
  </button>
);
