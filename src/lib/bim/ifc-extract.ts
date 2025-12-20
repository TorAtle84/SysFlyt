import fs from "fs";
import readline from "readline";
import { parseTFMCode, isValidSystemCode, isValidComponentCode } from "@/lib/id-pattern";

export type ExtractedIfcComponent = {
  systemCode: string;
  componentTag: string;
  fullTag: string;
  ifcGuid?: string;
  ifcType?: string;
  name?: string;
  source?: "name" | "tag" | "line";
};

function normalizeSystemCode(systemCode: string): string {
  // Keep the optional :version, but normalize whitespace.
  return systemCode.trim();
}

function normalizeComponentTag(componentTag: string): string {
  return componentTag.trim().toUpperCase();
}

function buildFullTag(systemCode: string, componentTag: string): string {
  return `${normalizeSystemCode(systemCode)}-${normalizeComponentTag(componentTag)}`;
}

function extractQuotedStrings(line: string, maxPerLine = 32): string[] {
  const results: string[] = [];
  let i = 0;

  while (i < line.length && results.length < maxPerLine) {
    const start = line.indexOf("'", i);
    if (start === -1) break;

    let end = start + 1;
    let value = "";

    while (end < line.length) {
      const ch = line[end];
      if (ch === "'") {
        // IFC escaping for single quote is doubled quotes: '' => '
        if (line[end + 1] === "'") {
          value += "'";
          end += 2;
          continue;
        }
        break;
      }
      value += ch;
      end++;
    }

    if (end >= line.length) break;
    results.push(value);
    i = end + 1;
  }

  return results;
}

function parseIfcHeader(line: string): { ifcType?: string; ifcGuid?: string } {
  const headerMatch = line.match(/^#\d+\s*=\s*(IFC[A-Z0-9_]+)\s*\(/i);
  if (!headerMatch) return {};
  const ifcType = headerMatch[1]?.toUpperCase();

  const quoted = extractQuotedStrings(line, 1);
  const maybeGuid = quoted[0];
  const ifcGuid = maybeGuid && maybeGuid !== "$" ? maybeGuid : undefined;
  return { ifcType, ifcGuid };
}

function findTfmsInText(text: string): { system?: string; component?: string; full?: string }[] {
  const parsed = parseTFMCode(text);
  if (!parsed?.system || !parsed.component) return [];

  const system = normalizeSystemCode(parsed.system);
  const component = normalizeComponentTag(parsed.component);

  if (!isValidSystemCode(system) || !isValidComponentCode(component)) return [];

  return [{ system, component, full: buildFullTag(system, component) }];
}

export async function extractComponentsFromIfcFile(params: {
  filePath: string;
  maxComponents?: number;
}): Promise<ExtractedIfcComponent[]> {
  const { filePath, maxComponents = 50_000 } = params;

  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const seen = new Map<string, ExtractedIfcComponent>();

  for await (const line of rl) {
    if (seen.size >= maxComponents) break;
    if (!line.includes("'")) continue;

    const { ifcType, ifcGuid } = parseIfcHeader(line);
    const quotedStrings = extractQuotedStrings(line);

    for (const value of quotedStrings) {
      if (seen.size >= maxComponents) break;
      if (!value || value.length < 4) continue;

      for (const match of findTfmsInText(value)) {
        const fullTag = match.full!;
        if (seen.has(fullTag)) continue;

        seen.set(fullTag, {
          systemCode: match.system!,
          componentTag: match.component!,
          fullTag,
          ifcGuid,
          ifcType,
          name: value,
          source: "line",
        });
      }
    }
  }

  return Array.from(seen.values());
}

