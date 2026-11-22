"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { apiClient, fetcher } from "@/lib/api";
import type { FAQCategory, FAQItem } from "@/lib/types";
import { Header } from "@/components/layout/Header";
import { useStaffNav } from "@/hooks/useStaffNav";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Edit,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

const CATEGORIES: FAQCategory[] = [
  "general",
  "logistics",
  "materials",
  "ownConstruction",
  "workshops",
  "support",
  "pdiVenue",
];

type FAQFormState = {
  category: FAQCategory;
  order: number;
  is_active: boolean;
  question_pl: string;
  answer_pl: string;
  question_en: string;
  answer_en: string;
};

const EMPTY_FORM: FAQFormState = {
  category: "general",
  order: 0,
  is_active: true,
  question_pl: "",
  answer_pl: "",
  question_en: "",
  answer_en: "",
};

export default function StaffFAQPage() {
  const { t, locale } = useTranslation();
  const navItems = useStaffNav();

  const { data: items, error, isLoading, mutate } = useSWR<FAQItem[]>(
    "/api/faq/?include_inactive=1",
    fetcher
  );

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FAQItem | null>(null);
  const [formState, setFormState] = useState<FAQFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FAQItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredItems = useMemo(() => {
    const list = items ?? [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.question_pl.toLowerCase().includes(q) ||
        item.answer_pl.toLowerCase().includes(q) ||
        item.question_en.toLowerCase().includes(q) ||
        item.answer_en.toLowerCase().includes(q)
      );
    });
  }, [items, categoryFilter, searchQuery]);

  const openCreate = () => {
    setEditingItem(null);
    setFormState(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEdit = (item: FAQItem) => {
    setEditingItem(item);
    setFormState({
      category: item.category,
      order: item.order,
      is_active: item.is_active,
      question_pl: item.question_pl,
      answer_pl: item.answer_pl,
      question_en: item.question_en,
      answer_en: item.answer_en,
    });
    setEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formState.question_pl.trim() ||
      !formState.answer_pl.trim() ||
      !formState.question_en.trim() ||
      !formState.answer_en.trim()
    ) {
      toast.error(t("staff.faq.validationError"));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formState,
        order: Number(formState.order) || 0,
        question_pl: formState.question_pl.trim(),
        answer_pl: formState.answer_pl.trim(),
        question_en: formState.question_en.trim(),
        answer_en: formState.answer_en.trim(),
      };
      if (editingItem) {
        await apiClient.patch(`/api/faq/${editingItem.id}/`, payload);
        toast.success(t("staff.faq.updatedSuccess"));
      } else {
        await apiClient.post("/api/faq/", payload);
        toast.success(t("staff.faq.createdSuccess"));
      }
      await mutate();
      setEditorOpen(false);
    } catch {
      toast.error(t("staff.faq.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: FAQItem) => {
    try {
      await apiClient.patch(`/api/faq/${item.id}/`, {
        is_active: !item.is_active,
      });
      await mutate();
      toast.success(t("staff.faq.updatedSuccess"));
    } catch {
      toast.error(t("staff.faq.saveError"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/faq/${deleteTarget.id}/`);
      await mutate();
      toast.success(t("staff.faq.deletedSuccess"));
      setDeleteTarget(null);
    } catch {
      toast.error(t("staff.faq.deleteError"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header navigationItems={navItems} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("staff.faq.title")}
            </h1>
            <p className="text-muted-foreground">{t("staff.faq.description")}</p>
          </div>
          <Button
            onClick={openCreate}
            className="text-white shrink-0"
            style={{ backgroundColor: STAFF_ACCENT_COLOR }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("staff.faq.addButton")}
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={categoryFilter === "all" ? "default" : "outline"}
              onClick={() => setCategoryFilter("all")}
            >
              {t("exhibitor.faq.allCategories")}
            </Button>
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                type="button"
                size="sm"
                variant={categoryFilter === cat ? "default" : "outline"}
                onClick={() => setCategoryFilter(cat)}
              >
                {t(`exhibitor.faq.categories.${cat}`)}
              </Button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("common.search")}
              className="pl-8"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{t("staff.faq.loadError")}</span>
            </CardContent>
          </Card>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {t("staff.faq.empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <Card key={item.id} className={!item.is_active ? "opacity-70" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium">
                        {t(`exhibitor.faq.categories.${item.category}`)}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        #{item.order}
                      </span>
                      {item.is_active ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                          {t("staff.faq.active")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                          {t("staff.faq.inactive")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title={
                          item.is_active
                            ? t("staff.faq.hide")
                            : t("staff.faq.show")
                        }
                        onClick={() => handleToggleActive(item)}
                      >
                        {item.is_active ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(item)}
                      >
                        <Edit className="mr-1 h-3.5 w-3.5" />
                        {t("common.edit")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-base pt-2">
                    {locale === "en" ? item.question_en : item.question_pl}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      PL: {item.question_pl}
                    </div>
                    <p className="text-muted-foreground whitespace-pre-line">
                      {item.answer_pl}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      EN: {item.question_en}
                    </div>
                    <p className="text-muted-foreground whitespace-pre-line">
                      {item.answer_en}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Create / Edit Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t("staff.faq.editTitle") : t("staff.faq.createTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("staff.faq.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-sm font-medium">
                  {t("staff.faq.categoryLabel")}
                </label>
                <select
                  value={formState.category}
                  onChange={(e) =>
                    setFormState((s) => ({
                      ...s,
                      category: e.target.value as FAQCategory,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {t(`exhibitor.faq.categories.${cat}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {t("staff.faq.orderLabel")}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={formState.order}
                  onChange={(e) =>
                    setFormState((s) => ({
                      ...s,
                      order: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="faq-is-active"
                type="checkbox"
                checked={formState.is_active}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, is_active: e.target.checked }))
                }
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="faq-is-active" className="text-sm font-medium">
                {t("staff.faq.activeLabel")}
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                {t("staff.faq.questionPl")} *
              </label>
              <Input
                value={formState.question_pl}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, question_pl: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                {t("staff.faq.answerPl")} *
              </label>
              <Textarea
                rows={4}
                value={formState.answer_pl}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, answer_pl: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                {t("staff.faq.questionEn")} *
              </label>
              <Input
                value={formState.question_en}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, question_en: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                {t("staff.faq.answerEn")} *
              </label>
              <Textarea
                rows={4}
                value={formState.answer_en}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, answer_en: e.target.value }))
                }
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="text-white"
                style={{ backgroundColor: STAFF_ACCENT_COLOR }}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("staff.faq.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("staff.faq.deleteConfirm", {
                question:
                  locale === "en"
                    ? deleteTarget?.question_en ?? ""
                    : deleteTarget?.question_pl ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
