-- Orayon Uplift — BuilderState determinístico por conversa.
-- Coluna JSONB nullable em builder_project_conversations: campos card-owned +
-- sentinelas *_confirmed. NULL = DEFAULT_BUILDER_STATE (backfill lazy em código,
-- ver src/server/ai-module/builder/cards/builder-state.ts → parseBuilderState).
-- Nullable + default em código → conversas existentes seguem funcionando.
-- IF NOT EXISTS para tolerar replays do migrate.

ALTER TABLE "builder_project_conversations"
  ADD COLUMN IF NOT EXISTS "builderState" JSONB;
