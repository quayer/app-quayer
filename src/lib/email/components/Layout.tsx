import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { Logo } from './Logo';

interface LayoutProps {
  /**
   * Optional preview text shown by mail clients in the inbox list (Gmail, Apple Mail).
   * If omitted no preview header is rendered.
   */
  preview?: string;
  children: React.ReactNode;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.quayer.com';

const FONT_STACK =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const COLORS = {
  background: '#F5F2ED',
  surface: '#FFFFFF',
  heading: '#1A0800',
  text: '#3F2A1F',
  muted: '#5C4438',
  border: '#E8DDD0',
  link: '#B5390C',
} as const;

/**
 * Standard wrapper for all Quayer transactional emails.
 *
 * Provides:
 *  - The HTML/Head/Body skeleton react-email expects
 *  - Brand cream background (#F5F2ED)
 *  - Centered 600px container with white surface card
 *  - Logo header
 *  - Footer with Termos / Privacidade links and corporate address
 */
export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="pt-BR">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      {preview ? <Preview>{preview}</Preview> : null}
      <Body
        style={{
          backgroundColor: COLORS.background,
          fontFamily: FONT_STACK,
          margin: 0,
          padding: '32px 0',
          color: COLORS.text,
        }}
      >
        <Container
          style={{
            backgroundColor: COLORS.surface,
            maxWidth: '600px',
            margin: '0 auto',
            borderRadius: '16px',
            overflow: 'hidden',
            border: `1px solid ${COLORS.border}`,
          }}
        >
          {/* Header */}
          <Section
            style={{
              padding: '32px 32px 16px',
              textAlign: 'left' as const,
            }}
          >
            <Logo />
          </Section>

          {/* Main content */}
          <Section style={{ padding: '8px 32px 24px' }}>{children}</Section>

          <Hr
            style={{
              borderColor: COLORS.border,
              margin: '0 32px',
              borderTop: `1px solid ${COLORS.border}`,
            }}
          />

          {/* Footer */}
          <Section style={{ padding: '24px 32px 32px' }}>
            <Text
              style={{
                color: COLORS.muted,
                fontSize: '12px',
                lineHeight: '20px',
                margin: '0 0 8px 0',
              }}
            >
              Você está recebendo este email porque tem uma conta no Quayer.
            </Text>
            <Text
              style={{
                color: COLORS.muted,
                fontSize: '12px',
                lineHeight: '20px',
                margin: '0 0 8px 0',
              }}
            >
              <Link
                href={`${APP_URL}/termos`}
                style={{ color: COLORS.muted, textDecoration: 'underline' }}
              >
                Termos
              </Link>
              {' · '}
              <Link
                href={`${APP_URL}/privacidade`}
                style={{ color: COLORS.muted, textDecoration: 'underline' }}
              >
                Privacidade
              </Link>
            </Text>
            <Text
              style={{
                color: COLORS.muted,
                fontSize: '12px',
                lineHeight: '20px',
                margin: 0,
              }}
            >
              Quayer · São Paulo, Brasil
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailColors = COLORS;
export const emailFontStack = FONT_STACK;
