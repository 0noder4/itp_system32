import { useTranslation } from "@/lib/i18n";
import { Company, CompanyInvitation } from "@/lib/types";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";

interface StatusBadgeProps {
  status: "main" | "partner" | "basic";
}

export function CompanyStatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();

  const statusColors = {
    main: "", // Will use inline style with STAFF_ACCENT_COLOR
    partner:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    basic: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        statusColors[status] || statusColors.basic
      }`}
      style={
        status === "main"
          ? {
              backgroundColor: `${STAFF_ACCENT_COLOR}1A`,
              color: STAFF_ACCENT_COLOR,
            }
          : undefined
      }
    >
      {t(`companies.status.${status}`)}
    </span>
  );
}

interface InvitationStatusBadgeProps {
  status:
    | "accepted"
    | "expired"
    | "not accepted"
    | "cancelled"
    | "resigned";
}

export function InvitationStatusBadge({ status }: InvitationStatusBadgeProps) {
  const { t } = useTranslation();

  const statusColors: Record<InvitationStatusBadgeProps["status"], string> = {
    accepted:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    expired: "bg-danger/10 text-danger dark:bg-danger/20 dark:text-danger-foreground",
    "not accepted":
      "bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning-foreground",
    cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    resigned:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };

  // Map status value to translation key (status has space, key doesn't)
  const statusKey = status === "not accepted" ? "notAccepted" : status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        statusColors[status] || statusColors["not accepted"]
      }`}
    >
      {t(`companies.invitations.status.${statusKey}`)}
    </span>
  );
}

export function CompanyLanguageBadge({
  language,
}: {
  language?: string | null;
}) {
  const { t } = useTranslation();
  if (language !== "en") return null;

  return (
    <span
      title={t("companies.englishBadgeTooltip")}
      className="inline-flex items-center rounded border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:border-sky-700 dark:bg-sky-900/60 dark:text-sky-200"
    >
      {t("companies.englishBadge")}
    </span>
  );
}

export type TableRow =
  | { type: "company"; data: Company }
  | { type: "invitation"; data: CompanyInvitation };

interface StatusBadgesProps {
  row: TableRow;
}

export function StatusBadges({ row }: StatusBadgesProps) {
  if (row.type === "company") {
    return <CompanyStatusBadge status={row.data.status} />;
  } else {
    return (
      <div className="flex flex-wrap gap-1">
        <CompanyStatusBadge status={row.data.company_status} />
        <InvitationStatusBadge status={row.data.invitation_status} />
      </div>
    );
  }
}
