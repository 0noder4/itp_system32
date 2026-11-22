"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "@/lib/i18n";
import { fetcher } from "@/lib/api";
import type { FAQCategory, FAQItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR } from "@/lib/colors";

const CATEGORY_ORDER: FAQCategory[] = [
  "general",
  "logistics",
  "materials",
  "ownConstruction",
  "workshops",
  "support",
  "pdiVenue",
];

type StructuredSection = {
  index: string;
  title: string;
  details: string[];
};

type StructuredFaqAnswer = {
  intro?: string;
  sections: StructuredSection[];
};

function parseStructuredFaqAnswer(answer: string): StructuredFaqAnswer | null {
  const lines = answer.split(/\r?\n/);
  const introLines: string[] = [];
  const sections: StructuredSection[] = [];
  let current: StructuredSection | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^(\d+)\.\s+(.+?):?\s*$/);
    if (headingMatch) {
      current = {
        index: headingMatch[1],
        title: headingMatch[2],
        details: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      introLines.push(trimmed);
      continue;
    }

    const detail = trimmed.replace(/^[-–•*]\s*/, "");
    if (detail) {
      current.details.push(detail);
    }
  }

  if (sections.length < 2 || sections.some((s) => s.details.length === 0)) {
    return null;
  }

  return {
    intro: introLines.length > 0 ? introLines.join("\n") : undefined,
    sections,
  };
}

function getRunSpanClasses(runLength: number, indexInRun: number): string {
  if (runLength === 1) {
    return "md:col-span-2 lg:col-span-3";
  }
  const rem = runLength % 3;
  if (rem === 0) {
    return "lg:col-span-2";
  }
  if (rem === 2) {
    return indexInRun >= runLength - 2 ? "lg:col-span-3" : "lg:col-span-2";
  }
  // rem === 1 and runLength >= 4: balance the last 4 items into two 50/50 rows.
  return indexInRun >= runLength - 4 ? "lg:col-span-3" : "lg:col-span-2";
}

export default function FAQPage() {
  const { t, locale } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const { data: items, error, isLoading } = useSWR<FAQItem[]>(
    "/api/faq/",
    fetcher
  );

  const faqCategories = useMemo(() => {
    if (!items?.length) return [];
    const byCat = new Map<string, FAQItem[]>();
    for (const item of items) {
      const list = byCat.get(item.category) ?? [];
      list.push(item);
      byCat.set(item.category, list);
    }
    const orderedKeys = [
      ...CATEGORY_ORDER.filter((c) => byCat.has(c)),
      ...Array.from(byCat.keys()).filter(
        (k) => !CATEGORY_ORDER.includes(k as FAQCategory)
      ),
    ];
    return orderedKeys.map((catId) => ({
      id: catId,
      title: t(`exhibitor.faq.categories.${catId}`),
      questions: (byCat.get(catId) ?? []).map((item) => ({
        id: item.id,
        categoryId: catId,
        question: locale === "en" ? item.question_en : item.question_pl,
        answer: locale === "en" ? item.answer_en : item.answer_pl,
      })),
    }));
  }, [items, locale, t]);

  const allQuestions = useMemo(
    () => faqCategories.flatMap((c) => c.questions),
    [faqCategories]
  );

  const filteredQuestions = useMemo(() => {
    if (selectedCategory === "all") return allQuestions;
    return allQuestions.filter((q) => q.categoryId === selectedCategory);
  }, [allQuestions, selectedCategory]);

  const layoutQuestions = useMemo(() => {
    const parsed = filteredQuestions.map((item) => ({
      item,
      structured: parseStructuredFaqAnswer(item.answer),
    }));

    const spans: string[] = new Array(parsed.length).fill("lg:col-span-2");
    let runStart = 0;

    const assignRun = (start: number, end: number) => {
      const len = end - start;
      for (let i = 0; i < len; i++) {
        spans[start + i] = getRunSpanClasses(len, i);
      }
    };

    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].structured) {
        if (i > runStart) assignRun(runStart, i);
        spans[i] = "md:col-span-2 lg:col-span-6";
        runStart = i + 1;
      }
    }
    if (parsed.length > runStart) {
      assignRun(runStart, parsed.length);
    }

    return parsed.map((entry, idx) => ({
      ...entry,
      spanClass: spans[idx],
    }));
  }, [filteredQuestions]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 space-y-8">
        {/* Header Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: ACCENT_COLOR }}
            >
              <HelpCircle className="h-5 w-5" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              {t("exhibitor.faq.title")}
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl">
            {t("exhibitor.faq.description")}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-44 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{t("exhibitor.loadError")}</span>
            </CardContent>
          </Card>
        ) : faqCategories.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              {t("exhibitor.faq.empty")}
            </CardContent>
          </Card>
        ) : (
          <Tabs
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            className="w-full"
          >
            <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0 justify-start">
              <TabsTrigger
                value="all"
                className={cn(
                  "rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                  "border border-border bg-card text-foreground",
                  "data-[state=active]:bg-[#F55718] data-[state=active]:text-white data-[state=active]:border-[#F55718]"
                )}
              >
                {t("exhibitor.faq.allCategories")}
              </TabsTrigger>
              {faqCategories.map((category) => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className={cn(
                    "rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                    "border border-border bg-card text-foreground",
                    "data-[state=active]:bg-[#F55718] data-[state=active]:text-white data-[state=active]:border-[#F55718]"
                  )}
                >
                  {category.title}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="mt-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                {layoutQuestions.map(({ item, structured, spanClass }) => (
                  <Card
                    key={item.id}
                    className={cn(
                      "transition-all hover:shadow-lg bg-card border-border hover:border-[#F55718]",
                      spanClass
                    )}
                  >
                    <CardContent className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-muted border-2 border-border mt-0.5">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-base leading-tight text-foreground">
                          {item.question}
                        </h3>
                      </div>
                      {structured ? (
                        <div className="space-y-4">
                          {structured.intro ? (
                            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                              {structured.intro}
                            </p>
                          ) : null}
                          <div
                            className={cn(
                              "grid grid-cols-1 gap-3 sm:grid-cols-2",
                              structured.sections.length >= 4
                                ? "lg:grid-cols-4"
                                : structured.sections.length === 3
                                  ? "lg:grid-cols-3"
                                  : "lg:grid-cols-2"
                            )}
                          >
                            {structured.sections.map((section) => (
                              <div
                                key={`${section.index}-${section.title}`}
                                className="rounded-lg border border-border/70 bg-muted/35 p-3.5 space-y-2"
                              >
                                <div className="flex items-start gap-2">
                                  <span
                                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white mt-0.5"
                                    style={{ backgroundColor: ACCENT_COLOR }}
                                  >
                                    {section.index}
                                  </span>
                                  <h4 className="text-sm font-medium leading-snug text-foreground">
                                    {section.title}
                                  </h4>
                                </div>
                                <ul className="space-y-1 pl-7 text-xs text-muted-foreground leading-relaxed list-disc">
                                  {section.details.map((detail, idx) => (
                                    <li key={idx}>{detail}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                          {item.answer}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </Tabs>
        )}

        {selectedCategory !== "all" && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => setSelectedCategory("all")}
              className="rounded-lg px-6 py-2.5 bg-muted hover:bg-muted/80 text-foreground border-border"
            >
              {t("exhibitor.faq.seeAllQuestions")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
