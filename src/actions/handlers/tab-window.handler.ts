import type { BrowserManager } from '../../browser';
import type {
  Response,
  TabNewCommand,
  TabSwitchCommand,
  TabCloseCommand,
  WindowNewCommand,
} from '../../types';
import { successResponse } from '../../protocol';

export async function handleTabNew(
  command: TabNewCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.newTab();
  const page = browser.getPage();
  if (command.url) {
    await page.goto(command.url);
  }
  return successResponse(command.id, { created: true });
}

export async function handleTabList(command: any, browser: BrowserManager): Promise<Response> {
  const tabs = await browser.listTabs();
  return successResponse(command.id, { tabs, active: browser.getActiveIndex() });
}

export async function handleTabSwitch(
  command: TabSwitchCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.switchTo(command.index);
  return successResponse(command.id, { switched: true });
}

export async function handleTabClose(command: any, browser: BrowserManager): Promise<Response> {
  await browser.closeTab();
  return successResponse(command.id, { closed: true });
}

export async function handleWindowNew(
  command: WindowNewCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.newWindow();
  return successResponse(command.id, { created: true });
}

export async function handleWindowList(command: any, browser: BrowserManager): Promise<Response> {
  const windows = await browser.listWindows();
  return successResponse(command.id, { windows });
}
