import { test, expect, reviewText, reviewTail } from './swipe-fixture';

test('complete Swipe text is readable through the last line without changing Library teasers', async ({ page, swipeFixture }, testInfo) => {
  await page.goto('/#content');
  const libraryPreview = page.locator('.library-text-preview').first();
  const teaser = await libraryPreview.evaluate(element => ({
    height: element.clientHeight, overflow: getComputedStyle(element).overflow,
    clamp: getComputedStyle(element).webkitLineClamp,
  }));
  expect(teaser).toEqual({ height: 44, overflow: 'hidden', clamp: '2' });
  await page.getByRole('tab', { name: 'Публикации', exact: true }).click();
  const publicationPreview = page.locator('.content-card-body > p').first();
  expect(await publicationPreview.evaluate(element => ({ height: element.clientHeight,
    overflow: getComputedStyle(element).overflow, clamp: getComputedStyle(element).webkitLineClamp }))).toEqual(teaser);
  await page.getByRole('tab', { name: 'Заготовки', exact: true }).click();
  await page.getByRole('button', { name: 'Разобрать заготовки', exact: true }).click();
  const text = page.locator('.swipe-text');
  await expect(text).toHaveText(reviewText);
  await text.scrollIntoViewIfNeeded();
  if (testInfo.project.name === 'mobile') {
    const session = await page.context().newCDPSession(page);
    // Real browser touch events exercise the nested scroll area and pointer-cancel path.
    const scrollRange = await text.evaluate(element => element.scrollHeight - element.clientHeight);
    for (let step = 0; step < Math.ceil(scrollRange / 100) + 2; step++) {
      const box = (await text.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = Math.min(box.y + box.height - 20, 800);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (const distance of [50, 100, 150]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - distance }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await session.detach();
  } else {
    await text.hover();
    await page.mouse.wheel(0, 10000);
  }
  await text.scrollIntoViewIfNeeded();
  await expect.poll(() => text.evaluate((element, tail) => {
    const node = element.firstChild!;
    const start = node.textContent!.lastIndexOf(tail);
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, node.textContent!.length);
    const last = range.getBoundingClientRect(); const box = element.getBoundingClientRect();
    return last.top >= Math.max(box.top, 0) - 1 && last.bottom <= Math.min(box.bottom, window.innerHeight) + 1;
  }, reviewTail), { message: 'Last review line must be painted inside the scroll area and viewport' }).toBe(true);
  expect(await text.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(swipeFixture.decisions, 'Reading/scrolling must not decide a card').toEqual([]);
  await testInfo.attach('full-review-last-line', { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('.swipe-card').getByRole('button', { name: 'Открыть редактор', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Создать пост', exact: true })).toBeVisible();
  await expect(page.locator('textarea').first()).toHaveValue(reviewText);
  expect(swipeFixture.decisions).toEqual([]);
});

test('Swipe gestures and decision buttons still work from the review text', async ({ page, swipeFixture }, testInfo) => {
  await page.goto('/#content');
  await page.getByRole('button', { name: 'Разобрать заготовки', exact: true }).click();
  const review = page.locator('.swipe-planner');
  const card = page.locator('.swipe-card');
  const swipe = async (distance: number) => {
    const text = page.locator('.swipe-text'); await text.scrollIntoViewIfNeeded();
    const box = (await text.boundingBox())!;
    const x = box.x + box.width / 2; const y = box.y + Math.min(box.height / 2, 20);
    if (testInfo.project.name === 'mobile') {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (const fraction of [0.3, 0.6, 1]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + distance * fraction, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + distance, y, { steps: 8 }); await page.mouse.up();
    }
  };
  await swipe(105);
  await expect(card).toHaveAttribute('aria-label', 'Заготовка: Review b');
  await review.getByRole('button', { name: 'Не нравится', exact: true }).click();
  await expect(card).toHaveAttribute('aria-label', 'Заготовка: Review c');
  await swipe(-105);
  await expect(card).toHaveAttribute('aria-label', 'Заготовка: Review d');
  await review.getByRole('button', { name: 'В черновики', exact: true }).click();
  await expect(review.getByRole('heading', { name: 'Разбор завершён', exact: true })).toBeVisible();
  expect(swipeFixture.decisions.map(({ action, itemId }) => ({ action, itemId }))).toEqual([
    { action: 'approve', itemId: 'a' }, { action: 'reject', itemId: 'b' },
    { action: 'reject', itemId: 'c' }, { action: 'approve', itemId: 'd' },
  ]);
  expect(swipeFixture.decisions[0].text).toBe(reviewText);
});
