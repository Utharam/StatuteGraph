import { useCallback, useEffect, useState } from 'react';
import {
  DocumentLoadError,
  StatuteDocument,
  addLocalDocument,
  loadCatalogue,
  openDocument,
  removeLocalDocument,
} from '../services/documentLibrary';
import { isStorageAvailable } from '../services/documentStore';

export interface LibraryError {
  title: string;
  detail?: string;
}

export interface LibraryState {
  documents: StatuteDocument[];
  isLoading: boolean;
  /** False when IndexedDB is blocked, so opened documents cannot persist. */
  storageAvailable: boolean;
  error: LibraryError | null;
  addFiles: (files: File[]) => Promise<StatuteDocument[]>;
  remove: (id: string) => Promise<void>;
  dismissError: () => void;
}

/**
 * Owns the document catalogue: the built-in statutes plus anything the user has
 * opened. Refresh is manual (after add/remove) rather than reactive, since the
 * underlying store is only written by this hook.
 */
export function useDocumentLibrary(): LibraryState {
  const [documents, setDocuments] = useState<StatuteDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<LibraryError | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await loadCatalogue());
      setStorageAvailable(await isStorageAvailable());
    } catch {
      setError({ title: 'Could not read your document library.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addFiles = useCallback(
    async (files: File[]): Promise<StatuteDocument[]> => {
      const added: StatuteDocument[] = [];

      for (const file of files) {
        try {
          const document = await addLocalDocument(file);
          added.push(document);
          // Re-read the dataset so the card shows real provision counts rather
          // than only a file size.
          const enriched = await enrich(document);
          added[added.length - 1] = enriched;
        } catch (caught) {
          if (caught instanceof DocumentLoadError) {
            setError({ title: caught.message, detail: caught.detail });
          } else {
            setError({
              title: `Could not read ${file.name}.`,
              detail: caught instanceof Error ? caught.message : undefined,
            });
          }
        }
      }

      if (added.length > 0) setError(null);
      await refresh();
      return added;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await removeLocalDocument(id);
      await refresh();
    },
    [refresh]
  );

  const dismissError = useCallback(() => setError(null), []);

  return { documents, isLoading, storageAvailable, error, addFiles, remove, dismissError };
}

/**
 * Loads a just-added document purely to compute its summary. If this fails the
 * document is still added — a missing summary must not block opening.
 */
async function enrich(document: StatuteDocument): Promise<StatuteDocument> {
  try {
    const opened = await openDocument(document);
    return { ...document, summary: opened.document.summary };
  } catch {
    return document;
  }
}