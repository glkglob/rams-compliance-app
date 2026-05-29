import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getAppBaseUrl, isQStashConfigured } from '../document-queue';

const URL_KEYS = ['APP_URL', 'NEXT_PUBLIC_APP_URL', 'RAILWAY_PUBLIC_DOMAIN', 'VERCEL_URL'];

describe('getAppBaseUrl', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [...URL_KEYS, 'QSTASH_TOKEN']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('prefers an explicit APP_URL and strips a trailing slash', () => {
    process.env.APP_URL = 'https://app.example.com/';
    expect(getAppBaseUrl()).toBe('https://app.example.com');
  });

  it('derives https URL from RAILWAY_PUBLIC_DOMAIN', () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = 'rams.up.railway.app';
    expect(getAppBaseUrl()).toBe('https://rams.up.railway.app');
  });

  it('throws when no base URL can be determined', () => {
    expect(() => getAppBaseUrl()).toThrow();
  });

  it('reports QStash configuration from QSTASH_TOKEN', () => {
    expect(isQStashConfigured()).toBe(false);
    process.env.QSTASH_TOKEN = 'token';
    expect(isQStashConfigured()).toBe(true);
  });
});
