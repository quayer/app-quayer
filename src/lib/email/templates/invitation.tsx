import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { render } from '@react-email/render';
import { BrandButton, Layout, emailColors } from '../components';

interface InvitationTemplateParams {
  inviterName: string;
  organizationName: string;
  invitationUrl: string;
  role: string;
}

function InvitationEmail({
  inviterName,
  organizationName,
  invitationUrl,
  role,
}: InvitationTemplateParams) {
  return (
    <Layout preview={`Você foi convidado para ${organizationName} no Quayer`}>
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
        Você foi convidado para {organizationName}
      </Heading>

      <Text
        style={{
          color: emailColors.text,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 16px 0',
        }}
      >
        <strong>{inviterName}</strong> convidou você para fazer parte de{' '}
        <strong>{organizationName}</strong> no Quayer como{' '}
        <strong>{role}</strong>.
      </Text>

      <Text
        style={{
          color: emailColors.text,
          fontSize: '16px',
          lineHeight: '24px',
          margin: '0 0 24px 0',
        }}
      >
        Aceite o convite para começar a colaborar com a equipe.
      </Text>

      <Section style={{ textAlign: 'center' as const, margin: '0 0 24px 0' }}>
        <BrandButton href={invitationUrl}>Aceitar convite</BrandButton>
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
        Ou abra este link diretamente:{' '}
        <a href={invitationUrl} style={{ color: emailColors.link }}>
          {invitationUrl}
        </a>
      </Text>

      <Text
        style={{
          color: emailColors.muted,
          fontSize: '14px',
          lineHeight: '20px',
          margin: 0,
        }}
      >
        Se você não esperava este convite, pode ignorar este email com segurança.
      </Text>
    </Layout>
  );
}

export function invitationTemplate(
  params: InvitationTemplateParams
): Promise<string> {
  return render(<InvitationEmail {...params} />);
}

export default InvitationEmail;
