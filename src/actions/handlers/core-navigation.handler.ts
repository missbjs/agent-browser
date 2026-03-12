import type { BrowserManager } from '../../browser';
import type { Response, NavigateCommand, Command, NavigateData } from '../../types';
import { successResponse } from '../../protocol';

export async function handleLaunch(
  command: Command & { action: 'launch' },
  browser: BrowserManager
): Promise<Response> {
  await browser.launch(command);
  return successResponse(command.id, { launched: true });
}

export async function handleNavigate(
  command: NavigateCommand,
  browser: BrowserManager
): Promise<Response<NavigateData>> {
  browser.checkDomainAllowed(command.url);

  const page = browser.getPage();

  // If headers are provided, set up scoped headers for this origin
  if (command.headers && Object.keys(command.headers).length > 0) {
    await browser.setScopedHeaders(command.url, command.headers);
  }

  await page.goto(command.url, {
    waitUntil: command.waitUntil ?? 'load',
  });

  return successResponse(command.id, {
    url: page.url(),
    title: await page.title(),
  });
}

export async function handleClose(
  command: Command & { action: 'close' },
  browser: BrowserManager
): Promise<Response> {
  await browser.close();
  return successResponse(command.id, { closed: true });
}

export async function handleBack(
  command: Command & { action: 'back' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.goBack();
  return successResponse(command.id, { url: page.url() });
}

export async function handleForward(
  command: Command & { action: 'forward' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.goForward();
  return successResponse(command.id, { url: page.url() });
}

export async function handleReload(
  command: Command & { action: 'reload' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.reload();
  return successResponse(command.id, { url: page.url() });
}
