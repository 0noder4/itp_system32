"use client";

import * as React from "react";
import {
  DEFAULT_EDITION_NUMBER,
  appFullName as buildFullName,
  appShortName as buildShortName,
} from "@/lib/edition";
import { apiClient } from "@/lib/api";

type EditionContextType = {
  edition: number;
  appName: string;
  fullName: string;
};

const EditionContext = React.createContext<EditionContextType>({
  edition: DEFAULT_EDITION_NUMBER,
  appName: buildShortName(),
  fullName: buildFullName(),
});

export function EditionProvider({ children }: { children: React.ReactNode }) {
  const [edition, setEdition] = React.useState(DEFAULT_EDITION_NUMBER);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get<{ edition_number?: number }>(
          "/api/edition/"
        );
        const next = Number(data?.edition_number);
        if (!cancelled && Number.isFinite(next) && next >= 1) {
          setEdition(next);
        }
      } catch {
        // Keep DEFAULT_EDITION_NUMBER on network / backend errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    document.title = buildFullName(edition);
  }, [edition]);

  const value = React.useMemo(
    () => ({
      edition,
      appName: buildShortName(edition),
      fullName: buildFullName(edition),
    }),
    [edition]
  );

  return (
    <EditionContext.Provider value={value}>{children}</EditionContext.Provider>
  );
}

export function useEdition() {
  return React.useContext(EditionContext);
}
