import { redirect } from 'next/navigation'

/**
 * /user/seguranca — Redirect permanente para /conta?tab=seguranca
 *
 * A seção de segurança foi consolidada na página /conta como tab "Segurança",
 * que contém PasskeyManager + TwoFactorSection (2FA/TOTP).
 */
export default function SegurancaPage() {
  redirect('/conta?tab=seguranca')
}
