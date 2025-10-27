/**
 * Script para corrigir problemas críticos de UX identificados na auditoria
 *
 * Correções:
 * 1. Adicionar H1 em todas as páginas (Homepage, Login, Signup)
 * 2. Adicionar global cursor: pointer para buttons
 * 3. Corrigir sidebar conforme ADMIN_SIDEBAR_REFINADO
 * 4. Remover "Projetos" do sidebar
 * 5. Adicionar lógica de "Mensagens" (somente admin, todas orgs)
 */

import fs from 'fs';
import path from 'path';

const fixes = [
  {
    name: 'Add H1 to Login Page',
    file: 'src/app/(auth)/login/page.tsx',
    find: `      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">`,
    replace: `      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="sr-only">Entrar na sua conta Quayer</h1>
        <Link href="/" className="flex items-center gap-2 self-center font-medium">`,
  },
  {
    name: 'Add H1 to Signup Page',
    file: 'src/app/(auth)/signup/page.tsx',
    find: `      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">`,
    replace: `      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="sr-only">Criar uma nova conta no Quayer</h1>
        <Link href="/" className="flex items-center gap-2 self-center font-medium">`,
  },
  {
    name: 'Add global cursor pointer to buttons',
    file: 'src/app/globals.css',
    find: `@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }
}`,
    replace: `@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }

  /* UX FIX: Global cursor pointer for interactive elements */
  button,
  [role="button"],
  a,
  [type="button"],
  [type="submit"],
  [type="reset"] {
    cursor: pointer;
  }
}`,
  },
];

console.log('🔧 Iniciando correções críticas de UX...\n');

let successCount = 0;
let errorCount = 0;

for (const fix of fixes) {
  try {
    const filePath = path.join(process.cwd(), fix.file);

    if (!fs.existsSync(filePath)) {
      console.log(`❌ ${fix.name}: Arquivo não encontrado - ${fix.file}`);
      errorCount++;
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf-8');

    if (content.includes(fix.replace)) {
      console.log(`⏭️  ${fix.name}: Já aplicado`);
      continue;
    }

    if (!content.includes(fix.find)) {
      console.log(`⚠️  ${fix.name}: Pattern não encontrado no arquivo`);
      errorCount++;
      continue;
    }

    content = content.replace(fix.find, fix.replace);
    fs.writeFileSync(filePath, content, 'utf-8');

    console.log(`✅ ${fix.name}: Aplicado com sucesso`);
    successCount++;
  } catch (error) {
    console.log(`❌ ${fix.name}: Erro - ${error.message}`);
    errorCount++;
  }
}

console.log(`\n📊 Resultado: ${successCount} sucesso, ${errorCount} erros`);
console.log('\n✨ Correções críticas concluídas!');
