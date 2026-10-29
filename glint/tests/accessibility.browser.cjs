/* Fixture-only WCAG 2.1 A/AA scan of the current Glint shell and primary views. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const axe = require('axe-core');
const BASE = process.env.PINBOARD_TEST_URL || 'http://127.0.0.1:8000';
const WIDTHS = (process.env.PINBOARD_TEST_WIDTHS || '390,1280').split(',').map(Number);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      await page.addInitScript(axe.source);
      await page.addInitScript(() => {
        localStorage.setItem('pb-swipe-hint-v22', '1');
        localStorage.setItem('pb2', JSON.stringify({
          mode: 'live', screen: 'profile', bt: 'Bookmarks', src: 'yandere',
          srcs: ['yandere'], bookmarks: [], bookmarkVersion: 1
        }));
      });
      await page.route('**/api/proxy**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.route('https://**/*', route => route.abort());
      await page.goto(BASE + '/');
      await page.waitForFunction(() => window.PB_APP_READY === true);
      const checked = [];
      const scan = async (name, action, theme) => {
        await page.evaluate(({ action, theme }) => {
          S.theme = theme;
          document.documentElement.dataset.theme = theme;
          if (action === 'explore') { S.screen = 'profile'; S.bt = 'Explore'; render(); exploreEnsure(); }
          else if (action === 'home') { S.screen = 'home'; render(); }
          else if (action === 'bookmarks') { S.screen = 'profile'; S.bt = 'Bookmarks'; render(); }
          else if (action === 'search') { S.screen = 'search'; S.q = ''; render(); }
          else if (action === 'related') {
            history.replaceState({ ...(history.state || {}), [POST_VIEW_KEY]: { kind: 'app' } }, '');
            const p = normPin({ sid: 91827, md5: '00000000000000000000000000016623', image_width: 600, image_height: 900, file_ext: 'png', tag_string: 'sakura_miko thomas_8000 hololive', tag_string_character: 'sakura_miko', tag_string_artist: 'thomas_8000', tag_string_copyright: 'hololive', file_url: 'https://fixture.invalid/post.png', sample_url: 'https://fixture.invalid/sample.png' }, 'yandere');
            p.detailsReady = p.fileInfoReady = p.sourceInfoReady = p.uploadInfoReady = true;
            rememberPin(p); detail(p.id); blankPostPage(p.id);
          }
          else if (action === 'settings') settings();
        }, { action, theme });
        // Let sheet and section entrance animations settle before measuring contrast.
        await page.waitForTimeout(550);
        const result = await page.evaluate(async tags => axe.run(document, {
          runOnly: { type: 'tag', values: tags }
        }), TAGS);
        const violations = result.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map(node => node.target.join(' '))
        }));
        checked.push({ view: name, theme, violations });
        assert.deepEqual(violations, [], `${width}px ${theme} ${name} accessibility violations`);
      };
      for (const theme of ['dark', 'light']) {
        for (const [name, action] of [['Explore', 'explore'], ['Home', 'home'], ['Bookmarks', 'bookmarks'], ['Search', 'search'], ['Related art', 'related'], ['Settings', 'settings']]) {
          await scan(name, action, theme);
        }
      }
      console.log(`PASS ${width}px: axe WCAG 2.1 A/AA reports zero violations on Home, Explore, Bookmarks, Search, Related art sliders and Settings in both themes.`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
