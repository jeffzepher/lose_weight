const {test}=require('node:test');
const assert=require('node:assert/strict');
const origin='https://jeffzepher.github.io';
const env={DEEPSEEK_API_KEY:'test-provider-key',ACCESS_TOKEN:'test-personal-code-12345'};
const image='data:image/jpeg;base64,/9j/2Q==';
const worker=()=>import('../cloudflare/worker.mjs');
function request({method='POST',path='/api/recognize',site=origin,token=env.ACCESS_TOKEN,body={image},headers={}}={}){
  return new Request('https://qingxun-ai.jeffchen9618.workers.dev'+path,{method,headers:{Origin:site,'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},...(!['GET','OPTIONS'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
test('health confirms correct code and configuration without contacting DeepSeek',async()=>{
  const handler=(await worker()).createHandler(()=>{throw Error('must not call');});
  const response=await handler(request({method:'GET',path:'/health'}),env);
  assert.deepEqual(await response.json(),{service:'qingxun-ai',version:2,configured:true});
  const incomplete=await handler(request({method:'GET',path:'/'}),{DEEPSEEK_API_KEY:'test'});
  assert.equal((await incomplete.json()).configured,false);
});
test('allows browser preflight only from the configured GitHub Pages origin',async()=>{
  const handler=(await worker()).createHandler();
  const response=await handler(request({method:'OPTIONS',token:''}),env);
  assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.match(response.headers.get('Access-Control-Allow-Headers'),/Authorization/);
  const foreign=await handler(request({method:'OPTIONS',site:'https://foreign.test'}),env);
  assert.equal(foreign.status,403);assert.equal(foreign.headers.get('Access-Control-Allow-Origin'),null);
});
test('requires configured secrets and the personal code before contacting provider',async()=>{
  const handler=(await worker()).createHandler(()=>{throw Error('must not call');});
  assert.equal((await handler(request(),{})).status,503);
  assert.equal((await handler(request(),{...env,ACCESS_TOKEN:'short'})).status,503);
  for(const token of ['', 'incorrect']){
    const response=await handler(request({token}),env);assert.equal(response.status,401);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
    assert.doesNotMatch(JSON.stringify(await response.json()),/test-provider-key|test-personal-code/);
  }
});
test('sends compressed photo to the official endpoint without forwarding personal code',async()=>{
  let outgoing;
  const handler=(await worker()).createHandler(async(url,options)=>{outgoing={url,options};return Response.json({choices:[{message:{content:JSON.stringify({name:'鸡蛋',amount:'两个',kcal:160.4})}}]});});
  const response=await handler(request(),env);assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{name:'鸡蛋',amount:'两个',kcal:160});
  assert.equal(outgoing.url,'https://api.deepseek.com/chat/completions');
  assert.equal(outgoing.options.headers.Authorization,'Bearer '+env.DEEPSEEK_API_KEY);
  assert.doesNotMatch(JSON.stringify(outgoing),/test-personal-code/);
  const body=JSON.parse(outgoing.options.body);assert.equal(body.model,'deepseek-flash');assert.equal(body.messages[1].content[1].image_url.url,image);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('rejects invalid input, excessive body size and unsupported routes',async()=>{
  const handler=(await worker()).createHandler(()=>{throw Error('must not call');});
  assert.equal((await handler(request({body:'not json'}),env)).status,400);
  assert.equal((await handler(request({body:{image:'https://foreign.test/photo.jpg'}}),env)).status,400);
  assert.equal((await handler(request({headers:{'Content-Type':'text/plain'}}),env)).status,415);
  assert.equal((await handler(request({body:'x'.repeat(4*1024*1024+1)}),env)).status,413);
  assert.equal((await handler(request({method:'GET'}),env)).status,405);
  assert.equal((await handler(request({path:'/elsewhere'}),env)).status,404);
});
test('provider errors, malformed results and timeouts preserve CORS and hide details',async()=>{
  for(const fetchImpl of [async()=>new Response('secret provider debug',{status:401}),async()=>Response.json({choices:[{message:{content:'{"name":"egg","amount":"one","kcal":-1}'}}]}),async()=>Response.json({choices:[{message:{content:'not json'}}]}),async()=>{throw new DOMException('timeout','TimeoutError');}]){
    const response=await (await worker()).createHandler(fetchImpl)(request(),env);
    assert.equal(response.status,502);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
    assert.doesNotMatch(JSON.stringify(await response.json()),/secret provider debug|test-provider-key|test-personal-code/);
  }
});

test('worker returns valid nutrient estimates while preserving missing fields',async()=>{
  const handler=(await worker()).createHandler(async()=>Response.json({choices:[{message:{content:JSON.stringify({name:'鸡蛋',amount:'两个',kcal:160,nutrients:{protein:13.56,carbs:0,fat:null}})}}]}));
  const response=await handler(request(),env);
  assert.deepEqual((await response.json()).nutrients,{protein:13.6,carbs:0});
});
