import { describe, expect, it } from 'vitest';
import { isLocalTestDatabaseUrl, isLocalTestRedisUrl } from '../../test/globalSetup';

describe('test environment target guards', () => {
  it('accepts only the loopback test database target', () => {
    expect(isLocalTestDatabaseUrl('postgresql://postgres:taskflow@localhost:5433/taskflow_test')).toBe(
      true,
    );
    expect(isLocalTestDatabaseUrl('postgres://postgres:taskflow@127.0.0.1:5433/taskflow_test')).toBe(
      true,
    );
    expect(isLocalTestDatabaseUrl('postgresql://postgres:taskflow@[::1]:5433/taskflow_test')).toBe(
      true,
    );
    expect(
      isLocalTestDatabaseUrl('postgresql://postgres:taskflow@localhost:5433/taskflow_test?schema=public'),
    ).toBe(true);
  });

  it('rejects remote, wrong database, wrong port, and connection target overrides', () => {
    const testDatabase = 'postgresql://postgres:taskflow@localhost:5433/taskflow_test';
    const remoteDirectUrl =
      'postgresql://taskflow_test:localhost:5433@production.example/production?host=localhost&port=5433&dbname=taskflow_test';

    expect(isLocalTestDatabaseUrl(testDatabase)).toBe(true);
    expect(isLocalTestDatabaseUrl(remoteDirectUrl)).toBe(false);
    expect(isLocalTestDatabaseUrl('postgresql://localhost:5432/taskflow_test')).toBe(false);
    expect(isLocalTestDatabaseUrl('postgresql://localhost:5433/production?dbname=taskflow_test')).toBe(
      false,
    );
    expect(isLocalTestDatabaseUrl('postgresql://localhost:5433/production?database=taskflow_test')).toBe(
      false,
    );
    expect(isLocalTestDatabaseUrl('postgresql://localhost:5433/production?db=taskflow_test')).toBe(
      false,
    );
    expect(isLocalTestDatabaseUrl('not-a-database-url')).toBe(false);
  });

  it('accepts only loopback Redis on the test port', () => {
    expect(isLocalTestRedisUrl('redis://localhost:6380')).toBe(true);
    expect(isLocalTestRedisUrl('redis://127.0.0.1:6380')).toBe(true);
    expect(isLocalTestRedisUrl('redis://[::1]:6380')).toBe(true);
    expect(isLocalTestRedisUrl('redis://6380:6380@production.example/0?host=localhost')).toBe(false);
    expect(isLocalTestRedisUrl('redis://localhost:6379')).toBe(false);
    expect(isLocalTestRedisUrl('not-a-redis-url')).toBe(false);
  });
});
