import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import {
  createTeam as createTeamService,
  listTeams as listTeamsService,
  getTeam as getTeamService,
  addMemberByDisplayId as addMemberByDisplayIdService,
  removeMember as removeMemberService,
} from '../services/teams.service';
import { register } from '../services/auth.service';
import { AppError } from '../middleware/errorHandler';
import { withTenantContext } from '../db/withTenant';

async function cleanDb() {
  await prisma.teamMember.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.message.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const bk = await redis.keys('blacklist:jti:*');
  if (bk.length) await redis.del(...bk);
  const sk = await redis.keys('session:*');
  if (sk.length) await redis.del(...sk);
}

type Actor = { id: string; role: 'companyAdmin' | 'teamAdmin' | 'member'; tenantId: string | null };

async function inTenant<T>(
  actor: Actor,
  work: (db: Parameters<typeof withTenantContext>[2]) => Promise<T>,
) {
  if (!actor.tenantId) return work(undefined as never);
  return withTenantContext(actor.id, actor.tenantId, work);
}

const createTeam = (input: Parameters<typeof createTeamService>[1], actor: Actor) =>
  inTenant(actor, (db) => createTeamService(db, input, actor));
const listTeams = (actor: Actor) =>
  actor.tenantId ? inTenant(actor, (db) => listTeamsService(db, actor)) : Promise.resolve([]);
const getTeam = (teamId: string, actor: Actor) =>
  inTenant(actor, (db) => getTeamService(db, teamId, actor));
const addMemberByDisplayId = (teamId: string, displayId: string, actor: Actor) =>
  inTenant(actor, (db) => addMemberByDisplayIdService(db, teamId, displayId, actor));
const removeMember = (teamId: string, userId: string, actor: Actor) =>
  inTenant(actor, (db) => removeMemberService(db, teamId, userId, actor));

async function makeAdmin(email: string, tenantName?: string) {
  const r = await register({
    fullName: 'Admin',
    email,
    password: 'hunter22',
    companyName: tenantName,
  });
  return r.user as Actor;
}

async function makeMember(email: string, tenantId: string) {
  const r = await register({ fullName: 'Member', email, password: 'hunter22' });
  // Üye oluşturulan user'ı verilen tenant'a taşı (farklı tenant senaryosu için).
  await prisma.user.update({ where: { id: r.user.id }, data: { tenantId, role: 'member' } });
  return { ...r.user, role: 'member' as const, tenantId };
}

describe('createTeam', () => {
  beforeEach(cleanDb);

  it('admin creates team (201 equivalent)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const t = await createTeam({ name: 'Engineering' }, admin);
    expect(t.name).toBe('Engineering');
    expect(t.tenantId).toBe(admin.tenantId);
    expect(t.memberCount).toBe(0);
  });

  it('member forbidden (403)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    await expect(createTeam({ name: 'X' }, member)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('listTeams', () => {
  beforeEach(cleanDb);

  it('admin sees all tenant teams', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    await createTeam({ name: 'T1' }, admin);
    await createTeam({ name: 'T2' }, admin);
    const list = await listTeams(admin);
    expect(list.map((t) => t.name).sort()).toEqual(['T1', 'T2']);
  });

  it('member sees only teams they belong to', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const t1 = await createTeam({ name: 'T1' }, admin);
    await createTeam({ name: 'T2' }, admin);
    // Add member to T1
    await prisma.teamMember.create({
      data: { teamId: t1.id, userId: member.id, role: 'member' },
    });
    const list = await listTeams(member);
    expect(list.map((t) => t.name)).toEqual(['T1']);
  });

  it('cross-tenant member sees nothing', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    await createTeam({ name: 'Hidden' }, admin);
    const outsider = await makeAdmin('out@b.com', 'Globex');
    const list = await listTeams(outsider);
    expect(list).toEqual([]);
  });

  it('tenantless user sees no teams', async () => {
    // tenantless user = register without companyName → tenantId: null
    const r = await register({ fullName: 'Solo', email: 'solo@x.com', password: 'hunter22' });
    expect(r.user.tenantId).toBeNull();
    const list = await listTeams(r.user);
    expect(list).toEqual([]);
  });
});

describe('getTeam', () => {
  beforeEach(cleanDb);

  it('member sees own team with members and taskCount=0', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await prisma.teamMember.create({
      data: { teamId: t.id, userId: member.id, role: 'member' },
    });
    const detail = await getTeam(t.id, member);
    expect(detail.members).toHaveLength(1);
    expect(detail.taskCount).toBe(0);
  });

  it('admin sees team they are not a member of', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    // other: kişisel tenant, sonra admin'in tenant'ına taşı
    const otherRaw = await makeAdmin('other@a.com');
    await prisma.user.update({ where: { id: otherRaw.id }, data: { tenantId: admin.tenantId } });
    // Actor tipi için tenantId'yi tazele
    const other: Actor = { ...otherRaw, tenantId: admin.tenantId };
    const t = await createTeam({ name: 'Eng' }, admin);
    const detail = await getTeam(t.id, other);
    expect(detail.name).toBe('Eng');
  });

  it('cross-tenant returns 404 (not 403, to avoid info leak)', async () => {
    const a = await makeAdmin('a@a.com', 'Acme');
    const b = await makeAdmin('b@b.com', 'Globex');
    const t = await createTeam({ name: 'A-Team' }, a);
    await expect(getTeam(t.id, b)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('member not in team returns 403', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await expect(getTeam(t.id, member)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('addMemberByDisplayId', () => {
  beforeEach(cleanDb);

  it('admin adds member by displayId (201 equivalent)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    const m = await addMemberByDisplayId(t.id, member.displayId, admin);
    expect(m.userId).toBe(member.id);
    expect(m.role).toBe('member');
  });

  it('member forbidden (403)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const other = await makeMember('o@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await expect(addMemberByDisplayId(t.id, other.displayId, member)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('unknown displayId → 404', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const t = await createTeam({ name: 'Eng' }, admin);
    await expect(addMemberByDisplayId(t.id, 'ZZZZZ', admin)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('cross-tenant displayId → 404', async () => {
    const a = await makeAdmin('a@a.com', 'Acme');
    const b = await makeAdmin('b@b.com', 'Globex');
    const tA = await createTeam({ name: 'TA' }, a);
    await expect(addMemberByDisplayId(tA.id, b.displayId, a)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('duplicate add → 409', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await addMemberByDisplayId(t.id, member.displayId, admin);
    await expect(addMemberByDisplayId(t.id, member.displayId, admin)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('tenantless user is transferred to admin tenant on add', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    // tenantless user (register without companyName → tenantId: null)
    const r = await register({ fullName: 'Solo', email: 'solo@x.com', password: 'hunter22' });
    expect(r.user.tenantId).toBeNull();
    const t = await createTeam({ name: 'Eng' }, admin);
    const m = await addMemberByDisplayId(t.id, r.user.displayId, admin);
    expect(m.userId).toBe(r.user.id);
    // User'ın tenantId'si artık admin tenant'ı
    const updated = await prisma.user.findUnique({ where: { id: r.user.id } });
    expect(updated?.tenantId).toBe(admin.tenantId);
  });

  it('per-team teamAdmin (TeamMember.role=teamAdmin) can add (User.role=member)', async () => {
    // JWT'de User.role=member, ama bu takımda TeamMember.role=teamAdmin → yetkili.
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const teamAdmin = await makeMember('ta@a.com', admin.tenantId);
    const newcomer = await makeMember('new@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await prisma.teamMember.create({
      data: { teamId: t.id, userId: teamAdmin.id, role: 'teamAdmin' },
    });
    const m = await addMemberByDisplayId(t.id, newcomer.displayId, {
      id: teamAdmin.id,
      role: 'member',
      tenantId: teamAdmin.tenantId,
    });
    expect(m.userId).toBe(newcomer.id);
  });

  it('per-team teamAdmin of OTHER team cannot add (403)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const teamAdmin = await makeMember('ta@a.com', admin.tenantId);
    const newcomer = await makeMember('new@a.com', admin.tenantId);
    const tA = await createTeam({ name: 'A' }, admin);
    const tB = await createTeam({ name: 'B' }, admin);
    // teamAdmin sadece tB'de admin
    await prisma.teamMember.create({
      data: { teamId: tB.id, userId: teamAdmin.id, role: 'teamAdmin' },
    });
    await expect(
      addMemberByDisplayId(tA.id, newcomer.displayId, {
        id: teamAdmin.id,
        role: 'member',
        tenantId: teamAdmin.tenantId,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('removeMember', () => {
  beforeEach(cleanDb);

  it('admin removes member (204 equivalent)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await prisma.teamMember.create({
      data: { teamId: t.id, userId: member.id, role: 'member' },
    });
    await removeMember(t.id, member.id, admin);
    const after = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: t.id, userId: member.id } },
    });
    expect(after).toBeNull();
  });

  it('member forbidden (403)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await prisma.teamMember.create({
      data: { teamId: t.id, userId: member.id, role: 'member' },
    });
    const other = await makeMember('o@a.com', admin.tenantId);
    await expect(removeMember(t.id, member.id, other)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('not a member → 404', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await expect(removeMember(t.id, member.id, admin)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('cross-tenant team → 404', async () => {
    const a = await makeAdmin('a@a.com', 'Acme');
    const b = await makeAdmin('b@b.com', 'Globex');
    const tA = await createTeam({ name: 'TA' }, a);
    await expect(removeMember(tA.id, a.id, b)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('per-team teamAdmin can remove member (User.role=member)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const teamAdmin = await makeMember('ta@a.com', admin.tenantId);
    const target = await makeMember('m@a.com', admin.tenantId);
    const t = await createTeam({ name: 'Eng' }, admin);
    await prisma.teamMember.create({
      data: { teamId: t.id, userId: teamAdmin.id, role: 'teamAdmin' },
    });
    await prisma.teamMember.create({
      data: { teamId: t.id, userId: target.id, role: 'member' },
    });
    await removeMember(t.id, target.id, {
      id: teamAdmin.id,
      role: 'member',
      tenantId: teamAdmin.tenantId,
    });
    const after = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: t.id, userId: target.id } },
    });
    expect(after).toBeNull();
  });
});

describe('AppError shape', () => {
  it('keeps statusCode and code', async () => {
    const e = new AppError(418, 'test', 'TEAPOT');
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('TEAPOT');
  });
});
