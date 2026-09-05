import { expect, type Page } from '@playwright/test';

/** Opens the visual page for a document and waits for its first frame. */
export async function openDocument(
  page: Page,
  assets: string,
  document: object,
  camera?: object,
  lighting?: string | object,
): Promise<string> {
  const params = new URLSearchParams({ assets, doc: JSON.stringify(document) });
  if (camera) params.set('camera', JSON.stringify(camera));
  if (lighting)
    params.set('lighting', typeof lighting === 'string' ? lighting : JSON.stringify(lighting));
  await page.goto(`/visual.html?${params.toString()}`);
  const status = page.locator('#status');
  await expect(status).toHaveAttribute('data-ready', 'true');
  const error = await status.getAttribute('data-error');
  expect(error, 'the viewer reported an error').toBeNull();
  return (await status.textContent()) ?? '';
}
