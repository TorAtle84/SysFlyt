/**
 * Debug script to test TFM extraction from PDFs
 * Run with: npx tsx test-tfm-extract.ts
 */

import { readFileSync } from "fs";
import { extractPlainTextFromPDF } from "./src/lib/pdf-text-extractor";

async function main() {
    const files = [
        "3601.009 - Luftbehandling klatrehall - Funksjonsbeskrivelse.pdf",
        "524-XXX-C-XX-70-360-009 Systemskjema - Ventilasjon - Klatrehall.pdf",
    ];

    for (const fileName of files) {
        console.log("\n" + "=".repeat(60));
        console.log(`File: ${fileName}`);
        console.log("=".repeat(60));

        try {
            const buffer = readFileSync(fileName);
            const text = await extractPlainTextFromPDF(buffer);

            console.log(`\nExtracted ${text.length} characters`);

            // Show first 2000 characters
            console.log("\n--- First 2000 chars of text ---");
            console.log(text.substring(0, 2000));

            // Look for component-like patterns
            console.log("\n--- Component-like patterns found ---");

            // Pattern 1: 2-3 letters followed by digits
            const componentPattern = /\b([A-Z]{2,3}\d{1,6}[A-Z0-9/_-]*)\b/gi;
            const components = text.match(componentPattern);
            const uniqueComponents = [...new Set(components || [])];
            console.log(`Found ${uniqueComponents.length} unique matches:`);
            console.log(uniqueComponents.slice(0, 30).join(", "));

            // Pattern 2: Full TFM pattern
            const tfmPattern = /(?:\+\d+)?(?:=)?(\d{3,4}\.\d{2,4}(?::\d{2,4})?)?(?:-)?([A-Za-z]{2,3}[A-Za-z0-9/_\-]+)?(?:%[A-Za-z]{2,3})?/gi;
            const tfmMatches: string[] = [];
            let match;
            while ((match = tfmPattern.exec(text)) !== null) {
                if (match[0].length > 2) {
                    tfmMatches.push(match[0]);
                }
            }
            console.log(`\nFull TFM pattern matches: ${tfmMatches.length}`);
            console.log([...new Set(tfmMatches)].slice(0, 20).join(", "));

        } catch (error) {
            console.error(`Error: ${error}`);
        }
    }
}

main();
