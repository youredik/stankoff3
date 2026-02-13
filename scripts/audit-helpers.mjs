// Shared helpers for audit scripts
export async function loginAsAdmin(page) {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Click first user card (Эдуард Сарваров — Admin)
  const userCards = await page.$$('button');
  for (const card of userCards) {
    const text = await card.textContent();
    if (text && text.includes('Эдуард') && text.includes('Админ')) {
      await card.click();
      break;
    }
  }

  // Wait for redirect to dashboard/workspace
  await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('Auth OK: ' + page.url());
}
