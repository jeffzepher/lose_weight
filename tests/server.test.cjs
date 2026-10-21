const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');
async function running(t,options={}){
  const server=createServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  return {get:url=>fetch(base+url),post:(value,headers={})=>fetch(base+'/api/recognize',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)})};
}
const image='data:image/jpeg;base64,/9j/2Q==';
test('serves storage script and keeps local configuration private',async t=>{
  const app=await running(t,{apiKey:''});
  assert.equal((await app.get('/storage.js')).status,200);
  assert.equal((await app.get('/.env')).status,404);
  const response=await app.post({image});assert.equal(response.status,503);assert.match((await response.json()).error,/密钥/);
});
test('uses official vision model, sends image and returns editable validated values',async t=>{
  let sent;
  const app=await running(t,{apiKey:'test-only',fetchImpl:async(url,options)=>{sent={url,options};return Response.json({choices:[{message:{content:JSON.stringify({name:'米饭与鸡蛋',amount:'一碗',kcal:450.4})}}]});}});
  const response=await app.post({image});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{name:'米饭与鸡蛋',amount:'一碗',kcal:450});
  assert.equal(sent.url,'https://api.deepseek.com/chat/completions');
  const body=JSON.parse(sent.options.body);assert.equal(body.model,'deepseek-flash');
  assert.equal(body.messages[1].content[1].image_url.url,image);
  assert.equal(sent.options.headers.Authorization,'Bearer test-only');
});
test('rejects invalid images and cross-site requests before contacting provider',async t=>{
  const app=await running(t,{apiKey:'test-only',fetchImpl:()=>{throw Error('must not call');}});
  assert.equal((await app.post({image:'https://example.com/photo.jpg'})).status,400);
  assert.equal((await app.post({image},{Origin:'https://foreign.test'})).status,403);
  assert.equal((await app.post({image:'data:image/svg+xml;base64,AA=='})).status,400);
});
test('handles bad output, provider failures, timeout and permits subsequent retries',async t=>{
  for(const fetchImpl of [async()=>Response.json({choices:[{message:{content:'{"name":"food","amount":"one","kcal":-1}'}}]}),async()=>Response.json({choices:[{message:{content:'not json'}}]}),async()=>new Response('private details',{status:401}),async()=>{throw new DOMException('timeout','TimeoutError');}]){
    const app=await running(t,{apiKey:'test-only',fetchImpl});
    for(let i=0;i<2;i++){const response=await app.post({image});assert.equal(response.status,502);assert.doesNotMatch(JSON.stringify(await response.json()),/private details|test-only/);}
  }
});

test('local recognition returns validated optional nutrients',async t=>{
  const app=await running(t,{apiKey:'test-only',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify({name:'鸡蛋',amount:'两个',kcal:160,nutrients:{protein:13.56,carbs:0,fat:-1}})}}]})});
  const response=await app.post({image});assert.deepEqual((await response.json()).nutrients,{protein:13.6,carbs:0});
});

test('local recognition validation sums food details and preserves legacy results',()=>{
  const {validateMeal}=require('../server.cjs');
  const meal=validateMeal({name:'组合餐',amount:'一份',kcal:999,foods:[{name:'米饭',amount:'100 g',kcal:130.1,nutrients:{protein:3,carbs:28,fat:0}},{name:'鸡蛋',amount:'1 个',kcal:80.2,nutrients:{protein:6,carbs:0}}]});
  assert.equal(meal.kcal,210.3);assert.deepEqual(meal.nutrients,{protein:9,carbs:28});
  assert.equal(meal.foods.length,2);
  assert.throws(()=>validateMeal({name:'食物',amount:'一份',kcal:1,foods:[]}));
});
