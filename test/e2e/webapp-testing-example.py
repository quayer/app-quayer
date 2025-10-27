#!/usr/bin/env python3
"""
🎯 EXEMPLO DE USO DO SKILL WEBAPP-TESTING
Baseado no skill .cursor/skills/webapp-testing/

Este script demonstra:
- Padrão Reconnaissance-Then-Action
- Captura de console logs
- Screenshots para debugging
- Descoberta dinâmica de elementos
"""

from playwright.sync_api import sync_playwright
import os
from datetime import datetime

BASE_URL = os.getenv('BASE_URL', 'http://localhost:3000')

def save_console_logs(logs: list, filename: str):
    """Salva logs do console em arquivo"""
    os.makedirs('test-screenshots', exist_ok=True)
    path = f'test-screenshots/{filename}'
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(logs))
    print(f"📋 Console logs salvos em: {path}")
    return path

def take_reconnaissance(page, name: str):
    """
    🔍 RECONNAISSANCE PATTERN
    Inspeciona a página antes de agir
    """
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Screenshot full page
    screenshot_path = f'test-screenshots/{name}_{timestamp}.png'
    page.screenshot(path=screenshot_path, full_page=True)
    
    # Descobrir elementos interativos
    buttons = page.locator('button').all()
    links = page.locator('a').all()
    inputs = page.locator('input').all()
    
    print(f"\n🔍 Reconnaissance [{name}]:")
    print(f"  📸 Screenshot: {screenshot_path}")
    print(f"  🔘 Buttons: {len(buttons)}")
    print(f"  🔗 Links: {len(links)}")
    print(f"  📝 Inputs: {len(inputs)}")
    
    # Listar primeiros botões encontrados
    if buttons:
        print(f"\n  Primeiros botões:")
        for i, btn in enumerate(buttons[:5]):
            text = btn.text_content() or btn.get_attribute('aria-label') or 'No text'
            print(f"    {i+1}. {text[:50]}")
    
    return {
        'screenshot': screenshot_path,
        'buttons': buttons,
        'links': links,
        'inputs': inputs
    }

def test_login_page():
    """
    ✅ TESTE: Página de Login
    Demonstra o padrão completo do skill webapp-testing
    """
    console_logs = []
    
    with sync_playwright() as p:
        # Sempre usar chromium em headless mode
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        
        # Capturar console messages
        def handle_console(msg):
            log = f"[{msg.type}] {msg.text}"
            console_logs.append(log)
            if msg.type == 'error':
                print(f"🔴 Console Error: {msg.text}")
        
        page.on("console", handle_console)
        
        # Capturar erros de página
        def handle_page_error(error):
            error_msg = f"[PAGE_ERROR] {error}"
            console_logs.append(error_msg)
            print(f"🔴 Page Error: {error}")
        
        page.on("pageerror", handle_page_error)
        
        print(f"\n{'='*60}")
        print(f"🧪 Testando: {BASE_URL}/login")
        print(f"{'='*60}")
        
        # Navegar para a página
        page.goto(f'{BASE_URL}/login')
        
        # CRÍTICO: Wait for networkidle (apps dinâmicos)
        page.wait_for_load_state('networkidle')
        print("✅ Página carregada (networkidle)")
        
        # 🔍 RECONNAISSANCE: Inspecionar ANTES de agir
        recon = take_reconnaissance(page, 'login-page')
        
        # 🎯 ACTION: Usar dados da reconnaissance para agir
        if recon['inputs']:
            email_input = page.locator('input[type="email"]').first
            password_input = page.locator('input[type="password"]').first
            
            if email_input.is_visible():
                print("\n🎯 Interagindo com formulário de login...")
                email_input.fill('test@example.com')
                password_input.fill('Test@1234')
                
                # Screenshot após preencher
                page.screenshot(
                    path='test-screenshots/login-filled.png',
                    full_page=True
                )
                print("  📸 Screenshot após preencher: login-filled.png")
        
        # Salvar console logs
        if console_logs:
            log_file = save_console_logs(
                console_logs, 
                f'console-login-{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
            )
            print(f"\n📊 Total de mensagens no console: {len(console_logs)}")
        
        browser.close()
        print("\n✅ Teste concluído!")

def test_homepage():
    """
    ✅ TESTE: Homepage
    Teste simples da página inicial
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        print(f"\n{'='*60}")
        print(f"🧪 Testando: {BASE_URL}/")
        print(f"{'='*60}")
        
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')
        
        # Reconnaissance simples
        take_reconnaissance(page, 'homepage')
        
        # Verificar título
        title = page.title()
        print(f"\n📋 Título da página: {title}")
        
        browser.close()
        print("✅ Teste concluído!")

def test_admin_routes():
    """
    ✅ TESTE: Rotas Administrativas
    Testa múltiplas rotas admin
    """
    admin_routes = [
        '/admin',
        '/admin/brokers',
        '/admin/clients',
        '/admin/organizations'
    ]
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        print(f"\n{'='*60}")
        print(f"🧪 Testando {len(admin_routes)} rotas admin")
        print(f"{'='*60}")
        
        for route in admin_routes:
            print(f"\n📍 Testando: {route}")
            
            try:
                page.goto(f'{BASE_URL}{route}', timeout=10000)
                page.wait_for_load_state('networkidle', timeout=10000)
                
                # Screenshot de cada rota
                route_name = route.replace('/', '-').strip('-') or 'root'
                page.screenshot(
                    path=f'test-screenshots/admin-{route_name}.png',
                    full_page=True
                )
                
                print(f"  ✅ Rota acessível")
                
            except Exception as e:
                print(f"  ❌ Erro: {e}")
        
        browser.close()
        print("\n✅ Teste concluído!")

if __name__ == '__main__':
    # Criar diretório para screenshots
    os.makedirs('test-screenshots', exist_ok=True)
    
    print("""
    ╔════════════════════════════════════════════════════════════╗
    ║  🎯 WEBAPP-TESTING SKILL - EXEMPLOS PRÁTICOS              ║
    ║  Baseado em: .cursor/skills/webapp-testing                ║
    ╚════════════════════════════════════════════════════════════╝
    """)
    
    # Executar testes
    try:
        test_homepage()
        test_login_page()
        test_admin_routes()
        
        print(f"\n{'='*60}")
        print("🎉 TODOS OS TESTES CONCLUÍDOS!")
        print(f"{'='*60}")
        print(f"\n📸 Screenshots salvos em: test-screenshots/")
        print(f"📋 Console logs salvos em: test-screenshots/")
        
    except Exception as e:
        print(f"\n❌ Erro durante execução: {e}")
        import traceback
        traceback.print_exc()

