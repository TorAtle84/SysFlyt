import * as fs from 'fs';
// import pdf from 'pdf-parse';
const pdf = require('pdf-parse');
import { parseSystemTags } from './src/lib/tag-parser';

async function main() {
    const dataBuffer = fs.readFileSync('test.pdf');

    try {
        const data = await pdf(dataBuffer);
        console.log("📄 PDF Text Length:", data.text.length);
        console.log("📄 First 500 chars:", data.text.substring(0, 500));

        const tags = parseSystemTags(data.text);
        console.log("🏷️ Found Tags:", tags);

    } catch (error) {
        console.error("❌ Error parsing PDF:", error);
    }
}

main();
