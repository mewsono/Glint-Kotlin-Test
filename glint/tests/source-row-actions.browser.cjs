/* Settings ▸ Sources rows: pick target plus a pencil (edit) and a bin
   (delete). Fixtures only — no real source, credential or network. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="414" height="600"><rect width="414" height="600" fill="#627e81"/></svg>';
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of [360,390,1200]){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(9000);
  await page.addInitScript(()=>{
   localStorage.setItem('pb-swipe-hint-v22','1');
   localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'e621',srcs:['e621','gelbooru'],theme:'dark',bookmarks:[],bookmarkVersion:1}));
  });
  await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.pathname==='/api/proxy')return route.fulfill({contentType:'application/json',body:'{"posts":[]}'});
   return u.hostname==='127.0.0.1'?route.continue():route.abort();
  });
  await page.goto(BASE);await page.waitForFunction(()=>window.PB_APP_READY===true);await page.waitForTimeout(200);await page.waitForFunction(()=>!LOADING);
  // A source of the user's own, added without contacting anything.
  const custom=await page.evaluate(()=>{
   window.pbLoadPosts=((real)=>async(src,options)=>String(src).startsWith('custom-')?[]:real(src,options))(window.pbLoadPosts);
   const id=pbAddCustomSource({name:'My Booru',base:'https://fixture.booru.test/',engine:'danbooru'});
   if(!S.srcs.includes(id))S.srcs.push(id);
   save(true);return id;
  });
  await page.evaluate(()=>settings());
  await page.waitForSelector('.glint-rows .glint-source-choice');
  const row=id=>page.locator(`.glint-rows .glint-source-row[data-v="${id}"]`);
  const editBtn=id=>page.locator(`.glint-rows .glint-source-edit[data-v="${id}"]`);
  const delBtn=id=>page.locator(`.glint-rows .glint-source-delete[data-v="${id}"]`);
  for(const id of ['e621','gelbooru',custom]){
   await row(id).waitFor({state:'visible'});
   await editBtn(id).waitFor({state:'visible'});
   await delBtn(id).waitFor({state:'visible'});
   const name=await row(id).evaluate(el=>el.textContent.trim());
   assert.equal(await editBtn(id).getAttribute('aria-label'),'Edit '+name);
   assert.equal(await delBtn(id).getAttribute('aria-label'),'Delete '+name);
  }
  const geometry=await page.evaluate(()=>{
   const li=document.querySelector('.glint-rows .glint-source-choice'),rects=[...li.children].map(c=>c.getBoundingClientRect());
   const pick=rects[0],edit=rects[1],del=rects[2],mid=r=>r.top+r.height/2;
   return {sameRow:rects.every(r=>Math.abs(mid(r)-mid(pick))<1.5),order:[...li.children].map(c=>c.className),
     pickW:Math.round(pick.width),edit:Math.round(edit.width),del:Math.round(del.width),
     delRight:Math.round(li.getBoundingClientRect().right-del.right),overflow:li.scrollWidth-li.clientWidth};
  });
  assert.equal(geometry.sameRow,true,'the pick row and both controls share one line');
  assert.deepEqual(geometry.order,['glint-source-row','glint-source-edit','glint-source-delete']);
  assert.ok(geometry.edit<=44&&geometry.del<=44&&geometry.edit>=36&&geometry.del>=36,'the controls stay small');
  assert.ok(geometry.delRight<=2&&geometry.overflow===0,'the row does not overflow its sheet');

  // Picking a source still works from the row itself.
  await row('gelbooru').click();
  await page.waitForFunction(()=>S.src==='gelbooru');
  await page.evaluate(()=>settings());
  await page.waitForSelector('.glint-rows .glint-source-choice');

  // A preset opens its account & filters form.
  await editBtn('e621').click();
  await page.waitForSelector('#source-account-form[data-source="e621"]');
  assert.match(await page.locator('#sheet h2').first().textContent(),/e621/);
  await page.evaluate(()=>settings());
  await page.waitForSelector('.glint-rows .glint-source-choice');

  // A source of the user's own opens a prefilled edit form.
  await editBtn(custom).click();
  await page.waitForSelector('.custom-source-form');
  assert.match(await page.locator('#sheet h2').first().textContent(),/Edit source/);
  assert.deepEqual(await page.evaluate(()=>({name:$('#sheet #csName').value,base:$('#sheet #csBase').value,engine:$('#sheet #csEngine').value})),
   {name:'My Booru',base:'https://fixture.booru.test/',engine:'danbooru'});
  await page.fill('#csName','Renamed Booru');await page.fill('#csBase','https://moved.booru.test/');
  await page.locator('#sheet [data-a="cssave"]').click();
  await page.waitForFunction(id=>PB_SOURCES[id]&&PB_SOURCES[id].name==='Renamed Booru'&&PB_SOURCES[id].bases[0]==='https://moved.booru.test/'&&PB_SOURCES[id].id===id&&S.srcs.includes(id),custom);
  await page.waitForSelector(`.glint-rows .glint-source-row[data-v="${custom}"]`);
  assert.match(await row(custom).textContent(),/Renamed Booru/);

  // An address that already belongs to another source is refused, not applied.
  await editBtn(custom).click();await page.waitForSelector('.custom-source-form');
  await page.fill('#csBase','https://e621.net/');
  await page.locator('#sheet [data-a="cssave"]').click();
  await page.waitForFunction(()=>/already a source/.test($('#sheet #cs-result')?.textContent||''));
  assert.equal(await page.evaluate(id=>PB_SOURCES[id].bases[0],custom),'https://moved.booru.test/','a refused edit changes nothing');

  // The bin asks first: cancelling keeps the source.
  let asked='';page.once('dialog',async d=>{asked=d.message();await d.dismiss()});
  await page.evaluate(()=>settings());await page.waitForSelector('.glint-rows .glint-source-choice');
  await delBtn('e621').click();
  await page.waitForFunction(()=>S.srcs.includes('e621'));
  assert.match(asked,/e621/);

  // Removing a preset takes it out of the row only.
  page.once('dialog',async d=>{asked=d.message();await d.accept()});
  await delBtn('e621').click();
  await page.waitForFunction(()=>!S.srcs.includes('e621'));
  await page.waitForSelector('.glint-rows .glint-source-choice');
  assert.equal(await row('e621').count(),0,'the removed source leaves the Settings row');
  assert.match(asked,/Manage sources/);
  await page.evaluate(()=>sourceSheet());
  await page.waitForSelector('.source-catalogue');
  assert.equal(await page.locator('.source-card[data-source="e621"] [data-a="srcadd"]').count(),1,'a preset can be added back');
  assert.equal(await page.locator('.source-card[data-source="e621"] [data-a="srcrowedit"]').count(),0,'presets are not "edited" as custom sources');

  // A custom source card offers Edit next to Delete.
  await page.evaluate(()=>sourceSheet());await page.waitForSelector('.source-catalogue');
  assert.equal(await page.locator(`.source-card[data-source="${custom}"] [data-a="srcrowedit"]`).count(),1);

  // Deleting a source of the user's own removes it for good.
  await page.evaluate(()=>settings());await page.waitForSelector('.glint-rows .glint-source-choice');
  page.once('dialog',async d=>{asked=d.message();await d.accept()});
  await delBtn(custom).click();
  await page.waitForFunction(id=>!PB_SOURCES[id]&&!S.srcs.includes(id),custom);
  assert.match(asked,/Delete/);
  await page.waitForSelector('.glint-rows .glint-source-choice');
  assert.equal(await page.locator(`.glint-rows [data-v="${custom}"]`).count(),0);
  await page.evaluate(()=>sourceSheet());await page.waitForSelector('.source-catalogue');
  assert.equal(await page.locator('.source-card[data-source="'+custom+'"]').count(),0,'a deleted custom source is gone, not merely removed');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: Settings source rows expose edit and delete, presets are removed and re-addable, custom sources are editable and deleted for good, and picking a row still switches source.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
