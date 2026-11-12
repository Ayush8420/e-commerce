import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

describe('NestJS AppModule dependency injection', () => {
  const prevSkip = process.env.SKIP_INFRA_BOOT;

  beforeAll(() => {
    process.env.SKIP_INFRA_BOOT = 'true';
  });

  afterAll(() => {
    process.env.SKIP_INFRA_BOOT = prevSkip;
  });

  it('compiles AppModule with all controllers, services, and Kafka consumers wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});

