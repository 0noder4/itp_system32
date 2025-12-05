"use client";

import React from "react";
import useSWR from "swr";
import { Search, X, UserPlus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { fetcher, apiClient } from "@/lib/api";
import { Company } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const invitationFormSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  company_name: z.string().min(1, "Company name is required."),
  company_status: z.enum(["main", "partner", "basic"]),
});

export default function Index() {
  const {
    data: companies,
    error,
    isLoading,
    mutate,
  } = useSWR<Company[]>("/api/companies/", fetcher);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "main" | "partner" | "basic"
  >("all");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const invitationForm = useForm<z.infer<typeof invitationFormSchema>>({
    resolver: zodResolver(invitationFormSchema),
    defaultValues: {
      email: "",
      company_name: "",
      company_status: "basic",
    },
  });

  const onInvitationSubmit = async (
    data: z.infer<typeof invitationFormSchema>
  ) => {
    setIsSubmitting(true);
    try {
      await apiClient.post("/api/invite/", data);
      toast.success("Invitation sent successfully!", {
        description: `An invitation has been sent to ${data.email}`,
      });
      setIsInviteDialogOpen(false);
      invitationForm.reset();
      // Optionally refresh the companies list
      mutate();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        Object.values(error.response?.data || {}).flat()[0] ||
        "Failed to send invitation. Please try again.";
      toast.error("Invitation failed", {
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      main: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      partner:
        "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      basic: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          statusColors[status as keyof typeof statusColors] ||
          statusColors.basic
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // Filter companies based on search query and status filter
  const filteredCompanies = React.useMemo(() => {
    if (!companies) return [];

    return companies.filter((company) => {
      // Status filter
      if (statusFilter !== "all" && company.status !== statusFilter) {
        return false;
      }

      // Search filter (searches in name, email, and ID)
      if (searchQuery.trim() === "") {
        return true;
      }

      const query = searchQuery.toLowerCase();
      return (
        company.name.toLowerCase().includes(query) ||
        company.email.toLowerCase().includes(query) ||
        company.id.toString().includes(query)
      );
    });
  }, [companies, searchQuery, statusFilter]);

  return (
    <div className="flex h-screen flex-col overflow-hidden p-6">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold mb-2">Staff Dashboard</h1>
        <p className="text-muted-foreground">
          Manage companies and system settings from here.
        </p>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle>Companies</CardTitle>
            <Dialog
              open={isInviteDialogOpen}
              onOpenChange={setIsInviteDialogOpen}
            >
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite New
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Invite New Company</DialogTitle>
                  <DialogDescription>
                    Send an invitation to a new company. They will receive an
                    email with a registration link.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={invitationForm.handleSubmit(onInvitationSubmit)}
                  id="invite-company-form"
                >
                  <FieldGroup>
                    <Controller
                      name="email"
                      control={invitationForm.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="invite-email">
                            Email Address
                          </FieldLabel>
                          <Input
                            {...field}
                            id="invite-email"
                            type="email"
                            placeholder="company@example.com"
                            aria-invalid={fieldState.invalid}
                            disabled={isSubmitting}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name="company_name"
                      control={invitationForm.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="invite-company-name">
                            Company Name
                          </FieldLabel>
                          <Input
                            {...field}
                            id="invite-company-name"
                            type="text"
                            placeholder="Enter company name"
                            aria-invalid={fieldState.invalid}
                            disabled={isSubmitting}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name="company_status"
                      control={invitationForm.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="invite-company-status">
                            Company Status
                          </FieldLabel>
                          <select
                            {...field}
                            id="invite-company-status"
                            aria-invalid={fieldState.invalid}
                            disabled={isSubmitting}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                          >
                            <option value="basic">Basic</option>
                            <option value="partner">Partner</option>
                            <option value="main">Main</option>
                          </select>
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </form>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsInviteDialogOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="invite-company-form"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Sending..." : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col overflow-hidden">
          {!isLoading && companies && (
            <div className="mb-4 shrink-0 space-y-4">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by name, email, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Status Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Filter by status:
                </span>
                <div className="flex gap-2">
                  {(["all", "main", "partner", "basic"] as const).map(
                    (status) => (
                      <Button
                        key={status}
                        variant={
                          statusFilter === status ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setStatusFilter(status)}
                        className="capitalize"
                      >
                        {status === "all" ? "All" : status}
                      </Button>
                    )
                  )}
                </div>
                {(searchQuery || statusFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                    className="ml-auto"
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              {/* Results count */}
              <div className="text-sm text-muted-foreground">
                Showing {filteredCompanies.length} of {companies.length}{" "}
                companies
              </div>
            </div>
          )}

          <div className="custom-scrollbar flex-1 overflow-auto">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Failed to load companies. Please try again later.</p>
              </div>
            ) : filteredCompanies && filteredCompanies.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Representative ID</TableHead>
                      <TableHead>Created At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell className="font-medium">
                          {company.id}
                        </TableCell>
                        <TableCell>{company.name}</TableCell>
                        <TableCell>{getStatusBadge(company.status)}</TableCell>
                        <TableCell>{company.email}</TableCell>
                        <TableCell>
                          {company.representative ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(company.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : companies && companies.length > 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No companies match your search criteria.</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No companies found.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
