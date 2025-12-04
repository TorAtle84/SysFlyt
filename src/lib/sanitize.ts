export function sanitizeString(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }
  
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
    .trim();
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
} | {
  valid: false;
  error: string;
} {
  if (typeof data !== "object" || data === null) {
    return { valid: false, error: "Ugyldig input" };
  }

  const { firstName, lastName, phone, company, title, discipline } = data as Record<string, unknown>;

  const result: {
    valid: true;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    company?: string | null;
    title?: string | null;
    discipline?: string | null;
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

  return result;
}
