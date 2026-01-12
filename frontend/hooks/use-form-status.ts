"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import {
  UserValidationResponse,
  FormStatusResponse,
  StageStatus,
  StageInfo,
  StageFeedback,
} from "@/lib/types";

// Stage titles for display
const STAGE_TITLES: Record<number, string> = {
  1: "stage1.title",
  2: "stage2.title",
  3: "stage3.title",
  4: "stage4.title",
  5: "stage5.title",
};

const STAGE_DESCRIPTIONS: Record<number, string> = {
  1: "stage1.description",
  2: "stage2.description",
  3: "stage3.description",
  4: "stage4.description",
  5: "stage5.description",
};

function computeStageStatus(
  stageNum: number,
  formStatus: FormStatusResponse | undefined,
  previousStageCompleted: boolean
): StageStatus {
  if (!formStatus) return "not_started";

  const stageKey = `stage_${stageNum}`;
  const isCompleted = formStatus.form[
    `stage_${stageNum}_completed` as keyof typeof formStatus.form
  ] as boolean;
  const dataExists = formStatus.data_exists[stageKey];
  const feedback = formStatus.feedbacks[stageKey];

  // If data exists, check feedback status first
  if (dataExists && feedback) {
    if (feedback.status === "accepted") return "accepted";
    if (feedback.status === "rejected") return "rejected";
    if (feedback.status === "pending") return "pending_approval";
  }

  // If stage is marked as completed in Form model but no feedback yet
  if (isCompleted) {
    return "pending_approval";
  }

  // Stage not completed
  if (dataExists) {
    // Data exists but not completed - check if it was rejected
    if (feedback && feedback.status === "rejected") return "rejected";
    // If there's pending feedback, show pending
    if (feedback && feedback.status === "pending") return "pending_approval";
    return "in_progress";
  }

  // No data exists
  if (!previousStageCompleted && stageNum > 1) {
    return "not_started";
  }

  return "not_started";
}

export interface UseFormStatusReturn {
  companyId: number | null;
  companyName: string | null;
  stages: StageInfo[];
  currentStageNumber: number | null;
  isAllCompleted: boolean;
  isLoading: boolean;
  isError: boolean;
  mutateFormStatus: () => void;
}

export function useFormStatus(): UseFormStatusReturn {
  // Fetch user data (includes company info for company users)
  const {
    data: userData,
    error: userError,
    isLoading: userLoading,
  } = useSWR<UserValidationResponse>("/api/token/validate/", fetcher);

  const companyId = userData?.company?.id ?? null;
  const companyName = userData?.company?.name ?? null;

  // Fetch form status (only if we have a company ID)
  const {
    data: formStatus,
    error: formError,
    isLoading: formLoading,
    mutate: mutateFormStatus,
  } = useSWR<FormStatusResponse>(
    companyId ? `/api/company/${companyId}/form/status/` : null,
    fetcher
  );

  const isLoading = userLoading || formLoading;
  const isError = !!userError || !!formError;

  // Compute stage info
  const stages: StageInfo[] = [];
  let currentStageNumber: number | null = null;
  let isAllCompleted = true;
  let previousStageCompleted = true;

  for (let i = 1; i <= 5; i++) {
    const stageKey = `stage_${i}`;
    const status = computeStageStatus(i, formStatus, previousStageCompleted);
    const isCompleted =
      (formStatus?.form[
        `stage_${i}_completed` as keyof typeof formStatus.form
      ] as boolean) ?? false;
    const feedback = formStatus?.feedbacks[stageKey];
    const dataExists = formStatus?.data_exists[stageKey] ?? false;
    const completedAt = formStatus?.completion_timestamps?.[stageKey] ?? null;

    stages.push({
      stageNumber: i,
      title: STAGE_TITLES[i],
      description: STAGE_DESCRIPTIONS[i],
      status,
      isCompleted,
      feedback: feedback as StageFeedback | undefined,
      dataExists,
      completedAt: completedAt || undefined,
    });

    // Determine current stage (first non-accepted stage)
    if (currentStageNumber === null && status !== "accepted") {
      currentStageNumber = i;
    }

    if (status !== "accepted") {
      isAllCompleted = false;
    }

    previousStageCompleted = isCompleted;
  }

  return {
    companyId,
    companyName,
    stages,
    currentStageNumber,
    isAllCompleted,
    isLoading,
    isError,
    mutateFormStatus,
  };
}
