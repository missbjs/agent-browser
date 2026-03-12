import type { BrowserManager } from '../../browser';
import type {
  Response,
  GetByRoleCommand,
  GetByTextCommand,
  GetByLabelCommand,
  GetByPlaceholderCommand,
  GetAttributeCommand,
  GetTextCommand,
  IsVisibleCommand,
  IsEnabledCommand,
  IsCheckedCommand,
  CountCommand,
  BoundingBoxCommand,
  StylesCommand,
  GetByAltTextCommand,
  GetByTitleCommand,
  GetByTestIdCommand,
} from '../../types';
import { successResponse, errorResponse } from '../../protocol';

export async function handleGetByRole(
  command: GetByRoleCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = page.getByRole(command.role as any, { name: command.name, exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
    case 'check':
      await locator.check();
      return successResponse(command.id, { checked: true });
    case 'hover':
      await locator.hover();
      return successResponse(command.id, { hovered: true });
  }
}

export async function handleGetByText(
  command: GetByTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = page.getByText(command.text, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'hover':
      await locator.hover();
      return successResponse(command.id, { hovered: true });
  }
}

export async function handleGetByLabel(
  command: GetByLabelCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = page.getByLabel(command.label, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
    case 'check':
      await locator.check();
      return successResponse(command.id, { checked: true });
  }
}

export async function handleGetByPlaceholder(
  command: GetByPlaceholderCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = page.getByPlaceholder(command.placeholder, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
  }
}

export async function handleGetAttribute(
  command: GetAttributeCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const value = await page.locator(command.selector).getAttribute(command.attribute);
  return successResponse(command.id, { value });
}

export async function handleGetText(
  command: GetTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const text = await page.locator(command.selector).innerText();
  return successResponse(command.id, { text });
}

export async function handleIsVisible(
  command: IsVisibleCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const visible = await page.locator(command.selector).isVisible();
  return successResponse(command.id, { visible });
}

export async function handleIsEnabled(
  command: IsEnabledCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const enabled = await page.locator(command.selector).isEnabled();
  return successResponse(command.id, { enabled });
}

export async function handleIsChecked(
  command: IsCheckedCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const checked = await page.locator(command.selector).isChecked();
  return successResponse(command.id, { checked });
}

export async function handleCount(
  command: CountCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const count = await page.locator(command.selector).count();
  return successResponse(command.id, { count });
}

export async function handleBoundingBox(
  command: BoundingBoxCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const box = await page.locator(command.selector).boundingBox();
  return successResponse(command.id, { box });
}

export async function handleStyles(
  command: StylesCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const styles = await page.locator(command.selector).evaluate((el) => {
    return window.getComputedStyle(el as any);
  });
  return successResponse(command.id, { styles });
}

export async function handleGetByAltText(
  command: GetByAltTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = page.getByAltText(command.text, { exact: command.exact });

  if (command.subaction === 'click') {
    await locator.click();
    return successResponse(command.id, { clicked: true });
  } else if (command.subaction === 'hover') {
    await locator.hover();
    return successResponse(command.id, { hovered: true });
  }

  return successResponse(command.id, { found: true });
}

export async function handleGetByTitle(
  command: GetByTitleCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = page.getByTitle(command.text, { exact: command.exact });

  if (command.subaction === 'click') {
    await locator.click();
    return successResponse(command.id, { clicked: true });
  } else if (command.subaction === 'hover') {
    await locator.hover();
    return successResponse(command.id, { hovered: true });
  }

  return successResponse(command.id, { found: true });
}

export async function handleGetByTestId(
  command: GetByTestIdCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = page.getByTestId(command.testId);

  if (command.subaction === 'click') {
    await locator.click();
    return successResponse(command.id, { clicked: true });
  } else if (command.subaction === 'hover') {
    await locator.hover();
    return successResponse(command.id, { hovered: true });
  }

  return successResponse(command.id, { found: true });
}
