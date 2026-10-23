const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {cyclePhase,videoLink,trendSeries,energyBalance}=require('../core');

test('calendar phase boundaries, historical cycles and uncovered dates',async()=>{
  const cycle={records:[{start:'2026-09-01',length:28,duration:5},{start:'2026-10-02',length:28,duration:5}]};
  const cases={'2026-09-01':'menstrual','2026-09-05':'menstrual','2026-09-06':'follicular','2026-09-14':'follicular','2026-09-15':'luteal','2026-09-23':'luteal','2026-09-24':'late-luteal','2026-09-28':'late-luteal','2026-10-02':'menstrual'};
  for(const [date,phase] of Object.entries(cases))assert.equal(cyclePhase(date,cycle).key,phase,date);
  for(const date of ['2026-08-31','2026-09-29','2026-10-30'])assert.equal(cyclePhase(date,cycle),null,date);
  assert.equal(cyclePhase('2026-10-04',{start:'2026-10-02',length:28,duration:5}).key,'menstrual');
});
test('new actual period overrides a previous estimated window',async()=>{
  const cycle={records:[{start:'2026-10-01',length:28,duration:5},{start:'2026-10-24',length:30,duration:6}]};
  assert.equal(cyclePhase('2026-10-24',cycle).key,'menstrual');
});
test('platform links accept share text and reject foreign hosts and unsafe protocols',async()=>{
  assert.equal(videoLink('复制打开抖音 https://v.douyin.com/abc/ 看视频','douyin'),'https://v.douyin.com/abc/');
  assert.equal(videoLink('https://www.douyin.com/video/123','douyin'),'https://www.douyin.com/video/123');
  assert.equal(videoLink('https://b23.tv/abc','bilibili'),'https://b23.tv/abc');
  for(const url of ['javascript:alert(1)','http://v.douyin.com/x','https://v.douyin.com.evil.test/x','https://evil.test/?url=https://v.douyin.com/x'])assert.equal(videoLink(url,'douyin'),null);
  assert.equal(videoLink('https://b23.tv/abc','douyin'),null);
});
async function harness(initial={},options={}){
  const events={},els={};let stored=initial,fields={};
  function el(s){return els[s]||=( {innerHTML:'',dataset:{},elements:{namedItem:key=>el('field:'+key)},classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(t,fn){events[s+':'+t]=fn;},showModal(){this.open=true;},close(){this.open=false;events[s+':close']?.();}});}
  const doc={querySelector:el,querySelectorAll:()=>[],createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='}),addEventListener(t,fn){events[t]=fn;}};
  const ctx={AbortController,fetch:options.fetchImpl,FileReader:class{readAsDataURL(){this.result='photo';this.onload();}},Image:class{width=800;height=600;set src(value){this.onload();}},QingxunStorage:{createStorage:()=>({load:async()=>JSON.parse(JSON.stringify(initial)),save:async value=>{if(options.failSave?.())throw Error('quota exceeded');stored=JSON.parse(JSON.stringify(value));},info:{}})},document:doc,window:{scrollTo(){},addEventListener(t,fn){events['window:'+t]=fn;}},navigator:{clipboard:options.clipboard},sessionStorage:{getItem:()=>options.healthPending?'1':null,setItem(){},removeItem(){}},location:{href:''},QingxunCore:require('../core'),FormData:class{constructor(){return Object.entries(fields);}},Intl,Date,URL,setTimeout(){},clearTimeout(){}};
  ctx.QingxunConfig=options.config;
  el('#recognition-code').focus=()=>{};
  el('#recognition-code').closest=()=>el('access-details');
  await vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),ctx);
  return {el,async event(name,visibility){if(visibility)doc.visibilityState=visibility;await events[name]?.();await new Promise(setImmediate);},get state(){return stored;},async click(dataset){events.click({target:{closest(){return {dataset};}}});await new Promise(setImmediate);},async change(target){await events.change({target});await new Promise(setImmediate);},submit(values){fields=values;return events['#sheet-form:submit']({preventDefault(){}});}};
}
test('home begins with intake, measurements persist and calendar renders phase colors',async()=>{
  const h=await harness();
  assert.match(h.el('#content').innerHTML,/今日摄入/);
  assert.doesNotMatch(h.el('#content').innerHTML,/greeting|cycle-banner|认识你的身体节奏/);
  await h.click({action:'measurements'});await h.submit({chest:'',waist:'80.5',hip:'99',thigh:'',arm:'',calf:''});
  const d=Object.values(h.state.days).find(d=>d.measurements?.waist);
  assert.equal(d.measurements.waist,80.5);assert.equal(d.weight,undefined);
  assert.doesNotMatch(h.el('#content').innerHTML,/80.5/);
  await h.click({go:'measurements'});
  assert.match(h.el('#content').innerHTML,/80.5/);
  assert.match(h.el('#content').innerHTML,/腰围趋势/);
  const current=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  await h.click({action:'cycle'});await h.submit({start:current.slice(0,8)+'01',length:'28',duration:'5'});
  await h.click({page:'calendar'});
  for(const key of ['menstrual','follicular','luteal','late-luteal'])assert.match(h.el('#content').innerHTML,new RegExp('class="phase-'+key));
  assert.match(h.el('#content').innerHTML,/腰围 80.5 cm/);
});
test('trend data uses only real values in date order, omits future and missing entries',async()=>{
  const data={'2026-10-04':{weight:61},'2026-10-01':{weight:60,measurements:{waist:75}},'2026-10-02':{},'2026-11-01':{weight:62}};
  assert.deepEqual(trendSeries(data,'weight','2026-10-20'),[{date:'2026-10-01',value:60},{date:'2026-10-04',value:61}]);
  assert.deepEqual(trendSeries(data,'waist','2026-10-20'),[{date:'2026-10-01',value:75}]);
});
test('weight edits preserve circumferences, circumference edits preserve weight',async()=>{
  const h=await harness();await h.click({action:'weight'});await h.submit({weight:'60'});
  await h.click({action:'measurements'});await h.submit({waist:'75'});
  await h.click({action:'weight'});await h.submit({weight:'60.5'});
  const d=Object.values(h.state.days).find(d=>d.weight);
  assert.equal(d.weight,60.5);assert.equal(d.measurements.waist,75);
  assert.doesNotMatch(h.el('#content').innerHTML,/腰围/);
});
test('four category checkboxes persist and general undo clears them',async()=>{
  const h=await harness();await h.click({page:'train'});
  assert.match(h.el('#content').innerHTML,/data-training="shoulder"/);
  await h.change({dataset:{training:'legs'},checked:true});
  let d=Object.values(h.state.days).find(d=>d.exercise);
  assert.deepEqual(d.trainingCategories,['legs']);
  await h.click({action:'exercise'});
  d=Object.values(h.state.days)[0];assert.equal(d.exercise,false);assert.deepEqual(d.trainingCategories,[]);
});
test('energy balance requires complete intake and expenditure and sums resting plus active once',async()=>{
  const d={meals:[{kcal:1400}],energy:{resting:1300,active:500,complete:false}};
  assert.equal(energyBalance(d).status,'partial');
  d.energy.complete=true;assert.equal(energyBalance(d).status,'partial');
  d.intakeComplete=true;assert.deepEqual(energyBalance(d),{intake:1400,total:1800,difference:400,status:'complete'});
  assert.equal(energyBalance({meals:[]}).status,'missing');
  d.meals[0].kcal=2000;assert.equal(energyBalance(d).difference,-200);
});
test('training migration, Douyin save and stretch filtering',async()=>{
  const h=await harness({videos:[{category:'全身',title:'旧收藏',url:'https://b23.tv/old'}]});
  await h.click({page:'train'});
  assert.doesNotMatch(h.el('#content').innerHTML,/今天，想动一动哪里|data-filter="全身"/);
  assert.match(h.el('#content').innerHTML,/data-filter="体态"/);
  await h.click({platform:'douyin'});await h.submit({title:'拉伸练习',url:'复制 https://v.douyin.com/abc/ 打开',category:'拉伸'});
  assert.equal(h.state.videos[0].category,'体态');
  assert.equal(h.state.videos[1].platform,'douyin');
  await h.click({filter:'拉伸'});
  assert.match(h.el('#content').innerHTML,/拉伸练习/);
  assert.doesNotMatch(h.el('#content').innerHTML,/旧收藏/);
});
test('PWA manifest paths and offline shell assets exist',async()=>{
  const path=require('node:path'),base=path.resolve(__dirname,'..');
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');
  for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(base,icon.src)));
  const sw=fs.readFileSync(path.join(base,'sw.js'),'utf8');
  const assets=sw.match(/const SHELL=\[([^;]+)\];/)[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
  for(const asset of assets)assert.ok(fs.existsSync(path.join(base,asset)),asset);
  assert.ok(assets.includes('./mobile.css'));
});

test('profile and daily weight accept decimal values without rounding',async()=>{
  const h=await harness();await h.click({action:'profile'});
  assert.match(h.el('#sheet-body').innerHTML,/name="height"[^>]*step="any"/);
  assert.match(h.el('#sheet-body').innerHTML,/name="weight"[^>]*step="any"/);
  await h.submit({age:'25',height:'165.25',weight:'60.55',activity:'轻度活动'});
  assert.equal(h.state.profile.height,165.25);assert.equal(h.state.profile.weight,60.55);
  await h.click({action:'weight'});await h.submit({weight:'59.85'});
  assert.equal(Object.values(h.state.days).find(d=>d.weight).weight,59.85);
});

test('photo recognition fills editable fields and user corrections are saved',async()=>{
  let sent;
  const h=await harness({}, {fetchImpl:async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({name:'鸡蛋',amount:'两个',kcal:160})};}});
  await h.click({action:'meal'});
  await h.change({id:'food-photo',files:[{type:'image/jpeg',size:1024}]});
  await h.click({recognize:''});
  assert.equal(sent.url,'./api/recognize');assert.match(JSON.parse(sent.options.body).image,/^data:image\/jpeg/);
  assert.equal(h.el('field:name').value,'鸡蛋');assert.equal(h.el('field:kcal').value,160);
  await h.submit({type:'早餐',name:'煎鸡蛋',amount:'一个',kcal:'100'});
  const meal=Object.values(h.state.days).flatMap(d=>d.meals)[0];
  assert.equal(meal.name,'煎鸡蛋');assert.equal(meal.kcal,100);assert.match(meal.photo,/^data:image\/jpeg/);
});

test('failed recognition leaves manual entries intact; stale result cannot fill a new form',async()=>{
  const h=await harness({}, {fetchImpl:async()=>({ok:false,json:async()=>({error:'尚未配置密钥'})})});
  await h.click({action:'meal'});h.el('field:name').value='手动食物';
  await h.change({id:'food-photo',files:[{type:'image/jpeg',size:1024}]});await h.click({recognize:''});
  assert.equal(h.el('field:name').value,'手动食物');assert.match(h.el('#recognition-status').textContent,/密钥/);
  assert.equal(h.el('#recognize-food').disabled,false);
  let finish;
  const delayed=await harness({}, {fetchImpl:()=>new Promise(resolve=>{finish=resolve;})});
  await delayed.click({action:'meal'});await delayed.change({id:'food-photo',files:[{type:'image/jpeg',size:1024}]});await delayed.click({recognize:''});
  await delayed.click({action:'close'});await delayed.click({action:'meal'});
  finish({ok:true,json:async()=>({name:'旧照片',amount:'一份',kcal:123})});await new Promise(setImmediate);
  assert.notEqual(delayed.el('field:name').value,'旧照片');
});

test('failed save keeps form open and retry saves a meal only once',async()=>{
  let fail=true;
  const h=await harness({}, {failSave:()=>fail});await h.click({action:'meal'});await h.click({mealManual:''});
  const input={type:'早餐',name:'鸡蛋',amount:'一个',kcal:'80'};await h.submit(input);
  assert.equal(h.el('#sheet').open,true);assert.equal(h.el('#storage-alert').hidden,false);
  fail=false;await h.submit(input);
  assert.equal(h.el('#sheet').open,false);assert.equal(h.el('#storage-alert').hidden,true);
  assert.equal(Object.values(h.state.days).flatMap(d=>d.meals).length,1);
});

test('online recognition uses configured Worker and keeps access code out of stored records',async()=>{
  let sent,calls=0;
  const config={recognitionUrl:'https://qingxun-ai.jeffchen9618.workers.dev/api/recognize',recognitionRequiresCode:true};
  const h=await harness({}, {config,fetchImpl:async(url,options)=>{calls++;sent={url,options};return {ok:true,json:async()=>({name:'鸡蛋',amount:'两个',kcal:160})};}});
  await h.click({action:'meal'});assert.match(h.el('#sheet-body').innerHTML,/个人访问口令/);
  await h.change({id:'food-photo',files:[{type:'image/jpeg',size:1024}]});
  h.el('#recognition-code').value='';await h.click({recognize:''});assert.equal(calls,0);
  h.el('#recognition-code').value='my-private-access-code';await h.click({recognize:''});
  assert.equal(sent.url,config.recognitionUrl);assert.equal(sent.options.headers.Authorization,'Bearer my-private-access-code');
  await h.submit({type:'早餐',name:'鸡蛋',amount:'两个',kcal:'160'});
  assert.doesNotMatch(JSON.stringify(h.state),/my-private-access-code/);
});

test('deployment config routes GitHub Pages to deployed HTTPS API and local preview to local server',()=>{
  const script=fs.readFileSync(require.resolve('../config.js'),'utf8');
  for(const hostname of ['localhost','127.0.0.1','[::1]','jeffzepher.github.io']){
    const ctx={location:{hostname}};vm.runInNewContext(script,ctx);
    const local=hostname!=='jeffzepher.github.io';
    assert.equal(ctx.QingxunConfig.recognitionRequiresCode,!local);
    assert.equal(ctx.QingxunConfig.recognitionUrl,local?'./api/recognize':'https://193.112.55.186:4186/api/recognize');
  }
});

test('nutrition totals distinguish zero, unknown and partial records',()=>{
  const {nutrientTotals}=require('../core');
  const totals=nutrientTotals([{nutrients:{protein:12.3,carbs:0,fat:5.2}},{nutrients:{protein:2.1,carbs:null}},{kcal:480}]);
  assert.deepEqual(totals.protein,{grams:14.4,count:2,total:3});
  assert.deepEqual(totals.carbs,{grams:0,count:1,total:3});
  assert.deepEqual(totals.fat,{grams:5.2,count:1,total:3});
  assert.equal(nutrientTotals([{kcal:480}]).protein.grams,null);
});

test('legacy meal can be edited to add nutrients without duplicating or losing its photo and time',async()=>{
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  const photo='data:image/jpeg;base64,/9j/2Q==';
  const h=await harness({days:{[date]:{meals:[{type:'早餐',name:'原餐食',amount:'一份',kcal:480,photo,time:'08:30'}]}}});
  await h.click({page:'record'});
  assert.doesNotMatch(h.el('#content').innerHTML,/待分析/);
  assert.match(h.el('#content').innerHTML,/尚未补充/);
  await h.click({editMeal:'0'});
  assert.equal(h.el('field:name').value,'原餐食');assert.equal(h.el('#photo-preview').src,photo);
  await h.submit({type:'早餐',name:'原餐食',amount:'一份',kcal:'480',protein:'25.5',carbs:'40',fat:'0'});
  const meals=h.state.days[date].meals;assert.equal(meals.length,1);
  assert.equal(meals[0].time,'08:30');assert.equal(meals[0].photo,photo);
  assert.deepEqual(meals[0].nutrients,{protein:25.5,carbs:40,fat:0});
  assert.match(h.el('#content').innerHTML,/25.5 <span>g/);
  assert.doesNotMatch(h.el('#content').innerHTML,/尚未补充/);
});

test('recognition fills nutrients and a legacy response clears stale nutrient estimates',async()=>{
  let full=true;
  const h=await harness({}, {fetchImpl:async()=>({ok:true,json:async()=>({name:'鸡蛋',amount:'两个',kcal:160,...(full?{nutrients:{protein:13.5,carbs:0,fat:11}}:{})})})});
  await h.click({action:'meal'});await h.change({id:'food-photo',files:[{type:'image/jpeg',size:1024}]});
  await h.click({recognize:''});assert.equal(h.el('field:protein').value,13.5);assert.equal(h.el('field:carbs').value,0);
  full=false;await h.click({recognize:''});assert.equal(h.el('field:protein').value,'');
  assert.match(h.el('#recognition-status').textContent,/营养数据未完整返回/);
});

test('weight goal handles loss, gain, reversals, completion and missing values',()=>{
  const {weightProgress}=require('../core');
  assert.equal(weightProgress(70,60,65).percent,50);
  assert.equal(weightProgress(50,60,55).percent,50);
  assert.equal(weightProgress(70,60,72).percent,0);
  assert.equal(weightProgress(70,60,59).complete,true);
  assert.equal(weightProgress(50,60,61).remaining,0);
  assert.equal(weightProgress(60,60,60).percent,100);
  assert.equal(weightProgress(70,60,60.01).percent,99.9);
  assert.equal(weightProgress(70,60,''),null);
});

test('goal persists through profile changes and updates with a daily weight',async()=>{
  const h=await harness({profile:{age:25,height:165,weight:70,activity:''}});
  await h.click({action:'weight-goal'});await h.submit({start:'70',target:'60'});
  await h.click({action:'profile'});await h.submit({age:'26',height:'165.5',weight:'70',activity:'轻度活动'});
  assert.equal(h.state.profile.goalStart,70);assert.equal(h.state.profile.goalTarget,60);
  await h.click({action:'weight'});await h.submit({weight:'65'});
  assert.match(h.el('#content').innerHTML,/体重目标完成 50%/);
  assert.match(h.el('#content').innerHTML,/距目标还有 5 kg/);
});

test('manual meal entry reveals editable results and saves without recognition',async()=>{
  const h=await harness();await h.click({action:'meal'});
  assert.equal(h.el('#meal-result').hidden,true);
  assert.equal(h.el('#meal-save').hidden,true);
  await h.click({mealManual:''});
  assert.equal(h.el('#meal-result').hidden,false);
  assert.equal(h.el('#meal-setup').hidden,true);
  await h.submit({type:'午餐',name:'米饭',amount:'一碗',kcal:'200',protein:'',carbs:'',fat:''});
  assert.equal(Object.values(h.state.days).find(d=>d.meals.length).meals[0].name,'米饭');
});

test('food totals derive from items and keep any incomplete nutrient unknown',()=>{
  const {foodTotals,normalizeFood}=require('../core');
  const foods=[{name:'米饭',amount:'100 g',kcal:130.1,nutrients:{protein:3,carbs:28,fat:0}},{name:'鸡蛋',amount:'1 个',kcal:80.2,nutrients:{protein:6,carbs:0,fat:5}}].map(normalizeFood);
  assert.deepEqual(foodTotals(foods),{kcal:210.3,nutrients:{protein:9,carbs:28,fat:5}});
  delete foods[1].nutrients.fat;
  assert.deepEqual(foodTotals(foods),{kcal:210.3,nutrients:{protein:9,carbs:28}});
  assert.equal(foodTotals([]).kcal,null);
  assert.equal(foodTotals([{kcal:null}]).kcal,null);
  assert.throws(()=>normalizeFood({name:'食物',amount:'一份',kcal:-1}));
});

test('nutrition targets are optional, persisted in profile and reflected on home',async()=>{
  const h=await harness();await h.click({action:'nutrition-goal'});
  await h.submit({'goal-kcal':'1800','goal-protein':'90','goal-carbs':'','goal-fat':'50.5'});
  assert.deepEqual(h.state.profile.nutritionTargets,{kcal:1800,protein:90,fat:50.5});
  assert.match(h.el('#content').innerHTML,/目标 1800 kcal/);
  assert.match(h.el('#content').innerHTML,/未设目标/);
  await h.click({action:'profile'});await h.submit({age:'30',height:'165',weight:'60',activity:'轻度活动'});
  assert.equal(h.state.profile.nutritionTargets.kcal,1800);
});


test('stale health return flag never opens import dialog on a new visit',async()=>{
  let reads=0;
  const h=await harness({}, {healthPending:true,clipboard:{readText:async()=>{reads++;return '{}';}}});
  await h.event('window:pageshow');await h.event('window:focus');
  await h.event('visibilitychange','hidden');await h.event('visibilitychange','visible');
  assert.notEqual(h.el('#sheet').open,true);assert.equal(reads,0);
});

test('closing health import cancels clipboard reads on return',async()=>{
  let reads=0;
  const h=await harness({}, {clipboard:{readText:async()=>{reads++;return '{}';}}});
  await h.click({healthLaunch:''});
  await h.event('visibilitychange','hidden');
  await h.click({action:'close'});
  await h.event('window:focus');await h.event('visibilitychange','visible');
  assert.equal(h.el('#sheet').open,false);assert.equal(reads,0);
});

test('health import uses preview and save with two decimal display and original precision',async()=>{
  const h=await harness();await h.click({action:'health'});
  assert.doesNotMatch(h.el('#sheet-body').innerHTML,/data-health-clipboard|粘贴并导入/);
  h.el('#health-json').value=JSON.stringify({weight:65.12345,weightDate:'2026-01-02',distance:[{start:'2026-01-02 10:00',end:'2026-01-02 11:00',value:1.23678,unit:'km'}],steps:[{start:'2026-01-02 10:00',end:'2026-01-02 11:00',value:123,unit:'count'}]});
  await h.click({healthPreview:''});
  const preview=h.el('#health-preview').innerHTML;
  assert.match(preview,/65\.12 kg/);assert.match(preview,/1\.24 km/);assert.match(preview,/123\.00 步/);
  await h.submit({'replace-weight':'on'});
  assert.equal(h.el('#sheet').open,false);
  assert.equal(h.state.days['2026-01-02'].weight,65.12345);
  assert.equal(h.state.days['2026-01-02'].healthSamples.find(r=>r.metric==='distance').value,1.23678);
});


test('explicit shortcut return pastes once and failed permission is not retried on focus',async()=>{
  for(const denied of [false,true]){
    let reads=0;
    const h=await harness({}, {clipboard:{readText:async()=>{reads++;if(denied)throw Error('denied');return JSON.stringify({weight:60.123,weightDate:'2026-01-02'});}}});
    await h.click({healthLaunch:''});h.el('#health-json').value='';
    await h.event('visibilitychange','hidden');await h.event('visibilitychange','visible');
    await h.event('window:focus');
    await h.event('visibilitychange','hidden');await h.event('visibilitychange','visible');
    assert.equal(reads,1);assert.equal(h.el('#sheet').open,true);
    if(denied)assert.match(h.el('#form-error').textContent,/长按输入框粘贴/);
    else assert.match(h.el('#health-json').value,/60.123/);
  }
});
