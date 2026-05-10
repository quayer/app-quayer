import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { BrandButton, Layout, emailColors } from '../components';

interface WelcomeParams {
  name: string;
  dashboardUrl?: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.quayer.com';

function WelcomeEmail({ name, dashboardUrl }: WelcomeParams) {
  const cta = dashboardUrl || APP_URL;

  return (
    <Layout preview={`Bem-vindo ao Quayer, ${name}!`}>
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
          margin: '0 0 16px 0',
        }}
      >
        Obrigado por se cadastrar. A partir de agora você tem acesso à plataforma
        multi-tenant de WhatsApp do Quayer — conecte instâncias, dispare campanhas,
        acompanhe métricas e construa fluxos com IA.
      </Text>

      <Text
        style={{
          color: emailColors.text,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 24px 0',
        }}
      >
        Estamos felizes em ter você por aqui.
      </Text>

      <Section style={{ textAlign: 'center' as const, margin: '0 0 8px 0' }}>
        <BrandButton href={cta}>Acessar plataforma</BrandButton>
      </Section>
    </Layout>
  );
}

export function getWelcomeEmailTemplate(
  params: WelcomeParams
): Promise<string> {
  return render(<WelcomeEmail {...params} />);
}

export default WelcomeEmail;
