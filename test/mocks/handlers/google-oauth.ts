/**
 * MSW handlers for Google OAuth endpoints hit by src/lib/auth/google-oauth.ts.
 *
 * Endpoints stubbed:
 *   POST https://oauth2.googleapis.com/token         (exchange code -> tokens)
 *   GET  https://www.googleapis.com/oauth2/v3/userinfo (access_token -> profile)
 *
 * The auth-URL builder (`getGoogleAuthUrl`) does not make a network call;
 * it just returns a string with our state param, so no handler is required.
 *
 * Tests can override behavior by composing the `googleOAuthScenario` helper.
 */

import { http, HttpResponse } from 'msw'

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  picture?: string
  email_verified?: boolean
}

const DEFAULT_PROFILE: GoogleProfile = {
  sub: 'goog-sub-default',
  email: 'goog-user@test.local',
  name: 'Google Test User',
  picture: 'https://example.com/avatar.png',
  email_verified: true,
}

let currentProfile: GoogleProfile = { ...DEFAULT_PROFILE }
let tokenFailure: { status: number; body: unknown } | null = null

/**
 * Override the profile returned by the userinfo endpoint for the next calls.
 * Reset with `resetGoogleOAuthMocks()`.
 */
export function setGoogleProfile(profile: Partial<GoogleProfile>): void {
  currentProfile = { ...DEFAULT_PROFILE, ...profile }
}

/**
 * Force the token-exchange endpoint to return an error (e.g. invalid_grant).
 */
export function setGoogleTokenFailure(status: number, body: unknown): void {
  tokenFailure = { status, body }
}

export function resetGoogleOAuthMocks(): void {
  currentProfile = { ...DEFAULT_PROFILE }
  tokenFailure = null
}

export const googleOAuthHandlers = [
  http.post('https://oauth2.googleapis.com/token', () => {
    if (tokenFailure) {
      return HttpResponse.json(tokenFailure.body, { status: tokenFailure.status })
    }
    return HttpResponse.json({
      access_token: 'mock-google-access-token',
      expires_in: 3600,
      refresh_token: 'mock-google-refresh-token',
      scope: 'openid email profile',
      token_type: 'Bearer',
      id_token: 'mock.google.id_token',
    })
  }),
  http.get('https://www.googleapis.com/oauth2/v3/userinfo', () => {
    return HttpResponse.json(currentProfile)
  }),
]
