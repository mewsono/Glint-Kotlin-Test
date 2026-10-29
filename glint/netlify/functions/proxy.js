/* Netlify: private source requests are never publicly cached. */
const proxy=require('../../proxy-core.cjs');
exports.handler=async event=>{
  const body=event.isBase64Encoded?Buffer.from(event.body||'','base64'):event.body;
  const r=await proxy.handleProxy(event.httpMethod,event.queryStringParameters?.u||'',body);
  return {statusCode:r.statusCode,headers:r.headers,body:r.body.toString('base64'),isBase64Encoded:true};
};
