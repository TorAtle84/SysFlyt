/**
 * TFM Parser - Extracts system codes from various document formats
 * 
 * TFM Format: {Byggnr}{System}{Komponent}{Typekode}
 * 
 * This module focuses on extracting the {System} segment which follows the pattern:
 * - 3-4 digits + "." + 3-4 digits
 * - Optional suffix: ":" + 2-4 digits
 * - May be prefixed with "=" if Byggnr is present
 * 
 * Examples:
 * - 360.001
 * - 3200.001
 * - 360.001:01
 * - =360.001-ABC123
 */

/**
 * Extract system codes from raw text using TFM rules
 * @param text - Raw text content to search
 * @returns Array of unique, sorted system codes
 */
export function extractSystemsFromText(text: string): string[] {
    // Pattern explanation:
    // - Optional = prefix (when Byggnr is present)
    // - 3-4 digits
    // - Literal dot
    // - 3-4 digits
    // - Optional suffix (: followed by 2-4 digits)
    // - Followed by either:
    //   - End of string/word boundary
    //   - Dash (component follows)
    //   - Whitespace
    //   - Comma, semicolon, or parenthesis
    const systemPattern = /=?(\d{3,4}\.\d{3,4}(?::\d{2,4})?)(?=[-\s,;)\]>]|$)/g;

    const matches = new Set<string>();
    let match;

    while ((match = systemPattern.exec(text)) !== null) {
        const systemCode = match[1];
        // Validate it looks like a real system code
        if (isValidSystemCode(systemCode)) {
            matches.add(systemCode);
        }
    }

    // Sort numerically (360.001 < 360.002 < 3200.001)
    return Array.from(matches).sort((a, b) => {
        const aParts = a.split(/[.:]/);
        const bParts = b.split(/[.:]/);

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aNum = parseInt(aParts[i] || '0', 10);
            const bNum = parseInt(bParts[i] || '0', 10);
            if (aNum !== bNum) return aNum - bNum;
        }
        return 0;
    });
}

/**
 * Validate a system code matches expected format
 */
function isValidSystemCode(code: string): boolean {
    // Must be at least X.Y format with digits
    const parts = code.split('.');
    if (parts.length < 2) return false;

    const mainPart = parts[0];
    const subPart = parts[1].split(':')[0]; // Remove suffix if present

    // Main part: 3-4 digits
    if (!/^\d{3,4}$/.test(mainPart)) return false;

    // Sub part: 3-4 digits
    if (!/^\d{3,4}$/.test(subPart)) return false;

    return true;
}

/**
 * Parse Excel file for system codes
 * @param buffer - Excel file buffer
 * @returns Array of unique, sorted system codes
 */
export async function parseExcelForSystems(buffer: Buffer): Promise<string[]> {
    const xlsx = await import('xlsx');

    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const allText: string[] = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 });

        for (const row of jsonData) {
            if (Array.isArray(row)) {
                for (const cell of row) {
                    if (cell !== null && cell !== undefined) {
                        allText.push(String(cell));
                    }
                }
            }
        }
    }

    return extractSystemsFromText(allText.join(' '));
}

/**
 * Parse PDF file for system codes
 * @param buffer - PDF file buffer
 * @returns Array of unique, sorted system codes
 */
export async function parsePdfForSystems(buffer: Buffer): Promise<string[]> {
    // Dynamic import to handle CommonJS module
    const pdfParse = (await import('pdf-parse')).default;

    try {
        const data = await pdfParse(buffer);
        return extractSystemsFromText(data.text);
    } catch (error) {
        console.error('Error parsing PDF:', error);
        return [];
    }
}

/**
 * Parse any supported file for system codes
 * @param buffer - File buffer
 * @param filename - Original filename (for type detection)
 * @returns Array of unique, sorted system codes
 */
export async function parseFileForSystems(buffer: Buffer, filename: string): Promise<string[]> {
    const ext = filename.toLowerCase().split('.').pop();

    switch (ext) {
        case 'pdf':
            return parsePdfForSystems(buffer);
        case 'xlsx':
        case 'xls':
            return parseExcelForSystems(buffer);
        case 'txt':
        case 'csv':
            return extractSystemsFromText(buffer.toString('utf-8'));
        default:
            throw new Error(`Unsupported file type: ${ext}`);
    }
}

/**
 * Merge two arrays of system codes, keeping unique values and sorting
 */
export function mergeSystemCodes(existing: string[], incoming: string[]): string[] {
    const merged = new Set([...existing, ...incoming]);
    return Array.from(merged).sort((a, b) => {
        const aParts = a.split(/[.:]/);
        const bParts = b.split(/[.:]/);

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aNum = parseInt(aParts[i] || '0', 10);
            const bNum = parseInt(bParts[i] || '0', 10);
            if (aNum !== bNum) return aNum - bNum;
        }
        return 0;
    });
}
