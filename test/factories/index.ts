/**
 * Test factories — single entry point.
 *
 * Import from `test/factories` (the path alias is wired by tsconfig.test.json).
 *
 * Use cases:
 *   - C4 integration tests: pair with `withTransaction` so every fixture is
 *     rolled back at the end of the test.
 *   - C2/C3 unit tests: import only the type defaults (`UserOverrides`,
 *     `OrganizationOverrides`) to keep mock shapes accurate.
 */

export {
  makeUser,
  makePendingUser,
  makeUserWith2FA,
  makeUserWithPassword,
  makeAdminUser,
  makeUserWithPhone,
  type UserOverrides,
} from './user.factory'

export {
  makeOrganization,
  addUserToOrg,
  makeUserInOrg,
  type OrganizationOverrides,
  type MembershipOverrides,
} from './organization.factory'

export {
  withTransaction,
  getTestPrisma,
  disconnectTestPrisma,
} from './transaction'

export {
  makeTotpDevice,
  makeRecoveryCode,
  makeRecoveryCodes,
  type TotpDeviceOverrides,
  type RecoveryCodeOverrides,
} from './twofa.factory'

export {
  makePasskeyCredential,
  makePasskeyChallenge,
  type PasskeyCredentialOverrides,
  type PasskeyChallengeOverrides,
} from './passkey.factory'
