import { describe, expect, it } from "vitest";

import {
  pushUndo,
  remapUndo,
  UNDO_LIMIT,
  type EditorSnapshot,
  type UndoEntry,
} from "@/components/arch/undo-history";
import type { ApiWallHold } from "@/services/types";

function hold(id: number): ApiWallHold {
  return {
    id,
    wall_id: 1,
    label: "",
    x: 0.1,
    y: 0.1,
    width: 0.1,
    height: 0.1,
    created_at: "2026-10-23T00:00:00Z",
    updated_at: "2026-10-23T00:00:00Z",
  };
}

function snapshot(sequence: number[], selectedId: number | null = null): EditorSnapshot {
  return { holds: sequence.map(hold), sequence, selectedId };
}

describe("undo history", () => {
  it("keeps only the last 30 operations", () => {
    let history: UndoEntry[] = [];
    for (let index = 0; index < UNDO_LIMIT + 5; index += 1) {
      history = pushUndo(history, snapshot([index]), `edit ${index}`);
    }

    expect(history).toHaveLength(UNDO_LIMIT);
    expect(history[0]?.snapshot.sequence).toEqual([5]);
    expect(history[history.length - 1]?.snapshot.sequence).toEqual([UNDO_LIMIT + 4]);
  });

  it("remaps a recreated hold in every older snapshot", () => {
    const history: UndoEntry[] = [
      { label: "older", affectedHoldId: 2, snapshot: snapshot([1, 2], 2) },
      { label: "newer", affectedHoldId: 9, snapshot: snapshot([2, 1], null) },
    ];

    const remapped = remapUndo(history, new Map([[2, 9]]));

    expect(remapped[0]?.snapshot.sequence).toEqual([1, 9]);
    expect(remapped[0]?.snapshot.selectedId).toBe(9);
    expect(remapped[0]?.snapshot.holds.map((row) => row.id)).toEqual([1, 9]);
    expect(remapped[0]?.affectedHoldId).toBe(9);
    expect(remapped[1]?.snapshot.sequence).toEqual([9, 1]);
    expect(remapped[1]?.affectedHoldId).toBe(9);
    expect(history[0]?.snapshot.sequence).toEqual([1, 2]);
  });
});
