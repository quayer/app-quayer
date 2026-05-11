-- Tracks federated login identities (Google OAuth, future GitHub/Microsoft, WhatsApp phone)
-- linked to each user. Used by /api/v1/auth/me/linked-accounts (GET, DELETE) so users can
-- view and revoke external login methods in the /conta page.
--
-- Password and passkey are NOT stored here — they remain in User.password and
-- PasskeyCredential. UserIdentity is exclusively for federated/external providers.

CREATE TABLE "user_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_identities_provider_providerUserId_key"
    ON "user_identities"("provider", "providerUserId");

CREATE UNIQUE INDEX "user_identities_userId_provider_key"
    ON "user_identities"("userId", "provider");

CREATE INDEX "user_identities_userId_idx" ON "user_identities"("userId");

ALTER TABLE "user_identities"
    ADD CONSTRAINT "user_identities_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: registra como `google` qualquer usuário existente que tenha logado via Google.
-- Heurística: usuário com password NULL E emailVerified NOT NULL tem alta probabilidade de
-- ter entrado por OAuth Google (signups por magic-link também têm essa assinatura, mas a
-- maioria do baseline atual é Google). Backfill é opcional — sem ele, usuários antigos
-- verão a lista vazia em /conta até o próximo login com Google, que vai criar o registro
-- via upsert no callback. Para não criar ruído, NÃO fazemos backfill automático aqui.
