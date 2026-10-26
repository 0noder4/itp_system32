"use client";

import React, { useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { MapCanvas } from "@/components/map/MapCanvas";
import useSWR from "swr";
import { apiClient, fetcher } from "@/lib/api";
import { Company, Stage1Data, Stage4Data } from "@/lib/types";
import { Header } from "@/components/layout/Header";
import { getUserInfo } from "@/lib/auth";
import {
  MapLayoutResponse,
  MapLayoutSnapshot,
  MapSegment,
  RepartitionOption,
  findTrackForLabel,
  findTrackForLabels,
  segmentsForDay,
} from "@/lib/mapLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getFileUrl } from "@/components/staff/StageViewer/utils";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";

const ALLOWED_AREAS = [4, 6, 8, 12] as const;

type ManualRow = { label: string; area: number };

export default function StaffMapPage() {
  const { t } = useTranslation();
  const [selectedDay, setSelectedDay] = useState<"day1" | "day2">("day1");
  const [editMode, setEditMode] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [options, setOptions] = useState<RepartitionOption[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pendingOption, setPendingOption] = useState<RepartitionOption | null>(
    null
  );
  const [warnings, setWarnings] = useState<MapLayoutResponse["warnings"]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undoStack, setUndoStack] = useState<MapLayoutSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<MapLayoutSnapshot[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [manualTotal, setManualTotal] = useState(0);
  const [manualSuggested, setManualSuggested] = useState<string[] | null>(null);
  const [manualSeed, setManualSeed] = useState<{
    areas: number[];
    labels: string[];
    description: string;
  } | null>(null);
  const [manualErrors, setManualErrors] = useState<string[]>([]);

  const userInfo = getUserInfo();
  const isAdmin = userInfo?.type === "admin";

  const snapshotFrom = (src: MapLayoutResponse): MapLayoutSnapshot => ({
    sync_days: !!src.sync_days,
    day1: src.day1,
    day2: src.day2,
  });

  const pushUndo = (src: MapLayoutResponse | undefined) => {
    if (!src?.day1 || !src?.day2) return;
    setUndoStack((prev) => [...prev.slice(-19), snapshotFrom(src)]);
    setRedoStack([]);
  };

  const {
    data: layout,
    error: layoutError,
    isLoading: isLoadingLayout,
    mutate: mutateLayout,
  } = useSWR<MapLayoutResponse>("/api/map-layout/", fetcher);

  const {
    data: companies,
    error: companiesError,
    isLoading: isLoadingCompanies,
  } = useSWR<Company[]>("/api/companies/", fetcher);

  const [stage1DataMap, setStage1DataMap] = React.useState<
    Record<number, Stage1Data | null>
  >({});
  const [stage4DataMap, setStage4DataMap] = React.useState<
    Record<number, Stage4Data | null>
  >({});

  React.useEffect(() => {
    if (!companies) return;
    const ids = new Set<number>();
    companies.forEach((c) => {
      if (c.day1_stand?.stand_number || c.day2_stand?.stand_number) {
        ids.add(c.id);
      }
    });
    if (ids.size === 0) return;
    let cancelled = false;
    (async () => {
      const s1: Record<number, Stage1Data | null> = {};
      const s4: Record<number, Stage4Data | null> = {};
      await Promise.all(
        Array.from(ids).map(async (id) => {
          try {
            const [a, b] = await Promise.all([
              fetcher<Stage1Data>(`/api/company/${id}/form/stage-1/`),
              fetcher<Stage4Data>(`/api/company/${id}/form/stage-4/`),
            ]);
            s1[id] = a;
            s4[id] = b;
          } catch {
            s1[id] = null;
            s4[id] = null;
          }
        })
      );
      if (!cancelled) {
        setStage1DataMap(s1);
        setStage4DataMap(s4);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companies]);

  const buildStands = (day: "day1" | "day2") => {
    if (!companies) return [];
    return companies
      .filter((c) =>
        day === "day1"
          ? c.day1_stand?.stand_number
          : c.day2_stand?.stand_number
      )
      .map((c) => {
        const stand =
          day === "day1" ? c.day1_stand! : c.day2_stand!;
        const logo =
          stage4DataMap[c.id]?.description?.logo_file &&
          typeof stage4DataMap[c.id]?.description?.logo_file === "string"
            ? getFileUrl(
                stage4DataMap[c.id]!.description!.logo_file as string
              )
            : null;
        const name =
          stage1DataMap[c.id]?.basic_data?.full_name || c.name;
        const frName = [c.fr_resp_name, c.fr_resp_surname]
          .filter(Boolean)
          .join(" ")
          .trim();
        return {
          companyId: c.id,
          companyName: name,
          standNumber: stand.stand_number,
          logoUrl: logo,
          frRespName: frName || null,
        };
      });
  };

  const day1CompanyStands = useMemo(
    () => buildStands("day1"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companies, stage1DataMap, stage4DataMap]
  );
  const day2CompanyStands = useMemo(
    () => buildStands("day2"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companies, stage1DataMap, stage4DataMap]
  );

  const dayLayout =
    selectedDay === "day1" ? layout?.day1 : layout?.day2;
  const segments = segmentsForDay(dayLayout);
  const companyStands =
    selectedDay === "day1" ? day1CompanyStands : day2CompanyStands;

  const toggleSelect = (label: string) => {
    setSelectedLabels((prev) => {
      if (prev.includes(label)) return prev.filter((l) => l !== label);
      if (prev.length === 0) return [label];
      if (prev.length >= 3) {
        toast.error("Można zaznaczyć maksymalnie 3 stoiska naraz.");
        return prev;
      }
      const letter = findTrackForLabel(dayLayout, label);
      if (prev.some((p) => findTrackForLabel(dayLayout, p) !== letter)) {
        toast.error("Zaznacz stoiska z tej samej grupy (toru).");
        return prev;
      }
      return [...prev, label];
    });
  };

  const loadOptions = async () => {
    if (selectedLabels.length === 0) {
      toast.error("Zaznacz co najmniej jedno stoisko.");
      return;
    }
    const letter = findTrackForLabels(dayLayout, selectedLabels);
    setBusy(true);
    try {
      const { data } = await apiClient.get<{ options: RepartitionOption[] }>(
        "/api/map-layout/repartition-options/",
        {
          params: {
            day: selectedDay,
            track: letter,
            labels: selectedLabels.join(","),
          },
        }
      );
      setOptions(data.options || []);
      setOptionsOpen(true);
      if (!data.options?.length) {
        toast.message("Brak innych podziałów dla tego zaznaczenia.");
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Nie udało się pobrać wariantów.";
      toast.error(String(msg));
    } finally {
      setBusy(false);
    }
  };

  const applyOption = async (option: RepartitionOption, confirm = false) => {
    const letter = findTrackForLabels(dayLayout, selectedLabels);
    setBusy(true);
    try {
      const { data, status } = await apiClient.post<MapLayoutResponse>(
        "/api/map-layout/repartition/",
        {
          day: selectedDay,
          track: letter,
          selected_labels: selectedLabels,
          areas: option.areas,
          labels: option.labels,
          variant_id: option.variant_id,
          confirm,
        },
        { validateStatus: (s) => s === 200 || s === 409 }
      );
      if (status === 409 || (data.warnings?.length && !data.applied)) {
        setPendingOption(option);
        setWarnings(data.warnings || []);
        setConfirmOpen(true);
        setOptionsOpen(false);
        setManualOpen(false);
        return;
      }
      pushUndo(layout);
      await mutateLayout(data, false);
      setSelectedLabels([]);
      setOptionsOpen(false);
      setManualOpen(false);
      setConfirmOpen(false);
      setPendingOption(null);
      toast.success("Zapisano podział mapy.");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Nie udało się zapisać.";
      toast.error(String(msg));
    } finally {
      setBusy(false);
    }
  };

  const undoLast = async () => {
    if (undoStack.length === 0 || !layout) return;
    const prev = undoStack[undoStack.length - 1];
    setBusy(true);
    try {
      setRedoStack((r) => [...r.slice(-19), snapshotFrom(layout)]);
      const { data } = await apiClient.patch<MapLayoutResponse>(
        "/api/map-layout/",
        {
          sync_days: prev.sync_days,
          day1: prev.day1,
          day2: prev.day2,
        }
      );
      setUndoStack((s) => s.slice(0, -1));
      await mutateLayout(data, false);
      setSelectedLabels([]);
      toast.success("Cofnięto ostatnią zmianę mapy.");
    } catch {
      toast.error("Nie udało się cofnąć.");
    } finally {
      setBusy(false);
    }
  };

  const redoLast = async () => {
    if (redoStack.length === 0 || !layout) return;
    const next = redoStack[redoStack.length - 1];
    setBusy(true);
    try {
      setUndoStack((s) => [...s.slice(-19), snapshotFrom(layout)]);
      const { data } = await apiClient.patch<MapLayoutResponse>(
        "/api/map-layout/",
        {
          sync_days: next.sync_days,
          day1: next.day1,
          day2: next.day2,
        }
      );
      setRedoStack((r) => r.slice(0, -1));
      await mutateLayout(data, false);
      setSelectedLabels([]);
      toast.success("Przywrócono cofniętą zmianę mapy.");
    } catch {
      toast.error("Nie udało się przywrócić.");
    } finally {
      setBusy(false);
    }
  };

  const openManualEditor = () => {
    if (selectedLabels.length === 0) {
      toast.error("Zaznacz co najmniej jedno stoisko.");
      return;
    }
    const letter = findTrackForLabels(dayLayout, selectedLabels);
    const trackSegs: MapSegment[] =
      dayLayout?.tracks?.[letter] || [];
    const byLabel = new Map(trackSegs.map((s) => [s.label, s]));
    const ordered = [...selectedLabels].sort((a, b) => {
      const ia = trackSegs.findIndex((s) => s.label === a);
      const ib = trackSegs.findIndex((s) => s.label === b);
      return ia - ib;
    });
    const rows: ManualRow[] = ordered.map((lab) => {
      const seg = byLabel.get(lab);
      return { label: lab, area: Number(seg?.area_m2 || 4) };
    });
    setManualRows(rows);
    setManualTotal(rows.reduce((s, r) => s + r.area, 0));
    setManualSuggested(null);
    setManualSeed(null);
    setManualErrors([]);
    setManualOpen(true);
  };

  const refreshManualValidation = React.useCallback(
    async (rows: ManualRow[]) => {
      if (selectedLabels.length === 0) return;
      const letter = findTrackForLabels(dayLayout, selectedLabels);
      try {
        const { data } = await apiClient.post<{
          total_m2: number;
          suggested_labels: string[] | null;
          errors: string[];
          valid: boolean;
          seed_original?: {
            areas: number[];
            labels: string[];
            description: string;
          } | null;
        }>("/api/map-layout/repartition-validate/", {
          day: selectedDay,
          track: letter,
          selected_labels: selectedLabels,
          areas: rows.map((r) => r.area),
          labels: rows.map((r) => r.label.trim()),
        });
        setManualTotal(data.total_m2);
        setManualSuggested(data.suggested_labels);
        setManualSeed(data.seed_original ?? null);
        setManualErrors(data.errors || []);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail || "Nie udało się zweryfikować podziału.";
        setManualErrors([String(msg)]);
      }
    },
    [selectedDay, selectedLabels, dayLayout]
  );

  const manualHasSuggestedDiff =
    !!manualSuggested &&
    manualSuggested.length === manualRows.length &&
    manualSuggested.some((s, i) => s !== manualRows[i]?.label);

  React.useEffect(() => {
    if (!manualOpen || manualRows.length === 0) return;
    const t = window.setTimeout(() => {
      void refreshManualValidation(manualRows);
    }, 250);
    return () => window.clearTimeout(t);
  }, [manualOpen, manualRows, refreshManualValidation]);

  // sync_days: day2 mirrors day1 — keep UI on day1 (same as StandEditDialog)
  React.useEffect(() => {
    if (layout?.sync_days && selectedDay === "day2") {
      setSelectedDay("day1");
      setSelectedLabels([]);
    }
  }, [layout?.sync_days, selectedDay]);

  const toggleSync = async (value: boolean) => {
    setBusy(true);
    try {
      pushUndo(layout);
      const { data } = await apiClient.patch<MapLayoutResponse>(
        "/api/map-layout/",
        { sync_days: value }
      );
      await mutateLayout(data, false);
      if (value) {
        setSelectedDay("day1");
        setSelectedLabels([]);
      }
      toast.success(
        value
          ? "Synchronizacja obu dni włączona."
          : "Synchronizacja wyłączona (dzień 2 edytowany osobno przy kolizjach)."
      );
    } catch {
      toast.error("Nie udało się zmienić synchronizacji.");
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      pushUndo(layout);
      const { data } = await apiClient.post<MapLayoutResponse>(
        "/api/map-layout/reset/",
        { confirm: true }
      );
      await mutateLayout(data, false);
      setResetOpen(false);
      setSelectedLabels([]);
      toast.success("Przywrócono domyślną mapę i wyczyszczono przypisania.");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Reset nieudany.";
      toast.error(String(msg));
    } finally {
      setBusy(false);
    }
  };

  const isLoading = isLoadingLayout || isLoadingCompanies;
  const error = layoutError || companiesError;

  const navItems = [
    { title: t("companies.title"), url: "/panel/staff" },
    { title: t("staff.map.title"), url: "/panel/staff/map" },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <Header navigationItems={navItems} />
        <div className="p-8">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <Header navigationItems={navItems} />
        <div className="p-8">
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-destructive">
              <AlertCircle className="h-5 w-5" />
              {t("exhibitor.loadError")}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header navigationItems={navItems} />
      <div className="flex flex-1 flex-col overflow-auto bg-background">
        <div className="mx-auto w-full max-w-7xl space-y-6 p-6 lg:p-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
              {t("staff.map.title")}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t("staff.map.description")}
            </p>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="mb-0">{t("staff.map.title")}</CardTitle>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="text-white hover:opacity-90"
                  style={{
                    backgroundColor: STAFF_ACCENT_COLOR,
                    borderColor: STAFF_ACCENT_COLOR,
                  }}
                  onClick={() => {
                    setEditMode((v) => !v);
                    setSelectedLabels([]);
                  }}
                >
                  {editMode ? "Koniec edycji" : "Edytuj mapę"}
                </Button>
              </div>
              {editMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || undoStack.length === 0}
                    onClick={undoLast}
                    title="Cofnij ostatnią zmianę mapy"
                  >
                    <Undo2 className="mr-1 h-4 w-4" />
                    Cofnij
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || redoStack.length === 0}
                    onClick={redoLast}
                    title="Przywróć cofniętą zmianę mapy"
                  >
                    <Redo2 className="mr-1 h-4 w-4" />
                    Dalej
                  </Button>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setResetOpen(true)}
                    >
                      Przywróć domyślną
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {editMode ? (
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!layout?.sync_days}
                      disabled={busy}
                      onChange={(e) => toggleSync(e.target.checked)}
                    />
                    Synchronizuj dzień 2 z dniem 1
                  </label>
                  <span className="text-sm text-muted-foreground">
                    Zaznaczone: {selectedLabels.join(", ") || "—"}
                    {selectedLabels.length > 0
                      ? " (PPM = ręczny podział)"
                      : ""}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || selectedLabels.length === 0}
                    onClick={loadOptions}
                  >
                    Zmień podział…
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedLabels([])}
                  >
                    Wyczyść zaznaczenie
                  </Button>
                </div>
              ) : null}

              <Tabs
                value={selectedDay}
                onValueChange={(v) => {
                  if (layout?.sync_days && v === "day2") return;
                  setSelectedDay(v as "day1" | "day2");
                  setSelectedLabels([]);
                }}
              >
                <TabsList className="mb-4">
                  <TabsTrigger value="day1">{t("staff.map.day1")}</TabsTrigger>
                  <TabsTrigger value="day2" disabled={!!layout?.sync_days}>
                    {t("staff.map.day2")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value={selectedDay} className="mt-0">
                  <MapCanvas
                    segments={segments}
                    companyStands={companyStands}
                    selectedLabels={selectedLabels}
                    onToggleSelect={editMode ? toggleSelect : undefined}
                    onSelectedContextMenu={
                      editMode ? () => openManualEditor() : undefined
                    }
                    editable={editMode}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Warianty podziału</DialogTitle>
            <DialogDescription>
              Wybierz podział zaznaczonych stoisk (powierzchnia łącznie bez
              zmian).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {options.map((opt) => (
              <Button
                key={`${opt.variant_id}-${opt.labels.join("-")}-${opt.areas.join(",")}`}
                type="button"
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                disabled={busy}
                onClick={() => applyOption(opt, false)}
              >
                {opt.description}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ręczny podział stoisk</DialogTitle>
            <DialogDescription>
              Edytuj nazwy i powierzchnie zaznaczenia. Suma musi wynieść{" "}
              {manualTotal} m². PPM na zaznaczeniu otwiera ten dialog.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Suma wierszy:{" "}
              <span
                className={
                  manualRows.reduce((s, r) => s + r.area, 0) === manualTotal
                    ? "text-foreground"
                    : "text-destructive"
                }
              >
                {manualRows.reduce((s, r) => s + r.area, 0)} m²
              </span>{" "}
              / {manualTotal} m²
            </p>
            {manualRows.map((row, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-md border p-2"
              >
                <div className="min-w-[7rem] flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Nazwa</label>
                  <Input
                    value={row.label}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\s/g, "");
                      setManualRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, label: v } : r))
                      );
                    }}
                    placeholder="np. A8a"
                  />
                  {manualSuggested?.[i] &&
                  manualSuggested[i] !== row.label ? (
                    <button
                      type="button"
                      className="text-xs text-blue-600 underline"
                      onClick={() =>
                        setManualRows((rows) =>
                          rows.map((r, j) =>
                            j === i
                              ? { ...r, label: manualSuggested![i] }
                              : r
                          )
                        )
                      }
                    >
                      Zalecana: {manualSuggested[i]}
                    </button>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">m²</label>
                  <div className="flex gap-1">
                    {ALLOWED_AREAS.map((a) => (
                      <Button
                        key={a}
                        type="button"
                        size="sm"
                        variant={row.area === a ? "default" : "outline"}
                        className="h-9 min-w-9 px-2"
                        onClick={() =>
                          setManualRows((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, area: a } : r
                            )
                          )
                        }
                      >
                        {a}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={manualRows.length <= 1}
                  onClick={() =>
                    setManualRows((rows) => rows.filter((_, j) => j !== i))
                  }
                  title="Usuń wiersz"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={manualRows.length >= 3}
                onClick={() =>
                  setManualRows((rows) => [
                    ...rows,
                    {
                      label: manualSuggested?.[rows.length] || "",
                      area: 4,
                    },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Dodaj stoisko
              </Button>
              {manualSeed ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    applyOption(
                      {
                        areas: manualSeed.areas,
                        labels: manualSeed.labels,
                        variant_id: "seed-original",
                        description: manualSeed.description,
                      },
                      false
                    )
                  }
                >
                  Forma pierwotna
                  {manualSeed.labels.length
                    ? `: ${manualSeed.labels.join(" + ")}`
                    : ""}
                </Button>
              ) : null}
              {manualHasSuggestedDiff ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setManualRows((rows) =>
                      rows.map((r, i) => ({
                        ...r,
                        label: manualSuggested![i] || r.label,
                      }))
                    )
                  }
                >
                  Zastosuj zalecane nazwy
                </Button>
              ) : null}
            </div>
            {manualErrors.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                {manualErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Podział wygląda OK.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setManualOpen(false)}
            >
              Anuluj
            </Button>
            <Button
              type="button"
              disabled={busy || manualErrors.length > 0}
              onClick={() =>
                applyOption(
                  {
                    areas: manualRows.map((r) => r.area),
                    labels: manualRows.map((r) => {
                      const raw = r.label.trim();
                      const m = raw.match(/^([A-Za-z]+)(\d+)([a-zA-Z]?)$/);
                      if (!m) return raw;
                      return `${m[1].toUpperCase()}${m[2]}${m[3].toLowerCase()}`;
                    }),
                    variant_id: "manual",
                    description: "Ręczny podział",
                  },
                  false
                )
              }
            >
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konflikt z rezerwacją</DialogTitle>
            <DialogDescription>
              Zmiana dotyczy zajętych stoisk. Skonsultuj z opiekunem FR, potem
              potwierdź.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
            {(warnings || []).map((w, i) => (
              <li key={`${w.stand_number}-${w.day}-${i}`}>{w.message}</li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Anuluj
            </Button>
            <Button
              type="button"
              disabled={busy || !pendingOption}
              onClick={() => pendingOption && applyOption(pendingOption, true)}
            >
              Tak, zmień mimo to
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Przywrócić domyślną mapę?</DialogTitle>
            <DialogDescription>
              To nadpisze układ day1/day2 i usunie wszystkie przypisania stoisk
              firm. Tej operacji nie da się cofnąć.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetOpen(false)}
            >
              Anuluj
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={doReset}
            >
              Tak, resetuj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
