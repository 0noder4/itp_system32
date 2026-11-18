"use client";

import React from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
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
import { coerceInput, displayText, isFileValue } from "@/lib/sheets/format";
import type { SheetCellValue, SheetColumn, SheetEditPart } from "@/lib/sheets/types";
import { getFileUrl } from "@/components/staff/StageViewer/utils";

const FILE_ACCEPT: Record<string, string> = {
  "sign.logo": "image/*",
  "sign.visualization": ".pdf,.png,.jpg,.jpeg",
  "sign.fire_cert": ".pdf,.jpg,.jpeg,.png",
  "catalogue.logo": "image/*",
};

type FileSlot = { file: File | null; name: string; path?: string; url?: string };

export type SheetFileUpload = {
  file?: File | null;
  mode: "draft" | "commit";
  path?: string;
  clear?: boolean;
};

function fileSeedKey(slot: FileSlot) {
  return `${slot.path ?? ""}\n${slot.url ?? ""}\n${slot.name}`;
}

function useFileHistory(open: boolean, seed: FileSlot) {
  const seedRef = React.useRef(seed);
  seedRef.current = seed;
  const seedKey = fileSeedKey(seed);
  const [slot, setSlot] = React.useState<FileSlot>(seed);
  const slotRef = React.useRef(slot);
  slotRef.current = slot;
  const past = React.useRef<FileSlot[]>([]);
  const future = React.useRef<FileSlot[]>([]);
  const lastSaved = React.useRef<FileSlot>(seed);
  const synced = React.useRef(false);
  const wasOpen = React.useRef(false);
  const [counts, setCounts] = React.useState({ undo: 0, redo: 0 });
  const [inputKey, setInputKey] = React.useState(0);

  React.useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    const initial = seedRef.current;
    if (!wasOpen.current) {
      wasOpen.current = true;
      past.current = [];
      future.current = [];
      lastSaved.current = initial;
      synced.current = false;
      setSlot(initial);
      setCounts({ undo: 0, redo: 0 });
      setInputKey((key) => key + 1);
      return;
    }
    const current = slotRef.current;
    const unsavedPick = current.file != null && current.file !== lastSaved.current.file;
    if (unsavedPick) return;
    if (
      current.file == null &&
      current.path === initial.path &&
      current.name === initial.name &&
      current.url === initial.url
    ) {
      return;
    }
    if (current.file == null && current.path && initial.path === current.path && initial.url && current.url !== initial.url) {
      const next = { ...current, url: initial.url, name: initial.name || current.name };
      lastSaved.current = { ...lastSaved.current, url: next.url, name: next.name };
      setSlot(next);
      return;
    }
    if (current.file != null) return;
    past.current = [];
    future.current = [];
    lastSaved.current = initial;
    synced.current = Boolean(initial.path);
    setSlot(initial);
    setCounts({ undo: 0, redo: 0 });
    setInputKey((key) => key + 1);
  }, [open, seedKey]);

  const sync = () => setCounts({ undo: past.current.length, redo: future.current.length });

  const pick = (file: File) => {
    setSlot((prev) => {
      past.current = [...past.current, prev].slice(-80);
      future.current = [];
      sync();
      return { file, name: file.name };
    });
  };

  const undo = () => {
    const previous = past.current.pop();
    if (!previous) return null;
    setSlot((current) => {
      future.current.push(current);
      return previous;
    });
    setInputKey((key) => key + 1);
    sync();
    return previous;
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return null;
    setSlot((current) => {
      past.current.push(current);
      return next;
    });
    setInputKey((key) => key + 1);
    sync();
    return next;
  };

  const markSaved = (after: FileSlot) => {
    past.current = [{ ...lastSaved.current }];
    future.current = [];
    lastSaved.current = after;
    synced.current = true;
    setSlot(after);
    setInputKey((key) => key + 1);
    sync();
  };

  const reset = (next: FileSlot) => {
    past.current = [];
    future.current = [];
    lastSaved.current = next;
    synced.current = false;
    setSlot(next);
    setInputKey((key) => key + 1);
    sync();
  };

  return {
    slot,
    pick,
    undo,
    redo,
    markSaved,
    reset,
    synced,
    inputKey,
    canUndo: counts.undo > 0,
    canRedo: counts.redo > 0,
  };
}

const DRAFT_HINT =
  "Wersja robocza zostaje w arkuszu. Firma zobaczy nową wartość dopiero po „Zapisz do bazy”.";

/** Spójny dialog: podgląd / pole / lista + wersja robocza z cofaniem. */

function asColumn(part: SheetEditPart): SheetColumn {
  return {
    key: part.key,
    label: part.label,
    kind: part.kind,
    source: "system",
    group: "",
    editable: true,
    options: part.options,
    width: 0,
    aggregate: null,
    aggregate_by_day: false,
    highlight: null,
    highlight_above: null,
    help: "",
  };
}

export function DialogUndoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1">
      <Button type="button" size="sm" variant="outline" disabled={!canUndo} onClick={onUndo} title={t("sheets.undoHint")}>
        <Undo2 className="mr-1 h-4 w-4" />
        {t("sheets.undo")}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={!canRedo} onClick={onRedo} title={t("sheets.redoHint")}>
        <Redo2 className="mr-1 h-4 w-4" />
        {t("sheets.redo")}
      </Button>
    </div>
  );
}

function sameTextMap(a: Record<string, string>, b: Record<string, string>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? "") !== (b[key] ?? "")) return false;
  }
  return true;
}

export function useFieldHistory(open: boolean, seed: Record<string, string>) {
  const seedRef = React.useRef(seed);
  seedRef.current = seed;
  const seedKey = JSON.stringify(seed);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const draftsRef = React.useRef(drafts);
  draftsRef.current = drafts;
  const past = React.useRef<Record<string, string>[]>([]);
  const future = React.useRef<Record<string, string>[]>([]);
  const lastSaved = React.useRef<Record<string, string>>({});
  const draftSynced = React.useRef(false);
  const wasOpen = React.useRef(false);
  const [counts, setCounts] = React.useState({ undo: 0, redo: 0 });

  React.useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    const initial = seedRef.current;
    if (!wasOpen.current) {
      wasOpen.current = true;
      past.current = [];
      future.current = [];
      lastSaved.current = initial;
      draftSynced.current = false;
      setDrafts(initial);
      setCounts({ undo: 0, redo: 0 });
      return;
    }
    const current = draftsRef.current;
    if (!sameTextMap(current, lastSaved.current)) return;
    if (sameTextMap(current, initial)) return;
    past.current = [];
    future.current = [];
    lastSaved.current = initial;
    draftSynced.current = false;
    setDrafts(initial);
    setCounts({ undo: 0, redo: 0 });
  }, [open, seedKey]);

  const sync = () => setCounts({ undo: past.current.length, redo: future.current.length });

  const change = (key: string, next: string) => {
    setDrafts((prev) => {
      past.current = [...past.current, prev].slice(-80);
      future.current = [];
      sync();
      return { ...prev, [key]: next };
    });
  };

  const undo = () => {
    const previous = past.current.pop();
    if (!previous) return null;
    setDrafts((current) => {
      future.current.push(current);
      return previous;
    });
    sync();
    return previous;
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return null;
    setDrafts((current) => {
      past.current.push(current);
      return next;
    });
    sync();
    return next;
  };

  /** After a successful draft save: one undo step back to the previous synced value. */
  const markDraftSaved = (after: Record<string, string>) => {
    past.current = [{ ...lastSaved.current }];
    future.current = [];
    lastSaved.current = after;
    draftSynced.current = true;
    setDrafts(after);
    sync();
  };

  const reset = (next: Record<string, string>) => {
    past.current = [];
    future.current = [];
    lastSaved.current = next;
    draftSynced.current = false;
    setDrafts(next);
    sync();
  };

  return {
    drafts,
    change,
    undo,
    redo,
    markDraftSaved,
    reset,
    draftSynced,
    canUndo: counts.undo > 0,
    canRedo: counts.redo > 0,
  };
}

function storedLabel(column: SheetColumn, value: SheetCellValue | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (column.kind === "bool") return value === true || value === "true" ? "tak" : "nie";
  const text = displayText(column, value);
  return text || "—";
}

function initialText(column: SheetColumn, value: SheetCellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (column.kind === "select" || column.kind === "user_select" || column.kind === "bool") {
    return String(value);
  }
  return displayText(column, value);
}

function ValueField({
  column,
  value,
  onChange,
  disabled,
  label,
  baseline,
}: {
  column: SheetColumn;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  baseline?: string;
}) {
  const caption = label ?? column.label.replace(/\n/g, " ");
  if (column.kind === "bool") {
    return (
      <div className="space-y-1">
        {baseline !== undefined && (
          <p className="text-xs text-muted-foreground">
            W bazie: <span className="text-foreground">{baseline}</span>
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value === "true"}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          />
          {caption}
        </label>
      </div>
    );
  }
  if (column.kind === "select" || column.kind === "user_select") {
    return (
      <div className="space-y-1">
        {baseline !== undefined && (
          <p className="text-xs text-muted-foreground">
            W bazie: <span className="text-foreground">{baseline}</span>
          </p>
        )}
        <Label className="text-xs">{caption}</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {column.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (column.kind === "longtext") {
    return (
      <div className="space-y-1 sm:col-span-2">
        {baseline !== undefined && (
          <p className="text-xs text-muted-foreground">
            W bazie: <span className="whitespace-pre-wrap text-foreground">{baseline}</span>
          </p>
        )}
        <Label className="text-xs">{caption}</Label>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {baseline !== undefined && (
        <p className="text-xs text-muted-foreground">
          W bazie: <span className="text-foreground">{baseline}</span>
        </p>
      )}
      <Label className="text-xs">{caption}</Label>
      <Input
        type={column.kind === "number" ? "number" : column.kind === "date" ? "date" : column.kind === "time" ? "time" : "text"}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SheetCellEditDialog({
  open,
  onOpenChange,
  column,
  companyName,
  value,
  parts,
  partValues,
  stored,
  hasDraft = false,
  canRestore,
  onCommit,
  onDraft,
  onUpload,
  onRestore,
  busy,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: SheetColumn | null;
  companyName: string;
  value: SheetCellValue;
  parts?: SheetEditPart[];
  partValues?: Record<string, SheetCellValue>;
  /** Live form value per field. Falls back to the shown cell when there is no draft yet. */
  stored?: Record<string, SheetCellValue>;
  hasDraft?: boolean;
  canRestore: boolean;
  onCommit: (changes: { columnKey: string; value: SheetCellValue }[]) => void;
  onDraft?: (changes: { columnKey: string; value: SheetCellValue }[]) => Promise<void>;
  /** Multipart draft or commit for graphics file_link columns. */
  onUpload?: (payload: SheetFileUpload) => Promise<{ name?: string; path?: string; url?: string } | void>;
  /** 'local' = nothing saved on the server, reset the fields. 'server' = draft or form was restored. */
  onRestore: () => Promise<'local' | 'server'>;
  busy?: boolean;
  readOnly?: boolean;
}) {
  const fields = parts?.length ? parts.map(asColumn) : column ? [column] : [];
  const seed: Record<string, string> = {};
  if (parts?.length) {
    for (const part of parts) seed[part.key] = initialText(asColumn(part), partValues?.[part.key]);
  } else if (column) {
    seed[column.key] = initialText(column, value);
  }
  const history = useFieldHistory(open, seed);
  const shownFile = isFileValue(value) ? value : null;
  const files = useFileHistory(open, {
    file: null,
    name: shownFile?.path ? shownFile.name : "",
    path: shownFile?.path,
    url: shownFile?.path ? shownFile.url : undefined,
  });
  const isFileUpload = Boolean(
    column && column.kind === "file_link" && column.can_commit && onUpload && !readOnly
  );
  const showDraft = Boolean(onDraft && column?.can_draft) && !isFileUpload;
  const showFileDraft = isFileUpload && Boolean(column?.can_draft);
  const singleDraft = (showDraft || hasDraft) && !parts?.length && !isFileUpload;

  if (!column) return null;

  const buildChanges = (source: Record<string, string>) =>
    fields.map((field) => ({
      columnKey: field.key,
      value: coerceInput(field, source[field.key] ?? ""),
    }));

  const saveDraft = async () => {
    if (!onDraft) return;
    const after = { ...history.drafts };
    await onDraft(buildChanges(after));
    history.markDraftSaved(after);
  };

  const handleUndo = async () => {
    const restored = history.undo();
    if (restored && history.draftSynced.current && onDraft) {
      await onDraft(buildChanges(restored));
    }
  };

  const handleRedo = async () => {
    const restored = history.redo();
    if (restored && history.draftSynced.current && onDraft) {
      await onDraft(buildChanges(restored));
    }
  };

  const baselines = () => {
    const next: Record<string, string> = {};
    for (const field of fields) next[field.key] = initialText(field, stored?.[field.key]);
    return next;
  };

  const handleRestore = async () => {
    try {
      const result = await onRestore();
      if (result === 'local') {
        history.reset(baselines());
        files.reset({ file: null, name: "", path: undefined });
      }
    } catch {
      // The sheet view already shows the error.
    }
  };

  const uploadSlot = async (slot: FileSlot, mode: "draft" | "commit") => {
    if (!onUpload) return;
    if (mode === "draft" && !slot.file && !slot.path) {
      return onUpload({ mode: "draft", clear: true });
    }
    return onUpload({
      file: slot.file,
      mode,
      path: slot.file ? undefined : slot.path,
    });
  };

  const saveFileDraft = async () => {
    const slot = files.slot;
    if (!slot.file) return;
    const saved = await uploadSlot(slot, "draft");
    files.markSaved({
      file: null,
      name: saved?.name ?? slot.name,
      path: saved?.path ?? slot.path,
      url: saved?.url,
    });
  };

  const handleFileUndo = async () => {
    const restored = files.undo();
    if (restored && files.synced.current) await uploadSlot(restored, "draft");
  };

  const handleFileRedo = async () => {
    const restored = files.redo();
    if (restored && files.synced.current) await uploadSlot(restored, "draft");
  };

  const showRestore = !readOnly && (showDraft || showFileDraft || canRestore || hasDraft);
  const rawStored = stored?.[column.key];
  const storedFile = rawStored != null && isFileValue(rawStored) ? rawStored : null;
  const storedHref = storedFile ? getFileUrl(storedFile.url) : null;
  const draftLabel = files.slot.name || "—";
  const draftHref = !files.slot.file && files.slot.url ? getFileUrl(files.slot.url) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{column.label.replace(/\n/g, " · ")}</DialogTitle>
          <DialogDescription>
            {companyName}.{" "}
            {readOnly
              ? "To podgląd. Tej komórki nie zmienisz w arkuszu."
              : showFileDraft || showDraft
                ? "Na górze jest wartość z formularza firmy. Pole poniżej to wersja robocza arkusza."
                : hasDraft
                  ? "Na górze jest wartość zapisana w bazie. Pole poniżej to wersja robocza."
                  : parts?.length
                    ? "Osobne pola tej komórki."
                    : "Pełna wartość tej komórki."}
          </DialogDescription>
        </DialogHeader>
        {readOnly ? (
          <div className="space-y-2">
            {column.kind === "file_link" && storedFile ? (
              <div className="space-y-1 text-sm">
                <p className="truncate">{storedFile.name}</p>
                {storedHref ? (
                  <a href={storedHref} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                    Otwórz plik
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm">{displayText(column, value) || "—"}</p>
            )}
            {column.help ? <p className="text-xs text-muted-foreground">{column.help}</p> : null}
          </div>
        ) : isFileUpload ? (
          <div className="space-y-3">
            <DialogUndoButtons
              canUndo={files.canUndo}
              canRedo={files.canRedo}
              onUndo={() => void handleFileUndo()}
              onRedo={() => void handleFileRedo()}
            />
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">W bazie</div>
              {storedFile ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="truncate">{storedFile.name}</span>
                  {storedHref ? (
                    <a href={storedHref} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                      Otwórz
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm">—</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Wersja robocza</Label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="truncate">{draftLabel}</span>
                {draftHref ? (
                  <a href={draftHref} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                    Otwórz
                  </a>
                ) : null}
              </div>
              <Input
                key={files.inputKey}
                type="file"
                accept={FILE_ACCEPT[column.key] ?? "image/*,.pdf"}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.files?.[0];
                  if (next) files.pick(next);
                }}
              />
            </div>
            {showFileDraft && <p className="text-xs text-amber-700 dark:text-amber-400">{DRAFT_HINT}</p>}
            {column.help ? <p className="text-xs text-muted-foreground">{column.help}</p> : null}
          </div>
        ) : (
          <>
            <DialogUndoButtons
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={() => void handleUndo()}
              onRedo={() => void handleRedo()}
            />
            {singleDraft && (
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">W bazie</div>
                <p className="whitespace-pre-wrap break-words text-sm">{storedLabel(column, stored?.[column.key])}</p>
              </div>
            )}
            <div className={parts?.length ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
              {fields.map((field) => (
                <ValueField
                  key={field.key}
                  column={field}
                  label={singleDraft ? "Wersja robocza" : undefined}
                  baseline={
                    showDraft && parts?.length
                      ? storedLabel(field, stored?.[field.key])
                      : undefined
                  }
                  value={history.drafts[field.key] ?? ""}
                  onChange={(next) => history.change(field.key, next)}
                  disabled={busy}
                />
              ))}
            </div>
            {showDraft && <p className="text-xs text-amber-700 dark:text-amber-400">{DRAFT_HINT}</p>}
          </>
        )}
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
              {readOnly ? "Zamknij" : "Anuluj"}
            </Button>
            {!readOnly && showDraft && (
              <Button type="button" variant="secondary" onClick={() => void saveDraft()} disabled={busy}>
                Wersja robocza
              </Button>
            )}
            {!readOnly && showFileDraft && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void saveFileDraft()}
                disabled={busy || !files.slot.file}
              >
                Wersja robocza
              </Button>
            )}
            {!readOnly && isFileUpload && (
              <Button
                type="button"
                onClick={() => void uploadSlot(files.slot, "commit")}
                disabled={busy || (!files.slot.file && !files.slot.path)}
              >
                Zapisz do bazy
              </Button>
            )}
            {!readOnly && !isFileUpload && (
              <Button type="button" onClick={() => onCommit(buildChanges(history.drafts))} disabled={busy}>
                Zapisz do bazy
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
