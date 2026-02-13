import { chromium } from 'playwright';

const AUTH_EMAIL = 'youredik@gmail.com';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text().substring(0, 200);
      // Ignore known non-critical errors
      if (!text.includes('WebSocket') && !text.includes('socket') && !text.includes('favicon'))
        errors.push({ page: page.url(), text });
    }
  });
  page.on('pageerror', err => errors.push({ page: page.url(), text: err.message.substring(0, 200) }));
  page.on('response', resp => {
    if (resp.status() >= 500) networkErrors.push({ url: resp.url().substring(0, 100), status: resp.status() });
  });

  // Auth
  const resp = await page.request.post('http://localhost:3000/api/auth/dev/login', {
    data: { email: AUTH_EMAIL }
  });
  const data = await resp.json();
  await context.addCookies([{
    name: 'access_token', value: data.accessToken, domain: 'localhost', path: '/'
  }]);
  console.log('✓ Auth OK');

  // Chat list page
  console.log('\nTesting: /chat');
  await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check chat list
  const chatLinks = await page.$$('a[href*="/chat/"]');
  console.log(`Chat rooms found: ${chatLinks.length}`);

  // New chat button
  const newChatBtns = await page.$$('button');
  for (const btn of newChatBtns) {
    const text = await btn.textContent();
    if (text && text.includes('Новый')) {
      console.log('New chat button found');
      await btn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      console.log('New chat modal Escape tested');
      break;
    }
  }

  // Open first chat
  if (chatLinks.length > 0) {
    await chatLinks[0].click();
    await page.waitForTimeout(2000);

    const chatInput = await page.$('textarea');
    if (chatInput) {
      console.log('✓ Chat input found');
      // Type and clear
      await chatInput.fill('Тест');
      await page.waitForTimeout(300);

      // Check send button appeared
      const sendBtn = await page.$('[data-testid="chat-send-btn"]');
      console.log(`Send button visible: ${sendBtn ? 'yes' : 'no'}`);
      await chatInput.fill('');
    }

    // Check messages rendered
    const messages = await page.$$('[class*="message"], [class*="bubble"]');
    console.log(`Messages visible: ${messages.length}`);

    // Check attachments area
    const attachBtn = await page.$('[data-testid="chat-attach-btn"]');
    console.log(`Attach button: ${attachBtn ? 'yes' : 'no'}`);

    // Check mic button
    const micBtn = await page.$('[data-testid="chat-mic-btn"]');
    console.log(`Mic button: ${micBtn ? 'yes' : 'no'}`);
  }

  console.log('\n=== CHAT AUDIT ===');
  console.log(`Console errors: ${errors.length}, Network 500s: ${networkErrors.length}`);
  if (errors.length > 0) console.log('Errors:', JSON.stringify(errors, null, 2));
  if (networkErrors.length > 0) console.log('Network:', JSON.stringify(networkErrors, null, 2));

  await browser.close();
}

run().catch(console.error);
