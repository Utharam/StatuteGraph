import React, { useCallback, useEffect, useState } from 'react';
import { extractJsonFiles } from '../services/documentLibrary';
import { Upload, FileJson } from 'lucide-react';

/**
 * Global file drop target.
 *
 * Listens on the window rather than a container so a file can be dropped
 * anywhere, including over the reader canvas and the side panel. The counter is
 * necessary because `dragleave` fires when crossing child boundaries; without
 * it the overlay flickers off the instant the pointer moves over a nested
 * element.
 */
export const GlobalDropZone: React.FC<{ onFiles: (files: File[]) => void }> = ({ onFiles }) => {
  const [isDragging, setIsDragging] = useState(false);
  const depth = React.useRef(0);

  const hasFiles = useCallback((event: DragEvent) => {
    const types = event.dataTransfer?.types;
    return !!types && Array.from(types).includes('Files');
  }, []);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setIsDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Required, or the browser navigates to the dropped file.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setIsDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setIsDragging(false);

      const files = extractJsonFiles(event.dataTransfer?.items ?? event.dataTransfer?.files ?? null);
      if (files.length > 0) {
        onFiles(files);
      }
    };

    // A drag that ends outside the window never fires `drop`.
    const onDragEnd = () => {
      depth.current = 0;
      setIsDragging(false);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', onDragEnd);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', onDragEnd);
    };
  }, [hasFiles, onFiles]);

  if (!isDragging) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-slate-900/70 backdrop-blur-sm pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div className="px-10 py-8 rounded-2xl border-2 border-dashed border-indigo-400 bg-slate-900/80 text-center">
        <Upload className="w-10 h-10 mx-auto text-indigo-300 mb-3" />
        <p className="text-lg font-bold text-white">Drop to open</p>
        <p className="text-xs text-slate-300 mt-1">Parsed AKN statute JSON</p>
      </div>
      <p className="text-xs text-slate-300 flex items-center gap-1.5">
        <FileJson className="w-3.5 h-3.5" />
        .json files only
      </p>
    </div>
  );
};