import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { UserRole } from '@prisma/client';
import ts from 'typescript';

export function loadMergeModule<T>(file: string, dependencies: Record<string, unknown>): T {
  const filename = resolve(file);
  const require = createRequire(filename);
  const exports = {};
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    exports, process, Date,
    require: (name: string) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
  });
  return exports as T;
}

export const redirectForTest = (url: string): never => { throw new Error(`redirect:${url}`); };

export function loadMergeAuth(role: UserRole | null, isActive = true) {
  return loadMergeModule<typeof import('../../lib/auth')>('lib/auth.ts', {
    './prisma': { prisma: { userSession: { findFirst: async () =>
      role && isActive ? { user: { id: 'authenticated-actor', role, isActive } } : null,
    } } },
    './userActivity': { recordUserActivity: async () => { throw new Error('unexpected activity write'); } },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'test-session' }) }) },
    'next/navigation': { redirect: redirectForTest },
  });
}

export function loadMergeService(db: object, role: UserRole | null = UserRole.PLATFORM_ADMIN, isActive = true) {
  return loadMergeModule<typeof import('../../lib/wholesaleAccountMerge')>('lib/wholesaleAccountMerge.ts', {
    './auth': loadMergeAuth(role, isActive),
    './prisma': { prisma: db },
  });
}

