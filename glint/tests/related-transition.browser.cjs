/* Pixel-level regression for the stationary post/Related art handoff. A swipe's
   last frame must match the first frame after navigation, in both directions.
   All media and APIs are local fixtures; no upstream source is contacted. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = process.env.PINBOARD_TEST_URL || 'http://127.0.0.1:8000';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="414" height="844"><rect width="414" height="844" fill="#e34c35"/><path d="M0 300L414 200V680L0 780Z" fill="#32bccc"/><circle cx="207" cy="470" r="120" fill="#fbc847"/></svg>`;

async function pixelDifference(page, first, second) {
  return page.evaluate(async ([a, b]) => {
    const decode = src => new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = 'data:image/png;base64,' + src;
    });
    const [before, after] = await Promise.all([decode(a), decode(b)]);
    const canvas = document.createElement('canvas'); canvas.width = before.width; canvas.height = before.height;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    const w = before.width, h = before.height;
    c.drawImage(before, 0, 0); const old = c.getImageData(0, 0, w, h).data;
    c.clearRect(0, 0, w, h); c.drawImage(after, 0, 0); const now = c.getImageData(0, 0, w, h).data;
    let sum = 0; for (let i = 0; i < old.length; i += 4) for (let ch = 0; ch < 3; ch++) sum += Math.abs(old[i + ch] - now[i + ch]);
    return sum / (w * h * 3);
  }, [first.toString('base64'), second.toString('base64')]);
}
async function setup(page) {
  await page.addInitScript(() => {
    localStorage.setItem('pb-swipe-hint-v22', '1');
    localStorage.setItem('pb2', JSON.stringify({mode:'live',screen:'home',src:'e621',srcs:['e621'],bookmarks:[],bookmarkVersion:1}));
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = original.apply(this, args);
      if (window.__freezeRelatedHandoff) { animation.pause(); animation.currentTime = 0; }
      return animation;
    };
  });
  await page.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (req.resourceType() === 'image') return route.fulfill({contentType:'image/svg+xml',body:svg});
    if (url.pathname === '/api/proxy') return route.fulfill({contentType:'application/json',body:'[]'});
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await page.goto(BASE); await page.waitForFunction(() => window.PB_APP_READY === true);
  await page.addStyleTag({content: '.related-skeleton { animation: none !important }'});
  await page.evaluate(() => {
    const p = normPin({sid:'4201',sample:'https://static1.e621.net/fake.png',orig:'https://static1.e621.net/fake.png',grid:'https://static1.e621.net/fake.png',w:414,h:844,tags:[]}, 'e621');
    Object.assign(p,{characters:[],artists:[],series:[],detailsReady:true,fileInfoReady:true,sourceInfoReady:true,uploadInfoReady:true});
    rememberPin(p); detail(p.id);
    window.__originalPost = document.querySelector('#sheet');
    window.__originalImage = document.querySelector('#sheet .post-image');
  });
  await page.waitForFunction(() => document.querySelector('#sheet .post-image')?.complete);
}

(async () => {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  try {
    for (const width of [360,414,1200]) {
      const mobile = width < 600;
      const context = await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
      page.setDefaultTimeout(9000); await setup(page);
      const cdp = mobile ? await context.newCDPSession(page) : null;
      const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', {type,touchPoints:point?[{id:1,x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]:[]});
      const drag = async (from,to) => {
        if (mobile) {
          await touch('touchStart',from);
          for(let i=1;i<=5;i++) await touch('touchMove',{x:from.x+(to.x-from.x)*i/5,y:from.y+(to.y-from.y)*i/5});
        } else {
          await page.mouse.move(from.x,from.y); await page.mouse.down(); await page.mouse.move(to.x,to.y,{steps:5});
        }
      };
      const release = () => mobile ? touch('touchEnd',null) : page.mouse.up();
      const grab = () => page.screenshot({type:'png'});
      const freeze = () => page.evaluate(() => {window.__freezeRelatedHandoff=true});
      const thaw = () => page.evaluate(() => {window.__freezeRelatedHandoff=false; document.getAnimations().forEach(a=>{if(a.playState==='paused')a.play()})});
      const waitKind = kind => page.waitForFunction(kind => postView()?.kind === kind && document.querySelector(kind === 'blank' ? '#sheet.post-blank-page' : '#sheet.post-sheet'),kind);
      const compare = async (before,label) => {
        const difference = await pixelDifference(page,before,await grab());
        assert(difference < 3, `${width}px ${label} jumps by ${difference.toFixed(2)} RGB levels at the handoff`);
        return difference;
      };
      const x = width/2;

      await drag({x,y:560},{x,y:445});
      await page.waitForSelector('.sheet-next'); await page.waitForTimeout(250);
      await page.evaluate(() => {window.__relatedPreview=document.querySelector('.sheet-next')});
      const forwardBefore = await grab(); await freeze(); await release(); await waitKind('blank');
      const forwardDifference = await compare(forwardBefore,'post → Related swipe');
      assert.equal(await page.evaluate(() => window.__relatedPreview===document.querySelector('#sheet')),true,'the painted preview becomes the real Related panel');
      assert.equal(await page.evaluate(() => window.__originalPost===document.querySelector('.glint-related-post-underlay') && window.__originalImage.isConnected),true,'the already-decoded post remains beneath the Related panel');
      assert.equal(await page.evaluate(() => document.querySelector('.glint-related-post-underlay').inert),true,'the underlay is not interactive');
      await page.evaluate(() => {window.__relatedPanel=document.querySelector('#sheet')});
      await thaw(); await page.waitForTimeout(350);

      // The same handoff must work with the Related page scrolled in the middle.
      await page.locator('#sheet .related-page').evaluate(el=>{const spacer=document.createElement('div');spacer.style.height='1200px';spacer.setAttribute('aria-hidden','true');el.append(spacer);el.parentElement.scrollTop=250});
      await page.waitForFunction(() => document.querySelector('#sheet').scrollTop>200);
      await drag({x,y:430},{x,y:545}); await page.waitForTimeout(100);
      const reverseBefore = await grab(); await freeze(); await release(); await waitKind('post');
      const reverseDifference = await compare(reverseBefore,'Related → post swipe');
      assert.equal(await page.evaluate(() => window.__relatedPanel===document.querySelector('.glint-related-exit')),true,'the visible Related panel itself fades away');
      assert.equal(await page.evaluate(() => window.__originalPost===document.querySelector('#sheet') && window.__originalImage===document.querySelector('#sheet .post-image')),true,'return reuses the original post and image');
      await thaw();
      await page.waitForFunction(() => !document.querySelector('.glint-related-exit,.glint-related-post-underlay'),null,{timeout:3000});
      assert.equal(await page.locator('.glint-related-exit,.glint-related-post-underlay').count(),0,'temporary layers are cleaned after returning');

      // Short swipes spring back; browser Forward and the on-screen Back button
      // also crossfade without replacing a painted frame.
      await drag({x,y:560},{x,y:520}); await release(); await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => postView()?.kind),'post');
      assert.equal(await page.locator('.sheet-next').count(),0,'cancelled preview is removed');
      const browserForwardBefore = await grab(); await freeze(); await page.evaluate(() => history.forward()); await waitKind('blank');
      const browserDifference = await compare(browserForwardBefore,'browser Forward');
      await thaw(); await page.waitForTimeout(350);
      await drag({x,y:430},{x,y:470}); await release(); await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => postView()?.kind),'blank');
      const canceled = await page.evaluate(() => ({related:+getComputedStyle(document.querySelector('#sheet')).opacity,post:+getComputedStyle(document.querySelector('.glint-related-post-underlay')).opacity}));
      assert(canceled.related>.99 && canceled.post<.01,'cancelled return restores both layers');
      const buttonBefore = await grab(); await freeze();
      await page.locator('#sheet .related-header button')[mobile?'tap':'click'](); await waitKind('post');
      const buttonDifference = await compare(buttonBefore,'back button');
      await thaw(); await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => document.querySelectorAll('#sheet').length),1,'exactly one active sheet remains');
      if(width===414){
        await page.evaluate(() => history.forward()); await waitKind('blank'); await page.waitForTimeout(350);
        await page.evaluate(() => {
          const p=normPin({sid:'4202',sample:'https://static1.e621.net/child.png',orig:'https://static1.e621.net/child.png',grid:'https://static1.e621.net/child.png',w:414,h:844,tags:[]},'e621');
          Object.assign(p,{characters:[],artists:[],series:[],detailsReady:true,fileInfoReady:true,sourceInfoReady:true,uploadInfoReady:true});rememberPin(p);
          document.querySelector('#sheet .related-grid').innerHTML=relatedCardHTML(p);
        });
        await page.locator('#sheet .related-card').first().tap();
        await page.waitForFunction(() => postView()?.kind==='post'&&postView()?.id==='e621:4202');
        assert.equal(await page.locator('#sheet .post-image').count(),1,'a Related artwork opens its own post');
        await page.evaluate(() => history.back());
        await page.waitForFunction(() => postView()?.kind==='blank'&&document.querySelector('#sheet').dataset.blankPostId==='e621:4201');
        await page.waitForTimeout(350);
        assert.equal(await page.evaluate(() => document.querySelector('.glint-related-post-underlay')?.dataset.postId),'e621:4201','returning from a child post prepares the correct parent underlay');
        await page.evaluate(() => history.back());
        await page.waitForFunction(() => postView()?.kind==='post'&&postView()?.id==='e621:4201');
        assert.equal(await page.locator('#sheet .post-image').count(),1,'Back returns from Related art to the original post');
        await page.waitForTimeout(350);
        await page.evaluate(() => {
          const state=relatedPageState(pin('e621:4201')),group=state.groups[0];
          Object.assign(group,{tag:'fixture_character',query:'fixture_character',items:[],loaded:false,busy:false,done:false,error:false});
          state.scroll=0;window.pbLoadPosts=()=>new Promise(()=>{});
        });
        await drag({x,y:560},{x,y:445});
        await page.waitForSelector('.sheet-next .related-skeleton');
        await page.evaluate(() => {window.__previewSkeleton=document.querySelector('.sheet-next .related-skeleton')});
        await release(); await waitKind('blank');
        assert.equal(await page.evaluate(() => window.__previewSkeleton===document.querySelector('#sheet .related-skeleton')),true,'the loading skeleton is not destroyed and restarted when the preview becomes the page');
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px: zero-jump swipe handoffs (${forwardDifference.toFixed(2)}/${reverseDifference.toFixed(2)}), browser Forward (${browserDifference.toFixed(2)}), Back button (${buttonDifference.toFixed(2)}), cancellations, and mid-scroll return.`);
      await context.close();
    }
    const reduced = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
    const page = await reduced.newPage(); await setup(page);
    await page.evaluate(() => blankPostPage('e621:4201'));
    await page.waitForFunction(() => postView()?.kind==='blank');
    const state = await page.evaluate(() => ({animations:document.querySelector('#sheet').getAnimations().length,related:+getComputedStyle(document.querySelector('#sheet')).opacity,post:+getComputedStyle(document.querySelector('.glint-related-post-underlay')).opacity}));
    assert.equal(state.animations,0,'reduced motion skips the entrance animation');
    assert.equal(state.related,1);assert.equal(state.post,0);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => postView()?.kind==='post'&&document.querySelector('#sheet.post-sheet'));
    assert.equal(await page.evaluate(() => document.querySelector('#sheet')===window.__originalPost),true,'reduced-motion return keeps the original post');
    assert.equal(await page.locator('.glint-related-exit').count(),0,'reduced motion removes the outgoing layer immediately');
    await page.evaluate(() => history.forward());
    await page.waitForFunction(() => postView()?.kind==='blank');
    await page.evaluate(() => history.go(-2));
    await page.waitForFunction(() => !document.getElementById('ov').classList.contains('show'));
    await page.waitForFunction(() => !document.querySelector('.glint-related-post-underlay'));
    console.log('PASS reduced motion: instant transition and cleanup when history skips straight back to the feed.');
    await reduced.close();
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
