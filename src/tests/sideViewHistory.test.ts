import { describe, it, expect } from 'vitest';
import { Citation } from '../types/akn';

describe('SideView History Management Logic', () => {
  const isSameCitation = (a: Citation | null, b: Citation | null): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.target_eid === b.target_eid && a.parent_eid === b.parent_eid && a.raw_text === b.raw_text;
  };

  it('correctly manages back and forward history stack', () => {
    let history: Citation[] = [];
    let historyIndex = -1;

    const c1: Citation = { parent_eid: 's1', target_eid: 's2', raw_text: 'sec 2', span: [0,0], relation: '', resolved: true, external: false };
    const c2: Citation = { parent_eid: 's2', target_eid: 's3', raw_text: 'sec 3', span: [0,0], relation: '', resolved: true, external: false };
    const c3: Citation = { parent_eid: 's3', target_eid: 's4', raw_text: 'sec 4', span: [0,0], relation: '', resolved: true, external: false };

    // Push c1
    history = [...history.slice(0, historyIndex + 1), c1];
    historyIndex = history.length - 1;
    expect(historyIndex).toBe(0);
    expect(history).toEqual([c1]);

    // Push c2
    history = [...history.slice(0, historyIndex + 1), c2];
    historyIndex = history.length - 1;
    expect(historyIndex).toBe(1);
    expect(history).toEqual([c1, c2]);

    // Push c3
    history = [...history.slice(0, historyIndex + 1), c3];
    historyIndex = history.length - 1;
    expect(historyIndex).toBe(2);
    expect(history).toEqual([c1, c2, c3]);

    // Go Back
    expect(historyIndex > 0).toBe(true); // canGoBack
    historyIndex = historyIndex - 1; // 1
    expect(history[historyIndex]).toBe(c2);
    expect(historyIndex < history.length - 1).toBe(true); // canGoForward

    // Go Back again
    historyIndex = historyIndex - 1; // 0
    expect(history[historyIndex]).toBe(c1);
    expect(historyIndex > 0).toBe(false); // cannot go back further

    // Go Forward
    historyIndex = historyIndex + 1; // 1
    expect(history[historyIndex]).toBe(c2);

    // Branching forward: user navigates to c4 while at index 1
    const c4: Citation = { parent_eid: 's2', target_eid: 's5', raw_text: 'sec 5', span: [0,0], relation: '', resolved: true, external: false };
    history = [...history.slice(0, historyIndex + 1), c4];
    historyIndex = history.length - 1;

    expect(history).toEqual([c1, c2, c4]);
    expect(historyIndex).toBe(2);
    expect(historyIndex < history.length - 1).toBe(false); // cannot go forward
  });

  it('prevents consecutive duplicate citations in history', () => {
    let history: Citation[] = [];
    let historyIndex = -1;

    const push = (c: Citation) => {
      if (historyIndex >= 0 && historyIndex < history.length && isSameCitation(history[historyIndex], c)) {
        return;
      }
      history = [...history.slice(0, historyIndex + 1), c];
      historyIndex = history.length - 1;
    };

    const c1: Citation = { parent_eid: 's1', target_eid: 's2', raw_text: 'sec 2', span: [0,0], relation: '', resolved: true, external: false };
    const c1Clone: Citation = { ...c1 };

    push(c1);
    expect(history.length).toBe(1);

    // Push clone of c1
    push(c1Clone);
    expect(history.length).toBe(1); // Not duplicated!
  });
});
