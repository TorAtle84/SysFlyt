/**
 * AI Client for LinkDog
 * Supports both Google Gemini and Anthropic Claude
 */

import { decrypt } from '@/lib/encryption';
import { buildSystemPrompt, filterResponse, type LinkDogContext } from './system-prompt';

export type AIProvider = 'gemini' | 'claude' | 'openai';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatResponse {
    response: string;
    error?: string;
}

/**
 * Send a message to the AI and get a response
 */
export async function chat(
    message: string,
    context: LinkDogContext,
    provider: AIProvider,
    apiKey: string,
    conversationHistory: ChatMessage[] = []
): Promise<ChatResponse> {
    try {
        if (!apiKey) {
            return {
                response: '',
                error: 'API-nøkkel er ikke konfigurert. Gå til Profil for å legge den inn! 🐕'
            };
        }

        const systemPrompt = buildSystemPrompt(context);

        if (provider === 'gemini') {
            return await chatWithGemini(message, systemPrompt, apiKey, conversationHistory);
        } else if (provider === 'openai') {
            return await chatWithOpenAI(message, systemPrompt, apiKey, conversationHistory);
        } else {
            return await chatWithClaude(message, systemPrompt, apiKey, conversationHistory);
        }
    } catch (error) {
        console.error('LinkDog chat error:', error);
        return {
            response: '',
            error: 'Beklager, noe gikk galt. Prøv igjen senere! 🐕'
        };
    }
}

/**
 * Chat with Google Gemini
 */
async function chatWithGemini(
    message: string,
    systemPrompt: string,
    apiKey: string,
    history: ChatMessage[]
): Promise<ChatResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Build conversation contents
    const contents = [];

    // Add history
    for (const msg of history) {
        contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        });
    }

    // Add current message
    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents,
            generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.7,
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            ]
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Gemini API error:', error);

        if (response.status === 401 || response.status === 403) {
            return {
                response: '',
                error: 'API-nøkkelen er ugyldig. Sjekk innstillingene dine! 🐕'
            };
        }

        return {
            response: '',
            error: 'Kunne ikke kontakte AI-tjenesten. Prøv igjen! 🐕'
        };
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
        return {
            response: '',
            error: 'Ingen respons fra AI. Prøv å omformulere spørsmålet! 🐕'
        };
    }

    const rawResponse = data.candidates[0]?.content?.parts?.[0]?.text || '';
    const filteredResponse = filterResponse(rawResponse);

    return { response: filteredResponse };
}

/**
 * Chat with Anthropic Claude
 */
async function chatWithClaude(
    message: string,
    systemPrompt: string,
    apiKey: string,
    history: ChatMessage[]
): Promise<ChatResponse> {
    const url = 'https://api.anthropic.com/v1/messages';

    // Build messages array
    const messages = [];

    // Add history
    for (const msg of history) {
        messages.push({
            role: msg.role,
            content: msg.content
        });
    }

    // Add current message
    messages.push({
        role: 'user',
        content: message
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 500,
            system: systemPrompt,
            messages,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Claude API error:', error);

        if (response.status === 401) {
            return {
                response: '',
                error: 'API-nøkkelen er ugyldig. Sjekk innstillingene dine! 🐕'
            };
        }

        return {
            response: '',
            error: 'Kunne ikke kontakte AI-tjenesten. Prøv igjen! 🐕'
        };
    }

    const data = await response.json();

    if (!data.content || data.content.length === 0) {
        return {
            response: '',
            error: 'Ingen respons fra AI. Prøv å omformulere spørsmålet! 🐕'
        };
    }

    const rawResponse = data.content[0]?.text || '';
    const filteredResponse = filterResponse(rawResponse);

    return { response: filteredResponse };
}

/**
 * Chat with OpenAI
 */
async function chatWithOpenAI(
    message: string,
    systemPrompt: string,
    apiKey: string,
    history: ChatMessage[]
): Promise<ChatResponse> {
    const url = 'https://api.openai.com/v1/chat/completions';

    // Build messages array
    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    // Add history
    for (const msg of history) {
        messages.push({
            role: msg.role,
            content: msg.content
        });
    }

    // Add current message
    messages.push({
        role: 'user',
        content: message
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 500,
            temperature: 0.7,
            messages,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('OpenAI API error:', error);

        if (response.status === 401) {
            return {
                response: '',
                error: 'API-nøkkelen er ugyldig. Sjekk innstillingene dine! 🐕'
            };
        }

        return {
            response: '',
            error: 'Kunne ikke kontakte AI-tjenesten. Prøv igjen! 🐕'
        };
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
        return {
            response: '',
            error: 'Ingen respons fra AI. Prøv å omformulere spørsmålet! 🐕'
        };
    }

    const rawResponse = data.choices[0]?.message?.content || '';
    const filteredResponse = filterResponse(rawResponse);

    return { response: filteredResponse };
}

/**
 * Check if a message seems irrelevant to the application
 */
export function isIrrelevantMessage(message: string): boolean {
    const irrelevantPatterns = [
        /hva skal jeg (ha|lage|spise)/i,
        /middag/i,
        /frokost/i,
        /lunsj/i,
        /været/i,
        /været i dag/i,
        /fortell en vits/i,
        /skriv (et dikt|en sang|en historie)/i,
        /hvem vinner/i,
        /favoritt/i,
        /hva synes du om/i,
        /kjenner du/i,
        /er du en robot/i,
        /er du ekte/i,
    ];

    return irrelevantPatterns.some(pattern => pattern.test(message));
}

/**
 * Get exit message when conversation needs to end
 */
export function getExitMessage(): string {
    const messages = [
        "Jeg stikker ut og leker litt! Vi snakkes senere! 🐕",
        "Nå må jeg ut og jage noen ekorn! Ha det! 🐿️",
        "Bjeffer på deg senere! Jeg skal ut og kose meg! 🦴",
        "Må ut og grave etter bein! Snakkes! 🐾",
    ];

    return messages[Math.floor(Math.random() * messages.length)];
}
