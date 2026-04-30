/**
 * Thin re-export — the real implementation was split into ./chat/*.
 * Keep this file so existing consumers (preview-panel, workspace,
 * app/projetos/[id]/page) continue to import from the same path.
 */
export { ChatPanel } from "./chat/chat-panel"
