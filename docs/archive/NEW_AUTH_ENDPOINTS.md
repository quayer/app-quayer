# Novos Endpoints de Autenticação

## 1. POST /auth/signup-otp
```typescript
/**
 * Signup OTP - Request signup code
 */
signupOTP: igniter.mutation({
  name: 'Signup OTP',
  description: 'Request signup code via email',
  path: '/signup-otp',
  method: 'POST',
  body: signupOTPSchema,
  handler: async ({ request, response }) => {
    // Rate limiting
    const identifier = getClientIdentifier(request);
    const rateLimit = await authRateLimiter.check(identifier);

    if (!rateLimit.success) {
      return response.status(429).json({
        error: 'Too many requests',
        retryAfter: rateLimit.retryAfter,
      });
    }

    const { email, name } = request.body;

    // Check if user already exists
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return response.badRequest({ error: 'Email already registered. Please login instead.' });
    }

    // Generate OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Save to TempUser (upsert to allow resend)
    await db.tempUser.upsert({
      where: { email },
      create: {
        email,
        name,
        code: otpCode,
        expiresAt,
      },
      update: {
        name,
        code: otpCode,
        expiresAt,
      },
    });

    // Generate magic link (optional for signup)
    const magicLinkToken = jwt.sign(
      { email, name, type: 'signup-magic' },
      process.env.JWT_SECRET || 'your_secret',
      { expiresIn: '10m' }
    );

    const magicLinkUrl = `${appBaseUrl}/signup/verify-magic?token=${magicLinkToken}`;

    // Send email
    await emailService.sendLoginCodeEmail(
      email,
      name,
      otpCode,
      magicLinkUrl,
      10
    );

    return response.success({
      sent: true,
      message: 'Signup code sent to your email',
    });
  },
}),
```

## 2. POST /auth/verify-signup-otp
```typescript
/**
 * Verify Signup OTP - Create user after verification
 */
verifySignupOTP: igniter.mutation({
  name: 'Verify Signup OTP',
  description: 'Verify signup OTP code and create user',
  path: '/verify-signup-otp',
  method: 'POST',
  body: verifySignupOTPSchema,
  handler: async ({ request, response }) => {
    const { email, code } = request.body;

    // Find TempUser
    const tempUser = await db.tempUser.findUnique({ where: { email } });

    if (!tempUser) {
      return response.badRequest({ error: 'Invalid code or email' });
    }

    // Verify code
    if (tempUser.code !== code) {
      return response.badRequest({ error: 'Invalid code' });
    }

    // Check expiration
    if (tempUser.expiresAt < new Date()) {
      return response.badRequest({ error: 'Code expired. Request a new one.' });
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return response.badRequest({ error: 'User already exists' });
    }

    // Check if first user (will be admin)
    const usersCount = await db.user.count();
    const isFirstUser = usersCount === 0;

    // Create organization for new user
    const slug = tempUser.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 50);

    const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14);

    const organization = await db.organization.create({
      data: {
        name: `${tempUser.name}'s Organization`,
        slug: `${slug}-${Date.now()}`,
        document: uniqueDocument,
        type: 'pf',
        isActive: true,
      },
    });

    // Generate random password (user won't use it)
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await hashPassword(randomPassword);

    // Create user
    const user = await db.user.create({
      data: {
        email: tempUser.email,
        name: tempUser.name,
        password: hashedPassword,
        role: isFirstUser ? UserRole.ADMIN : UserRole.USER,
        emailVerified: new Date(), // Auto-verified via OTP
        currentOrgId: organization.id,
        organizations: {
          create: {
            organizationId: organization.id,
            role: 'master',
          },
        },
      },
    });

    // Delete TempUser
    await db.tempUser.delete({ where: { email } });

    // Generate tokens
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      currentOrgId: organization.id,
      organizationRole: 'master',
    }, '24h');

    const refreshTokenData = await db.refreshToken.create({
      data: {
        userId: user.id,
        token: signRefreshToken({ userId: user.id, tokenId: '' }),
        expiresAt: getExpirationDate('7d'),
      },
    });

    const refreshToken = signRefreshToken({
      userId: user.id,
      tokenId: refreshTokenData.id,
    });

    await db.refreshToken.update({
      where: { id: refreshTokenData.id },
      data: { token: refreshToken },
    });

    // Send welcome email
    await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl);

    return response.success({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        currentOrgId: organization.id,
        organizationRole: 'master',
      },
    });
  },
}),
```

## 3. Atualizar imports no controller
```typescript
import jwt from 'jsonwebtoken';
import {
  // ... existing imports
  signupOTPSchema,
  verifySignupOTPSchema,
} from '../auth.schemas';
```

## 4. Atualizar signup-form.tsx para usar novo endpoint
```typescript
// Change from:
await api.auth.loginOTP.mutate({ body: { email } })

// To:
await api.auth.signupOTP.mutate({ body: { email, name } })
```
