/**
 * Chatwoot Procedure
 * 
 * @description Igniter.js procedure for injecting Chatwoot dependencies.
 * Injects the ChatwootRepository into the context.
 * 
 * @version 1.0.0
 */

import { igniter } from '@/igniter';
import { ChatwootRepository } from '../repositories/chatwoot.repository';

/**
 * @typedef {object} ChatwootContext
 * @property {object} features - Features context object
 * @property {object} features.chatwoot - Chatwoot feature context
 * @property {ChatwootRepository} features.chatwoot.repository - Chatwoot repository instance
 */
export type ChatwootContext = {
  features: {
    chatwoot: {
      repository: ChatwootRepository;
    };
  };
};

/**
 * @const chatwootProcedure
 * @description Igniter.js procedure to inject ChatwootRepository into the context.
 * 
 * @example
 * // In a controller action
 * use: [chatwootProcedure()],
 * handler: async ({ context }) => {
 *   const config = await context.features.chatwoot.repository.getConfig(connectionId, orgId);
 * }
 * 
 * @returns {ChatwootContext} Context with Chatwoot repository
 */
export const chatwootProcedure = igniter.procedure({
  name: 'chatwootProcedure',
  handler: (_options: Record<string, never>, ctx) => {
    // Igniter.js pattern: (options, ctx) where ctx contains { request, response, context }
    const { context } = ctx;

    // Context Extension: Instantiate ChatwootRepository with database client
    const chatwootRepository = new ChatwootRepository(context.services.database);

    // Context Extension: Return repository in hierarchical structure
    return {
      features: {
        chatwoot: {
          repository: chatwootRepository,
        },
      },
    };
  },
});
