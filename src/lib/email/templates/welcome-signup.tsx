import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { BrandButton, Layout, emailColors } from '../components';

interface WelcomeSignupParams {
  name: string;
  code: string;
  magicLink: string;
  expirationMinutes?: number;
}

function WelcomeSignupEmail({
  name,
  code,
  magicLink,
  expirationMinutes,
}: WelcomeSignupParams) {
  return (
    <Layout preview={`Bem-vindo ao Quayer! Seu código: ${code}`}>
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
        Bem-vindo ao Quayer, {name}!
      </Heading>

      <Text
        style={{
          color: emailColors.text,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 24px 0',
        }}
      >
        Sua conta foi criada com sucesso. Use o código abaixo para concluir seu
        primeiro acesso e começar a usar a plataforma.
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
          Seu código de acesso
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
        <BrandButton href={magicLink}>Entrar agora</BrandButton>
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
          ? `Este código expira em ${expirationMinutes} minutos.`
          : 'Este código expira em breve.'}
      </Text>
    </Layout>
  );
}

export function getWelcomeSignupEmailTemplate(
  params: WelcomeSignupParams
): Promise<string> {
  return render(<WelcomeSignupEmail {...params} />);
}

export default WelcomeSignupEmail;
