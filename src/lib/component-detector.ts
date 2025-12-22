/**
 * Component Detector - Robust component code detection with format learning
 * 
 * Supported formats:
 * - RT001    (2 letters + 3 digits)
 * - RT0001   (2 letters + 4 digits)
 * - RTA001   (3 letters + 3 digits)
 * - RTA0001  (3 letters + 4 digits)
 * - RT001T/01    (2 letters + 3 digits + letter + / + 2 digits)
 * - RTA001T/001  (3 letters + 3 digits + letter + / + 3 digits)
 */

// Main component pattern - matches all supported formats
// Pattern breakdown:
// - [A-Z]{2,3}  = 2-3 uppercase letters (prefix)
// - \d{3,4}     = 3-4 digits
// - (?:[A-Z])?  = optional single letter suffix
// - (?:\/\d{1,3})? = optional /digits suffix
const COMPONENT_PATTERN_COMPREHENSIVE = /\b([A-Z]{2,3}\d{3,4}(?:[A-Z])?(?:\/\d{1,3})?)\b/gi;

// Pattern variants for format detection
const FORMAT_PATTERNS = {
    // Base formats (without suffix)
    "2L3D": /^[A-Z]{2}\d{3}$/i,           // RT001
    "2L4D": /^[A-Z]{2}\d{4}$/i,           // RT0001
    "3L3D": /^[A-Z]{3}\d{3}$/i,           // RTA001
    "3L4D": /^[A-Z]{3}\d{4}$/i,           // RTA0001

    // Extended formats (with suffix)
    "2L3D_EXT": /^[A-Z]{2}\d{3}[A-Z]\/\d{1,3}$/i,   // RT001T/01
    "3L3D_EXT": /^[A-Z]{3}\d{3}[A-Z]\/\d{1,3}$/i,   // RTA001T/001
    "2L4D_EXT": /^[A-Z]{2}\d{4}[A-Z]\/\d{1,3}$/i,   // RT0001T/01
    "3L4D_EXT": /^[A-Z]{3}\d{4}[A-Z]\/\d{1,3}$/i,   // RTA0001T/001
};

export interface DetectedComponent {
    code: string;
    format: string;
    confidence: number;
}

export interface FormatStatistics {
    formatCounts: Record<string, number>;
    dominantFormat: string | null;
    totalComponents: number;
}

/**
 * Detect component format type
 */
export function detectComponentFormat(code: string): string | null {
    const normalized = code.toUpperCase().trim();

    for (const [formatName, pattern] of Object.entries(FORMAT_PATTERNS)) {
        if (pattern.test(normalized)) {
            return formatName;
        }
    }

    return null;
}

/**
 * Check if a string is a valid component code
 */
export function isValidComponent(code: string): boolean {
    const normalized = code.toUpperCase().trim();
    return detectComponentFormat(normalized) !== null;
}

/**
 * Extract all components from text using comprehensive pattern
 */
export function extractComponents(text: string): DetectedComponent[] {
    const components: DetectedComponent[] = [];
    const seen = new Set<string>();

    COMPONENT_PATTERN_COMPREHENSIVE.lastIndex = 0;
    let match;

    while ((match = COMPONENT_PATTERN_COMPREHENSIVE.exec(text)) !== null) {
        const code = match[1].toUpperCase();

        if (seen.has(code)) continue;
        seen.add(code);

        const format = detectComponentFormat(code);
        if (format) {
            components.push({
                code,
                format,
                confidence: format.includes("_EXT") ? 0.95 : 0.9,
            });
        }
    }

    return components;
}

/**
 * Analyze text to find format statistics and dominant format
 */
export function analyzeComponentFormats(text: string): FormatStatistics {
    const components = extractComponents(text);
    const formatCounts: Record<string, number> = {};

    for (const comp of components) {
        formatCounts[comp.format] = (formatCounts[comp.format] || 0) + 1;
    }

    let dominantFormat: string | null = null;
    let maxCount = 0;

    for (const [format, count] of Object.entries(formatCounts)) {
        if (count > maxCount) {
            maxCount = count;
            dominantFormat = format;
        }
    }

    return {
        formatCounts,
        dominantFormat,
        totalComponents: components.length,
    };
}

/**
 * Extract components with format filtering
 * If dominantFormat is provided, only matches that format
 */
export function extractComponentsWithFormat(
    text: string,
    allowedFormats?: string[]
): DetectedComponent[] {
    const allComponents = extractComponents(text);

    if (!allowedFormats || allowedFormats.length === 0) {
        return allComponents;
    }

    return allComponents.filter(comp => allowedFormats.includes(comp.format));
}

/**
 * Smart extraction: analyze text, detect dominant format, then extract matching
 */
export function smartExtractComponents(text: string): {
    components: DetectedComponent[];
    stats: FormatStatistics;
} {
    const stats = analyzeComponentFormats(text);

    // If we have a clear dominant format (>50% of matches), filter to that format family
    if (stats.dominantFormat && stats.totalComponents > 3) {
        const dominantCount = stats.formatCounts[stats.dominantFormat] || 0;
        const dominantRatio = dominantCount / stats.totalComponents;

        if (dominantRatio > 0.5) {
            // Get base format (without _EXT) and allow both base and extended
            const baseFormat = stats.dominantFormat.replace("_EXT", "");
            const allowedFormats = [baseFormat, `${baseFormat}_EXT`];

            return {
                components: extractComponentsWithFormat(text, allowedFormats),
                stats,
            };
        }
    }

    // No dominant format - return all
    return {
        components: extractComponents(text),
        stats,
    };
}

/**
 * Filter known non-components (common false positives)
 */
const NON_COMPONENT_PATTERNS = [
    /^ISO\d+$/i,      // ISO standards (ISO9001)
    /^EN\d+$/i,       // EN standards
    /^NS\d+$/i,       // NS standards
    /^PDF\d+$/i,      // PDF references
    /^REV\d+$/i,      // Revision numbers
    /^VER\d+$/i,      // Version numbers
    /^DWG\d+$/i,      // Drawing numbers
];

export function isKnownNonComponent(code: string): boolean {
    const normalized = code.toUpperCase().trim();
    return NON_COMPONENT_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Final component extraction with all filters applied
 */
export function extractValidComponents(text: string): DetectedComponent[] {
    const { components } = smartExtractComponents(text);
    return components.filter(comp => !isKnownNonComponent(comp.code));
}
