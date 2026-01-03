import prisma from "@/lib/db";

// Gemini API types
interface GeminiMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
        };
    }[];
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

export interface RequirementCandidate {
    text: string;
    keywords: string[];
    verbs: string[];
    confidence: number;
    source?: string;
}

export interface ValidatedRequirement {
    text: string;
    shortText: string;
    isRequirement: boolean;
    type: "FUNCTION" | "PERFORMANCE" | "DESIGN" | "OTHER";
    confidence: number;
}

export interface DisciplineAssignment {
    disciplineId: string | null;
    disciplineName: string | null;
    confidence: number;
    reasoning?: string;
}

export interface ApiUsage {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    model: string;
    provider: "gemini" | "openai";
}

// Pricing per 1M tokens (as of 2024)
const GEMINI_PRICING = {
    "gemini-1.5-flash": { input: 0.075, output: 0.30 },
    "gemini-1.5-pro": { input: 1.25, output: 5.00 },
};

// USD to NOK exchange rate (approximate)
const USD_TO_NOK = 10.5;

// Decryption for API keys (must match encryption in api-keys route)
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || "default-32-char-encryption-key!!";

function decryptApiKey(encryptedText: string): string {
    try {
        const crypto = require("crypto");
        const parts = encryptedText.split(":");
        if (parts.length < 2) {
            // Not encrypted, return as-is
            return encryptedText;
        }
        const iv = Buffer.from(parts.shift()!, "hex");
        const encrypted = Buffer.from(parts.join(":"), "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error("Error decrypting API key:", error);
        // Return as-is if decryption fails (might not be encrypted)
        return encryptedText;
    }
}

/**
 * Get user's Gemini API key (decrypted)
 */
export async function getUserGeminiKey(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { geminiApiKey: true },
    });

    if (!user?.geminiApiKey) {
        return null;
    }

    // Decrypt the API key
    return decryptApiKey(user.geminiApiKey);
}

/**
 * Calculate cost from tokens
 */
function calculateCost(
    model: "gemini-1.5-flash" | "gemini-1.5-pro",
    promptTokens: number,
    outputTokens: number
): number {
    const pricing = GEMINI_PRICING[model];
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
}

/**
 * Call Gemini API with usage tracking
 */
async function callGemini(
    apiKey: string,
    model: "gemini-1.5-flash" | "gemini-1.5-pro",
    prompt: string,
    systemInstruction?: string
): Promise<{ text: string; usage: ApiUsage }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body: {
        contents: GeminiMessage[];
        systemInstruction?: { parts: { text: string }[] };
        generationConfig: {
            temperature: number;
            maxOutputTokens: number;
            responseMimeType: string;
        };
    } = {
        contents: [
            {
                role: "user",
                parts: [{ text: prompt }],
            },
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
        },
    };

    if (systemInstruction) {
        body.systemInstruction = {
            parts: [{ text: systemInstruction }],
        };
    }

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error("Gemini API error:", error);
        throw new Error(`Gemini API feilet: ${response.status}`);
    }

    const data: GeminiResponse = await response.json();

    const tokensUsed = data.usageMetadata?.totalTokenCount || 0;
    const promptTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const costUsd = calculateCost(model, promptTokens, outputTokens);

    return {
        text: data.candidates[0]?.content?.parts[0]?.text || "",
        usage: {
            inputTokens: promptTokens,
            outputTokens,
            costUsd,
            model,
            provider: "gemini",
        },
    };
}

// Accumulator for tracking total usage across calls
export class UsageTracker {
    private totalTokens = 0;
    private totalCostUsd = 0;

    // Provider specific tracking
    private geminiTokens = 0;
    private geminiCostUsd = 0;

    private openaiTokens = 0;
    private openaiCostUsd = 0;

    // Active keys tracking
    private activeProviders: Set<string> = new Set();

    add(usage: ApiUsage) {
        this.totalTokens += usage.inputTokens + usage.outputTokens;
        this.totalCostUsd += usage.costUsd;
        this.activeProviders.add(usage.provider);

        if (usage.provider === "gemini") {
            this.geminiTokens += usage.inputTokens + usage.outputTokens;
            this.geminiCostUsd += usage.costUsd;
        } else if (usage.provider === "openai") {
            this.openaiTokens += usage.inputTokens + usage.outputTokens;
            this.openaiCostUsd += usage.costUsd;
        }
    }

    get totals() {
        return {
            totalTokens: this.totalTokens,
            apiCostUsd: this.totalCostUsd,
            apiCostNok: this.totalCostUsd * USD_TO_NOK,

            // Provider breakdown
            geminiTokens: this.geminiTokens,
            geminiCostUsd: this.geminiCostUsd,

            openaiTokens: this.openaiTokens,
            openaiCostUsd: this.openaiCostUsd,

            // Active keys (snapshot)
            activeKeys: JSON.stringify(Array.from(this.activeProviders)),
        };
    }
}

/**
 * Stage 1: Find requirement candidates using cheap model
 */
export async function findRequirementCandidates(
    apiKey: string,
    text: string,
    fileName: string,
    tracker?: UsageTracker
): Promise<RequirementCandidate[]> {
    const systemInstruction = `Du er en ekspert på å identifisere krav i tekniske dokumenter for byggebransjen.
Din oppgave er å finne setninger som KAN være krav.

Se etter:
- Kravverb: "skal", "må", "bør", "kreves", "minimum", "maksimum"
- Tekniske spesifikasjoner med tall og enheter
- Referanser til standarder (NS, EN, ISO)

Returner KUN JSON-array.`;

    const prompt = `Analyser følgende tekst og finn alle setninger som kan være krav.

Tekst fra "${fileName}":
---
${text}
---

Returner JSON i dette formatet:
[
  {
    "text": "Full setning som kan være et krav",
    "keywords": ["tekniske", "nøkkelord", "i", "setningen"],
    "verbs": ["skal", "må", "bør"],
    "confidence": 0.8
  }
]

Confidence skal være mellom 0.0 og 1.0 basert på hvor sannsynlig det er at dette er et krav.`;

    try {
        const { text: result, usage } = await callGemini(apiKey, "gemini-1.5-flash", prompt, systemInstruction);
        tracker?.add(usage);
        const candidates = JSON.parse(result) as RequirementCandidate[];
        return candidates.map(c => ({ ...c, source: fileName }));
    } catch (error) {
        console.error("Error finding candidates:", error);
        return [];
    }
}

/**
 * Stage 2: Validate requirements using advanced model
 */
export async function validateRequirements(
    apiKey: string,
    candidates: RequirementCandidate[],
    tracker?: UsageTracker
): Promise<ValidatedRequirement[]> {
    const systemInstruction = `Du er en ekspert på kravsporing i byggebransjen.
Din oppgave er å vurdere om kandidatene er EKTE krav eller bare informasjon.

Et krav må:
- Være testbart eller verifiserbart
- Beskrive noe som SKAL/MÅ oppfylles
- Ha en tydelig forpliktelse

IKKE krav:
- Generell beskrivelse av systemet
- Ønsker uten forpliktelse
- Bakgrunnsinformasjon`;

    const prompt = `Vurder følgende kandidater og avgjør hvilke som er ekte krav.

Kandidater:
${JSON.stringify(candidates, null, 2)}

For hver kandidat, returner:
[
  {
    "text": "Original tekst",
    "shortText": "Kort oppsummering (maks 50 ord)",
    "isRequirement": true,
    "type": "FUNCTION",
    "confidence": 0.9
  }
]

Type kan være: FUNCTION, PERFORMANCE, DESIGN, OTHER`;

    try {
        const { text: result, usage } = await callGemini(apiKey, "gemini-1.5-pro", prompt, systemInstruction);
        tracker?.add(usage);
        return JSON.parse(result) as ValidatedRequirement[];
    } catch (error) {
        console.error("Error validating requirements:", error);
        return [];
    }
}

/**
 * Stage 3a: Local keyword matching for discipline assignment
 */
export function matchDisciplineByKeywords(
    text: string,
    disciplines: { id: string; name: string; keywords: string[] }[]
): DisciplineAssignment {
    const textLower = text.toLowerCase();
    const scores: { id: string; name: string; score: number }[] = [];

    for (const discipline of disciplines) {
        let score = 0;
        for (const keyword of discipline.keywords) {
            if (textLower.includes(keyword.toLowerCase())) {
                score += 1;
            }
        }
        scores.push({ id: discipline.id, name: discipline.name, score });
    }

    scores.sort((a, b) => b.score - a.score);

    if (scores[0]?.score > 0) {
        const topScore = scores[0].score;
        const secondScore = scores[1]?.score || 0;
        const confidence = topScore > secondScore
            ? Math.min(0.9, 0.5 + (topScore - secondScore) * 0.1)
            : 0.5;

        return {
            disciplineId: scores[0].id,
            disciplineName: scores[0].name,
            confidence,
        };
    }

    return {
        disciplineId: null,
        disciplineName: null,
        confidence: 0,
    };
}

/**
 * Stage 3b: AI discipline assignment for uncertain cases
 */
export async function assignDisciplineWithAI(
    apiKey: string,
    requirement: string,
    disciplines: { id: string; name: string; keywords: string[] }[],
    tracker?: UsageTracker
): Promise<DisciplineAssignment> {
    const disciplineList = disciplines
        .map(d => `- ${d.name}: ${d.keywords.slice(0, 5).join(", ")}...`)
        .join("\n");

    const prompt = `Gitt følgende fagdisipliner:
${disciplineList}

Hvilket fag eier dette kravet?
"${requirement}"

Returner JSON:
{
  "disciplineName": "Navnet på faget",
  "confidence": 0.8,
  "reasoning": "Kort begrunnelse"
}

Hvis kravet ikke passer noen fag, bruk disciplineName: null`;

    try {
        const { text: result, usage } = await callGemini(apiKey, "gemini-1.5-flash", prompt);
        tracker?.add(usage);
        const assignment = JSON.parse(result);
        const discipline = disciplines.find(d => d.name === assignment.disciplineName);

        return {
            disciplineId: discipline?.id || null,
            disciplineName: assignment.disciplineName,
            confidence: assignment.confidence || 0.5,
            reasoning: assignment.reasoning,
        };
    } catch (error) {
        console.error("Error assigning discipline with AI:", error);
        return { disciplineId: null, disciplineName: null, confidence: 0 };
    }
}

// Default discipline keywords (from legacy Prosjektbasen)
export const DEFAULT_DISCIPLINE_KEYWORDS: Record<string, string[]> = {
    "Ventilasjon": [
        "ventilasjon", "luft", "luftmengde", "avtrekk", "tilluft", "VAV", "CAV",
        "ventilasjonsanlegg", "kanaler", "luftbehandling", "aggregat", "filter",
        "lufthastighet", "trykkfall", "lyddemper", "spjeld", "behovsstyrt"
    ],
    "Elektro": [
        "elektro", "elektrisk", "kabling", "sikring", "belysning", "lys",
        "strøm", "spenning", "hovedtavle", "underfordeling", "jordfeil",
        "nødlys", "kontakter", "brytere", "LED", "armatur"
    ],
    "Rørlegger": [
        "rør", "vann", "avløp", "sanitær", "sluk", "vannforsyning",
        "varmtvann", "kaldtvann", "blandebatteri", "servant", "toalett",
        "dusj", "spillvann", "overvann", "pumpe"
    ],
    "Byggautomasjon": [
        "automasjon", "SD-anlegg", "BMS", "DDC", "regulering", "styring",
        "sensor", "føler", "temperaturføler", "CO2", "fukt", "alarm",
        "trendlogg", "toppsystem", "undersentral", "protokoll"
    ],
    "Felles": [
        "prosjekt", "byggherre", "entreprenør", "dokumentasjon", "FDV",
        "garanti", "testing", "igangkjøring", "opplæring", "overlevering"
    ],
};
