"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Company } from "@/lib/types";

export default function Index() {
  const { data, error, isLoading } = useSWR<Company[]>(
    "/api/companies/",
    fetcher
  );

  if (isLoading) {
    return <div>Loading companies...</div>;
  }

  if (error) {
    console.log(error);
    return <div>Error loading companies: {error.message}</div>;
  }

  if (!data || data.length === 0) {
    return <div>No companies found</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Companies</h1>
      <div className="space-y-4">
        {data.map((company) => (
          <div
            key={company.id}
            className="border rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold">{company.name}</h2>
            <p className="text-gray-600">Email: {company.email}</p>
            <p className="text-sm text-gray-500">Status: {company.status}</p>
            <p className="text-xs text-gray-400">
              Created: {new Date(company.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
