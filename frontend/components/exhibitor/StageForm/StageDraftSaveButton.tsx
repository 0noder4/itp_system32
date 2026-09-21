"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { Loader2 } from "lucide-react";

interface StageDraftSaveButtonProps {
  onClick: () => void | Promise<void>;
  isSubmitting: boolean;
  className?: string;
}

/** Shared “Zapisz wersję roboczą” control (top/bottom of stage forms). */
export function StageDraftSaveButton({
  onClick,
  isSubmitting,
  className,
}: StageDraftSaveButtonProps) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isSubmitting}
      className={className ?? "w-full md:w-auto"}
      onClick={onClick}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("common.loading")}
        </>
      ) : (
        t("common.saveDraft")
      )}
    </Button>
  );
}
