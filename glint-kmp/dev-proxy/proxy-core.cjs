/* Shared serverless source transport. Never log request URLs, bodies or secrets. */
'use strict';
const POLICY=require('./proxy-policy.json'),ALLOW=new Set(POLICY.hosts);
/* Same UA as server.py. Danbooru sits behind Cloudflare: a `Mozilla/5.0 …
   (compatible; …)` client string is answered normally, while a bare app token or a
   full Chrome UA can be challenged with 403 depending on the network. */
const UA='Mozilla/5.0 (compatible; Pinboard/65; +https://github.com/khoadng/Boorusama)';
const RESPONSE_LIMIT=3*1024*1024,PRIVATE_LIMIT=1024*1024,TIMEOUT=18000;
const CORS={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'Content-Type, Accept',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'cache-control':'no-store, private',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  // Upstream HTML/SVG must NEVER execute in the app's credential-bearing origin.
  'content-security-policy':"default-src 'none'; sandbox; frame-ancestors 'none'"
};
function validateTarget(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||!ALLOW.has(u.hostname)||u.username||u.password||u.hash||(u.port&&u.port!=='443'))throw Error('Invalid source URL');
  return u;
}
function safeHeaders(input,host){
  const out={Accept:'application/json,text/html,*/*','User-Agent':UA,'Accept-Language':'en-US,en;q=0.9'};
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid headers');
  for(const [key,value] of Object.entries(input)){
    const lower=key.toLowerCase();
    if(!['accept','content-type','authorization','cookie'].includes(lower))continue;
    if(typeof value!=='string'||value.length>8192||/[\r\n]/.test(value))throw Error('Invalid header');
    if(lower==='cookie'&&host!=='gelbooru.com')throw Error('Unsupported website session');
    if(lower==='authorization'&&(!['danbooru.donmai.us','e621.net'].includes(host)||!/^Basic \S+$/.test(value)))throw Error('Unsupported account authentication');
    out[lower]=value;
  }
  return out;
}
function gelWrite(u){return u.hostname==='gelbooru.com'&&(u.pathname==='/public/addfav.php'||u.pathname==='/index.php'&&u.searchParams.get('page')==='favorites'&&u.searchParams.get('s')==='delete')}
function validateAction(url,method,mutation){
  const u=validateTarget(url);
  if(!['GET','POST','DELETE'].includes(method))throw Error('Unsupported method');
  if(method==='GET'&&!mutation&&!gelWrite(u))return;
  let ok=false;
  if(['danbooru.donmai.us','e621.net'].includes(u.hostname))ok=method==='POST'&&u.pathname==='/favorites.json'||method==='DELETE'&&/^\/favorites\/[1-9]\d*\.json$/.test(u.pathname);
  else if(['yande.re','konachan.net','konachan.com','www.sakugabooru.com','sakugabooru.com'].includes(u.hostname))ok=method==='POST'&&['/post/vote.json','/user/authenticate.json'].includes(u.pathname);
  else if(gelWrite(u))ok=method==='GET'&&mutation&&/^[1-9]\d*$/.test(u.searchParams.get('id')||'');
  if(!ok)throw Error('Unsupported account action');
}
function validatePublic(url,method,raw){
  const u=validateTarget(url);
  if(gelWrite(u))throw Error('Account writes require a private envelope');
  if(method==='GET')return;
  // The one retained legacy POST adapter is a read-only GraphQL search.
  if(method!=='POST'||u.hostname!=='rule34.paheal.net'||u.pathname!=='/graphql')throw Error('Unsupported public action');
  const data=JSON.parse(raw),q=data?.query;
  if(typeof q!=='string'||!/^\s*(?:query\b|\{)/.test(q)||/\b(?:mutation|subscription)\b/.test(q))throw Error('Read-only GraphQL queries only');
}
async function boundedBody(response,limit){
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('Response too large')}
  const chunks=[];let n=0;if(!response.body)return Buffer.alloc(0);
  for await(const chunk of response.body){n+=chunk.length;if(n>limit)throw Error('Response too large');chunks.push(Buffer.from(chunk))}
  return Buffer.concat(chunks);
}
async function forward(url,method,body,headers,privateRequest){
  let current=url;const signal=AbortSignal.timeout(TIMEOUT);
  for(let hop=0;hop<6;hop++){
    const u=validateTarget(current),h=safeHeaders(headers||{},u.hostname);h.Referer=u.origin+'/';
    if(privateRequest){h['Cache-Control']='no-cache, no-store';h.Pragma='no-cache'}
    const response=await fetch(u.href,{method,headers:h,body:body==null?undefined:body,redirect:'manual',cache:'no-store',signal});
    const location=response.headers.get('location');
    if(!privateRequest&&method==='GET'&&response.status>=300&&response.status<400&&location){current=new URL(location,u).href;validatePublic(current,'GET','');await response.body?.cancel();continue}
    return {status:response.status,body:await boundedBody(response,privateRequest?Math.min(PRIVATE_LIMIT,POLICY.max_private_bytes):Math.min(RESPONSE_LIMIT,POLICY.max_response_bytes)),contentType:response.headers.get('content-type')||'application/octet-stream',retry:response.headers.get('retry-after')};
  }
  throw Error('Too many redirects');
}
const reply=(statusCode,body,type='application/json')=>({statusCode,headers:{...CORS,'content-type':type},body:Buffer.isBuffer(body)?body:Buffer.from(body)});
async function handleProxy(method,target,body){
  if(method==='OPTIONS')return reply(204,'');
  if(!['GET','POST'].includes(method))return reply(405,'{"error":"Unsupported proxy method."}');
  try{
    let record=null;
    const raw=body==null?'':Buffer.isBuffer(body)?body.toString('utf8'):typeof body==='string'?body:JSON.stringify(body);
    if(Buffer.byteLength(raw)>POLICY.max_request_bytes)return reply(413,'{"error":"Request is too large."}');
    try{record=JSON.parse(raw)}catch(_){}
    if(method==='POST'&&record?.pb_private===1){
      const m=String(record.method||'GET').toUpperCase();validateAction(record.url,m,!!record.mutation);
      if(record.body!=null&&typeof record.body!=='string')throw Error('Invalid body');
      const response=await forward(record.url,m,record.body,record.headers||{},true);
      const value=JSON.stringify({pb_private_response:1,status:response.status,body:response.body.toString('utf8'),content_type:response.contentType,retry_after:response.retry});
      if(Buffer.byteLength(value)>RESPONSE_LIMIT)throw Error('Encoded response too large');
      return reply(200,value);
    }
    validatePublic(target,method,raw);
    const sensitive=[...new URL(target).searchParams.keys()].some(k=>/^(login|api_key|key|user_api_key|password_hash|pass_hash|password|token|access_token|refresh_token)$/i.test(k));
    const response=await forward(target,method,method==='POST'?raw:null,method==='POST'?{'Content-Type':'application/json'}:{},sensitive);
    return reply(response.status,response.body,response.contentType);
  }catch(_){return reply(502,'{"error":"Source request failed, exceeded a hosting limit or was blocked. No account request was retried."}')}
}
module.exports={handleProxy,validateTarget,validateAction,validatePublic,safeHeaders,reply,maxRequestBytes:POLICY.max_request_bytes};
