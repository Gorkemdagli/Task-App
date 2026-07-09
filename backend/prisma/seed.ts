/**
 * Faz 1 seed verisi:
 *   - 2 tenant (Acme Corp, Globex Inc)
 *   - Her tenant'ta 2 takım (Engineering, Design)
 *   - Her tenant'ta 5 kullanıcı (1 companyAdmin, 1 teamAdmin, 3 member)
 *   - Her takımda 5-6 görev (toplam ~10 per tenant)
 *   - Bazı görevlerde 2-3 yorum
 *   - Her takımda 1 kanal + 2-3 mesaj
 *   - Her kullanıcıda 1-2 okunmamış bildirim
 *
 * Tenant context'ini SET LOCAL ile aktif eder → RLS geçer.
 *
 * Çalıştırma: `npm run seed`
 */

import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// 5-char displayId üretir (ör. P0000 ... P0009).
// Seed'de deterministik — re-runnable olması için count'a değil, parametreye dayanır.
function seedDisplayId(i: number): string {
  return `P${i.toString().padStart(4, '0')}`;
}

// Tenant ID'ler sabit (re-runnable). Child ID'ler (user, team, channel) her seed'de randomUUID
// ile üretilir — re-runnable değil ama duplicate ID sorunu yok. Email'ler hardcoded unique.
const TENANT_A = {
  id: '00000000-0000-0000-0000-00000000000a',
  name: 'Acme Corp',
  slug: 'acme',
};
const TENANT_B = {
  id: '00000000-0000-0000-0000-00000000000b',
  name: 'Globex Inc',
  slug: 'globex',
};

async function truncate() {
  // Sıra önemli: FK bağımlılıkları
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

async function seedTenant(
  tenant: { id: string; name: string; slug: string },
  companyAdminEmail: string,
  seedIndex: number,
) {
  // CompanyAdmin ID random — auth'da da kullanılacak Faz 2'de (Faz 2'de sabit ID'ye geçiş)
  const companyAdminId = randomUUID();
  const teamAdminId = randomUUID();
  const memberIds = [randomUUID(), randomUUID(), randomUUID()];

  // Admin prisma (BYPASSRLS) — seed RLS politikalarını atlar, authenticated GRANT'larına bağlı değil
  // Tenant
  await prisma.tenant.create({ data: tenant });

  // Users
  await prisma.user.createMany({
    data: [
      {
        id: companyAdminId,
        tenantId: tenant.id,
        email: companyAdminEmail,
        fullName: `${tenant.name} Admin`,
        passwordHash: '$2b$12$0000000000000000000000000000000000000000000000000000000',
        displayId: seedDisplayId(seedIndex + 0),
        role: 'companyAdmin',
      },
      {
        id: teamAdminId,
        tenantId: tenant.id,
        email: `teamadmin-${tenant.slug}@test.com`,
        fullName: 'Team Admin',
        passwordHash: '$2b$12$0000000000000000000000000000000000000000000000000000000',
        displayId: seedDisplayId(seedIndex + 1),
        role: 'teamAdmin',
      },
      {
        id: memberIds[0],
        tenantId: tenant.id,
        email: `member1-${tenant.slug}@test.com`,
        fullName: 'Member 1',
        passwordHash: '$2b$12$0000000000000000000000000000000000000000000000000000000',
        displayId: seedDisplayId(seedIndex + 2),
        role: 'member',
      },
      {
        id: memberIds[1],
        tenantId: tenant.id,
        email: `member2-${tenant.slug}@test.com`,
        fullName: 'Member 2',
        passwordHash: '$2b$12$0000000000000000000000000000000000000000000000000000000',
        displayId: seedDisplayId(seedIndex + 3),
        role: 'member',
      },
      {
        id: memberIds[2],
        tenantId: tenant.id,
        email: `member3-${tenant.slug}@test.com`,
        fullName: 'Member 3',
        passwordHash: '$2b$12$0000000000000000000000000000000000000000000000000000000',
        displayId: seedDisplayId(seedIndex + 4),
        role: 'member',
      },
    ],
  });

  // Teams
  const engineeringTeamId = randomUUID();
  const designTeamId = randomUUID();
  await prisma.team.createMany({
    data: [
      {
        id: engineeringTeamId,
        tenantId: tenant.id,
        name: 'Engineering',
        description: 'Engineering team',
      },
      { id: designTeamId, tenantId: tenant.id, name: 'Design', description: 'Design team' },
    ],
  });

  // Team members
  await prisma.teamMember.createMany({
    data: [
      { teamId: engineeringTeamId, userId: teamAdminId, role: 'teamAdmin' },
      { teamId: engineeringTeamId, userId: memberIds[0], role: 'member' },
      { teamId: engineeringTeamId, userId: memberIds[1], role: 'member' },
      { teamId: designTeamId, userId: teamAdminId, role: 'teamAdmin' },
      { teamId: designTeamId, userId: memberIds[2], role: 'member' },
    ],
  });

  // Tasks — Engineering: 6, Design: 4 (toplam 10 per tenant)
  const tasks: Prisma.TaskCreateManyInput[] = [];
  for (let i = 1; i <= 6; i++) {
    tasks.push({
      teamId: engineeringTeamId,
      title: `Engineering Task ${i}`,
      description: `Description for engineering task ${i}`,
      status: i <= 3 ? 'todo' : i <= 5 ? 'in_progress' : 'done',
      priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'low' : 'medium',
      assignerId: companyAdminId,
      assigneeId: i % 2 === 0 ? memberIds[0] : memberIds[1],
    });
  }
  for (let i = 1; i <= 4; i++) {
    tasks.push({
      teamId: designTeamId,
      title: `Design Task ${i}`,
      description: null,
      status: i <= 2 ? 'todo' : 'in_progress',
      priority: 'medium',
      assignerId: companyAdminId,
      assigneeId: memberIds[2],
    });
  }
  await prisma.task.createMany({ data: tasks });

  // Channels + messages
  const engChannelId = randomUUID();
  const designChannelId = randomUUID();
  await prisma.channel.createMany({
    data: [
      { id: engChannelId, teamId: engineeringTeamId, name: 'engineering', type: 'team' },
      { id: designChannelId, teamId: designTeamId, name: 'design', type: 'team' },
    ],
  });

  await prisma.message.createMany({
    data: [
      { channelId: engChannelId, senderId: companyAdminId, body: 'Welcome to Engineering!' },
      { channelId: engChannelId, senderId: teamAdminId, body: 'Sprint planning Cuma.' },
      { channelId: engChannelId, senderId: memberIds[0], body: 'Sounds good.' },
      { channelId: designChannelId, senderId: companyAdminId, body: 'Design review başlıyor.' },
    ],
  });

  // Notifications (1-2 per user)
  await prisma.notification.createMany({
    data: [
      {
        userId: memberIds[0],
        type: 'task_assigned',
        payload: { taskTitle: 'Engineering Task 2' },
      },
      {
        userId: memberIds[1],
        type: 'task_assigned',
        payload: { taskTitle: 'Engineering Task 1' },
      },
      { userId: memberIds[2], type: 'message_received', payload: { from: 'Company Admin' } },
      {
        userId: teamAdminId,
        type: 'task_commented',
        payload: { taskTitle: 'Engineering Task 5' },
      },
    ],
  });

  // Comments (2 per task — ilk 2 task'a)
  const firstTwoTasks = await prisma.task.findMany({ take: 2, orderBy: { createdAt: 'asc' } });
  for (const task of firstTwoTasks) {
    await prisma.taskComment.createMany({
      data: [
        { taskId: task.id, authorId: companyAdminId, body: `Initial comment on ${task.title}` },
        { taskId: task.id, authorId: teamAdminId, body: `Follow-up on ${task.title}` },
      ],
    });
  }
}

async function main() {
  console.log('🧹 Mevcut veri temizleniyor...');
  await truncate();

  console.log('🌱 Tenant A seed ediliyor...');
  await seedTenant(TENANT_A, 'admin@acme.test', 0);

  console.log('🌱 Tenant B seed ediliyor...');
  await seedTenant(TENANT_B, 'admin@globex.test', 5);

  // Counts
  const tenantCount = await prisma.tenant.count();
  const userCount = await prisma.user.count();
  const taskCount = await prisma.task.count();
  console.log(
    `\n📊 Seed tamamlandı: ${tenantCount} tenant, ${userCount} kullanıcı, ${taskCount} görev`,
  );
  console.log('   (Beklenen: 2 tenant, 10 kullanıcı, 20 görev)');
}

main()
  .catch((err) => {
    console.error('Seed hatası:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
