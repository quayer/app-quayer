import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { BrandButton, Layout, emailColors } from '../components';

interface LoginCodeParams {
  name: string;
  code: string;
  magicLink: string;
  expirationMinutes?: number;
}

function LoginCodeEmail({
  name,
  code,
  magicLink,
  expirationMinutes,
}: LoginCodeParams) {
  return (
    <Layout preview={`Seu código de login Quayer: ${code}`}>
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
        Seu código de login
      </Heading>

      <Text
        style={{
          color: emailColors.text,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 24px 0',
        }}
      >
        Olá {name}, use o código abaixo para entrar na sua conta Quayer.
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
          Seu código
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

      <Section style={{ textAlign: 'center' as const, margin: '0 0 24px 0' }}>
        <BrandButton href={magicLink}>Entrar</BrandButton>
      </Section>

      <Text
        style={{
          color: emailColors.muted,
          fontSize: '14px',
          lineHeight: '20px',
          margin: '0 0 8px 0',
        }}
      >
        {expirationMinutes
          ? `Este código expira em ${expirationMinutes} minutos.`
          : 'Este código expira em breve.'}
      </Text>

      <Text
        style={{
          color: emailColors.muted,
          fontSize: '14px',
          lineHeight: '20px',
          margin: 0,
        }}
      >
        Se você não solicitou este login, ignore este email.
      </Text>
    </Layout>
  );
}

export function getLoginCodeEmailTemplate(
  params: LoginCodeParams
): Promise<string> {
  return render(<LoginCodeEmail {...params} />);
}

export default LoginCodeEmail;
