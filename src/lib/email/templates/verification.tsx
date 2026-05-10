import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { Layout, emailColors } from '../components';

interface VerificationParams {
  name: string;
  code: string;
  expirationMinutes?: number;
  /**
   * Optional verify URL. The current `email.service.ts` only forwards a code,
   * but if a caller starts forwarding a URL too (e.g. magic verify link) we will
   * render a CTA button below the code. Kept optional for backwards compatibility.
   */
  verifyUrl?: string;
}

function VerificationEmail({
  name,
  code,
  expirationMinutes,
  verifyUrl,
}: VerificationParams) {
  return (
    <Layout preview={`Verifique seu email Quayer com o código ${code}`}>
      <Heading
        as="h1"
        style={{
          color: emailColors.heading,
          fontSize: '24px',
          lineHeight: '32px',
          fontWeight: 700,
          margin: '0 0 16px 0',
        }}
      >
        Verifique seu email
      </Heading>

      <Text
        style={{
          color: emailColors.text,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 24px 0',
        }}
      >
        Olá {name}, para confirmar que este endereço pertence a você, informe o
        código abaixo na tela de verificação.
      </Text>

      <Section
        style={{
          backgroundColor: '#FBF6EE',
          border: `1px solid ${emailColors.border}`,
          borderRadius: '12px',
          padding: '24px',
          textAlign: 'center' as const,
          margin: '0 0 24px 0',
        }}
      >
        <Text
          style={{
            color: emailColors.muted,
            fontSize: '12px',
            letterSpacing: '2px',
            textTransform: 'uppercase' as const,
            margin: '0 0 8px 0',
          }}
        >
          Código de verificação
        </Text>
        <Text
          style={{
            color: emailColors.heading,
            fontSize: '32px',
            lineHeight: '40px',
            fontWeight: 700,
            letterSpacing: '6px',
            fontFamily:
              "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            margin: 0,
          }}
        >
          {code}
        </Text>
      </Section>

      {verifyUrl ? (
        <Text
          style={{
            color: emailColors.text,
            fontSize: '14px',
            lineHeight: '20px',
            margin: '0 0 16px 0',
            wordBreak: 'break-all' as const,
          }}
        >
          Ou abra este link diretamente:{' '}
          <a href={verifyUrl} style={{ color: emailColors.link }}>
            {verifyUrl}
          </a>
        </Text>
      ) : null}

      <Text
        style={{
          color: emailColors.muted,
          fontSize: '14px',
          lineHeight: '20px',
          margin: '0 0 8px 0',
        }}
      >
        {expirationMinutes
          ? `Este código é válido por ${expirationMinutes} minutos.`
          : 'Este código é válido por tempo limitado.'}
      </Text>

      <Text
        style={{
          color: emailColors.muted,
          fontSize: '14px',
          lineHeight: '20px',
          margin: 0,
        }}
      >
        Se você não criou uma conta no Quayer, pode ignorar este email com
        segurança.
      </Text>
    </Layout>
  );
}

export function getVerificationEmailTemplate(
  params: VerificationParams
): Promise<string> {
  return render(<VerificationEmail {...params} />);
}

export default VerificationEmail;
