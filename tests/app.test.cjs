const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {cyclePhase,videoLink,trendSeries,energyBalance}=require('../core');

test('calendar phase boundaries, historical cycles and uncovered dates',()=>{
  const cycle={records:[{start:'2026-09-01',length:28,duration:5},{start:'2026-10-02',length:28,duration:5}]};
  const cases={'2026-09-01':'menstrual','2026-09-05':'menstrual','2026-09-06':'follicular','2026-09-14':'follicular','2026-09-15':'luteal','2026-09-23':'luteal','2026-09-24':'late-luteal','2026-09-28':'late-luteal','2026-10-02':'menstrual'};
  for(const [date,phase] of Object.entries(cases))assert.equal(cyclePhase(date,cycle).key,phase,date);
  for(const date of ['2026-08-31','2026-09-29','2026-10-30'])assert.equal(cyclePhase(date,cycle),null,date);
  assert.equal(cyclePhase('2026-10-04',{start:'2026-10-02',length:28,duration:5}).key,'menstrual');
});
test('new actual period overrides a previous estimated window',()=>{
  const cycle={records:[{start:'2026-10-01',length:28,duration:5},{start:'2026-10-24',length:30,duration:6}]};
  assert.equal(cyclePhase('2026-10-24',cycle).key,'menstrual');
});
test('platform links accept share text and reject foreign hosts and unsafe protocols',()=>{
  assert.equal(videoLink('复制打开抖音 https://v.douyin.com/abc/ 看视频','douyin'),'https://v.douyin.com/abc/');
  assert.equal(videoLink('https://www.douyin.com/video/123','douyin'),'https://www.douyin.com/video/123');
  assert.equal(videoLink('https://b23.tv/abc','bilibili'),'https://b23.tv/abc');
  for(const url of ['javascript:alert(1)','http://v.douyin.com/x','https://v.douyin.com.evil.test/x','https://evil.test/?url=https://v.douyin.com/x'])assert.equal(videoLink(url,'douyin'),null);
  assert.equal(videoLink('https://b23.tv/abc','douyin'),null);
});
function harness(initial={}){
  const events={},els={};let stored=initial,fields={};
  function el(s){return els[s]||=( {innerHTML:'',dataset:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(t,fn){events[s+':'+t]=fn;},showModal(){},close(){}});}
  const doc={querySelector:el,querySelectorAll:()=>[],addEventListener(t,fn){events[t]=fn;}};
  const ctx={document:doc,localStorage:{getItem(){return JSON.stringify(stored);},setItem(k,v){stored=JSON.parse(v);}},window:{scrollTo(){}},QingxunCore:require('../core'),FormData:class{constructor(){return Object.entries(fields);}},Intl,Date,URL,setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),ctx);
  return {el,get state(){return stored;},click(dataset){events.click({target:{closest(){return {dataset};}}});},change(target){events.change({target});},submit(values){fields=values;events['#sheet-form:submit']({preventDefault(){}});}};
}
test('home begins with budget, measurements persist and calendar renders phase colors',()=>{
  const h=harness();
  assert.match(h.el('#content').innerHTML,/今天的热量收支/);
  assert.doesNotMatch(h.el('#content').innerHTML,/greeting|cycle-banner|认识你的身体节奏/);
  h.click({action:'measurements'});h.submit({chest:'',waist:'80.5',hip:'99',thigh:'',arm:'',calf:''});
  const d=Object.values(h.state.days).find(d=>d.measurements?.waist);
  assert.equal(d.measurements.waist,80.5);assert.equal(d.weight,undefined);
  assert.doesNotMatch(h.el('#content').innerHTML,/80.5/);
  h.click({go:'measurements'});
  assert.match(h.el('#content').innerHTML,/80.5/);
  assert.match(h.el('#content').innerHTML,/腰围趋势/);
  const current=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  h.click({action:'cycle'});h.submit({start:current.slice(0,8)+'01',length:'28',duration:'5'});
  h.click({page:'calendar'});
  for(const key of ['menstrual','follicular','luteal','late-luteal'])assert.match(h.el('#content').innerHTML,new RegExp('class="phase-'+key));
  assert.match(h.el('#content').innerHTML,/腰围 80.5 cm/);
});
test('trend data uses only real values in date order, omits future and missing entries',()=>{
  const data={'2026-10-04':{weight:61},'2026-10-01':{weight:60,measurements:{waist:75}},'2026-10-02':{},'2026-11-01':{weight:62}};
  assert.deepEqual(trendSeries(data,'weight','2026-10-20'),[{date:'2026-10-01',value:60},{date:'2026-10-04',value:61}]);
  assert.deepEqual(trendSeries(data,'waist','2026-10-20'),[{date:'2026-10-01',value:75}]);
});
test('weight edits preserve circumferences, circumference edits preserve weight',()=>{
  const h=harness();h.click({action:'weight'});h.submit({weight:'60'});
  h.click({action:'measurements'});h.submit({waist:'75'});
  h.click({action:'weight'});h.submit({weight:'60.5'});
  const d=Object.values(h.state.days).find(d=>d.weight);
  assert.equal(d.weight,60.5);assert.equal(d.measurements.waist,75);
  assert.doesNotMatch(h.el('#content').innerHTML,/腰围/);
});
test('four category checkboxes persist and general undo clears them',()=>{
  const h=harness();h.click({page:'train'});
  assert.match(h.el('#content').innerHTML,/data-training="shoulder"/);
  h.change({dataset:{training:'legs'},checked:true});
  let d=Object.values(h.state.days).find(d=>d.exercise);
  assert.deepEqual(d.trainingCategories,['legs']);
  h.click({action:'exercise'});
  d=Object.values(h.state.days)[0];assert.equal(d.exercise,false);assert.deepEqual(d.trainingCategories,[]);
});
test('energy balance requires complete intake and expenditure and sums resting plus active once',()=>{
  const d={meals:[{kcal:1400}],energy:{resting:1300,active:500,complete:false}};
  assert.equal(energyBalance(d).status,'partial');
  d.energy.complete=true;assert.equal(energyBalance(d).status,'partial');
  d.intakeComplete=true;assert.deepEqual(energyBalance(d),{intake:1400,total:1800,difference:400,status:'complete'});
  assert.equal(energyBalance({meals:[]}).status,'missing');
  d.meals[0].kcal=2000;assert.equal(energyBalance(d).difference,-200);
});
test('training migration, Douyin save and stretch filtering',()=>{
  const h=harness({videos:[{category:'全身',title:'旧收藏',url:'https://b23.tv/old'}]});
  h.click({page:'train'});
  assert.doesNotMatch(h.el('#content').innerHTML,/今天，想动一动哪里|data-filter="全身"/);
  assert.match(h.el('#content').innerHTML,/data-filter="体态"/);
  h.click({platform:'douyin'});h.submit({title:'拉伸练习',url:'复制 https://v.douyin.com/abc/ 打开',category:'拉伸'});
  assert.equal(h.state.videos[0].category,'体态');
  assert.equal(h.state.videos[1].platform,'douyin');
  h.click({filter:'拉伸'});
  assert.match(h.el('#content').innerHTML,/拉伸练习/);
  assert.doesNotMatch(h.el('#content').innerHTML,/旧收藏/);
});
test('PWA manifest paths and offline shell assets exist',()=>{
  const path=require('node:path'),base=path.resolve(__dirname,'..');
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');
  for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(base,icon.src)));
  const sw=fs.readFileSync(path.join(base,'sw.js'),'utf8');
  const assets=sw.match(/const SHELL=\[([^;]+)\];/)[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
  for(const asset of assets)assert.ok(fs.existsSync(path.join(base,asset)),asset);
  assert.ok(assets.includes('./mobile.css'));
});
