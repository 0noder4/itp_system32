"use client";

import React from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  downloadCompaniesCSV,
  downloadCompaniesXLSX,
  downloadMediaFiles,
  type CompanyExportCombine,
  type CompanyExportSection,
  type CompanyMediaCategory,
  type MediaDownloadResult,
} from "@/lib/api";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { useTranslation } from "@/lib/i18n";
import {
  nativeCheckboxClassName,
  nativeChoiceAppearanceStyle,
  nativeRadioClassName,
} from "@/lib/native-choice-styles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const EXPORT_PREFS_STORAGE_KEY = "fr-panel:export-prefs:v1";

const ALL_SECTIONS: CompanyExportSection[] = [
  "basic",
  "stage_1",
  "stage_2",
  "stage_3",
  "stage_4",
  "stage_5",
  "billing",
];

const BASIC_ONLY_SECTIONS: CompanyExportSection[] = ["basic"];

const ALL_MEDIA_CATEGORIES: CompanyMediaCategory[] = [
  "logo_sign",
  "catalogue_logo",
  "stand_visualization",
  "fire_cert",
  "order_pdf",
];

const GRAPHICS_MEDIA_CATEGORIES: CompanyMediaCategory[] = [
  "logo_sign",
  "catalogue_logo",
  "stand_visualization",
  "fire_cert",
];

type ExportScope = "selected" | "filtered" | "all";

interface StoredExportPrefs {
  wantXlsx?: unknown;
  wantCsv?: unknown;
  wantMedia?: unknown;
  sections?: unknown;
  combine?: unknown;
  mediaCategories?: unknown;
}

export interface CompanyExportDialogProps {
  selectedCompanyIds: number[];
  selectedInvitationsCount: number;
  filteredCompanyIds: number[];
  allCompanyIds: number[];
}

function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item)
    ? list.filter((entry) => entry !== item)
    : [...list, item];
}

function parseValidSections(raw: unknown): CompanyExportSection[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = new Set<string>(ALL_SECTIONS);
  const picked = ALL_SECTIONS.filter((sec) => raw.includes(sec) && valid.has(sec));
  return picked.length > 0 ? picked : null;
}

function parseValidMediaCategories(raw: unknown): CompanyMediaCategory[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = new Set<string>(ALL_MEDIA_CATEGORIES);
  const picked = ALL_MEDIA_CATEGORIES.filter(
    (cat) => raw.includes(cat) && valid.has(cat)
  );
  return picked.length > 0 ? picked : null;
}

export function CompanyExportDialog({
  selectedCompanyIds,
  selectedInvitationsCount,
  filteredCompanyIds,
  allCompanyIds,
}: CompanyExportDialogProps) {
  const { t } = useTranslation();
  const uid = React.useId();

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [prefsLoaded, setPrefsLoaded] = React.useState(false);

  const [wantXlsx, setWantXlsx] = React.useState(true);
  const [wantCsv, setWantCsv] = React.useState(false);
  const [wantMedia, setWantMedia] = React.useState(false);
  const [scope, setScope] = React.useState<ExportScope>("all");
  const [sections, setSections] = React.useState<CompanyExportSection[]>(ALL_SECTIONS);
  const [combine, setCombine] = React.useState<CompanyExportCombine>("merge");
  const [mediaCategories, setMediaCategories] = React.useState<CompanyMediaCategory[]>(
    GRAPHICS_MEDIA_CATEGORIES
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(EXPORT_PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredExportPrefs;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          if (typeof parsed.wantXlsx === "boolean") setWantXlsx(parsed.wantXlsx);
          if (typeof parsed.wantCsv === "boolean") setWantCsv(parsed.wantCsv);
          if (typeof parsed.wantMedia === "boolean") setWantMedia(parsed.wantMedia);
          const loadedSections = parseValidSections(parsed.sections);
          if (loadedSections) setSections(loadedSections);
          if (parsed.combine === "merge" || parsed.combine === "separate") {
            setCombine(parsed.combine);
          }
          const loadedMedia = parseValidMediaCategories(parsed.mediaCategories);
          if (loadedMedia) setMediaCategories(loadedMedia);
        }
      }
    } catch {
      // Ignore malformed localStorage preferences
    } finally {
      setPrefsLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    if (!prefsLoaded || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        EXPORT_PREFS_STORAGE_KEY,
        JSON.stringify({
          wantXlsx,
          wantCsv,
          wantMedia,
          sections,
          combine,
          mediaCategories,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [prefsLoaded, wantXlsx, wantCsv, wantMedia, sections, combine, mediaCategories]);

  const hasFilteredSubset = filteredCompanyIds.length !== allCompanyIds.length;

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    if (next) {
      if (selectedCompanyIds.length > 0) {
        setScope("selected");
      } else if (hasFilteredSubset && filteredCompanyIds.length > 0) {
        setScope("filtered");
      } else {
        setScope("all");
      }
    }
    setOpen(next);
  };

  const targetCompanyIds = React.useMemo(() => {
    if (scope === "selected") return selectedCompanyIds;
    if (scope === "filtered") return filteredCompanyIds;
    return allCompanyIds;
  }, [scope, selectedCompanyIds, filteredCompanyIds, allCompanyIds]);

  const hasTabular = wantXlsx || wantCsv;

  const canConfirm =
    (wantXlsx || wantCsv || wantMedia) &&
    targetCompanyIds.length > 0 &&
    (!hasTabular || sections.length > 0) &&
    (!wantMedia || mediaCategories.length > 0);

  const confirmExport = async () => {
    if (!wantXlsx && !wantCsv && !wantMedia) {
      toast.message(t("companies.export.pickFormat"));
      return;
    }
    if (targetCompanyIds.length === 0) {
      toast.message(t("companies.export.emptyScope"));
      return;
    }
    if (hasTabular && sections.length === 0) {
      toast.message(t("companies.export.pickSections"));
      return;
    }
    if (wantMedia && mediaCategories.length === 0) {
      toast.message(t("companies.export.pickMediaCategories"));
      return;
    }

    setBusy(true);
    try {
      if (wantXlsx) {
        await downloadCompaniesXLSX(targetCompanyIds, { sections, combine });
      }
      if (wantCsv) {
        await downloadCompaniesCSV(targetCompanyIds, { sections, combine });
      }

      let mediaResult: MediaDownloadResult | null = null;
      if (wantMedia) {
        mediaResult = await downloadMediaFiles({
          companyIds: targetCompanyIds,
          categories: mediaCategories,
        });
      }

      if (wantMedia && mediaResult && !mediaResult.downloaded) {
        const emptyMsg =
          mediaResult.pdfSkipped > 0
            ? t("companies.export.noMediaWithSkippedPdfs", {
                skipped: mediaResult.pdfSkipped,
              })
            : t("companies.export.noMedia");
        toast.message(emptyMsg);
        if (!hasTabular) {
          return;
        }
        toast.success(t("companies.export.done"));
        setOpen(false);
        return;
      }

      if (wantMedia && mediaResult && mediaResult.pdfSkipped > 0) {
        toast.success(
          t("companies.export.doneWithSkippedPdfs", {
            count: mediaResult.filesCount,
            skipped: mediaResult.pdfSkipped,
          })
        );
      } else {
        toast.success(t("companies.export.done"));
      }
      setOpen(false);
    } catch (error: any) {
      toast.error(t("companies.export.error"), {
        description: error?.message || t("companies.export.errorDescription"),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={allCompanyIds.length === 0}
          className="text-xs sm:text-sm whitespace-nowrap"
          style={{
            backgroundColor:
              allCompanyIds.length === 0 ? undefined : STAFF_ACCENT_COLOR,
          }}
          onMouseEnter={(e) => {
            if (allCompanyIds.length > 0) {
              e.currentTarget.style.backgroundColor = "#C84FA8";
            }
          }}
          onMouseLeave={(e) => {
            if (allCompanyIds.length > 0) {
              e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
            }
          }}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("companies.export.button")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("companies.export.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("companies.export.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Formats */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("companies.export.formatsLabel")}
            </legend>
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex items-start gap-2.5">
                <input
                  id={`${uid}-fmt-xlsx`}
                  type="checkbox"
                  checked={wantXlsx}
                  onChange={(e) => setWantXlsx(e.target.checked)}
                  aria-describedby={`${uid}-fmt-xlsx-hint`}
                  className={cn(nativeCheckboxClassName, "mt-0.5")}
                  style={nativeChoiceAppearanceStyle}
                />
                <div className="grid gap-0.5">
                  <label
                    htmlFor={`${uid}-fmt-xlsx`}
                    className="cursor-pointer font-medium leading-none"
                  >
                    {t("companies.export.formatXlsx")}
                  </label>
                  <p
                    id={`${uid}-fmt-xlsx-hint`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("companies.export.formatXlsxHint")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <input
                  id={`${uid}-fmt-csv`}
                  type="checkbox"
                  checked={wantCsv}
                  onChange={(e) => setWantCsv(e.target.checked)}
                  aria-describedby={`${uid}-fmt-csv-hint`}
                  className={cn(nativeCheckboxClassName, "mt-0.5")}
                  style={nativeChoiceAppearanceStyle}
                />
                <div className="grid gap-0.5">
                  <label
                    htmlFor={`${uid}-fmt-csv`}
                    className="cursor-pointer font-medium leading-none"
                  >
                    {t("companies.export.formatCsv")}
                  </label>
                  <p
                    id={`${uid}-fmt-csv-hint`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("companies.export.formatCsvHint")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <input
                  id={`${uid}-fmt-media`}
                  type="checkbox"
                  checked={wantMedia}
                  onChange={(e) => setWantMedia(e.target.checked)}
                  aria-describedby={`${uid}-fmt-media-hint`}
                  className={cn(nativeCheckboxClassName, "mt-0.5")}
                  style={nativeChoiceAppearanceStyle}
                />
                <div className="grid gap-0.5">
                  <label
                    htmlFor={`${uid}-fmt-media`}
                    className="cursor-pointer font-medium leading-none"
                  >
                    {t("companies.export.formatMedia")}
                  </label>
                  <p
                    id={`${uid}-fmt-media-hint`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("companies.export.formatMediaHint")}
                  </p>
                </div>
              </div>
            </div>
          </fieldset>

          {/* Company scope */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("companies.export.scopeLabel")}
            </legend>
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex items-start gap-2.5">
                <input
                  id={`${uid}-scope-selected`}
                  type="radio"
                  name={`${uid}-scope`}
                  checked={scope === "selected"}
                  onChange={() => setScope("selected")}
                  disabled={selectedCompanyIds.length === 0}
                  aria-describedby={
                    selectedInvitationsCount > 0 || selectedCompanyIds.length === 0
                      ? `${uid}-scope-selected-hint`
                      : undefined
                  }
                  className={cn(nativeRadioClassName, "mt-0.5 rounded-full")}
                  style={nativeChoiceAppearanceStyle}
                />
                <div className="grid gap-0.5">
                  <label
                    htmlFor={`${uid}-scope-selected`}
                    className={cn(
                      "cursor-pointer leading-none",
                      selectedCompanyIds.length === 0 &&
                        "cursor-not-allowed text-muted-foreground"
                    )}
                  >
                    {t("companies.export.scopeSelected", {
                      count: selectedCompanyIds.length,
                    })}
                  </label>
                  {selectedCompanyIds.length === 0 ? (
                    <p
                      id={`${uid}-scope-selected-hint`}
                      className="text-xs text-muted-foreground"
                    >
                      {t("companies.export.scopeSelectedEmpty")}
                    </p>
                  ) : selectedInvitationsCount > 0 ? (
                    <p
                      id={`${uid}-scope-selected-hint`}
                      className="text-xs text-muted-foreground"
                    >
                      {t("companies.export.invitationsSkippedHint", {
                        count: selectedInvitationsCount,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>

              {hasFilteredSubset && (
                <div className="flex items-start gap-2.5">
                  <input
                    id={`${uid}-scope-filtered`}
                    type="radio"
                    name={`${uid}-scope`}
                    checked={scope === "filtered"}
                    onChange={() => setScope("filtered")}
                    disabled={filteredCompanyIds.length === 0}
                    className={cn(nativeRadioClassName, "mt-0.5 rounded-full")}
                    style={nativeChoiceAppearanceStyle}
                  />
                  <label
                    htmlFor={`${uid}-scope-filtered`}
                    className={cn(
                      "cursor-pointer leading-none",
                      filteredCompanyIds.length === 0 &&
                        "cursor-not-allowed text-muted-foreground"
                    )}
                  >
                    {t("companies.export.scopeFiltered", {
                      count: filteredCompanyIds.length,
                    })}
                  </label>
                </div>
              )}

              <div className="flex items-start gap-2.5">
                <input
                  id={`${uid}-scope-all`}
                  type="radio"
                  name={`${uid}-scope`}
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  disabled={allCompanyIds.length === 0}
                  className={cn(nativeRadioClassName, "mt-0.5 rounded-full")}
                  style={nativeChoiceAppearanceStyle}
                />
                <label
                  htmlFor={`${uid}-scope-all`}
                  className="cursor-pointer leading-none"
                >
                  {t("companies.export.scopeAll", {
                    count: allCompanyIds.length,
                  })}
                </label>
              </div>
            </div>
          </fieldset>

          {/* Tabular sections */}
          {hasTabular && (
            <fieldset className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="text-sm font-medium">
                  {t("companies.export.sectionsLabel")}
                </legend>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSections(ALL_SECTIONS)}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("companies.export.selectAllSections")}
                  </button>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => setSections(BASIC_ONLY_SECTIONS)}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("companies.export.selectBasicOnly")}
                  </button>
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_SECTIONS.map((sec) => {
                    const inputId = `${uid}-sec-${sec}`;
                    return (
                      <div key={sec} className="flex items-center gap-2">
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={sections.includes(sec)}
                          onChange={() => setSections((prev) => toggleItem(prev, sec))}
                          className={nativeCheckboxClassName}
                          style={nativeChoiceAppearanceStyle}
                        />
                        <label htmlFor={inputId} className="cursor-pointer">
                          {t(`companies.export.sections.${sec}`)}
                        </label>
                      </div>
                    );
                  })}
                </div>

                {sections.length > 1 && (
                  <fieldset className="space-y-2 border-t pt-2.5">
                    <legend className="text-xs font-medium text-foreground">
                      {t("companies.export.combineLabel")}
                    </legend>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5">
                        <input
                          id={`${uid}-combine-merge`}
                          type="radio"
                          name={`${uid}-combine`}
                          checked={combine === "merge"}
                          onChange={() => setCombine("merge")}
                          aria-describedby={`${uid}-combine-merge-hint`}
                          className={cn(nativeRadioClassName, "mt-0.5 rounded-full")}
                          style={nativeChoiceAppearanceStyle}
                        />
                        <div className="grid gap-0.5">
                          <label
                            htmlFor={`${uid}-combine-merge`}
                            className="cursor-pointer leading-none"
                          >
                            {t("companies.export.combineMerge")}
                          </label>
                          <p
                            id={`${uid}-combine-merge-hint`}
                            className="text-xs text-muted-foreground"
                          >
                            {t("companies.export.combineMergeHint")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <input
                          id={`${uid}-combine-separate`}
                          type="radio"
                          name={`${uid}-combine`}
                          checked={combine === "separate"}
                          onChange={() => setCombine("separate")}
                          aria-describedby={`${uid}-combine-separate-hint`}
                          className={cn(nativeRadioClassName, "mt-0.5 rounded-full")}
                          style={nativeChoiceAppearanceStyle}
                        />
                        <div className="grid gap-0.5">
                          <label
                            htmlFor={`${uid}-combine-separate`}
                            className="cursor-pointer leading-none"
                          >
                            {t("companies.export.combineSeparate")}
                          </label>
                          <p
                            id={`${uid}-combine-separate-hint`}
                            className="text-xs text-muted-foreground"
                          >
                            {t("companies.export.combineSeparateHint")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </fieldset>
                )}
              </div>
            </fieldset>
          )}

          {/* Media ZIP categories */}
          {wantMedia && (
            <fieldset className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="text-sm font-medium">
                  {t("companies.export.mediaCategoriesLabel")}
                </legend>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setMediaCategories(ALL_MEDIA_CATEGORIES)}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("companies.export.selectAllMedia")}
                  </button>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => setMediaCategories(GRAPHICS_MEDIA_CATEGORIES)}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("companies.export.selectGraphicsOnly")}
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3 text-sm">
                {ALL_MEDIA_CATEGORIES.map((cat) => {
                  const inputId = `${uid}-media-${cat}`;
                  const isPdf = cat === "order_pdf";
                  return (
                    <div key={cat} className="flex items-start gap-2.5">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={mediaCategories.includes(cat)}
                        onChange={() =>
                          setMediaCategories((prev) => toggleItem(prev, cat))
                        }
                        aria-describedby={isPdf ? `${inputId}-hint` : undefined}
                        className={cn(nativeCheckboxClassName, "mt-0.5")}
                        style={nativeChoiceAppearanceStyle}
                      />
                      <div className="grid gap-0.5">
                        <label
                          htmlFor={inputId}
                          className="cursor-pointer leading-tight"
                        >
                          {t(`companies.export.mediaCategories.${cat}`)}
                        </label>
                        {isPdf && (
                          <p
                            id={`${inputId}-hint`}
                            className="text-xs text-muted-foreground"
                          >
                            {t("companies.export.orderPdfHint")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between sm:space-x-0">
          <span className="text-xs sm:text-sm text-muted-foreground">
            {t("companies.export.targetCount", {
              count: targetCompanyIds.length,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy || !canConfirm}
              style={{
                backgroundColor: busy || !canConfirm ? undefined : STAFF_ACCENT_COLOR,
              }}
              className="hover:opacity-90"
              onClick={() => void confirmExport()}
            >
              {busy
                ? t("companies.export.downloading")
                : t("companies.export.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
