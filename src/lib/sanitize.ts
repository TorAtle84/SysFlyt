export function sanitizeString(input: unknown, maxLength?: number): string {
  if (typeof input !== "string") {
    return "";
  }
  
  let sanitized = input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
    .trim();
  
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }
  
  return sanitized;
}

export function sanitizeStringAllowEmpty(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null;
  }
  
  if (typeof input !== "string") {
    return null;
  }
  
  const sanitized = sanitizeString(input);
  return sanitized.length > 0 ? sanitized : null;
}

export function validateAndSanitizeProjectInput(data: unknown): {
  valid: true;
  name: string;
  description: string | null;
} | {
  valid: false;
  error: string;
} {
  if (typeof data !== "object" || data === null) {
    return { valid: false, error: "Ugyldig input" };
  }

  const { name, description } = data as { name?: unknown; description?: unknown };

  if (typeof name !== "string" || name.trim().length === 0) {
    return { valid: false, error: "Prosjektnavn er påkrevd" };
  }

  if (name.trim().length > 200) {
    return { valid: false, error: "Prosjektnavn kan ikke være lengre enn 200 tegn" };
  }

  const sanitizedName = sanitizeString(name);
  const sanitizedDescription = sanitizeStringAllowEmpty(description);

  if (sanitizedDescription && sanitizedDescription.length > 2000) {
    return { valid: false, error: "Beskrivelse kan ikke være lengre enn 2000 tegn" };
  }

  return {
    valid: true,
    name: sanitizedName,
    description: sanitizedDescription,
  };
}

export function validateAndSanitizeProfileInput(data: unknown): {
  valid: true;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  discipline?: string | null;
  reportsAsProjectLeaderEnabled?: boolean;
  reportsAsMemberEnabled?: boolean;
} | {
  valid: false;
  error: string;
} {
  if (typeof data !== "object" || data === null) {
    return { valid: false, error: "Ugyldig input" };
  }

  const {
    firstName,
    lastName,
    phone,
    company,
    title,
    discipline,
    reportsAsProjectLeaderEnabled,
    reportsAsMemberEnabled,
  } = data as Record<string, unknown>;

  const result: {
    valid: true;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    company?: string | null;
    title?: string | null;
    discipline?: string | null;
    reportsAsProjectLeaderEnabled?: boolean;
    reportsAsMemberEnabled?: boolean;
  } = { valid: true };

  if (firstName !== undefined) {
    if (typeof firstName !== "string") {
      return { valid: false, error: "Ugyldig fornavn" };
    }
    if (firstName.length > 100) {
      return { valid: false, error: "Fornavn kan ikke være lengre enn 100 tegn" };
    }
    result.firstName = sanitizeString(firstName);
  }

  if (lastName !== undefined) {
    if (typeof lastName !== "string") {
      return { valid: false, error: "Ugyldig etternavn" };
    }
    if (lastName.length > 100) {
      return { valid: false, error: "Etternavn kan ikke være lengre enn 100 tegn" };
    }
    result.lastName = sanitizeString(lastName);
  }

  if (phone !== undefined) {
    result.phone = sanitizeStringAllowEmpty(phone);
    if (result.phone && result.phone.length > 30) {
      return { valid: false, error: "Telefonnummer kan ikke være lengre enn 30 tegn" };
    }
  }

  if (company !== undefined) {
    result.company = sanitizeStringAllowEmpty(company);
    if (result.company && result.company.length > 200) {
      return { valid: false, error: "Firmanavn kan ikke være lengre enn 200 tegn" };
    }
  }

  if (title !== undefined) {
    result.title = sanitizeStringAllowEmpty(title);
    if (result.title && result.title.length > 100) {
      return { valid: false, error: "Tittel kan ikke være lengre enn 100 tegn" };
    }
  }

  if (discipline !== undefined) {
    result.discipline = sanitizeStringAllowEmpty(discipline);
    if (result.discipline && result.discipline.length > 100) {
      return { valid: false, error: "Fagområde kan ikke være lengre enn 100 tegn" };
    }
  }

  if (reportsAsProjectLeaderEnabled !== undefined) {
    if (typeof reportsAsProjectLeaderEnabled !== "boolean") {
      return { valid: false, error: "Ugyldig rapportinnstilling" };
    }
    result.reportsAsProjectLeaderEnabled = reportsAsProjectLeaderEnabled;
  }

  if (reportsAsMemberEnabled !== undefined) {
    if (typeof reportsAsMemberEnabled !== "boolean") {
      return { valid: false, error: "Ugyldig rapportinnstilling" };
    }
    result.reportsAsMemberEnabled = reportsAsMemberEnabled;
  }

  return result;
}
