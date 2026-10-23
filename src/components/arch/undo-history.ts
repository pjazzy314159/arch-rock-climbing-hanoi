import type { ApiWallHold } from "@/services/types";

/**
 * The editor state that undo restores.
 *
 * The saved draft is deliberately not part of a snapshot: a successful save is
 * a clean baseline, so undo history is cleared rather than allowed to cross it.
 */
export type EditorSnapshot = {
  holds: ApiWallHold[];
  sequence: number[];
  selectedId: number | null;
};

export type UndoEntry = {
  label: string;
  snapshot: EditorSnapshot;
  /**
   * The one wall hold this operation touched. Undo only writes to this row,
   * so it cannot delete or overwrite a box another session added or changed
   * after the snapshot was taken.
   */
  affectedHoldId: number | null;
};

/** Bounded so a long editing session cannot grow without limit. */
export const UNDO_LIMIT = 30;

function copySnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    holds: snapshot.holds.map((hold) => ({ ...hold })),
    sequence: [...snapshot.sequence],
    selectedId: snapshot.selectedId,
  };
}

export function pushUndo(
  history: UndoEntry[],
  snapshot: EditorSnapshot,
  label: string,
  affectedHoldId: number | null = null,
): UndoEntry[] {
  return [...history, { label, snapshot: copySnapshot(snapshot), affectedHoldId }].slice(
    -UNDO_LIMIT,
  );
}

/**
 * Keep older history usable after a deleted box has been recreated with a new
 * server id. The restored sequence and any older snapshots must use the new id.
 */
export function remapUndo(history: UndoEntry[], idMap: Map<number, number>): UndoEntry[] {
  if (idMap.size === 0) return history;
  return history.map((entry) => ({
    label: entry.label,
    affectedHoldId:
      entry.affectedHoldId === null
        ? null
        : (idMap.get(entry.affectedHoldId) ?? entry.affectedHoldId),
    snapshot: {
      holds: entry.snapshot.holds.map((hold) => {
        const replacement = idMap.get(hold.id);
        return replacement === undefined ? hold : { ...hold, id: replacement };
      }),
      sequence: entry.snapshot.sequence.map((id) => idMap.get(id) ?? id),
      selectedId:
        entry.snapshot.selectedId === null
          ? null
          : (idMap.get(entry.snapshot.selectedId) ?? entry.snapshot.selectedId),
    },
  }));
}
