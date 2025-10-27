import { chromium } from 'playwright';
import * as fs from 'fs';

async function mapAllRoutes() {
  console.log('🚀 Mapeando TODAS as rotas da documentação falecomigo.ai...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const allRoutes: any[] = [];

  try {
    // Acessar e autenticar
    console.log('📄 Acessando https://docs.falecomigo.ai/...');
    await page.goto('https://docs.falecomigo.ai/', { waitUntil: 'networkidle' });

    console.log('🔑 Digitando senha...');
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.fill('input[type="password"]', 'Fale@2025');

    const submitButton = await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Submit")').first();
    await submitButton.click();

    console.log('⏳ Aguardando carregamento...');
    await page.waitForTimeout(3000);

    // Extrair todas as categorias e suas rotas do menu lateral
    const categories = await page.evaluate(() => {
      const cats: any[] = [];

      // Procurar todos os links no menu de navegação
      const navLinks = document.querySelectorAll('nav a, aside a, .sidebar a, [role="navigation"] a');

      navLinks.forEach(link => {
        const text = (link as HTMLElement).innerText?.trim();
        const href = (link as HTMLAnchorElement).href;

        if (text && href) {
          cats.push({ text, href });
        }
      });

      return cats;
    });

    console.log(`📋 Encontradas ${categories.length} categorias/páginas`);

    // Visitar cada categoria e extrair rotas
    for (let i = 0; i < Math.min(categories.length, 50); i++) { // Limitar a 50 para não demorar muito
      const category = categories[i];
      console.log(`\n🔍 [${i + 1}/${Math.min(categories.length, 50)}] Visitando: ${category.text}`);

      try {
        await page.goto(category.href, { waitUntil: 'networkidle', timeout: 10000 });
        await page.waitForTimeout(1000);

        // Extrair informações da rota desta página
        const routeInfo = await page.evaluate(() => {
          const info: any = {
            title: '',
            method: '',
            path: '',
            description: '',
            parameters: [],
            examples: []
          };

          // Procurar título
          const title = document.querySelector('h1, h2, .title');
          info.title = title?.textContent?.trim() || '';

          // Procurar método HTTP
          const methodBadge = document.querySelector('.badge, .method, [class*="http-method"]');
          if (methodBadge) {
            const text = methodBadge.textContent || '';
            if (/POST|GET|PUT|PATCH|DELETE/.test(text)) {
              info.method = text.match(/POST|GET|PUT|PATCH|DELETE/)?.[0] || '';
            }
          }

          // Procurar path da API
          const codeBlocks = document.querySelectorAll('code, pre');
          codeBlocks.forEach(block => {
            const text = block.textContent || '';
            const match = text.match(/https:\/\/api\.falecomigo\.ai\/api\/([^\s'"]+)/);
            if (match) {
              info.path = '/api/' + match[1];
            }
          });

          // Procurar descrição
          const desc = document.querySelector('p, .description');
          info.description = desc?.textContent?.trim() || '';

          return info;
        });

        if (routeInfo.method || routeInfo.path) {
          allRoutes.push({
            category: category.text,
            ...routeInfo
          });
          console.log(`   ✅ ${routeInfo.method} ${routeInfo.path}`);
        }

      } catch (err) {
        console.log(`   ⚠️  Erro ao processar: ${err}`);
      }
    }

    // Salvar mapeamento completo
    const mapping = {
      totalRoutes: allRoutes.length,
      extractedAt: new Date().toISOString(),
      routes: allRoutes
    };

    fs.writeFileSync('MAPEAMENTO_ROTAS_FALECOMIGO.json', JSON.stringify(mapping, null, 2));
    console.log(`\n✅ Mapeamento completo salvo!`);
    console.log(`   📊 Total de rotas encontradas: ${allRoutes.length}`);
    console.log(`   💾 Arquivo: MAPEAMENTO_ROTAS_FALECOMIGO.json`);

  } catch (error) {
    console.error('❌ Erro:', error);
    await page.screenshot({ path: 'error-mapping.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

mapAllRoutes();
