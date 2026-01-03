const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

async function test(filePath) {
    console.log(`\nTesting ${path.basename(filePath)}...`);
    try {
        if (!fs.existsSync(filePath)) {
            console.error("File not found:", filePath);
            return;
        }
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);
        const text = data.text.trim();
        console.log(`Text length: ${text.length}`);
        if (text.length > 0) {
            console.log(`First 200 chars: \n${text.substring(0, 200)}`);
        } else {
            console.log("No text found!");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

// Test a Systemskjema file (likely similar to what user uploaded)
// I'll pick one from the list found earlier
const file1 = 'c:\\Applikasjoner\\SysFlyt\\uploads\\demo-project\\1765200871815_1764921562046_524-XXX-C-XX-70-360-009_Systemskjema_-_Ventilasjon_-_Klatrehall.pdf';

test(file1);
