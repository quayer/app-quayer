/**
 * Content Sanitization Service
 *
 * Sanitizes user-generated content to prevent XSS attacks
 * when displaying content in the frontend.
 */

import DOMPurify from 'isomorphic-dompurify';
import { logger } from '@/lib/logging/logger';

/**
 * DOMPurify configuration for message content
 * - ALLOWED_TAGS: Empty array = strip all HTML tags
 * - KEEP_CONTENT: true = keep text content from removed tags
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [] as string[], // Remove all HTML tags
  KEEP_CONTENT: true, // But keep the text content
  ALLOWED_ATTR: [] as string[], // No attributes allowed
};

/**
 * Sanitize message content to prevent XSS
 *
 * @param content - Raw message content from webhook
 * @returns Sanitized content safe for display
 */
export function sanitizeContent(content: string | null | undefined): string {
  if (!content) {
    return '';
  }

  try {
    // Sanitize HTML/script content
    const sanitized = DOMPurify.sanitize(content, SANITIZE_CONFIG);

    // Additional sanitization for common attack vectors
    return sanitized
      // Remove javascript: protocol links
      .replace(/javascript:/gi, '')
      // Remove data: URLs that could contain malicious content
      .replace(/data:text\/html/gi, '')
      // Remove event handlers
      .replace(/on\w+\s*=/gi, '')
      // Normalize whitespace
      .trim();
  } catch (error) {
    logger.warn('Content sanitization error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      contentLength: content.length,
    });
    // In case of error, return empty string for safety
    return '';
  }
}

/**
 * Sanitize contact name
 * Names should be plain text without HTML
 */
export function sanitizeContactName(name: string | null | undefined): string {
  if (!name) {
    return '';
  }

  try {
    return DOMPurify.sanitize(name, SANITIZE_CONFIG)
      .trim()
      .slice(0, 255); // Limit length
  } catch (error) {
    logger.warn('Contact name sanitization error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      nameLength: name.length,
    });
    // Return truncated raw name on error (better than empty)
    return name.slice(0, 255);
  }
}

/**
 * Sanitize file name
 * Prevents path traversal and special characters
 */
export function sanitizeFileName(fileName: string | null | undefined): string {
  if (!fileName) {
    return '';
  }

  return fileName
    // Remove path separators
    .replace(/[/\\]/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove special characters except dot, hyphen, underscore
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    // Limit length
    .slice(0, 255);
}

/**
 * Sanitize URL
 * Validates URL protocol and structure
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      logger.warn('Invalid URL protocol blocked', { url: url.slice(0, 100) });
      return null;
    }
    return url;
  } catch {
    // Invalid URL
    return null;
  }
}

/**
 * Sanitize webhook message object
 * Sanitizes all string fields in the message
 */
export function sanitizeMessage<T extends Record<string, unknown>>(message: T): T {
  if (!message || typeof message !== 'object') {
    return message;
  }

  const sanitized = { ...message };

  // Sanitize content field
  if (typeof sanitized.content === 'string') {
    (sanitized as Record<string, unknown>).content = sanitizeContent(sanitized.content);
  }

  // Sanitize media fields
  if (sanitized.media && typeof sanitized.media === 'object') {
    const media = sanitized.media as Record<string, unknown>;
    if (typeof media.fileName === 'string') {
      media.fileName = sanitizeFileName(media.fileName);
    }
    if (typeof media.mediaUrl === 'string') {
      media.mediaUrl = sanitizeUrl(media.mediaUrl);
    }
  }

  return sanitized;
}
