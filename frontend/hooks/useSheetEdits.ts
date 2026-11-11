"use client";

import React from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import {
  cellId,
  type SheetCellChangeRequest,
  type SheetCellValue,
  type SheetCellsResponse,
} from "@/lib/sheets/types";
import { sameValue } from "@/lib/sheets/format";

export type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "error";

export interface CellEdit {
  companyId: number;
  columnKey: string;
  value: SheetCellValue;
}

interface HistoryEntry {
  companyId: number;
  columnKey: string;
  before: SheetCellValue;
  after: SheetCellValue;
}

interface QueuedChange {
  companyId: number;
  columnKey: string;
  value: SheetCellValue;
  base: SheetCellValue;
}

const FLUSH_DELAY_MS = 300;
const HISTORY_LIMIT = 100;
const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000];

interface Options {
  cellsUrl: string;
  /** Latest value known from the server (polled data + confirmed saves). */
  getServerValue: (companyId: number, columnKey: string) => SheetCellValue;
  /** Called after the server confirmed or rejected values (update the SWR cache). */
  onServerValues: (values: CellEdit[]) => void;
  columnLabel: (columnKey: string) => string;
}

/**
 * Google-Sheets-like editing: optimistic overlay, batched autosave, retry on network
 * errors, and undo/redo that keeps working after autosave (undo = a normal write of
 * the previous value, checked against the value we wrote).
 */
export function useSheetEdits({ cellsUrl, getServerValue, onServerValues, columnLabel }: Options) {
  const { t } = useTranslation();
  const [overlay, setOverlay] = React.useState<Map<string, SheetCellValue>>(() => new Map());
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [historySize, setHistorySize] = React.useState({ undo: 0, redo: 0 });

  const overlayRef = React.useRef(overlay);
  const queueRef = React.useRef(new Map<string, QueuedChange>());
  const inflightRef = React.useRef(new Map<string, QueuedChange>());
  const undoRef = React.useRef<HistoryEntry[][]>([]);
  const redoRef = React.useRef<HistoryEntry[][]>([]);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = React.useRef(0);

  const optionsRef = React.useRef({ getServerValue, onServerValues, columnLabel, cellsUrl, t });
  optionsRef.current = { getServerValue, onServerValues, columnLabel, cellsUrl, t };

  const updateOverlay = React.useCallback((fn: (draft: Map<string, SheetCellValue>) => void) => {
    const next = new Map(overlayRef.current);
    fn(next);
    overlayRef.current = next;
    setOverlay(next);
  }, []);

  const syncHistorySize = () =>
    setHistorySize({ undo: undoRef.current.length, redo: redoRef.current.length });

  const currentValue = React.useCallback((companyId: number, columnKey: string) => {
    const id = cellId(companyId, columnKey);
    return overlayRef.current.has(id)
      ? overlayRef.current.get(id)!
      : optionsRef.current.getServerValue(companyId, columnKey);
  }, []);

  const flush = React.useCallback(async () => {
    timerRef.current = null;
    if (inflightRef.current.size > 0 || queueRef.current.size === 0) return;

    const batch = new Map(queueRef.current);
    queueRef.current.clear();
    inflightRef.current = batch;
    setStatus("saving");

    const changes: SheetCellChangeRequest[] = [...batch.values()].map((c) => ({
      company_id: c.companyId,
      column_key: c.columnKey,
      value: c.value,
      base: c.base,
    }));
    const opts = optionsRef.current;

    const settle = (ids: Iterable<string>) => {
      updateOverlay((draft) => {
        for (const id of ids) {
          if (!queueRef.current.has(id)) draft.delete(id);
        }
      });
    };

    try {
      const { data } = await apiClient.patch<SheetCellsResponse>(opts.cellsUrl, { changes });
      inflightRef.current = new Map();
      retryRef.current = 0;

      const confirmed: CellEdit[] = [
        ...data.applied.map((a) => ({ companyId: a.company_id, columnKey: a.column_key, value: a.value })),
        ...data.conflicts.map((c) => ({ companyId: c.company_id, columnKey: c.column_key, value: c.current })),
      ];
      // Edits queued meanwhile for a conflicted cell were based on a stale value — drop them.
      for (const conflict of data.conflicts) {
        queueRef.current.delete(cellId(conflict.company_id, conflict.column_key));
      }
      opts.onServerValues(confirmed);
      settle(batch.keys());

      for (const conflict of data.conflicts) {
        toast.warning(opts.t("sheets.conflict"), {
          description: opts.t("sheets.conflictDescription", {
            column: opts.columnLabel(conflict.column_key),
            who: conflict.updated_by || opts.t("sheets.someoneElse"),
          }),
        });
      }
      setStatus(queueRef.current.size > 0 ? "saving" : "saved");
    } catch (error: unknown) {
      const response = (error as { response?: { status?: number; data?: any } }).response;
      const code = response?.status;
      if (code === 400 || code === 403 || code === 404) {
        inflightRef.current = new Map();
        settle(batch.keys());
        const detail =
          response?.data?.errors?.[0]?.detail || response?.data?.detail || opts.t("sheets.saveRejected");
        toast.error(opts.t("sheets.saveRejected"), { description: String(detail) });
        setStatus(queueRef.current.size > 0 ? "saving" : "error");
        // Rejected batch is dropped, but edits queued while it was in flight must still flush.
        if (queueRef.current.size > 0) {
          timerRef.current = setTimeout(() => void flush(), FLUSH_DELAY_MS);
        }
        return;
      } else {
        // Network / 5xx: put the batch back. Newer queued edits of the same cell win
        // entirely (including their base) — overwriting base with the failed batch's base
        // would make the next PATCH conflict against a value the user already moved past.
        for (const [id, change] of batch) {
          const newer = queueRef.current.get(id);
          queueRef.current.set(id, newer ?? change);
        }
        inflightRef.current = new Map();
        const delay = RETRY_DELAYS_MS[Math.min(retryRef.current, RETRY_DELAYS_MS.length - 1)];
        retryRef.current += 1;
        setStatus("retrying");
        timerRef.current = setTimeout(() => void flush(), delay);
        return;
      }
    }

    if (queueRef.current.size > 0) {
      timerRef.current = setTimeout(() => void flush(), FLUSH_DELAY_MS);
    }
  }, [updateOverlay]);

  const scheduleFlush = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), FLUSH_DELAY_MS);
  }, [flush]);

  const enqueue = React.useCallback(
    (companyId: number, columnKey: string, value: SheetCellValue, expectedBase: SheetCellValue) => {
      const id = cellId(companyId, columnKey);
      const queued = queueRef.current.get(id);
      const inflight = inflightRef.current.get(id);
      const base = queued ? queued.base : inflight ? inflight.value : expectedBase;
      queueRef.current.set(id, { companyId, columnKey, value, base });
    },
    []
  );

  /** One user action (typing, paste, delete, undo step) = one history group. */
  const writeGroup = React.useCallback(
    (entries: HistoryEntry[], direction: "do" | "undo" | "redo") => {
      if (entries.length === 0) return;
      updateOverlay((draft) => {
        for (const e of entries) {
          const value = direction === "undo" ? e.before : e.after;
          draft.set(cellId(e.companyId, e.columnKey), value);
        }
      });
      for (const e of entries) {
        if (direction === "undo") enqueue(e.companyId, e.columnKey, e.before, e.after);
        else if (direction === "redo") enqueue(e.companyId, e.columnKey, e.after, e.before);
        else
          enqueue(
            e.companyId,
            e.columnKey,
            e.after,
            optionsRef.current.getServerValue(e.companyId, e.columnKey)
          );
      }
      setStatus("saving");
      scheduleFlush();
    },
    [enqueue, scheduleFlush, updateOverlay]
  );

  const applyEdits = React.useCallback(
    (edits: CellEdit[]) => {
      const entries: HistoryEntry[] = [];
      for (const edit of edits) {
        const before = currentValue(edit.companyId, edit.columnKey);
        if (sameValue(before, edit.value)) continue;
        entries.push({ companyId: edit.companyId, columnKey: edit.columnKey, before, after: edit.value });
      }
      if (entries.length === 0) return;
      undoRef.current = [...undoRef.current, entries].slice(-HISTORY_LIMIT);
      redoRef.current = [];
      syncHistorySize();
      writeGroup(entries, "do");
    },
    [currentValue, writeGroup]
  );

  const undo = React.useCallback(() => {
    const group = undoRef.current.pop();
    if (!group) return;
    redoRef.current.push(group);
    syncHistorySize();
    writeGroup(group, "undo");
  }, [writeGroup]);

  const redo = React.useCallback(() => {
    const group = redoRef.current.pop();
    if (!group) return;
    undoRef.current.push(group);
    syncHistorySize();
    writeGroup(group, "redo");
  }, [writeGroup]);

  React.useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (queueRef.current.size > 0 || inflightRef.current.size > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Leaving the tab/page must not lose queued edits: send them right away.
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (queueRef.current.size > 0) void flush();
    },
    [flush]
  );

  return {
    overlay,
    status,
    canUndo: historySize.undo > 0,
    canRedo: historySize.redo > 0,
    applyEdits,
    undo,
    redo,
    hasPending: () => queueRef.current.size > 0 || inflightRef.current.size > 0,
  };
}
