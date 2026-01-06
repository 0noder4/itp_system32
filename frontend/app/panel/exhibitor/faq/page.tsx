"use client";

import React, { useState, useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR } from "@/lib/colors";

export default function FAQPage() {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const faqCategories = [
    {
      id: "general",
      title: t("exhibitor.faq.categories.general"),
      questions: [
        {
          id: "location",
          question: t("exhibitor.faq.general.location.question"),
          answer: t("exhibitor.faq.general.location.answer"),
        },
        {
          id: "dates",
          question: t("exhibitor.faq.general.dates.question"),
          answer: t("exhibitor.faq.general.dates.answer"),
        },
        {
          id: "wifi",
          question: t("exhibitor.faq.general.wifi.question"),
          answer: t("exhibitor.faq.general.wifi.answer"),
        },
      ],
    },
    {
      id: "logistics",
      title: t("exhibitor.faq.categories.logistics"),
      questions: [
        {
          id: "unloading",
          question: t("exhibitor.faq.logistics.unloading.question"),
          answer: t("exhibitor.faq.logistics.unloading.answer"),
        },
        {
          id: "parking",
          question: t("exhibitor.faq.logistics.parking.question"),
          answer: t("exhibitor.faq.logistics.parking.answer"),
        },
      ],
    },
    {
      id: "materials",
      title: t("exhibitor.faq.categories.materials"),
      questions: [
        {
          id: "setupTime",
          question: t("exhibitor.faq.materials.setupTime.question"),
          answer: t("exhibitor.faq.materials.setupTime.answer"),
        },
        {
          id: "wallRestrictions",
          question: t("exhibitor.faq.materials.wallRestrictions.question"),
          answer: t("exhibitor.faq.materials.wallRestrictions.answer"),
        },
      ],
    },
    {
      id: "ownConstruction",
      title: t("exhibitor.faq.categories.ownConstruction"),
      questions: [
        {
          id: "ownSetup",
          question: t("exhibitor.faq.materials.ownSetup.question"),
          answer: t("exhibitor.faq.materials.ownSetup.answer"),
        },
      ],
    },
    {
      id: "support",
      title: t("exhibitor.faq.categories.support"),
      questions: [
        {
          id: "supervisor",
          question: t("exhibitor.faq.support.supervisor.question"),
          answer: t("exhibitor.faq.support.supervisor.answer"),
        },
        {
          id: "lunch",
          question: t("exhibitor.faq.support.lunch.question"),
          answer: t("exhibitor.faq.support.lunch.answer"),
        },
        {
          id: "coffee",
          question: t("exhibitor.faq.support.coffee.question"),
          answer: t("exhibitor.faq.support.coffee.answer"),
        },
      ],
    },
    {
      id: "pdiVenue",
      title: t("exhibitor.faq.categories.pdiVenue"),
      questions: [
        {
          id: "gala",
          question: t("exhibitor.faq.pdiVenue.gala.question"),
          answer: t("exhibitor.faq.pdiVenue.gala.answer"),
        },
      ],
    },
  ];

  // Flatten all questions for display
  const allQuestions = useMemo(() => {
    return faqCategories.flatMap((category) =>
      category.questions.map((q) => ({
        ...q,
        categoryId: category.id,
        categoryTitle: category.title,
      }))
    );
  }, [faqCategories]);

  // Filter questions based on selected category
  const filteredQuestions = useMemo(() => {
    if (selectedCategory === "all") {
      return allQuestions;
    }
    return allQuestions.filter((q) => q.categoryId === selectedCategory);
  }, [allQuestions, selectedCategory]);

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-background">
      <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col gap-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: ACCENT_COLOR }}
              >
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
                {t("exhibitor.faq.title")}
              </h1>
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl">
              {t("exhibitor.faq.description")}
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          className="w-full"
        >
          <TabsList className="bg-transparent p-0 h-auto gap-2">
            <TabsTrigger
              value="all"
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                "data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground hover:bg-muted/80"
              )}
                style={{
                  backgroundColor:
                    selectedCategory === "all" ? ACCENT_COLOR : undefined,
                  color: selectedCategory === "all" ? "white" : undefined,
                }}
            >
              {t("exhibitor.faq.allCategories")}
            </TabsTrigger>
            {faqCategories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className={cn(
                  "rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                  "data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground hover:bg-muted/80"
                )}
                style={{
                  backgroundColor:
                    selectedCategory === category.id ? ACCENT_COLOR : undefined,
                  color: selectedCategory === category.id ? "white" : undefined,
                }}
              >
                {category.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* FAQ Grid */}
          <div className="mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredQuestions.map((item, index) => {
                return (
                  <Card
                    key={item.id}
                    className="transition-all hover:shadow-lg bg-card border-border hover:border-[#F55718]"
                  >
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center justify-start gap-3">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-muted border-2 border-border">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-base leading-tight text-foreground">
                          {item.question}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed text-left">
                        {item.answer}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </Tabs>

        {/* See All Questions Button */}
        {selectedCategory !== "all" && (
          <div className="flex justify-center pt-4">
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

