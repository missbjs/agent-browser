import type { BrowserManager } from '../../browser';
import type {
  Response,
  ClickCommand,
  TypeCommand,
  PressCommand,
  FillCommand,
  CheckCommand,
  UncheckCommand,
  HoverCommand,
  ScrollCommand,
} from '../../types';
import { successResponse } from '../../protocol';
import { toAIFriendlyError } from '../actions';

export async function handleClick(
  command: ClickCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector);

  try {
    if (command.newTab) {
      const fullUrl = await locator.evaluate((el) => {
        const href = el.getAttribute('href');
        return href
          ? new (globalThis as any).URL(href, (globalThis as any).document.baseURI).toString()
          : '';
      });
      if (!fullUrl) {
        throw new Error(
          `Element '${command.selector}' does not have an href attribute. --new-tab only works on links.`
        );
      }

      await browser.newTab();
      const newPage = browser.getPage();
      await newPage.goto(fullUrl);

      return successResponse(command.id, {
        clicked: true,
        newTab: true,
        url: fullUrl,
      });
    }

    await locator.click({
      button: command.button,
      clickCount: command.clickCount,
      delay: command.delay,
    });
  } catch (error) {
    throw toAIFriendlyError(error, command.selector);
  }

  return successResponse(command.id, { clicked: true });
}

export async function handleType(command: TypeCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector);

  try {
    if (command.clear) {
      await locator.fill('');
    }

    await locator.pressSequentially(command.text, {
      delay: command.delay,
    });
  } catch (error) {
    throw toAIFriendlyError(error, command.selector);
  }

  return successResponse(command.id, { typed: true });
}

export async function handlePress(
  command: PressCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.selector) {
    await page.press(command.selector, command.key);
  } else {
    await page.keyboard.press(command.key);
  }

  return successResponse(command.id, { pressed: true });
}

export async function handleFill(command: FillCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector);
  await locator.fill(command.value);
  return successResponse(command.id, { filled: true });
}

export async function handleCheck(
  command: CheckCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector);
  await locator.check();
  return successResponse(command.id, { checked: true });
}

export async function handleUncheck(
  command: UncheckCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector);
  await locator.uncheck();
  return successResponse(command.id, { unchecked: true });
}

export async function handleHover(
  command: HoverCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector);
  await locator.hover();
  return successResponse(command.id, { hovered: true });
}

export async function handleScroll(
  command: ScrollCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.selector) {
    const locator = browser.getLocator(command.selector);
    await locator.evaluate(
      (el, { x, y }) => {
        el.scrollTop = y ?? el.scrollTop;
        el.scrollLeft = x ?? el.scrollLeft;
      },
      { x: command.x, y: command.y }
    );
  } else {
    await page.evaluate(
      ({ x, y }) => {
        window.scrollTo(x ?? window.scrollX, y ?? window.scrollY);
      },
      { x: command.x, y: command.y }
    );
  }

  return successResponse(command.id, { scrolled: true });
}
