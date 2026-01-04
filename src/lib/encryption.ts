/**
 * Encryption utilities for secure storage of API keys
 * Uses AES-256-GCM encryption with a secret key from environment variables
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment
 * Falls back to a default for development (NOT secure for production)
 */
function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;

    if (!key) {
        console.warn('ENCRYPTION_KEY not set, using insecure default. Set this in production!');
        // This is a fallback for development only
        return crypto.scryptSync('dev-fallback-key', 'salt', 32);
    }

    // Key should be 64 hex characters (32 bytes)
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }

    // If not hex, derive key from string
    return crypto.scryptSync(key, 'sysflyt-salt', 32);
}

/**
 * Encrypt a string value
 * @param text - The plaintext to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all hex)
 */
export function encrypt(text: string): string {
    if (!text) return '';

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an encrypted string
 * @param encryptedText - The encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedText: string): string {
    if (!encryptedText) {
        console.warn('[Encryption] Attempted to decrypt empty text');
        return '';
    }

    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) {
            console.error('[Encryption] Invalid format - expected 3 parts (iv:authTag:data), got:', parts.length);
            throw new Error('Invalid encrypted text format');
        }

        const [ivHex, authTagHex, dataHex] = parts;
        const key = getEncryptionKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encrypted = Buffer.from(dataHex, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);

        const result = decrypted.toString('utf8');
        console.log('[Encryption] Successfully decrypted text of length:', result.length);
        return result;
    } catch (error) {
        console.error('[Encryption] Decryption failed:', error instanceof Error ? error.message : error);
        console.error('[Encryption] Encrypted text length:', encryptedText.length);
        console.error('[Encryption] ENCRYPTION_KEY set:', !!process.env.ENCRYPTION_KEY);
        throw new Error('Failed to decrypt: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}

/**
 * Mask an API key for display (show first 4 and last 4 characters)
 * @param key - The API key to mask
 * @returns Masked key like "sk-xx...xxxx"
 */
export function maskApiKey(key: string | null | undefined): string {
    if (!key) return '';
    if (key.length <= 12) return '••••••••';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/**
 * Validate that a string looks like an API key
 * @param key - The key to validate
 * @param provider - The AI provider
 */
export function isValidApiKey(key: string, provider: 'gemini' | 'claude' | 'openai'): boolean {
    if (!key || key.length < 20) return false;

    switch (provider) {
        case 'gemini':
            // Gemini keys typically start with "AI" and are 39 characters
            return key.length >= 30;
        case 'claude':
            // Claude keys start with "sk-ant-"
            return key.startsWith('sk-ant-') && key.length >= 50;
        case 'openai':
            // OpenAI keys start with "sk-"
            return key.startsWith('sk-') && key.length >= 40;
        default:
            return key.length >= 20;
    }
}
