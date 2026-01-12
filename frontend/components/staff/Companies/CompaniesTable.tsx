"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadges, TableRow as TableRowType } from "./StatusBadges";
import { formatDate, formatDateWithTime, formatFrRespName, formatRepresentativeName } from "./utils";

function formatStandDisplay(
  day1Stand: { stand_number: string; stand_size: string } | null,
  day2Stand: { stand_number: string; stand_size: string } | null,
  t: any
): string {
  const formatStandSize = (size: string): string => {
    return t(`companies.stand.sizes.${size}`) || size;
  };

  const stands: string[] = [];
  
  if (day1Stand?.stand_number) {
    stands.push(`D1: ${day1Stand.stand_number} (${formatStandSize(day1Stand.stand_size)})`);
  }
  
  if (day2Stand?.stand_number) {
    stands.push(`D2: ${day2Stand.stand_number} (${formatStandSize(day2Stand.stand_size)})`);
  }

  if (stands.length === 0) {
    return t("companies.stand.notAssigned");
  }

  return stands.join(", ");
}

interface CompaniesTableProps {
  rows: TableRowType[];
  onInvitationClick?: (invitation: TableRowType & { type: "invitation" }) => void;
}

export function CompaniesTable({
  rows,
  onInvitationClick,
}: CompaniesTableProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const getCreatedAtCell = (row: TableRowType) => {
    if (row.type === "company") {
      return formatDate(row.data.created_at, locale);
    } else {
      const expiresAt = new Date(row.data.expires_at);
      const now = new Date();
      const isExpired = expiresAt < now;

      return (
        <div className="flex items-center gap-4">
          <span>{formatDate(row.data.created_at, locale)}</span>
          <span
            className={`text-xs ${
              isExpired
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground"
            }`}
          >
            {isExpired
              ? t("companies.invitations.expiredOn", {
                  date: formatDateWithTime(row.data.expires_at, locale),
                })
              : t("companies.invitations.expiresOn", {
                  date: formatDateWithTime(row.data.expires_at, locale),
                })}
          </span>
        </div>
      );
    }
  };

  const handleRowClick = (row: TableRowType) => {
    if (row.type === "company") {
      router.push(`/panel/staff/companies/${row.data.id}`);
    } else if (row.type === "invitation") {
      if (onInvitationClick) {
        onInvitationClick(row);
      } else {
        router.push(`/panel/staff/invitations/${row.data.id}`);
      }
    }
  };

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">{t("companies.table.name")}</TableHead>
                <TableHead className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">{t("companies.table.status")}</TableHead>
                <TableHead className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap hidden sm:table-cell">{t("companies.table.email")}</TableHead>
                <TableHead className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap hidden md:table-cell">{t("companies.table.representative")}</TableHead>
                <TableHead className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap hidden lg:table-cell">{t("companies.table.frResp")}</TableHead>
                <TableHead className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">{t("companies.table.standNumber")}</TableHead>
                <TableHead className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">{t("companies.table.completedStages")}</TableHead>
                <TableHead className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">{t("companies.table.createdAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const tableRow = (
                  <TableRow
                    key={`${row.type}-${row.data.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(row)}
                  >
                    <TableCell className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">
                      {row.type === "company"
                        ? row.data.name
                        : row.data.company_name}
                    </TableCell>
                    <TableCell className="px-2 sm:px-4 whitespace-nowrap">
                      <StatusBadges row={row} />
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap hidden sm:table-cell">{row.data.email}</TableCell>
                    <TableCell className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap hidden md:table-cell">
                      {row.type === "company" ? (
                        formatRepresentativeName(
                          row.data.representative_name,
                          row.data.representative_surname
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap hidden lg:table-cell">
                      {row.type === "company"
                        ? formatFrRespName(
                            row.data.fr_resp_name,
                            row.data.fr_resp_surname,
                            row.data.fr_resp_email
                          )
                        : formatFrRespName(
                            row.data.fr_resp_name,
                            row.data.fr_resp_surname,
                            row.data.fr_resp_email
                          )}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">
                      {row.type === "company" ? (
                        <span className="text-xs sm:text-sm">
                          {formatStandDisplay(
                            row.data.day1_stand,
                            row.data.day2_stand,
                            t
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">
                      {row.type === "company" ? (
                        <span>
                          {row.data.completed_stages_count}/5
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm px-2 sm:px-4 whitespace-nowrap">{getCreatedAtCell(row)}</TableCell>
                  </TableRow>
                );

              if (row.type === "company") {
                return (
                  <Tooltip key={`${row.type}-${row.data.id}`}>
                    <TooltipTrigger asChild>{tableRow}</TooltipTrigger>
                    <TooltipContent>
                      <p>{t("companies.viewDetails")}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }

              if (row.type === "invitation") {
                return (
                  <Tooltip key={`${row.type}-${row.data.id}`}>
                    <TooltipTrigger asChild>{tableRow}</TooltipTrigger>
                    <TooltipContent>
                      <p>{t("companies.invitations.viewDetails")}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return tableRow;
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

