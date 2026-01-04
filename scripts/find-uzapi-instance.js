const UAZAPI_URL = 'https://quayer.uazapi.com';
const UAZAPI_ADMIN_TOKEN = 'm04FjGogNfB6faw5jMr2T89cHdQVOb6nyPanIzS20A2FzTbtn6';
const OWNER_PHONE = '5541936180403';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`     BUSCANDO INSTÂNCIA UZAPI COM NÚMERO ${OWNER_PHONE}        `);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const res = await fetch(`${UAZAPI_URL}/instance/all`, {
    headers: { 'admintoken': UAZAPI_ADMIN_TOKEN }
  });

  if (!res.ok) {
    console.log('❌ Erro:', res.status);
    return;
  }

  const data = await res.json();
  const instances = data.data || data.instances || data || [];

  console.log(`Total de instâncias: ${instances.length}\n`);

  // Procurar pela instância com esse número
  const found = instances.find(i =>
    i.profileName?.includes('936180403') ||
    i.name?.includes('936180403') ||
    i.phone?.includes('936180403') ||
    i.id?.includes('936180403')
  );

  if (found) {
    console.log('✅ INSTÂNCIA ENCONTRADA:');
    console.log(JSON.stringify(found, null, 2));
  } else {
    console.log('⚠️ Nenhuma instância com esse número exato encontrado.');
    console.log('\n📋 Listando todas as instâncias conectadas:\n');

    const connected = instances.filter(i => i.status === 'connected');
    connected.forEach((inst, i) => {
      console.log(`${i+1}. ${inst.name || inst.instanceName}`);
      console.log(`   ID: ${inst.id}`);
      console.log(`   Token: ${inst.token?.substring(0, 30)}...`);
      console.log(`   Profile: ${inst.profileName || 'N/A'}`);
      console.log(`   Phone: ${inst.phone || 'N/A'}`);
      console.log('');
    });

    console.log('\n💡 O número 5541936180403 pode ser de uma instância:');
    console.log('   - Desconectada');
    console.log('   - Em outro provedor (Cloud API, não UZAPI)');
    console.log('   - Com outro nome/profile');
  }
}

main().catch(console.error);
