import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // ============================================
  // 🔐 ADMIN USER (Baseado em ENV)
  // ============================================
  // Configurações do admin via variáveis de ambiente
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@quayer.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';
  const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrator';
  const ADMIN_RECOVERY_TOKEN = process.env.ADMIN_RECOVERY_TOKEN || '123456';
  
  console.log('👤 Creating Admin user...');
  console.log(`   📧 Email: ${ADMIN_EMAIL}`);
  console.log(`   🔑 Recovery Token: ${ADMIN_RECOVERY_TOKEN}`);
  
  // Hash password for admin
  const adminPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
  
  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      // Sempre atualizar para garantir que o recovery token esteja presente
      resetToken: ADMIN_RECOVERY_TOKEN,
      resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano no futuro
      isActive: true,
      emailVerified: new Date(),
    },
    create: {
      email: ADMIN_EMAIL,
      password: adminPassword,
      name: ADMIN_NAME,
      role: 'admin',
      emailVerified: new Date(),
      isActive: true,
      onboardingCompleted: true, // Admin já fez onboarding
      resetToken: ADMIN_RECOVERY_TOKEN, // Recovery token permanente
      resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
    },
  });
  console.log(`✅ Admin user created/updated: ${adminUser.email}`);
  console.log(`   🎯 Recovery Token: ${ADMIN_RECOVERY_TOKEN}\n`);

  // ============================================
  // 🏢 ADMIN ORGANIZATION (Quayer HQ)
  // ============================================
  console.log('🏢 Creating Admin Organization...');
  
  const adminOrg = await prisma.organization.upsert({
    where: { slug: 'quayer-hq' },
    update: {},
    create: {
      name: 'Quayer HQ',
      slug: 'quayer-hq',
      document: '00.000.000/0001-00', // CNPJ fictício para admin
      type: 'pj',
      maxInstances: 999,
      maxUsers: 999,
      billingType: 'enterprise',
      isActive: true,
    },
  });
  console.log(`✅ Admin Organization created: ${adminOrg.name}`);

  // Vincular admin à organização (se ainda não vinculado)
  const adminOrgRelation = await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: adminUser.id,
        organizationId: adminOrg.id,
      },
    },
    update: {
      role: 'master',
      isActive: true,
    },
    create: {
      userId: adminUser.id,
      organizationId: adminOrg.id,
      role: 'master',
      isActive: true,
    },
  });
  console.log(`✅ Admin linked to organization`);

  // Atualizar currentOrgId do admin
  await prisma.user.update({
    where: { id: adminUser.id },
    data: {
      currentOrgId: adminOrg.id,
      onboardingCompleted: true, // Admin já completou onboarding
    },
  });
  console.log(`✅ Admin currentOrgId set to: ${adminOrg.name}\n`);

  // Hash passwords for other users
  const userPassword = await bcrypt.hash('user123456', 12);
  const masterPassword = await bcrypt.hash('master123456', 12);
  const managerPassword = await bcrypt.hash('manager123456', 12);

  // ============================================
  // 2. ORGANIZATIONS (3 total: 1 PF + 2 PJ)
  // ============================================
  console.log('🏢 Creating Organizations...');

  const org1 = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      document: '12.345.678/0001-90', // CNPJ
      type: 'pj',
      maxInstances: 10,
      maxUsers: 5,
      billingType: 'pro',
      isActive: true,
    },
  });
  console.log(`✅ Organization created: ${org1.name} (${org1.type.toUpperCase()})`);

  const org2 = await prisma.organization.upsert({
    where: { slug: 'tech-startup' },
    update: {},
    create: {
      name: 'Tech Startup Ltda',
      slug: 'tech-startup',
      document: '98.765.432/0001-10', // CNPJ
      type: 'pj',
      maxInstances: 5,
      maxUsers: 3,
      billingType: 'basic',
      isActive: true,
    },
  });
  console.log(`✅ Organization created: ${org2.name} (${org2.type.toUpperCase()})`);

  const org3 = await prisma.organization.upsert({
    where: { slug: 'joao-silva' },
    update: {},
    create: {
      name: 'João Silva',
      slug: 'joao-silva',
      document: '123.456.789-00', // CPF
      type: 'pf',
      maxInstances: 1,
      maxUsers: 1,
      billingType: 'free',
      isActive: true,
    },
  });
  console.log(`✅ Organization created: ${org3.name} (${org3.type.toUpperCase()})\n`);

  // ============================================
  // 3. USERS (5 ACME + 1 STARTUP = 6 total)
  // ============================================
  console.log('👥 Creating Users...');

  const masterUser = await prisma.user.upsert({
    where: { email: 'master@acme.com' },
    update: {},
    create: {
      email: 'master@acme.com',
      password: masterPassword,
      name: 'Master User Acme',
      role: 'user',
      currentOrgId: org1.id,
      emailVerified: new Date(),
      isActive: true,
    },
  });
  console.log(`✅ User created: ${masterUser.email}`);

  const managerUser = await prisma.user.upsert({
    where: { email: 'manager@acme.com' },
    update: {},
    create: {
      email: 'manager@acme.com',
      password: managerPassword,
      name: 'Manager User Acme',
      role: 'user',
      currentOrgId: org1.id,
      emailVerified: new Date(),
      isActive: true,
    },
  });
  console.log(`✅ User created: ${managerUser.email}`);

  const user1 = await prisma.user.upsert({
    where: { email: 'user1@acme.com' },
    update: {},
    create: {
      email: 'user1@acme.com',
      password: userPassword,
      name: 'User 1 Acme',
      role: 'user',
      currentOrgId: org1.id,
      emailVerified: new Date(),
      isActive: true,
    },
  });
  console.log(`✅ User created: ${user1.email}`);

  const user2 = await prisma.user.upsert({
    where: { email: 'user2@acme.com' },
    update: {},
    create: {
      email: 'user2@acme.com',
      password: userPassword,
      name: 'User 2 Acme',
      role: 'user',
      currentOrgId: org1.id,
      emailVerified: new Date(),
      isActive: true,
    },
  });
  console.log(`✅ User created: ${user2.email}`);

  const user3 = await prisma.user.upsert({
    where: { email: 'user3@acme.com' },
    update: {},
    create: {
      email: 'user3@acme.com',
      password: userPassword,
      name: 'User 3 Acme',
      role: 'user',
      currentOrgId: org1.id,
      emailVerified: new Date(),
      isActive: true,
    },
  });
  console.log(`✅ User created: ${user3.email}`);

  const masterStartup = await prisma.user.upsert({
    where: { email: 'master@startup.com' },
    update: {},
    create: {
      email: 'master@startup.com',
      password: masterPassword,
      name: 'Master User Startup',
      role: 'user',
      currentOrgId: org2.id,
      emailVerified: new Date(),
      isActive: true,
    },
  });
  console.log(`✅ User created: ${masterStartup.email}\n`);

  // ============================================
  // 4. USER-ORGANIZATION RELATIONSHIPS
  // ============================================
  console.log('🔗 Creating User-Organization relationships...');

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: { userId: masterUser.id, organizationId: org1.id },
    },
    update: {},
    create: {
      userId: masterUser.id,
      organizationId: org1.id,
      role: 'master',
      isActive: true,
    },
  });

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: { userId: managerUser.id, organizationId: org1.id },
    },
    update: {},
    create: {
      userId: managerUser.id,
      organizationId: org1.id,
      role: 'manager',
      isActive: true,
    },
  });

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: { userId: user1.id, organizationId: org1.id },
    },
    update: {},
    create: {
      userId: user1.id,
      organizationId: org1.id,
      role: 'user',
      isActive: true,
    },
  });

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: { userId: user2.id, organizationId: org1.id },
    },
    update: {},
    create: {
      userId: user2.id,
      organizationId: org1.id,
      role: 'user',
      isActive: true,
    },
  });

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: { userId: user3.id, organizationId: org1.id },
    },
    update: {},
    create: {
      userId: user3.id,
      organizationId: org1.id,
      role: 'user',
      isActive: true,
    },
  });

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: { userId: masterStartup.id, organizationId: org2.id },
    },
    update: {},
    create: {
      userId: masterStartup.id,
      organizationId: org2.id,
      role: 'master',
      isActive: true,
    },
  });

  console.log(`✅ 6 User-Organization relationships created\n`);

  // ============================================
  // 5. PROJECTS (3 total)
  // ============================================
  console.log('📁 Creating Projects...');

  const project1 = await prisma.project.upsert({
    where: { id: 'proj-acme-sales' },
    update: {},
    create: {
      id: 'proj-acme-sales',
      name: 'Vendas',
      description: 'Instâncias de WhatsApp para equipe de vendas',
      organizationId: org1.id,
      isActive: true,
    },
  });
  console.log(`✅ Project created: ${project1.name} (${org1.name})`);

  const project2 = await prisma.project.upsert({
    where: { id: 'proj-acme-support' },
    update: {},
    create: {
      id: 'proj-acme-support',
      name: 'Suporte',
      description: 'Instâncias de WhatsApp para suporte ao cliente',
      organizationId: org1.id,
      isActive: true,
    },
  });
  console.log(`✅ Project created: ${project2.name} (${org1.name})`);

  const project3 = await prisma.project.upsert({
    where: { id: 'proj-startup-main' },
    update: {},
    create: {
      id: 'proj-startup-main',
      name: 'Principal',
      description: 'Projeto principal da startup',
      organizationId: org2.id,
      isActive: true,
    },
  });
  console.log(`✅ Project created: ${project3.name} (${org2.name})\n`);

  // ============================================
  // 6. INSTANCES (10 total)
  // ============================================
  console.log('📱 Creating WhatsApp Instances...');

  const instances = [
    // Acme Corp - Projeto Vendas (4 instâncias)
    {
      name: 'Vendas - João',
      phoneNumber: '+5511999998881',
      organizationId: org1.id,
      projectId: project1.id,
      status: 'connected',
    },
    {
      name: 'Vendas - Maria',
      phoneNumber: '+5511999998882',
      organizationId: org1.id,
      projectId: project1.id,
      status: 'connected',
    },
    {
      name: 'Vendas - Pedro',
      phoneNumber: null,
      organizationId: org1.id,
      projectId: project1.id,
      status: 'disconnected',
    },
    {
      name: 'Vendas - Ana',
      phoneNumber: null,
      organizationId: org1.id,
      projectId: project1.id,
      status: 'disconnected',
    },

    // Acme Corp - Projeto Suporte (3 instâncias)
    {
      name: 'Suporte - Atendimento 1',
      phoneNumber: '+5511999998883',
      organizationId: org1.id,
      projectId: project2.id,
      status: 'connected',
    },
    {
      name: 'Suporte - Atendimento 2',
      phoneNumber: null,
      organizationId: org1.id,
      projectId: project2.id,
      status: 'connecting',
    },
    {
      name: 'Suporte - Emergência',
      phoneNumber: null,
      organizationId: org1.id,
      projectId: project2.id,
      status: 'disconnected',
    },

    // Tech Startup - Projeto Principal (2 instâncias)
    {
      name: 'WhatsApp Principal',
      phoneNumber: '+5511999998884',
      organizationId: org2.id,
      projectId: project3.id,
      status: 'connected',
    },
    {
      name: 'WhatsApp Backup',
      phoneNumber: null,
      organizationId: org2.id,
      projectId: project3.id,
      status: 'disconnected',
    },

    // João Silva - Pessoa Física (1 instância)
    {
      name: 'Meu WhatsApp',
      phoneNumber: '+5511999998885',
      organizationId: org3.id,
      projectId: null,
      status: 'connected',
    },
  ];

  for (const instanceData of instances) {
    const instance = await prisma.instance.create({
      data: {
        name: instanceData.name,
        phoneNumber: instanceData.phoneNumber,
        status: instanceData.status,
        organizationId: instanceData.organizationId,
        projectId: instanceData.projectId,
        brokerType: 'uazapi',
        msgDelayMin: 2,
        msgDelayMax: 4,
        lastConnected: instanceData.status === 'connected' ? new Date() : null,
      },
    });
    console.log(`✅ Instance created: ${instance.name} (${instanceData.status})`);
  }
  console.log();

  // ============================================
  // 7. INVITATIONS (2 total)
  // ============================================
  console.log('✉️  Creating Invitations...');

  const invitation1 = await prisma.invitation.upsert({
    where: { token: 'inv-token-acme-001' },
    update: {},
    create: {
      email: 'novousuario@acme.com',
      token: 'inv-token-acme-001',
      role: 'user',
      organizationId: org1.id,
      invitedById: masterUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });
  console.log(`✅ Invitation created: ${invitation1.email} → ${org1.name}`);

  const invitation2 = await prisma.invitation.upsert({
    where: { token: 'inv-token-startup-001' },
    update: {},
    create: {
      email: 'gerente@startup.com',
      token: 'inv-token-startup-001',
      role: 'manager',
      organizationId: org2.id,
      invitedById: masterStartup.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });
  console.log(`✅ Invitation created: ${invitation2.email} → ${org2.name}\n`);

  // ============================================
  // 8. AUDIT LOGS (Sample)
  // ============================================
  console.log('📝 Creating sample Audit Logs...');

  // Audit logs don't have unique constraints, so we can safely create them
  // Note: In production, you might want to clear old logs or use upsert with a unique identifier

  const existingLogs = await prisma.auditLog.count();
  if (existingLogs === 0) {
    await prisma.auditLog.create({
      data: {
        action: 'create',
        resource: 'organization',
        resourceId: org1.id,
        userId: adminUser.id,
        organizationId: org1.id,
        metadata: { name: org1.name, type: org1.type },
        ipAddress: '127.0.0.1',
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'create',
        resource: 'instance',
        resourceId: instances[0].name,
        userId: masterUser.id,
        organizationId: org1.id,
        metadata: { instanceName: instances[0].name, project: project1.name },
        ipAddress: '192.168.1.100',
      },
    });

    console.log(`✅ 2 Audit logs created\n`);
  } else {
    console.log(`ℹ️  Audit logs already exist (${existingLogs} total)\n`);
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('✨ Seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`   • 1 Admin user`);
  console.log(`   • 3 Organizations (1 PF + 2 PJ)`);
  console.log(`   • 6 Users (1 master + 1 manager + 3 users + 1 startup master)`);
  console.log(`   • 6 User-Organization relationships`);
  console.log(`   • 3 Projects`);
  console.log(`   • 10 WhatsApp Instances`);
  console.log(`   • 2 Invitations`);
  console.log(`   • 2 Audit Logs`);
  console.log();
  console.log('🔑 Login credentials (6 test users):');
  console.log('   1. admin@quayer.com / admin123456 (admin)');
  console.log('   2. master@acme.com / master123456 (master)');
  console.log('   3. manager@acme.com / manager123456 (manager)');
  console.log('   4. user1@acme.com / user123456 (user)');
  console.log('   5. user2@acme.com / user123456 (user)');
  console.log('   6. user3@acme.com / user123456 (user)');
  console.log();
  console.log('📖 View data: npx prisma studio');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
