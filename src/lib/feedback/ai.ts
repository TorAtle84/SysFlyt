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

export interface FeedbackActionPlan {
  summary: string;
  probableArea: string;
  suggestedFiles: { path: string; reason: string }[];
  steps: string[];
  questions: string[];
}

interface FeedbackPlanInput {
  category: string;
  priority: string;
  message: string;
  status: string;
  reporterName: string;
  reporterEmail: string;
  attachmentCount: number;
  createdAt: string;
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const cleanKey = apiKey.trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;

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
      maxOutputTokens: 1200,
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
    const errorText = await response.text();
    throw new Error(`Gemini API failed: ${response.status} - ${errorText.substring(0, 120)}`);
  }

  const data: GeminiResponse = await response.json();
  const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!outputText) {
    throw new Error("Gemini API returned empty response");
  }

  return outputText;
}

export async function generateFeedbackActionPlan(
  apiKey: string,
  input: FeedbackPlanInput
): Promise<{ plan: FeedbackActionPlan; raw: string }> {
  const systemInstruction = [
    "You are a senior full-stack engineer working on a Next.js app with Prisma, NextAuth, and Supabase Storage.",
    "Return ONLY valid JSON matching the required schema.",
    "Be concrete: suggest likely folders and files, and keep steps actionable.",
  ].join(" ");

  const prompt = `Feedback details:
- Category: ${input.category}
- Priority: ${input.priority}
- Status: ${input.status}
- Reporter: ${input.reporterName} (${input.reporterEmail})
- Created: ${input.createdAt}
- Attachments: ${input.attachmentCount}
- Message: ${input.message}

Required JSON schema:
{
  "summary": "Short summary of the issue",
  "probableArea": "Most likely app area or module",
  "suggestedFiles": [
    { "path": "src/...", "reason": "Why this file is relevant" }
  ],
  "steps": [
    "Step 1",
    "Step 2"
  ],
  "questions": [
    "Question to clarify missing details"
  ]
}`;

  const raw = await callGemini(apiKey, "gemini-1.5-pro-latest", prompt, systemInstruction);
  const parsed = JSON.parse(raw) as FeedbackActionPlan;

  return { plan: parsed, raw };
}
