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

    // Note: In production, decrypt the key here
    // For now, we store it encrypted but return as-is for simplicity
    return user.geminiApiKey;
}

/**
 * Call Gemini API
 */
async function callGemini(
    apiKey: string,
    model: "gemini-1.5-flash" | "gemini-1.5-pro",
    prompt: string,
    systemInstruction?: string
): Promise<string> {
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
    return data.candidates[0]?.content?.parts[0]?.text || "";
}

/**
 * Stage 1: Find requirement candidates using cheap model
 */
export async function findRequirementCandidates(
    apiKey: string,
    text: string,
    fileName: string
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
        const result = await callGemini(apiKey, "gemini-1.5-flash", prompt, systemInstruction);
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
    candidates: RequirementCandidate[]
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
        const result = await callGemini(apiKey, "gemini-1.5-pro", prompt, systemInstruction);
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
        // Calculate confidence based on how much better top score is vs second
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
    disciplines: { id: string; name: string; keywords: string[] }[]
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
        const result = await callGemini(apiKey, "gemini-1.5-flash", prompt);
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
