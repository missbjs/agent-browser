import type { BrowserManager } from '../../browser';
import type {
  Response,
  CookiesSetCommand,
  StorageGetCommand,
  StorageSetCommand,
  StorageClearCommand,
} from '../../types';
import { successResponse } from '../../protocol';

export async function handleCookiesGet(command: any, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  const cookies = await context.cookies(command.urls);
  return successResponse(command.id, { cookies });
}

export async function handleCookiesSet(
  command: CookiesSetCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  const pageUrl = page.url();
  const cookies = command.cookies.map((cookie) => {
    if (!cookie.url && !cookie.domain && !cookie.path) {
      return { ...cookie, url: pageUrl };
    }
    return cookie;
  });
  await context.addCookies(cookies);
  return successResponse(command.id, { set: true });
}

export async function handleCookiesClear(command: any, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  await context.clearCookies();
  return successResponse(command.id, { cleared: true });
}

export async function handleStorageGet(
  command: StorageGetCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const storageType = command.type === 'local' ? 'localStorage' : 'sessionStorage';

  if (command.key) {
    const value = await page.evaluate(`${storageType}.getItem(${JSON.stringify(command.key)})`);
    return successResponse(command.id, { key: command.key, value });
  } else {
    const all = await page.evaluate(`${storageType}`);
    return successResponse(command.id, all);
  }
}

export async function handleStorageSet(
  command: StorageSetCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const storageType = command.type === 'local' ? 'localStorage' : 'sessionStorage';
  await page.evaluate(
    `${storageType}.setItem(${JSON.stringify(command.key)}, ${JSON.stringify(command.value)})`
  );
  return successResponse(command.id, { set: true });
}

export async function handleStorageClear(
  command: StorageClearCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const storageType = command.type === 'local' ? 'localStorage' : 'sessionStorage';
  if (command.key) {
    await page.evaluate(`${storageType}.removeItem(${JSON.stringify(command.key)})`);
  } else {
    await page.evaluate(`${storageType}.clear()`);
  }
  return successResponse(command.id, { cleared: true });
}
