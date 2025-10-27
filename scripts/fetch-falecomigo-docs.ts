import { chromium } from 'playwright';
import * as fs from 'fs';

async function fetchFalecomigoDocumentation() {
  console.log('🚀 Iniciando extração da documentação falecomigo.ai...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Acessar a página de documentação
    console.log('📄 Acessando https://docs.falecomigo.ai/...');
    await page.goto('https://docs.falecomigo.ai/', { waitUntil: 'networkidle' });

    // Aguardar campo de senha aparecer
    console.log('🔑 Aguardando campo de senha...');
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });

    // Digitar a senha
    console.log('⌨️  Digitando senha...');
    await page.fill('input[type="password"]', 'Fale@2025');

    // Procurar e clicar no botão de submit
    const submitButton = await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Submit")').first();
    await submitButton.click();

    // Aguardar carregamento da documentação
    console.log('⏳ Aguardando carregamento da documentação...');
    await page.waitForTimeout(3000);

    // Extrair todo o conteúdo da página
    const content = await page.content();

    // Salvar HTML completo
    fs.writeFileSync('docs-falecomigo-raw.html', content);
    console.log('💾 HTML salvo em docs-falecomigo-raw.html');

    // Tentar extrair rotas da API (procurar por padrões comuns)
    const apiRoutes = await page.evaluate(() => {
      const routes: any[] = [];

      // Procurar por elementos que contenham rotas de API
      const elements = document.querySelectorAll('code, pre, .endpoint, .route, .api-path');

      elements.forEach((el) => {
        const text = el.textContent || '';
        // Procurar por padrões de rota HTTP
        const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        httpMethods.forEach(method => {
          if (text.includes(method)) {
            routes.push({
              element: el.tagName,
              text: text.trim(),
              html: el.innerHTML
            });
          }
        });
      });

      return routes;
    });

    console.log(`✅ Encontradas ${apiRoutes.length} referências a rotas`);
    fs.writeFileSync('docs-falecomigo-routes.json', JSON.stringify(apiRoutes, null, 2));
    console.log('💾 Rotas salvas em docs-falecomigo-routes.json');

    // Extrair texto completo da página
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync('docs-falecomigo-text.txt', bodyText);
    console.log('💾 Texto completo salvo em docs-falecomigo-text.txt');

    console.log('\n✅ Extração concluída! Arquivos salvos:');
    console.log('   - docs-falecomigo-raw.html (HTML completo)');
    console.log('   - docs-falecomigo-routes.json (Rotas extraídas)');
    console.log('   - docs-falecomigo-text.txt (Texto completo)');

  } catch (error) {
    console.error('❌ Erro:', error);

    // Tirar screenshot do erro
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
    console.log('📸 Screenshot do erro salvo em error-screenshot.png');
  } finally {
    await browser.close();
  }
}

fetchFalecomigoDocumentation();
