export function formatDate(dateString: string, locale: string) {
  return new Date(dateString).toLocaleDateString(
    locale === "pl" ? "pl-PL" : "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );
}

export function formatDateWithTime(dateString: string, locale: string) {
  return new Date(dateString).toLocaleDateString(
    locale === "pl" ? "pl-PL" : "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

export function formatFrRespName(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
  username?: string
): string {
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  if (firstName) {
    return firstName;
  }
  if (lastName) {
    return lastName;
  }
  if (email) {
    return email;
  }
  if (username) {
    return username;
  }
  return "—";
}

export function formatRepresentativeName(
  firstName: string | null,
  lastName: string | null
): string {
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  if (firstName) {
    return firstName;
  }
  if (lastName) {
    return lastName;
  }
  return "—";
}







