/**
 * TFM-KODE PARSING OG KOMPONENTGJENKJENNING
 *
 * Norsk Standard TFM-format:
 * +{byggnr}={system}-{komponent}%{typekode}
 *
 * Eksempel: +256=360.0001-RTA4001%RTA0001
 */

export interface TFMComponents {
  full: string;
  bygg?: string;
  system?: string;
  component?: string;
  typeCode?: string;
}

export interface ParsedComponent {
  code: string;
  system: string | null;
  byggnr: string | null;
  typeCode: string | null;
  confidence: number;
  matchType: 'inline' | 'context' | 'sameline' | 'default';
}

// REGEX PATTERNS - Based on tfmrules.md

// Byggnr: Starts with +, digits only
const BYGGNR_PART = "(?:\\+(?<byggnr>\\d+))";

// System: Optional =, 3-4 digits . 3-4 digits, optional suffix :digits
const SYSTEM_PART = "=?\\s*(?<system>\\d{3,4}\\.\\d{3,4}(?::\\d{2,4})?)";

// Component: Optional -, 2-3 letters, digits, optional extra chars
const COMPONENT_PART = "-?\\s*(?<komponent>[A-Za-z]{2,3}\\d+[A-Za-z0-9\\/_\\-]*)";

// Typecode: %, 2-3 letters
const TYPECODE_PART = "(?:%(?<typekode>[A-Za-z]{2,3}))";

// Inline TFM: {Byggnr}{System}{Component}{Typecode}
// Note: We construct this from parts to ensure consistency
const INLINE_TFM_RE = new RegExp(
  `${BYGGNR_PART}?\\s*${SYSTEM_PART}\\s*${COMPONENT_PART}\\s*${TYPECODE_PART}?`,
  "gi"
);

// Standalone System search
const SYSTEM_RE = new RegExp(
  `${BYGGNR_PART}?\\s*${SYSTEM_PART}`,
  "gi"
);

// Standalone Component search
// Note: Matches strict component structure
const COMPONENT_RE = /\b(?<komponent>[A-Za-z]{2,3}\d+[A-Za-z0-9\/_\-]*)\b/gi;

// Standalone Typecode search
const TYPECODE_RE = /%(?<typekode>[A-Za-z]{2,3})\b/i;

// CONFIG
const MAX_GAP = 2; // Max linjer mellom system og komponent for kontekst

/**
 * Parse component IDs from text using state machine
 * Implements context-aware parsing with system tracking
 */
export function parseComponentIds(
  text: string,
  defaultSystem?: string
): ParsedComponent[] {
  const components: ParsedComponent[] = [];
  const lines = text.split('\n');

  let currentSystem: string | null = defaultSystem || null;
  let currentByggnr: string | null = null;
  let gapSinceContext = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (!line) {
      gapSinceContext++;
      continue;
    }

    // Reset regex lastIndex
    INLINE_TFM_RE.lastIndex = 0;
    SYSTEM_RE.lastIndex = 0;
    COMPONENT_RE.lastIndex = 0;

    // PASS 1: Check for inline TFM (highest priority)
    let inlineMatch;
    while ((inlineMatch = INLINE_TFM_RE.exec(line)) !== null) {
      const system = inlineMatch.groups?.system || null;
      const component = inlineMatch.groups?.komponent || null;
      const byggnr = inlineMatch.groups?.byggnr || null;
      const typeCode = inlineMatch.groups?.typekode || null;

      if (component) {
        components.push({
          code: component,
          system: system || currentSystem,
          byggnr: byggnr || currentByggnr,
          typeCode,
          confidence: 0.95,
          matchType: 'inline',
        });

        // Update context
        if (system) {
          currentSystem = system;
          gapSinceContext = 0;
        }
        if (byggnr) currentByggnr = byggnr;
      }
    }

    // PASS 2: Check for standalone system codes (updates context)
    SYSTEM_RE.lastIndex = 0;
    let systemMatch;
    while ((systemMatch = SYSTEM_RE.exec(line)) !== null) {
      const system = systemMatch.groups?.system || null;
      const byggnr = systemMatch.groups?.byggnr || null;

      if (system) {
        currentSystem = system;
        gapSinceContext = 0;
      }
      if (byggnr) currentByggnr = byggnr;
    }

    // PASS 3: Check for standalone components (binds to context)
    COMPONENT_RE.lastIndex = 0;
    let componentMatch;
    while ((componentMatch = COMPONENT_RE.exec(line)) !== null) {
      const component = componentMatch.groups?.komponent || null;

      if (!component) continue;

      // Skip if already captured as inline
      const alreadyCaptured = components.some(
        (c) => c.code === component && c.matchType === 'inline'
      );
      if (alreadyCaptured) continue;

      // Check if there's a system code on the same line
      const sameLineSystem = extractSystemFromLine(line, componentMatch.index);

      // Check for typecode
      const typeCodeMatch = TYPECODE_RE.exec(line.slice(componentMatch.index));
      const typeCode = typeCodeMatch?.groups?.typekode || null;

      // Determine which system to use
      let systemToUse: string | null = null;
      let confidence = 0.5;
      let matchType: ParsedComponent['matchType'] = 'default';

      if (sameLineSystem) {
        // System on same line (high confidence)
        systemToUse = sameLineSystem;
        confidence = 0.9;
        matchType = 'sameline';
      } else if (currentSystem && gapSinceContext <= MAX_GAP) {
        // Context system (medium confidence)
        systemToUse = currentSystem;
        confidence = 0.7;
        matchType = 'context';
      } else if (defaultSystem) {
        // Default system (low confidence)
        systemToUse = defaultSystem;
        confidence = 0.5;
        matchType = 'default';
      }

      components.push({
        code: component,
        system: systemToUse,
        byggnr: currentByggnr,
        typeCode,
        confidence,
        matchType,
      });

      gapSinceContext = 0; // Reset gap when we find a component
    }

    // Increment gap if no system or component found
    const foundSystemOrComponent =
      SYSTEM_RE.test(line) || COMPONENT_RE.test(line);
    if (!foundSystemOrComponent) {
      gapSinceContext++;
    }

    // Reset context if gap too large
    if (gapSinceContext > MAX_GAP) {
      currentSystem = defaultSystem || null;
      currentByggnr = null;
    }
  }

  return components;
}

/**
 * Extract system code from line if present near component position
 */
function extractSystemFromLine(line: string, componentPos: number): string | null {
  // Look for system code before component (within 20 chars)
  const before = line.slice(Math.max(0, componentPos - 20), componentPos);
  SYSTEM_RE.lastIndex = 0;
  const match = SYSTEM_RE.exec(before);
  return match?.groups?.system || null;
}

/**
 * Extract component prefix (e.g., "RTA" from "RTA4001")
 * Per tfmrules.md: Component starts with 2-3 letters
 */
export function extractComponentPrefix(code: string): string | null {
  const match = code.match(/^([A-Z]{2,3})\d+/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Parse a single TFM code into components
 */
export function parseTFMCode(tfmCode: string): TFMComponents | null {
  INLINE_TFM_RE.lastIndex = 0;
  const match = INLINE_TFM_RE.exec(tfmCode);

  if (!match) return null;

  return {
    full: match[0],
    bygg: match.groups?.byggnr,
    system: match.groups?.system,
    component: match.groups?.komponent,
    typeCode: match.groups?.typekode,
  };
}

/**
 * Validate if string matches component pattern
 * Per tfmrules.md: 2-3 bokstaver etterfulgt av minst ett siffer
 */
export function isValidComponentCode(code: string): boolean {
  const componentPattern = /^[A-Z]{2,3}\d+[0-9A-Z/_\-]*$/i;
  return componentPattern.test(code);
}

/**
 * Validate if string matches system code pattern
 * Per tfmrules.md: 3-4 siffer . 3-4 siffer, valgfri :versjon
 */
export function isValidSystemCode(code: string): boolean {
  const systemPattern = /^\d{3,4}\.\d{3,4}(?::\d{2,4})?$/;
  return systemPattern.test(code);
}

/**
 * Normalize component code for comparison
 */
export function normalizeComponentCode(code: string): string {
  return code.toUpperCase().replace(/[-_/\s]/g, '');
}

/**
 * Generate component patterns from mass list
 * Used for whitelist filtering
 */
export function generateComponentPatterns(massList: { component?: string | null }[]): RegExp[] {
  const patterns = new Set<string>();

  for (const item of massList) {
    if (!item.component) continue;

    const code = item.component;
    const prefix = extractComponentPrefix(code);

    if (prefix) {
      // Extract pattern (e.g., "AA0000", "AA000/000")
      const pattern = code.replace(/\d/g, '0');
      patterns.add(pattern);
    }
  }

  // Add default patterns
  patterns.add('AA0000');
  patterns.add('AA000');
  patterns.add('AAA000');
  patterns.add('AA000/000');
  patterns.add('AAA0000');

  return Array.from(patterns).map((p) => {
    const regexStr = p.replace(/0/g, '\\d').replace(/A/g, '[A-Z]');
    return new RegExp(`^${regexStr}$`, 'i');
  });
}

/**
 * Check if component matches any of the allowed patterns
 */
export function matchesComponentPattern(
  code: string,
  patterns: RegExp[]
): boolean {
  return patterns.some((pattern) => pattern.test(code));
}

/**
 * Filter out obvious non-components
 */
export function isLikelyNonComponent(code: string): boolean {
  const blacklist = [
    /^DN\d+$/i,        // Diameter nominal
    /^Ø\d+$/i,         // Diameter
    /^M\d+$/i,         // Metric screws
    /^R\d+$/i,         // Radius
    /^\d+MM$/i,        // Millimeter
    /^\d+X\d+$/i,      // Dimensions
    /^IP\d+$/i,        // IP rating
    /^PN\d+$/i,        // Pressure nominal
  ];

  return blacklist.some((pattern) => pattern.test(code));
}
