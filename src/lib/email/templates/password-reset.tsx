import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { BrandButton, Layout, emailColors } from '../components';

interface PasswordResetParams {
  name: string;
  resetUrl: string;
  expirationMinutes?: number;
}

function PasswordResetEmail({
  name,
  resetUrl,
  expirationMinutes,
}: PasswordResetParams) {
  return (
    <Layout preview="Redefina sua senha do Quayer">
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
        Redefina sua senha
      </Heading>

      <Text
        style={{
          color: emailColors.text,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 24px 0',
        }}
      >
        Olá {name}, recebemos um pedido para redefinir a senha da sua conta
        Quayer. Clique no botão abaixo para criar uma nova senha.
      </Text>

      <Section style={{ textAlign: 'center' as const, margin: '0 0 24px 0' }}>
        <BrandButton href={resetUrl}>Redefinir senha</BrandButton>
      </Section>

      <Text
        style={{
          color: emailColors.text,
          fontSize: '14px',
          lineHeight: '20px',
          margin: '0 0 16px 0',
          wordBreak: 'break-all' as const,
        }}
      >
        Ou copie e cole este link no seu navegador:{' '}
        <a href={resetUrl} style={{ color: emailColors.link }}>
          {resetUrl}
        </a>
      </Text>

      <Section
        style={{
          backgroundColor: '#FBF6EE',
          border: `1px solid ${emailColors.border}`,
          borderRadius: '8px',
          padding: '12px 16px',
          margin: '0 0 8px 0',
        }}
      >
        <Text
          style={{
            color: emailColors.text,
            fontSize: '13px',
            lineHeight: '20px',
            margin: 0,
          }}
        >
          Se você não solicitou esta redefinição, ignore este email — sua senha
          permanece a mesma.
        </Text>
      </Section>

      <Text
        style={{
          color: emailColors.muted,
          fontSize: '14px',
          lineHeight: '20px',
          margin: 0,
        }}
      >
        {expirationMinutes
          ? `Este link expira em ${expirationMinutes} minutos.`
          : 'Este link expira em breve.'}
      </Text>
    </Layout>
  );
}

export function getPasswordResetEmailTemplate(
  params: PasswordResetParams
): Promise<string> {
  return render(<PasswordResetEmail {...params} />);
}

export default PasswordResetEmail;
