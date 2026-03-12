import type { Page } from 'playwright-core';

/**
 * Execute console.log in the browser context instead of the terminal
 * This allows logs to appear in the browser's DevTools console
 */
export function browserLog(page: Page): {
  log: (...messages: any[]) => Promise<void>;
  info: (...messages: any[]) => Promise<void>;
  warn: (...messages: any[]) => Promise<void>;
  error: (...messages: any[]) => Promise<void>;
} {
  const logInBrowser = async (
    messages: any[],
    logLevel: 'log' | 'info' | 'warn' | 'error' = 'log'
  ): Promise<void> => {
    switch (logLevel) {
      case 'info':
        await page.evaluate(({ messages }) => console.info(messages), { messages });
        break;
      case 'warn':
        await page.evaluate(({ messages }) => console.warn(messages), { messages });
        break;
      case 'error':
        await page.evaluate(({ messages }) => console.error(messages), { messages });
        break;
      default:
        await page.evaluate(({ messages }) => console.log(messages), { messages });
        break;
    }
  };

  return {
    log: (...messages: any[]) => logInBrowser(messages, 'log'),
    info: (...messages: any[]) => logInBrowser(messages, 'info'),
    warn: (...messages: any[]) => logInBrowser(messages, 'warn'),
    error: (...messages: any[]) => logInBrowser(messages, 'error'),
  };
}
