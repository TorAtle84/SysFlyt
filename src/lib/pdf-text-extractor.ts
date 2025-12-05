import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "";

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface ExtractedComponent {
  code: string;
  system: string | null;
  x: number;
  y: number;
  page: number;
  confidence: number;
}

const TFM_PATTERNS = [
  /(\d{3,4})[.\-_](\d{3})/g,
  /(\d{3,4})\.(\d{3})\.\d+/g,
  /([A-Z]{2,3})[-_]?(\d{3,4})/gi,
  /(\d{2,4})[-.](\d{2,4})[-.](\d{2,4})/g,
];

const SYSTEM_CODE_PATTERNS = [
  /^(\d{2,4})$/,
  /^(\d{3,4})\.\d{3}/,
  /^([A-Z]{2,3})\d*/i,
];

export function extractSystemCode(text: string): string | null {
  const cleaned = text.trim().toUpperCase();
  
  const match320 = cleaned.match(/^(\d{3})\./);
  if (match320) return match320[1];
  
  const match4digit = cleaned.match(/^(\d{4})\./);
  if (match4digit) return match4digit[1];
  
  for (const pattern of SYSTEM_CODE_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

export async function extractTextFromPDF(
  pdfBuffer: Buffer
): Promise<{ text: string; items: TextItem[] }> {
  try {
    const data = new Uint8Array(pdfBuffer);
    const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
    
    let fullText = "";
    const allItems: TextItem[] = [];
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      
      for (const item of textContent.items) {
        if ("str" in item && item.str.trim()) {
          const tx = item.transform;
          const x = (tx[4] / viewport.width) * 100;
          const y = (1 - tx[5] / viewport.height) * 100;
          
          allItems.push({
            text: item.str,
            x,
            y,
            width: (item.width / viewport.width) * 100,
            height: (item.height / viewport.height) * 100,
            page: pageNum,
          });
          
          fullText += item.str + " ";
        }
      }
      
      fullText += "\n";
    }
    
    return { text: fullText, items: allItems };
  } catch (error) {
    console.error("Error extracting PDF text:", error);
    return { text: "", items: [] };
  }
}

export function findComponentsInText(
  items: TextItem[]
): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];
  const seen = new Set<string>();
  
  for (const item of items) {
    for (const pattern of TFM_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(item.text)) !== null) {
        const code = match[0];
        const system = extractSystemCode(code);
        const key = `${code}-${item.page}`;
        
        if (!seen.has(key)) {
          seen.add(key);
          components.push({
            code,
            system,
            x: item.x,
            y: item.y,
            page: item.page,
            confidence: 0.8,
          });
        }
      }
    }
  }
  
  return components;
}

export function findSystemCodesInFilename(filename: string): string[] {
  const systems: string[] = [];
  const seen = new Set<string>();
  
  for (const pattern of TFM_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    
    while ((match = pattern.exec(filename)) !== null) {
      const system = extractSystemCode(match[0]);
      if (system && !seen.has(system)) {
        seen.add(system);
        systems.push(system);
      }
    }
  }
  
  const directMatch = filename.match(/(\d{3,4})/g);
  if (directMatch) {
    for (const m of directMatch.slice(0, 3)) {
      if (!seen.has(m) && m.length >= 3) {
        seen.add(m);
        systems.push(m);
      }
    }
  }
  
  return systems;
}

export async function extractSystemCodesFromPDF(
  pdfBuffer: Buffer,
  filename: string
): Promise<string[]> {
  const systemCodes = new Set<string>();
  
  const filenameMatches = findSystemCodesInFilename(filename);
  filenameMatches.forEach((s) => systemCodes.add(s));
  
  try {
    const { items } = await extractTextFromPDF(pdfBuffer);
    const components = findComponentsInText(items);
    
    for (const comp of components) {
      if (comp.system) {
        systemCodes.add(comp.system);
      }
    }
  } catch (error) {
    console.error("Error extracting system codes from PDF:", error);
  }
  
  return Array.from(systemCodes);
}
