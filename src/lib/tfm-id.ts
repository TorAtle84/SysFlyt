/**
 * TFM-KODE VERKTØY OG NORMALISERING
 *
 * TFM-format: +{byggnr}={system}-{komponent}%{typekode}
 * Eksempel: +256=360.0001-RTA4001%RTA0001
 */

export interface ParsedTFM {
  building: string | null;
  system: string;
  component: string;
  typeCode: string | null;
}

/**
 * Parse TFM-kode til komponenter
 * Støtter både full format og varianter
 */
export function parseTFM(tfm: string): ParsedTFM | null {
  if (!tfm || typeof tfm !== "string") return null;

  // Hovedregex for full TFM-parsing
  // +{byggnr}={system}-{komponent}%{typekode}
  // Komponent: 2-3 bokstaver, deretter siffer, som kan være splittet av bokstaver/spesialtegn
  const tfmRegex =
    /^(?<bygg>\+[A-Za-z0-9]+)?\s*=?\s*(?<system>\d+(?:\.\d+)*(?::\d+)?)[\s-]*(?<komponent>[A-Z]{2,3}\d+[A-Z0-9\/_\-]*)(?:%(?<type>[A-Z0-9.\-\/_]+))?$/i;

  const match = tfm.trim().match(tfmRegex);
  if (!match || !match.groups) return null;

  let building = match.groups.bygg || null;
  let system = match.groups.system || null;
  let component = match.groups.komponent || null;
  let typeCode = match.groups.type || null;

  if (!system || !component) return null;

  // Opprydding
  building = building ? building.replace(/^\+/, "").trim() : null;
  system = system.replace(/^=/, "").trim();
  component = component.replace(/^-/, "").trim().toUpperCase();
  typeCode = typeCode ? typeCode.trim().toUpperCase() : null;

  return { building, system, component, typeCode };
}

/**
 * Ekstraher komponentprefix (f.eks. "RTA" fra "RTA4001")
 */
export function extractComponentPrefix(component?: string | null): string {
  if (!component) return "";

  const match = component.match(/^([A-Z]{2,4})/i);
  return match ? match[1].toUpperCase() : "";
}

/**
 * Normaliser systemkode
 * Fjerner = prefix og kolon-suffiks
 */
export function normalizeSystemCode(value?: string | null): string {
  if (!value) return "";

  let normalized = value.toString().trim();

  // Fjern = prefix
  normalized = normalized.replace(/^=+/, "");

  // Fjern kolon og alt etter (versjon)
  // 360.001:02 -> 360.001
  normalized = normalized.replace(/:[0-9]+.*$/, "");

  return normalized.toUpperCase();
}

/**
 * Normaliser komponentkode
 * Fjerner - prefix og konverterer til uppercase
 */
export function normalizeComponentCode(value?: string | null): string {
  if (!value) return "";

  let normalized = value.toString().trim();

  // Fjern - prefix
  normalized = normalized.replace(/^-+/, "");

  return normalized.toUpperCase();
}

/**
 * Normaliser typekode
 * Fjerner % prefix
 */
export function normalizeTypeCode(value?: string | null): string {
  if (!value) return "";

  let normalized = value.toString().trim();

  // Fjern % prefix
  normalized = normalized.replace(/^%+/, "");

  return normalized.toUpperCase();
}

/**
 * Bygg TFM-kode fra komponenter
 */
export function buildTFM(parts: {
  building?: string | null;
  system: string;
  component: string;
  typeCode?: string | null;
}): string {
  let tfm = "";

  if (parts.building) {
    tfm += `+${parts.building}`;
  }

  tfm += `=${parts.system}`;
  tfm += `-${parts.component}`;

  if (parts.typeCode) {
    tfm += `%${parts.typeCode}`;
  }

  return tfm;
}

/**
 * Valider om streng er gyldig TFM-kode
 */
export function isValidTFM(tfm: string): boolean {
  return parseTFM(tfm) !== null;
}

/**
 * Valider om streng er gyldig systemkode
 */
export function isValidSystemCode(system: string): boolean {
  if (!system) return false;

  // Systemkode: 3-4 siffer, evt. med punktum og flere siffer
  // 360, 3601, 360.001, 5640.0001
  const systemPattern = /^\d{3,4}(?:\.\d{2,4})?(?::\d+)?$/;
  return systemPattern.test(system);
}

/**
 * Valider om streng er gyldig komponentkode
 */
export function isValidComponentCode(component: string): boolean {
  if (!component) return false;

  // Komponent: 2-3 bokstaver + minst ett siffer + valgfrie alfanumeriske tegn/spesialtegn
  // RTA4001, KA001, AA01T/003
  const componentPattern = /^[A-Z]{2,3}\d+[0-9A-Z\/_\-]*$/i;
  return componentPattern.test(component);
}

/**
 * Sammenlign to TFM-koder (case-insensitive, normalisert)
 */
export function compareTFM(tfm1: string, tfm2: string): boolean {
  const parsed1 = parseTFM(tfm1);
  const parsed2 = parseTFM(tfm2);

  if (!parsed1 || !parsed2) return false;

  return (
    normalizeSystemCode(parsed1.system) === normalizeSystemCode(parsed2.system) &&
    normalizeComponentCode(parsed1.component) === normalizeComponentCode(parsed2.component)
  );
}

/**
 * Generer alle mulige TFM-varianter for en oppføring
 * Brukes for matching mot masseliste
 */
export function getTFMVariants(entry: {
  tfm?: string | null;
  building?: string | null;
  system?: string | null;
  component?: string | null;
  typeCode?: string | null;
}): string[] {
  const variants = new Set<string>();

  // Normaliser verdier
  const normalize = (val?: string | null) =>
    val ? val.toString().toUpperCase().trim() : "";

  const tfm = normalize(entry.tfm);
  const building = normalize(entry.building);
  const system = normalize(entry.system);
  const component = normalize(entry.component);
  const typeCode = normalize(entry.typeCode);

  // Variant 1: Bruk rå TFM hvis tilstede
  if (tfm) {
    variants.add(tfm);
  }

  // Variant 2: Bygg fra komponenter
  if (system && component) {
    // Uten bygningsnummer, uten typekode
    variants.add(`${system}-${component}`);
    variants.add(`=${system}-${component}`);

    // Med typekode
    if (typeCode) {
      variants.add(`${system}-${component}%${typeCode}`);
      variants.add(`=${system}-${component}%${typeCode}`);
    }

    // Med bygningsnummer
    if (building) {
      variants.add(`+${building}=${system}-${component}`);
      if (typeCode) {
        variants.add(`+${building}=${system}-${component}%${typeCode}`);
      }
    }
  }

  // Variant 3: Kun system-komponent (uten formatering)
  if (system && component) {
    variants.add(`${system}${component}`);
  }

  return Array.from(variants);
}

/**
 * Match to masseliste-oppføringer
 */
export function matchMassListEntry(
  target: {
    system?: string | null;
    component?: string | null;
  },
  massEntry: {
    tfm?: string | null;
    building?: string | null;
    system?: string | null;
    component?: string | null;
    typeCode?: string | null;
  }
): boolean {
  const targetSystem = normalizeSystemCode(target.system);
  const targetComponent = normalizeComponentCode(target.component);

  const massSystem = normalizeSystemCode(massEntry.system);
  const massComponent = normalizeComponentCode(massEntry.component);

  return targetSystem === massSystem && targetComponent === massComponent;
}
