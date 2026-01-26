import LZString from 'lz-string';

/**
 * Generates a shareable URL for the application.
 * 
 * Logic:
 * 1. If VITE_APP_URL is defined in environment variables, use it as the base.
 * 2. Otherwise, use window.location.origin.
 * 
 * @param path - The path to append (e.g., '?session=abc')
 * @returns The full absolute URL.
 */
export const getAppUrl = (path: string = ''): string => {
    // Check for configured production URL
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    
    // Ensure no double slashes if path starts with /
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    return `${cleanBase}${cleanPath}`;
};

/**
 * Helper to generate a session link specifically.
 */
export const getSessionLink = (sessionId: string): string => {
    return getAppUrl(`?session=${sessionId}`);
};

/**
 * Helper to generate a template link (for creating new sessions from a plan).
 */
export const getTemplateLink = (templateId: string): string => {
    return getAppUrl(`?template=${templateId}`);
};

/**
 * Helper to generate a payload link (embeds entire plan in URL).
 * Useful when offline or for instant sharing without database.
 */
export const getPayloadLink = (data: any): string => {
    const json = JSON.stringify(data);
    const compressed = LZString.compressToEncodedURIComponent(json);
    return getAppUrl(`?payload=${compressed}`);
};
