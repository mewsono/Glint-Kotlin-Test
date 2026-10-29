// Run with: NODE_PATH=/home/user/.tools/browser/node_modules node tests/feeds.browser.cjs
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const records=Array.from({length:95},(_,i)=>({id:(i+1)*100,post:{id:200-i,md5:'1234567890abcdef1234567890abcdef',image_width:400,image_height:[500,600,450][i%3],tag_string:'caption_should_not_be_visible',rating:'g'}}));
const image='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#427b89"/><circle cx="260" cy="140" r="90" fill="#d5bd82"/><path d="M0 500V370L140 230 400 500" fill="#183b43"/></svg>';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    for (const mobile of [true,false]) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1200,height:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
      const page=await context.newPage(), errors=[], requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{localStorage.setItem('pb-auth',JSON.stringify({danbooru:{login:'tester',apiKey:'test-key'}}));localStorage.setItem('pb-swipe-hint-v22','1');});
      await page.route('**/*',async route=>{
        if(route.request().resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
        const req=new URL(route.request().url());
        if(req.pathname!=='/api/proxy')return route.continue();
        const u=new URL(req.searchParams.get('u'));requests.push(u);
        if(u.pathname.includes('/counts/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({counts:{posts:records.length}})});
        const limit=+(u.searchParams.get('limit')||40), cursor=u.searchParams.get('page')||'1';
        let body;
        if(u.pathname==='/favorites.json') {
          // A faithful cursor response: select the oldest after ID, return DESC.
          body=cursor.startsWith('a')?records.filter(r=>r.id>+cursor.slice(1)).slice(0,limit).reverse():records.slice(-limit).reverse();
        } else {
          const start=(+cursor-1)*limit;
          body=[...records].reverse().slice(start,start+limit).map(r=>r.post);
        }
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      await page.goto('http://127.0.0.1:8000/?screen=profile&tab=likes');
      const waitForPins = (n,first)=>page.waitForFunction(({n,first})=>{const f=favState(S.src);return !f.busy&&f.pins.length===n&&Number(f.pins[0].sid)===first},{n,first},{timeout:10000});
      await waitForPins(40,106);
      assert.match(await page.locator('.likes-head').innerText(),/95 liked posts/);
      assert.equal(await page.locator('.tabpane[data-tab="Likes"] .cap').count(),0);
      assert.equal(await page.locator('.tabpane[data-tab="Likes"] .grid .art').first().evaluate(el=>getComputedStyle(el).borderRadius),'12px');
      const press=selector=>mobile?page.locator(selector).first().tap():page.locator(selector).first().click();
      await press('.likes-sort');await waitForPins(40,200);
      assert.match(await page.locator('.likes-sort').innerText(),/Oldest/);
      assert.equal(requests.filter(u=>u.pathname==='/favorites.json').at(-1).searchParams.get('page'),'a0');
      await press('.tabpane[data-tab="Likes"] [data-a="favmore"]');await waitForPins(80,200);
      assert.equal(requests.filter(u=>u.pathname==='/favorites.json').at(-1).searchParams.get('page'),'a4000');
      await press('.tabpane[data-tab="Likes"] [data-a="favmore"]');await waitForPins(95,200);
      assert.equal(await page.evaluate(()=>new Set(favState(S.src).pins.map(p=>p.id)).size),95);
      assert.equal(await page.evaluate(()=>favState(S.src).done),true);
      // Details still open even when the image is an old favourite not in Home.
      await page.evaluate(()=>scrollTo(0,0));
      await press('.tabpane[data-tab="Likes"] .grid [data-a="open"]');
      assert.equal(await page.locator('#ov.show').count(),1);
      assert.equal(await page.locator('.post-detail').count(),1);
      assert.equal(await page.locator('.post-actions .post-action').count(),4);
      await press('#sheet [data-a="close"]');
      await press('.likes-sort');await waitForPins(40,106);
      assert.match(await page.locator('.likes-sort').innerText(),/Newest/);
      // Home, Search, Explore and a board all use caption-free cards.
      const cardChecks=await page.evaluate(()=>{
        const p=favState(S.src).pins[0];
        return [pc(p),pcN(p),pcx(p)].map(html=>({caption:html.includes('class="cap"'),title:html.includes('>caption_should_not_be_visible<')}));
      });
      assert.ok(cardChecks.every(x=>!x.caption&&!x.title));
      for(const screen of ['home','search','profile']) {
        await page.evaluate(screen=>{const pins=favState(S.src).pins;S.live[S.src]=pins;SRES=pins;S.explore=pins;S.screen=screen;S.bt='Explore';EXDONE=exploreKey();if(screen==='search'){S.q='fixture_tag';SEARCH={source:S.src,query:S.q,serial:SEARCH_SERIAL,pins,busy:false,error:'',hasMore:false}}render()},screen);
        assert.equal(await page.locator('.grid .cap').count(),0);
        assert.ok(!(await page.locator('.grid').first().innerText()).includes('caption_should_not_be_visible'));
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS ${mobile?'mobile taps':'desktop clicks'}: toggle changes actual posts; oldest pages advance without repeats; details open; all feed cards have no titles; corners are 12px.`);
      await context.close();
    }
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
