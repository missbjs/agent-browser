import type { BrowserManager } from '../../browser';
import type { Response, ConsoleCommand, ErrorsCommand } from '../../types';
import { successResponse } from '../../protocol';

export async function handleConsole(
  command: ConsoleCommand,
  browser: BrowserManager
): Promise<Response> {
  if (command.clear) {
    browser.clearConsoleMessages();
    return successResponse(command.id, { cleared: true });
  }

  const page = browser.getPage();
  const messages = browser.getConsoleMessages();
  return successResponse(command.id, { messages, origin: page.url() });
}

export async function handleErrors(
  command: ErrorsCommand,
  browser: BrowserManager
): Promise<Response> {
  if (command.clear) {
    browser.clearPageErrors();
    return successResponse(command.id, { cleared: true });
  }

  const page = browser.getPage();
  const errors = browser.getPageErrors();
  return successResponse(command.id, { errors, origin: page.url() });
}
