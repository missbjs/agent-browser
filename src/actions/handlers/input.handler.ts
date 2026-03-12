import type { BrowserManager } from '../../browser';
import type {
  Response,
  KeyboardCommand,
  WheelCommand,
  TapCommand,
  InputMouseCommand,
  InputKeyboardCommand,
  InputTouchCommand,
} from '../../types';
import { successResponse } from '../../protocol';

export async function handleKeyboard(
  command: KeyboardCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.keys) {
    await page.keyboard.press(command.keys);
  } else if (command.text) {
    await page.keyboard.type(command.text, { delay: command.delay });
  }

  return successResponse(command.id, { pressed: true });
}

export async function handleWheel(
  command: WheelCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.mouse.wheel(command.deltaX ?? 0, command.deltaY ?? 0);
  return successResponse(command.id, { scrolled: true });
}

export async function handleTap(command: TapCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.tap(command.selector);
  return successResponse(command.id, { tapped: true });
}

export async function handleInputMouse(
  command: InputMouseCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.injectMouseEvent({
    type: command.type,
    x: command.x,
    y: command.y,
    button: command.button,
    clickCount: command.clickCount,
    deltaX: command.deltaX,
    deltaY: command.deltaY,
    modifiers: command.modifiers,
  });
  return successResponse(command.id, { injected: true });
}

export async function handleInputKeyboard(
  command: InputKeyboardCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.type === 'keyDown' && command.key) {
    await page.keyboard.down(command.key);
  } else if (command.type === 'keyUp' && command.key) {
    await page.keyboard.up(command.key);
  } else if (command.type === 'char' && command.text) {
    await page.keyboard.type(command.text);
  }

  return successResponse(command.id, { done: true });
}

export async function handleInputTouch(
  command: InputTouchCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.touchPoints && command.touchPoints.length > 0) {
    const point = command.touchPoints[0];
    await page.touchscreen.tap(point.x, point.y);
  }

  return successResponse(command.id, { tapped: true });
}
