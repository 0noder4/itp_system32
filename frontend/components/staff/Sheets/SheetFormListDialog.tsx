"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SheetColumn, SheetListSchema } from "@/lib/sheets/types";
import { DialogUndoButtons } from "./SheetCellEditDialog";

type Row = Record<string, string | number>;

const ATTENDANCE = [
  { value: "", label: "—" },
  { value: "both", label: "oba dni" },
  { value: "day1", label: "dzień 1" },
  { value: "day2", label: "dzień 2" },
  { value: "none", label: "nieobecny" },
];

const JOB_FORM = [
  { value: "s", label: "stacjonarnie" },
  { value: "z", label: "zdalnie" },
  { value: "h", label: "hybrydowo" },
  { value: "k", label: "konkurs" },
  { value: "m", label: "mobilnie" },
];

const JOB_WORKLOAD = [
  { value: "pelen", label: "pełen etat" },
  { value: "pol", label: "1/2 etatu" },
  { value: "trzyczwarte", label: "3/4 etatu" },
  { value: "el", label: "elastyczny" },
];

const JOB_CONTRACT = [
  { value: "uop", label: "umowa o pracę" },
  { value: "uoz", label: "umowa o zlecenie" },
  { value: "uod", label: "umowa o dzieło" },
  { value: "b2b", label: "kontrakt b2b" },
  { value: "uos", label: "umowa o staż/praktyki" },
];

function emptyRow(schema: SheetListSchema): Row {
  switch (schema) {
    case "delegates":
      return { name: "", surname: "", phone_number: "", attendance: "" };
    case "pdi":
      return { name: "", surname: "", phone_number: "", email: "" };
    case "facilitators":
      return { name: "", surname: "", phone_number: "", description: "" };
    case "jobs":
      return {
        name: "",
        form: "s",
        workload: "pelen",
        contract: "uop",
        description: "",
        benefits: "",
        requirements: "",
        url: "",
      };
    default: {
      const _exhaustive: never = schema;
      return _exhaustive;
    }
  }
}

function normalizeRows(schema: SheetListSchema, raw: Record<string, unknown>[] | undefined): Row[] {
  if (!raw?.length) return [];
  return raw.map((item) => {
    const base = emptyRow(schema);
    for (const key of Object.keys(base)) {
      const value = item[key];
      if (value == null) continue;
      base[key] = typeof base[key] === "number" ? Number(value) || 0 : String(value);
    }
    return base;
  });
}

function cloneRows(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row }));
}

function useRowsHistory(open: boolean, initial: Row[]) {
  const initialRef = React.useRef(initial);
  initialRef.current = initial;
  const [rows, setRows] = React.useState<Row[]>([]);
  const past = React.useRef<Row[][]>([]);
  const future = React.useRef<Row[][]>([]);
  const lastSaved = React.useRef<Row[]>([]);
  const draftSynced = React.useRef(false);
  const [counts, setCounts] = React.useState({ undo: 0, redo: 0 });

  React.useEffect(() => {
    if (!open) return;
    const seed = cloneRows(initialRef.current);
    setRows(seed);
    past.current = [];
    future.current = [];
    lastSaved.current = seed;
    draftSynced.current = false;
    setCounts({ undo: 0, redo: 0 });
  }, [open]);

  const sync = () => setCounts({ undo: past.current.length, redo: future.current.length });

  const apply = (updater: (prev: Row[]) => Row[]) => {
    setRows((prev) => {
      past.current = [...past.current, cloneRows(prev)].slice(-80);
      future.current = [];
      sync();
      return updater(prev);
    });
  };

  const undo = () => {
    const previous = past.current.pop();
    if (!previous) return null;
    setRows((current) => {
      future.current.push(cloneRows(current));
      return previous;
    });
    sync();
    return previous;
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return null;
    setRows((current) => {
      past.current.push(cloneRows(current));
      return next;
    });
    sync();
    return next;
  };

  const markDraftSaved = (after: Row[]) => {
    past.current = [cloneRows(lastSaved.current)];
    future.current = [];
    lastSaved.current = cloneRows(after);
    draftSynced.current = true;
    setRows(after);
    sync();
  };

  const reset = () => {
    const seed = cloneRows(lastSaved.current);
    past.current = [];
    future.current = [];
    setRows(seed);
    draftSynced.current = false;
    sync();
  };

  return {
    rows,
    apply,
    undo,
    redo,
    markDraftSaved,
    reset,
    draftSynced,
    canUndo: counts.undo > 0,
    canRedo: counts.redo > 0,
  };
}

export function SheetFormListDialog({
  open,
  onOpenChange,
  column,
  companyName,
  initial,
  canRestore,
  onSave,
  onDraft,
  onRestore,
  busy,
  storedText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: SheetColumn | null;
  companyName: string;
  initial: Record<string, unknown>[] | undefined;
  canRestore?: boolean;
  onSave: (rows: Record<string, unknown>[]) => void;
  onDraft?: (rows: Record<string, unknown>[]) => Promise<void>;
  onRestore?: () => Promise<'local' | 'server'>;
  busy?: boolean;
  /** Composed text of the value currently in the company form. */
  storedText?: string;
}) {
  const schema = column?.list_schema;
  const seed = React.useMemo(
    () => (schema ? normalizeRows(schema, initial) : []),
    [schema, initial]
  );
  const history = useRowsHistory(open, seed);
  const showDraft = Boolean(onDraft && column?.can_draft);

  if (!column || !schema) return null;

  const update = (index: number, key: string, value: string | number) => {
    history.apply((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const removeRow = (index: number) => {
    history.apply((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    history.apply((prev) => [...prev, emptyRow(schema)]);
  };

  const saveDraft = async () => {
    if (!onDraft) return;
    const after = cloneRows(history.rows);
    await onDraft(after);
    history.markDraftSaved(after);
  };

  const handleUndo = async () => {
    const restored = history.undo();
    if (restored && history.draftSynced.current && onDraft) {
      await onDraft(cloneRows(restored));
    }
  };

  const handleRedo = async () => {
    const restored = history.redo();
    if (restored && history.draftSynced.current && onDraft) {
      await onDraft(cloneRows(restored));
    }
  };

  const handleRestore = async () => {
    try {
      const result = onRestore ? await onRestore() : 'local';
      if (result === 'local') history.reset();
    } catch {
      // The sheet view already shows the error.
    }
  };

  const showRestore = showDraft || Boolean(canRestore && onRestore);

  const fields = (row: Row, index: number) => {
    if (schema === "delegates") {
      return (
        <>
          <Field label="Imię" value={String(row.name)} onChange={(v) => update(index, "name", v)} />
          <Field label="Nazwisko" value={String(row.surname)} onChange={(v) => update(index, "surname", v)} />
          <Field
            label="Telefon"
            value={String(row.phone_number)}
            onChange={(v) => update(index, "phone_number", v)}
          />
          <SelectField
            label="Obecność"
            value={String(row.attendance)}
            options={ATTENDANCE}
            onChange={(v) => update(index, "attendance", v)}
          />
        </>
      );
    }
    if (schema === "pdi") {
      return (
        <>
          <Field label="Imię" value={String(row.name)} onChange={(v) => update(index, "name", v)} />
          <Field label="Nazwisko" value={String(row.surname)} onChange={(v) => update(index, "surname", v)} />
          <Field
            label="Telefon"
            value={String(row.phone_number)}
            onChange={(v) => update(index, "phone_number", v)}
          />
          <Field label="E-mail" value={String(row.email)} onChange={(v) => update(index, "email", v)} />
        </>
      );
    }
    if (schema === "facilitators") {
      return (
        <>
          <Field label="Imię" value={String(row.name)} onChange={(v) => update(index, "name", v)} />
          <Field label="Nazwisko" value={String(row.surname)} onChange={(v) => update(index, "surname", v)} />
          <Field
            label="Telefon"
            value={String(row.phone_number)}
            onChange={(v) => update(index, "phone_number", v)}
          />
          <Field
            label="Opis"
            value={String(row.description)}
            onChange={(v) => update(index, "description", v)}
          />
        </>
      );
    }
    return (
      <>
        <Field label="Nazwa" value={String(row.name)} onChange={(v) => update(index, "name", v)} />
        <SelectField
          label="Forma"
          value={String(row.form)}
          options={JOB_FORM}
          onChange={(v) => update(index, "form", v)}
        />
        <SelectField
          label="Wymiar etatu"
          value={String(row.workload)}
          options={JOB_WORKLOAD}
          onChange={(v) => update(index, "workload", v)}
        />
        <SelectField
          label="Umowa"
          value={String(row.contract)}
          options={JOB_CONTRACT}
          onChange={(v) => update(index, "contract", v)}
        />
        <Field
          label="Opis"
          value={String(row.description)}
          onChange={(v) => update(index, "description", v)}
        />
        <Field label="Oferuje" value={String(row.benefits)} onChange={(v) => update(index, "benefits", v)} />
        <Field
          label="Wymaga"
          value={String(row.requirements)}
          onChange={(v) => update(index, "requirements", v)}
        />
        <Field label="Link" value={String(row.url)} onChange={(v) => update(index, "url", v)} />
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{column.label.replace(/\n/g, " · ")}</DialogTitle>
          <DialogDescription>
            {companyName}. Lista poniżej to wersja robocza. W bazie zostaje poprzednia treść, dopóki nie
            zapiszesz jej do formularza firmy.
          </DialogDescription>
        </DialogHeader>
        {showDraft && (
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">W bazie</div>
            <p className="whitespace-pre-wrap break-words text-sm">{storedText || "—"}</p>
          </div>
        )}
        <DialogUndoButtons
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={() => void handleUndo()}
          onRedo={() => void handleRedo()}
        />
        <div className="space-y-4">
          {history.rows.map((row, index) => (
            <div key={index} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Pozycja {index + 1}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">{fields(row, index)}</div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" />
            Dodaj
          </Button>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {showRestore ? (
            <Button type="button" variant="outline" onClick={() => void handleRestore()} disabled={busy}>
              Przywróć
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Anuluj
            </Button>
            {showDraft && (
              <Button type="button" variant="secondary" onClick={() => void saveDraft()} disabled={busy}>
                Wersja robocza
              </Button>
            )}
            <Button type="button" onClick={() => onSave(history.rows)} disabled={busy}>
              Zapisz do bazy
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value || "empty"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
