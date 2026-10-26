export type MapShape =
  | { type: "polygon"; points: string }
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      transform?: string;
    };

export type MapSegment = {
  label: string;
  area_m2: 4 | 6 | 8 | 12 | number;
  shape: MapShape;
};

export type MapDayLayout = {
  tracks: Record<string, MapSegment[]>;
};

export type MapLayoutResponse = {
  id: number;
  sync_days: boolean;
  day1: MapDayLayout;
  day2: MapDayLayout;
  updated_at?: string | null;
  warnings?: MapConflictWarning[];
  applied?: boolean;
};

export type MapConflictWarning = {
  day: string;
  stand_number: string;
  company_id: number;
  company_name: string;
  fr_resp_id: number | null;
  fr_resp_name: string | null;
  message: string;
};

export type RepartitionOption = {
  areas: number[];
  labels: string[];
  variant_id: string;
  description: string;
  total_m2?: number;
};

export type MapLayoutSnapshot = {
  sync_days: boolean;
  day1: MapDayLayout;
  day2: MapDayLayout;
};

export function segmentsForDay(
  layout: MapDayLayout | undefined | null
): MapSegment[] {
  if (!layout?.tracks) return [];
  return Object.values(layout.tracks).flat();
}

export function trackLetter(label: string): string {
  const m = label.match(/^[A-Z]+/);
  return m ? m[0] : "";
}

/** Track key that contains the label (name prefix can differ after renames). */
export function findTrackForLabel(
  layout: MapDayLayout | undefined | null,
  label: string
): string {
  if (!layout?.tracks) return trackLetter(label);
  for (const [letter, segs] of Object.entries(layout.tracks)) {
    if (segs.some((s) => s.label === label)) return letter;
  }
  return trackLetter(label);
}

export function findTrackForLabels(
  layout: MapDayLayout | undefined | null,
  labels: string[]
): string {
  if (!labels.length) return "";
  return findTrackForLabel(layout, labels[0]);
}

/** Map layout area_m2 → API stand_size key. */
export function areaToStandSize(area_m2: number): string {
  if (area_m2 <= 4) return "podstawowy";
  if (area_m2 <= 6) return "standardowy";
  if (area_m2 <= 8) return "rozszerzony";
  return "12m2";
}
