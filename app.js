(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const content = $('#content'), sheet = $('#sheet'), form = $('#sheet-form');
  const dateKey = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai'}).format(new Date());
  const today = new Date(dateKey+'T12:00:00');
  const storage=QingxunStorage.createStorage();
  let state=await storage.load();
  state = state && typeof state === 'object' ? state : {};
  state.profile ||= {age:'',height:'',weight:'',activity:''};
  state.days ||= {}; state.videos ||= []; state.cycle ||= {}; state.reminders ||= {water:'10:00',exercise:'19:00',goal:2000};
  state.videos.forEach(v=>{if(v.category==='全身')v.category='体态';if(v.category==='腿臀')v.category='臀腿';v.platform ||= 'bilibili';});
  const {cyclePhase,phases,videoLink,trendSeries,energyBalance,nutrientTotals,weightProgress,foodTotals,normalizeFood}=QingxunCore;
  const measurements=[['chest','胸围'],['waist','腰围'],['hip','臀围'],['thigh','大腿围'],['arm','上臂围'],['calf','小腿围']];
  const measurementText=d=>measurements.filter(([key])=>d.measurements?.[key]).map(([key,label])=>`${label} ${d.measurements[key]} cm`).join(' · ');
  let page='today', month=today.getMonth(), year=today.getFullYear(), selected=dateKey, filter='全部', mealType='早餐';
  let draftFoods=null;
  let healthDraft=null;
  const healthPendingKey='qingxun-health-request';
  function applyHealth(rows,replaceWeight=true){
    for(const row of rows){
      const d=day(row.date);
      if(row.metric==='weight'){if(replaceWeight||!d.weight)d.weight=row.value;}
      else{d.healthSamples ||= [];if(!d.healthSamples.some(old=>JSON.stringify(old)===JSON.stringify(row)))d.healthSamples.push(row);}
    }
  }
  function launchHealth(){
    try{
      const request=crypto.randomUUID();
      localStorage.setItem(healthPendingKey,JSON.stringify({request,created:Date.now()}));
      const callback=new URL(location.href);callback.search='';callback.hash='';
      callback.searchParams.set('health-return','1');callback.searchParams.set('request',request);
      const link=new URL('shortcuts://x-callback-url/run-shortcut');
      link.searchParams.set('name','健康数据导出');
      link.searchParams.set('x-success',callback.href);
      const cancel=new URL(callback);cancel.searchParams.set('cancelled','1');
      link.searchParams.set('x-cancel',cancel.href);link.searchParams.set('x-error',callback.href);
      location.href=link.href;
    }catch{toast('无法启动快捷指令，请使用粘贴导入');}
  }
  async function importHealthClipboard(){
    try{
      const text=await navigator.clipboard.readText();
      $('#health-json').value=text;healthDraft=parseHealth(text);
      const before=JSON.parse(JSON.stringify(state));
      try{applyHealth(healthDraft.rows);await save();}catch(error){state=before;throw error;}
      sheet.close();render();toast('健康数据已导入，体重已按日期更新');
    }catch(error){$('#form-error').textContent=error.name==='NotAllowedError'||!navigator.clipboard?'系统未允许读取剪贴板，请长按输入框粘贴后预览保存。':error instanceof SyntaxError?'剪贴板不是有效的健康数据 JSON，请重新运行快捷指令。':error.message;}
  }
  async function receiveHealth(){
    const url=new URL(location.href);
    if(url.searchParams.get('health-return')!=='1')return;
    const raw=url.searchParams.get('result'),request=url.searchParams.get('request'),cancelled=url.searchParams.has('cancelled'),failed=url.searchParams.has('errorMessage');
    for(const key of ['health-return','request','result','cancelled','errorMessage'])url.searchParams.delete(key);
    history.replaceState(null,'',url.pathname+url.search+url.hash);
    if(cancelled||failed){toast(cancelled?'已取消健康数据导入':'快捷指令运行失败，可重试或粘贴导入');return;}
    if(!raw){open('health');$('#form-error').textContent='快捷指令未返回数据。请让最后一个动作输出最终合并字典，或使用粘贴并导入。';return;}
    try{
      const draft=parseHealth(raw);let pending=null;
      try{pending=JSON.parse(localStorage.getItem(healthPendingKey));}catch{}
      if(!pending||pending.request!==request||Date.now()-pending.created>15*60*1000){
        open('health');$('#health-json').value=raw;
        $('#form-error').textContent='返回到了其他浏览器，或同步请求已过期，未自动保存。若从桌面网站启动，请回原桌面网站粘贴导入；此处的本地记录可能独立。';return;
      }
      const before=JSON.parse(JSON.stringify(state));
      try{applyHealth(draft.rows);await save();}catch(error){state=before;throw error;}
      localStorage.removeItem(healthPendingKey);render();
      toast('已自动导入 '+draft.rows.length+' 条有效记录'+(draft.warnings.length?'，无效数据已跳过':''));
    }catch(error){open('health');$('#health-json').value=raw;$('#form-error').textContent=error instanceof SyntaxError?'快捷指令返回的不是完整 JSON，请改用最终合并字典作为输出。':error.message;}
  }
  function healthDate(raw){
    const m=String(raw??'').trim().match(/^(\d{4})[年-](\d{1,2})[月-](\d{1,2})(?:日)?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if(!m)return null;
    const [,y,mo,d,h='0',mi='0',s='0']=m,dt=new Date(Date.UTC(+y,+mo-1,+d,+h,+mi,+s));
    if(dt.getUTCFullYear()!==+y||dt.getUTCMonth()!==+mo-1||dt.getUTCDate()!==+d||+h>23||+mi>59||+s>59)return null;
    const date=[y,mo.padStart(2,'0'),d.padStart(2,'0')].join('-');
    if(date>dateKey)return null;
    return {date,time:date+'T'+h.padStart(2,'0')+':'+mi.padStart(2,'0')+':'+s.padStart(2,'0')};
  }
  function parseHealth(text){
    if(text.length>2000000)throw Error('数据过大，请缩短快捷指令查询范围');
    const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('请粘贴最终合并字典的 JSON');
    const rows=[],warnings=[];
    const wd=healthDate(data.weightDate);
    if(typeof data.weight==='number'&&data.weight>=30&&data.weight<=250&&wd)rows.push({metric:'weight',value:data.weight,...wd});
    else warnings.push('体重缺失或无效，已跳过（不会保存为 0）');
    for(const [key,unit,max] of [['steps','count',200000],['distance','km',500]]){
      const items=data[key]==null?[]:Array.isArray(data[key])?data[key]:[data[key]];
      if(items.length>20000)throw Error('样本过多，请缩短查询范围');
      let skipped=0;
      for(const item of items){
        const start=healthDate(item?.start),end=healthDate(item?.end);
        if(!start||!end||start.date!==end.date||end.time<start.time||item.unit!==unit||typeof item.value!=='number'||!Number.isFinite(item.value)||item.value<0||item.value>max||(key==='steps'&&!Number.isInteger(item.value))){skipped++;continue;}
        rows.push({metric:key,value:item.value,...start,end:end.time});
      }
      if(skipped)warnings.push(`${key==='steps'?'步数':'距离'}有 ${skipped} 条格式、日期或单位无效，已跳过`);
    }
    const unique=[...new Map(rows.map(r=>[JSON.stringify(r),r])).values()];
    if(!unique.length)throw Error('没有有效记录，请确认数值、日期和单位');
    return {rows:unique,warnings};
  }
  function healthPanel(){
    const records=day().healthSamples||[],steps=records.filter(r=>r.metric==='steps'),distance=records.filter(r=>r.metric==='distance');
    const imported=Object.entries(state.days).filter(([,d])=>d.healthSamples?.length).sort(([a],[b])=>b.localeCompare(a)).slice(0,7);
    return `<section class="panel"><div class="row"><h3>健康记录</h3><button class="small-btn" data-health-launch>导入健康数据</button></div><div class="stats"><div><small>今日步数样本合计</small><strong>${steps.length?steps.reduce((n,r)=>n+r.value,0):'—'}</strong><em>步</em></div><div><small>今日距离样本合计</small><strong>${distance.length?(distance.reduce((n,r)=>n+r.value,0)).toFixed(2):'—'}</strong><em>km</em></div></div><button type="button" class="small-btn" data-action="health">粘贴导入 / 使用说明</button><p class="info">来自快捷指令导入的样本，可能不完整或有来源重叠，不代表健康 App 的全天统计；不用于计算热量缺口。</p>${imported.length?`<details><summary>最近导入记录</summary>${imported.map(([date,d])=>`<div class="row"><span>${date}</span><small>${d.healthSamples.length} 条活动样本</small></div>`).join('')}</details>`:''}</section>`;
  }
  let draftPhoto='',photoVersion=0,recognition=null,recognitionCode='',editingMeal=null;
  const recognitionConfig=globalThis.QingxunConfig||{recognitionUrl:'./api/recognize',recognitionRequiresCode:false};
  let videoPlatform='bilibili';
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day = (key=dateKey) => state.days[key] ||= {water:0,exercise:false,meals:[]};
  let saving=Promise.resolve();
  const save = () => {
    const snapshot=JSON.parse(JSON.stringify(state));
    const task=saving.then(()=>storage.save(snapshot)).then(()=>{$('#storage-alert').hidden=true;});
    saving=task.catch(error=>{const alert=$('#storage-alert');alert.hidden=false;alert.textContent='记录尚未保存：'+error.message+'。请保留此页面后重试。';toast('保存失败，记录尚未写入本机');});
    return task;
  };
  const saveQuietly=()=>{save().catch(()=>{});};
  function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2800);}
  const summary = key => {const d=day(key);return {kcal:Math.round(d.meals.reduce((n,m)=>n+Number(m.kcal||0),0)*10)/10,water:d.water,meals:d.meals.length};};
  const head = (eyebrow,title,sub) => `<div class="page-head"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2><p class="subtitle">${sub}</p></div>`;
  function cycleStatus(){
    if(!state.cycle.start)return {title:'认识你的身体节奏',detail:'记录上次经期，开始了解自己的周期'};
    const phase=cyclePhase(dateKey,state.cycle);
    if(!phase)return {title:'等待更新经期记录',detail:'已超出预设周期，请记录实际情况'};
    return {title:`${phase.label} · 周期第 ${phase.day} 天`,detail:'根据日期粗略估算，实际阶段可能不同'};
  }
  function trend(metric,label,unit){
    const points=trendSeries(state.days,metric,dateKey);
    if(!points.length)return `<div class="trend-empty">记录后，这里会慢慢画出${label}趋势。</div>`;
    const values=points.map(p=>p.value),low=Math.min(...values),high=Math.max(...values),pad=Math.max((high-low)*0.2,0.5),min=low-pad,max=high+pad;
    const first=Date.parse(points[0].date),last=Date.parse(points[points.length-1].date);
    const x=p=>points.length===1?177:46+(Date.parse(p.date)-first)/(last-first)*252,y=p=>112-(p.value-min)/(max-min)*90;
    const axis=[max,(min+max)/2,min].map(n=>`<line class="grid" x1="46" y1="${112-(n-min)/(max-min)*90}" x2="298" y2="${112-(n-min)/(max-min)*90}"/><text x="1" y="${116-(n-min)/(max-min)*90}">${n.toFixed(1)}</text>`).join('');
    const lastPoint=points[points.length-1],delta=lastPoint.value-points[0].value;
    return `<svg class="trend-chart" viewBox="0 0 320 145" role="img" aria-label="${label}趋势，单位${unit}，${points.length}次记录"><title>${label}趋势：${points.map(p=>p.date+' '+p.value+unit).join('；')}</title>${axis}${points.length>1?`<polyline class="line" points="${points.map(p=>x(p)+','+y(p)).join(' ')}"/>`:''}${points.map(p=>`<circle class="dot" cx="${x(p)}" cy="${y(p)}" r="4"><title>${p.date}：${p.value} ${unit}</title></circle>`).join('')}<text x="46" y="138">${points[0].date.slice(5).replace('-','/')}</text>${points.length>1?`<text x="298" y="138" text-anchor="end">${lastPoint.date.slice(5).replace('-','/')}</text>`:''}</svg><p class="trend-meta">最近 ${points.length} 次记录${points.length>1?' · 较首条 '+(delta>0?'+':'')+delta.toFixed(1)+' '+unit:' · 再记录一次，即可看到连线'}</p><details class="trend-records"><summary>查看记录</summary>${[...points].reverse().map(p=>`<div class="row"><span>${p.date}</span><span>${p.value} ${unit}</span></div>`).join('')}</details>`;
  }
  function measurementsPage(){
    return `<button class="back-link" data-go="today">‹ 返回今日</button>${head('BODY MEASUREMENTS','围度记录','每个部位，分别看见自己的变化。')}<button class="main-btn secondary" data-action="measurements">＋ 记录今天的围度</button><div style="height:16px"></div>${measurements.map(([key,label])=>{const points=trendSeries(state.days,key,dateKey),latest=points[points.length-1];return `<section class="panel"><div class="row"><h3>${label}</h3><span class="eyebrow">${latest?latest.date:'暂无记录'}</span></div><div class="measure-value">${latest?latest.value:'—'} <small>cm</small></div>${trend(key,label,'cm')}</section>`;}).join('')}`;
  }
  const trainingTypes=[['shoulder','肩背'],['legs','臀腿'],['posture','体态'],['stretch','拉伸']];
  function trainingChecks(){
    const completed=day().trainingCategories||[];
    return `<h3 class="section-title">今天完成了哪些练习？</h3><div class="category-checks">${trainingTypes.map(([key,label])=>`<label class="category-${key}"><input type="checkbox" data-training="${key}" ${completed.includes(key)?'checked':''}>${label}</label>`).join('')}</div><p class="info">已勾选 ${completed.length} 类 · 按今天的安排勾选即可。</p>`;
  }
  function weightGoalPanel(current){
    const goal=weightProgress(state.profile.goalStart,state.profile.goalTarget,current);
    if(!goal&&state.profile.goalStart&&state.profile.goalTarget)return `<div class="weight-goal-empty"><span>目标 ${escape(state.profile.goalTarget)} kg · 记录体重后查看进度</span><button type="button" class="small-btn" data-action="weight">记录体重 →</button></div>`;
    if(!goal)return `<div class="weight-goal-empty"><span>给变化一个方向</span><button type="button" class="small-btn" data-action="weight-goal">设置体重目标 →</button></div>`;
    return `<div class="weight-goal"><div class="row"><span>目标进度</span><button type="button" class="goal-edit" data-action="weight-goal">调整目标</button></div><div class="goal-progress-copy"><strong>${goal.percent}<small>%</small></strong><span>${goal.complete?'已达到目标':`距目标还有 ${goal.remaining} kg`}</span></div><progress max="100" value="${goal.percent}" aria-label="体重目标完成 ${goal.percent}%">${goal.percent}%</progress><div class="goal-endpoints"><span>起始 ${goal.start} kg</span><span>目标 ${goal.target} kg</span></div></div>`;
  }
  function intakePanel(){
    const d=day(),s=summary(dateKey),totals=nutrientTotals(d.meals),targets=state.profile.nutritionTargets||{},balance=energyBalance(d);
    const goal=Number.isFinite(Number(targets.kcal))&&Number(targets.kcal)>0?Number(targets.kcal):null,remaining=goal===null?null:Math.round((goal-s.kcal)*10)/10;
    const percent=goal===null?0:Math.min(100,s.kcal/goal*100);
    return `<section class="panel intake-panel"><div class="row"><h3>今日摄入</h3><button class="small-btn" data-action="nutrition-goal">${Object.keys(targets).length?'调整目标':'设置目标'} ↗</button></div><div class="intake-overview"><div class="intake-ring" style="--intake-progress:${percent}%"><div><small>${goal===null?'已记录摄入':remaining>=0?'距摄入目标还差':'已超出摄入目标'}</small><strong>${remaining===null?s.kcal:Math.abs(remaining)}</strong><span>kcal</span></div></div><div class="intake-macros">${nutrientFields.map(([key,label])=>{
      const item=totals[key],target=Number.isFinite(Number(targets[key]))&&Number(targets[key])>0?Number(targets[key]):null,known=item.grams!==null,ratio=known&&target!==null?Math.min(100,item.grams/target*100):0;
      const status=!item.total?'暂无记录':item.count===0?'未补充':item.count<item.total?`仅 ${item.count}/${item.total} 餐`:'已记录';
      return `<div class="intake-macro macro-${key}"><div class="row"><strong>${label}</strong><span>${known?item.grams:'—'} <small>/ ${target??'未设目标'}${target!==null?' g':''}</small></span></div><progress max="100" value="${ratio}" aria-label="${label}摄入进度"></progress><small class="macro-coverage">${status}${known&&target!==null&&item.grams>target?' · 超出 '+Math.round((item.grams-target)*10)/10+' g':''}</small></div>`;
    }).join('')}</div></div><div class="intake-caption"><span>已记录 <strong>${s.kcal}</strong> kcal</span><span>${goal===null?'设置每日摄入目标':`目标 ${goal} kcal`}</span></div><p class="intake-note">按已保存餐食累计${d.meals.length?' · '+d.meals.length+' 餐':''}；缺失的营养值不计为 0。</p>
    <details class="energy-details"><summary>热量收支 <span>${balance.status==='complete'?(balance.difference>=0?'估算缺口 ':'估算超出 ')+Math.round(Math.abs(balance.difference))+' kcal':'填写消耗后查看'}</span></summary><div class="energy-detail-body"><div class="row"><h3>消耗与身体档案</h3><button class="small-btn" data-action="profile">身体档案</button></div><p class="info">摄入目标用于记录进度；全天热量缺口按实际消耗减去摄入计算。</p><div class="stats"><div><small>静息消耗</small><strong>${d.energy?.resting??'—'}</strong><em>kcal</em></div><div><small>活动消耗</small><strong>${d.energy?.active??'—'}</strong><em>kcal</em></div><div><small>估算热量缺口</small><strong>${balance.status==='complete'?Math.round(balance.difference):'—'}</strong><em>kcal</em></div></div><button class="main-btn secondary" data-action="energy">填写手表消耗</button><label class="confirmation"><input id="intake-complete" type="checkbox" ${d.intakeComplete?'checked':''}>确认已记完今天的全部饮食与饮料</label><p class="info">${balance.status==='complete'?'已按全天完整记录估算。负数表示摄入高于消耗。':'饮食与消耗需均确认为全天完整，才显示全天缺口。'}</p></div></details></section>`;
  }
  function foodNutrientText(food){
    return nutrientFields.map(([key,label])=>`<span class="food-nutrient macro-${key}">${label} <strong>${escape(food.nutrients?.[key]??'—')}</strong>${food.nutrients?.[key]!=null?'g':''}</span>`).join('');
  }
  function mealRecord(meal,index){
    return `<article class="meal-record"><div class="meal-entry">${meal.photo?`<img src="${meal.photo}" alt="${escape(meal.type)}照片">`:''}<div class="meal-copy"><h3>${escape(meal.type)} · ${escape(meal.name)}</h3><p>${escape(meal.time)} · ${escape(meal.amount)}</p></div><div class="meal-actions"><strong>${escape(meal.kcal)} kcal</strong><button class="small-btn" data-edit-meal="${index}" aria-label="编辑${escape(meal.type)}">编辑</button></div></div><div class="food-nutrient-line">${foodNutrientText(meal)}</div>${meal.foods?.length?`<details class="food-record-details"><summary>查看 ${meal.foods.length} 项食物明细</summary>${meal.foods.map(food=>`<div class="food-record-row"><div class="row"><div><strong>${escape(food.name)}</strong><small>${escape(food.amount)}</small></div><b>${escape(food.kcal)} <small>kcal</small></b></div><div class="food-nutrient-line">${foodNutrientText(food)}</div></div>`).join('')}</details>`:'<p class="legacy-food-note">整餐记录 · 尚无逐项明细，可在编辑中补充。</p>'}</article>`;
  }
  function todayPage(){const d=day(), s=summary(dateKey),balance=energyBalance(d),weightPoints=trendSeries(state.days,'weight',dateKey),latestWeight=weightPoints[weightPoints.length-1];return `
    ${intakePanel()}${healthPanel()}
    <div class="tiles"><section class="panel next-meal"><div><span class="eyebrow">下一餐 · 好好吃饭</span><h3>${s.meals?'每一餐，都值得认真对待':'从第一餐开始记录'}</h3><p>${s.meals?'记录食物和份量，慢慢了解饮食习惯。':'拍张照片，也可以手动填写。'}</p></div><button class="small-btn" data-go="record">去记录一餐 →</button></section><button class="panel meal-cta" data-action="meal"><span class="camera">▣</span><div><h3>拍照记一餐</h3><p>照片 · 份量 · 热量</p></div></button></div>
    <section class="panel"><div class="row"><div class="water-title"><span>♧</span><div><h3>今天喝水</h3><small>目标 ${state.reminders.goal} ml · 可自行调整</small></div></div><button class="small-btn" data-action="reminders">提醒设置</button></div><div class="water-body"><div class="bottle" style="--fill:${Math.min(100,d.water/state.reminders.goal*100)}%"></div><div class="water-number"><strong>${d.water}</strong><small>/ ${state.reminders.goal} ml</small></div><div class="water-actions"><small>刚刚喝了多少？</small><div class="water-buttons">${[100,200,300].map(n=>`<button data-water="${n}">+${n}</button>`).join('')}</div></div></div></section>
    <section class="panel"><div class="row"><h3>☀ 今天动一动</h3><span class="tag">按身体状态安排</span></div><div class="task"><input type="checkbox" id="exercise" ${d.exercise?'checked':''}><label for="exercise">完成今天的运动<small>散步、拉伸，或你喜欢的练习</small></label><button class="small-btn" data-go="train">去跟练 ↗</button></div></section>
    <section class="panel"><div class="row"><h3>体重记录</h3><button class="small-btn" data-action="weight">记一下</button></div><div class="weight-num">${latestWeight?.value||state.profile.weight||'—'} <small>kg</small></div><p class="info">${d.weight?'今日已记录体重':latestWeight?'最近记录于 '+latestWeight.date:'今日还未记录体重'}</p>${weightGoalPanel(latestWeight?.value||state.profile.weight)}${trend('weight','体重','kg')}</section><button class="panel measurement-entry" data-go="measurements"><span><h3>围度记录</h3><small>查看各部位记录与趋势线</small></span><span aria-hidden="true">›</span></button><p class="footer-note">不赶时间，和身体好好相处。</p>`;}
  const nutrientFields=[['protein','蛋白质'],['carbs','碳水'],['fat','脂肪']];
  function nutrientsPanel(meals){
    const totals=nutrientTotals(meals),complete=meals.filter(m=>nutrientFields.every(([key])=>typeof m.nutrients?.[key]==='number'&&Number.isFinite(m.nutrients[key])&&m.nutrients[key]>=0&&m.nutrients[key]<=2500)).length;
    return `<section class="panel nutrition-panel" aria-label="今日营养记录"><div class="nutrients">${nutrientFields.map(([key,label])=>{const item=totals[key];return `<div><small>${label}</small><strong>${item.grams===null?'—':item.grams+' <span>g</span>'}</strong><span class="nutrient-coverage">${!item.total?'暂无记录':!item.count?'尚未补充':item.count<item.total?'已记录 '+item.count+'/'+item.total+' 餐':'已记录合计'}</span></div>`;}).join('')}</div><p class="nutrition-note">${!meals.length?'记录餐食后，在这里查看营养合计。':complete<meals.length?'还有 '+(meals.length-complete)+' 餐营养信息不完整，点击餐食旁的「编辑」补充。':'合计来自已记录餐食，识别数值为估算。'}</p></section>`;
  }
  function recordPage(){
    const d=day(),s=summary(dateKey);
    return head('FOOD & BODY','把日常，轻轻记下。','每一餐和每一次努力，都在这里。')+`
      <div class="record-day-title">${Number(dateKey.slice(5,7))} 月 ${Number(dateKey.slice(8))} 日 · 今天</div><div class="record-summary"><div><small>总摄入</small><strong>${s.kcal} <span>kcal</span></strong></div><div><small>摄入目标</small><strong>${escape(state.profile.nutritionTargets?.kcal??'—')} <span>kcal</span></strong></div><div><small>已记录</small><strong>${s.meals} <span>餐</span></strong></div></div>
      <div class="panel"><div class="row"><h3>今日饮食</h3><span class="tag">${s.kcal} kcal · 已记录</span></div>
      <div class="meal-types">${[['早餐','🍞'],['午餐','🍚'],['晚餐','🥗'],['加餐','🍓']].map(([t,e])=>`<button data-meal="${t}"><span>${e}</span>${t}<em>＋</em></button>`).join('')}</div>
      ${d.meals.length?d.meals.map(mealRecord).join(''):`<div class="empty"><span>🥣</span><h3>今天的第一餐，会是什么？</h3><p>选一餐，拍照或输入食物。</p></div>`}</div>
      ${nutrientsPanel(d.meals)}
      <p class="info">支持照片识别或手动记录。识别的份量、热量和营养为估算，保存前请核对食物、份量和用油。</p>
      <h3 class="section-title">身体与运动</h3><div class="panel plain-list body-activity">
      <div class="row"><div class="body-copy"><strong>体重与围度</strong><small>${d.weight?d.weight+' kg':'未记录体重'}${measurementText(d)?' · '+measurementText(d):''}</small></div><button class="small-btn" data-action="weight">记录 ›</button></div>
      <div class="row"><div class="body-copy"><strong>围度趋势</strong><small>各部位记录与变化</small></div><button class="small-btn" data-go="measurements">查看 ›</button></div>
      <div class="row"><div class="body-copy"><strong>运动打卡</strong><small>${d.exercise?'今天已完成':'今天还没有打卡'}</small></div><button class="small-btn" data-action="exercise">${d.exercise?'取消打卡':'完成打卡'}</button></div></div>`;
  }
  function cyclePage(){const c=cycleStatus();return head('YOUR BODY, YOUR RHYTHM','跟着身体的节奏。','记录真实发生的，再慢慢了解规律。')+`<section class="panel"><div class="row"><span class="cycle-icon">❋</span><span class="tag">${state.cycle.start?'日期估算':'尚未设置'}</span></div><h2 style="font-size:23px;margin-top:20px">${c.title}</h2><p class="info">${c.detail}</p>${state.cycle.start?`<div class="plain-list"><div class="row"><span>最近经期开始</span><span>${escape(state.cycle.start)}</span></div><div class="row"><span>通常周期 / 经期</span><span>${state.cycle.length} / ${state.cycle.duration} 天</span></div></div>`:''}<button class="main-btn" data-action="cycle">${state.cycle.start?'更新经期记录':'记录上次经期'}</button></section><h3 class="section-title">周期里的四种节奏</h3><div class="phases"><div class="phase">01 · 经期<small>记录出血、疼痛与疲劳</small></div><div class="phase">02 · 卵泡期<small>观察精力、饥饿感与恢复</small></div><div class="phase">03 · 黄体期<small>留意食欲、睡眠和身体感受</small></div><div class="phase">04 · 黄体后期<small>记录经前症状与体重波动</small></div></div><section class="panel" style="margin-top:16px"><h3>今天身体感觉怎么样？</h3><p class="info">${escape(day().symptom||'还没有记录。用几个字描述就好。')}</p><button class="main-btn secondary" data-action="symptom">记录身体感受</button></section><p class="info">黄体后期是黄体期的一部分；这里单独展示，便于回顾经前变化。日期只能估算阶段，不能确认排卵，也不能用于避孕。热量方案还需结合活动量、健康情况和体重趋势制定。</p>`;}
  function trainPage(){
    const vids=state.videos.filter(v=>filter==='全部'||v.category===filter);
    return `<div class="collection-actions"><button class="main-btn secondary" data-platform="bilibili">＋ 收藏 B 站跟练</button><button class="main-btn douyin-btn" data-platform="douyin">＋ 收藏抖音视频</button></div><div class="tabs">${['全部','肩背','臀腿','体态','拉伸'].map(t=>`<button data-filter="${t}" class="${filter===t?'selected':''}">${t}</button>`).join('')}</div><section class="panel">${vids.length?vids.map(v=>`<div class="video"><div class="video-thumb">▷</div><div class="video-copy"><h3>${escape(v.title)}</h3><p>${v.platform==='douyin'?'抖音':'B 站'} · ${escape(v.category)}</p><a href="${escape(v.url)}" target="_blank" rel="noopener noreferrer">打开跟练 ↗</a></div></div>`).join(''):`<div class="empty"><span>🧺</span><h3>喜欢的练习，放在这里</h3><p>收藏 B 站或抖音视频，按部位收好。<br>完成后回来打个勾。</p></div>`}<button class="main-btn" data-action="exercise">${day().exercise?'今天已打卡 · 点击撤销':'我完成了今天的运动 ✓'}</button>${trainingChecks()}</section><p class="info">可粘贴视频页面或抖音分享链接，点开前往对应平台。封面与视频内容暂不自动抓取。</p>`;
  }
  function calendarPage(){
    const start=new Date(year,month,1).getDay(),count=new Date(year,month+1,0).getDate(),d=day(selected),s=summary(selected),selectedPhase=cyclePhase(selected,state.cycle);
    return head('LITTLE THINGS ADD UP','日子里，藏着你的坚持。','按身体的节奏，回看每一天。')+`<section class="panel"><div class="row"><button class="calendar-arrow" data-month="-1" aria-label="上个月">‹</button><h3>${year} 年 ${month+1} 月</h3><button class="calendar-arrow" data-month="1" aria-label="下个月">›</button></div><div class="week">${'日一二三四五六'.split('').map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar">${'<span></span>'.repeat(start)}${Array.from({length:count},(_,i)=>{
      const k=`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,x=state.days[k],has=x&&(x.water||x.meals.length||x.weight||x.exercise||x.symptom||measurementText(x)),phase=cyclePhase(k,state.cycle);
      return `<button data-date="${k}" class="${phase?'phase-'+phase.key+' ':''}${k===selected?'selected ':''}${has?'recorded':''}" aria-label="${k}${phase?' '+phase.label+'（日期估算）':''}${has?' 有记录':''}" aria-pressed="${k===selected}">${i+1}</button>`;
    }).join('')}</div><div class="cycle-legend">${phases.map(p=>`<span><i class="phase-${p.key}"></i>${p.label}</span>`).join('')}</div><p class="info">${state.cycle.start?'颜色按填写的经期开始日、经期与周期天数估算；选中日期以深绿轮廓标记。':'填写经期日期后，日历会按四个阶段着色。'}<br>未覆盖的日期保持空白，超出预设周期后需更新记录。</p><button class="small-btn" data-action="cycle">${state.cycle.start?'更新经期记录':'填写经期日期'} →</button></section><section class="panel"><div class="row"><h3>${Number(selected.slice(5,7))} 月 ${Number(selected.slice(8))} 日</h3><span class="tag ${selectedPhase?'phase-'+selectedPhase.key:''}">${selectedPhase?selectedPhase.label+' · 估算':selected===dateKey?'今天':'日常回顾'}</span></div><div class="plain-list"><div class="row"><span>饮食</span><small>${s.meals?s.meals+' 餐 · '+s.kcal+' kcal':'暂无记录'}</small></div><div class="row"><span>饮水</span><small>${d.water} ml</small></div><div class="row"><span>体重</span><small>${d.weight?d.weight+' kg':'暂无记录'}</small></div><div class="row"><span>围度</span><small>${measurementText(d)||'暂无记录'}</small></div><div class="row"><span>运动</span><small>${d.exercise?'已打卡 ✓':'暂无打卡'}${d.trainingCategories?.length?' · '+trainingTypes.filter(([key])=>d.trainingCategories.includes(key)).map(([,label])=>label).join('、'):''}</small></div>${d.symptom?`<div class="row"><span>身体感受</span><small>${escape(d.symptom)}</small></div>`:''}</div></section><p class="footer-note">每一个小小的行动，都算数。</p>`;
  }
  function render(){content.innerHTML=({today:todayPage,cycle:cyclePage,record:recordPage,train:trainPage,calendar:calendarPage,measurements:measurementsPage})[page]();document.querySelectorAll('nav button').forEach(b=>{b.classList.toggle('active',b.dataset.page===(page==='measurements'?'today':page));b.setAttribute('aria-current',b.dataset.page===(page==='measurements'?'today':page)?'page':'false');});}
  function navigate(p){page=p;render();window.scrollTo({top:0,behavior:'smooth'});}
  function captureDraftFoods(){
    if(draftFoods===null)return;
    const number=value=>value==null||String(value).trim()===''?null:Number(value);
    draftFoods=draftFoods.map((food,index)=>{
      const value=key=>form.elements.namedItem(`food-${index}-${key}`)?.value??'';
      const nutrients={};
      for(const [key] of nutrientFields){const grams=number(value(key));if(grams!==null)nutrients[key]=grams;}
      return {name:String(value('name')),amount:String(value('amount')),kcal:number(value('kcal')),nutrients};
    });
  }
  function syncFoodTotals(){
    const detailed=draftFoods!==null;
    for(const key of ['name','amount','kcal',...nutrientFields.map(([key])=>key)])form.elements.namedItem(key).readOnly=detailed;
    $('#food-mode-note').textContent=detailed?'整餐数值按下面的食物明细自动合计；请在明细中修改。营养项缺失时，整餐该项暂不合计。':'当前为整餐记录。建立明细时，已有整餐数据会作为一项保留，再由你修改拆分。';
    $('#food-add').textContent=detailed?'＋ 添加一种食物':'＋ 建立食物明细';
    $('#meal-save').disabled=detailed&&!draftFoods.length;
    if(!detailed)return;
    const total=foodTotals(draftFoods);
    form.elements.namedItem('kcal').value=total.kcal??'';
    for(const [key] of nutrientFields)form.elements.namedItem(key).value=total.nutrients[key]??'';
    form.elements.namedItem('name').value=draftFoods.map(f=>f.name.trim()).filter(Boolean).join('、').slice(0,100);
    form.elements.namedItem('amount').value=draftFoods.map(f=>f.name.trim()+' '+f.amount.trim()).filter(t=>t.trim()).join('，').slice(0,100);
  }
  function renderFoodEditor(){
    $('#food-editor').innerHTML=draftFoods===null?'':draftFoods.map((food,index)=>`<details class="food-edit-card" ${index===draftFoods.length-1?'open':''}><summary>食物 ${index+1} · ${escape(food.name||'待填写')}</summary><div class="food-edit-body"><div class="food-edit-head"><span>该份食物的实际摄入值</span><button type="button" data-remove-food="${index}">移除</button></div><div class="food-edit-fields"><label>食物名称<input name="food-${index}-name" data-food-index="${index}" value="${escape(food.name)}" maxlength="100" required></label><label>实际份量<input name="food-${index}-amount" data-food-index="${index}" value="${escape(food.amount)}" maxlength="100" placeholder="例如：100 g / 半碗" required></label></div><label>热量 · kcal<input name="food-${index}-kcal" data-food-index="${index}" value="${escape(food.kcal??'')}" type="number" min="0" max="10000" step="0.1" inputmode="decimal" required></label><div class="food-edit-macros">${nutrientFields.map(([key,label])=>`<label class="macro-${key}">${label} · g<input name="food-${index}-${key}" data-food-index="${index}" value="${escape(food.nutrients?.[key]??'')}" type="number" min="0" max="2500" step="0.1" inputmode="decimal" placeholder="未知"></label>`).join('')}</div></div></details>`).join('');
    document.querySelectorAll('#food-editor input').forEach(input=>{input.disabled=form.dataset.mealStage!=='result';});
    syncFoodTotals();
  }
  function addDraftFood(){
    if(draftFoods===null){
      const name=form.elements.namedItem('name').value.trim(),amount=form.elements.namedItem('amount').value.trim(),raw=form.elements.namedItem('kcal').value;
      if(name&&amount&&raw!==''){
        const nutrients={};for(const [key] of nutrientFields){const raw=form.elements.namedItem(key).value;if(raw!=='')nutrients[key]=Number(raw);}
        draftFoods=[{name,amount,kcal:Number(raw),nutrients}];
      }else draftFoods=[{name:'',amount:'',kcal:null,nutrients:{}}];
    }else{
      captureDraftFoods();
      if(draftFoods.length>=30){toast('每餐最多记录 30 项食物');return;}
      draftFoods.push({name:'',amount:'',kcal:null,nutrients:{}});
    }
    renderFoodEditor();
  }
  function mealStage(stage){
    form.dataset.mealStage=stage;
    document.querySelectorAll('#food-editor input').forEach(input=>{input.disabled=stage!=='result';});
    if(stage==='result')sheet.scrollTop=0;
    $('#meal-setup').hidden=stage==='result';
    $('#meal-result').hidden=stage!=='result';
    $('#meal-save').hidden=stage!=='result';
    $('#meal-heading').textContent=stage==='result'?'核对这一餐':stage==='loading'?'正在识别':'记录这一餐';
    $('#meal-photo-card').hidden=!draftPhoto;
    $('#recognize-food').disabled=stage==='loading';
    $('#recognize-food').textContent=stage==='loading'?'正在分析照片…':'开始识别';
    $('#meal-choices').hidden=stage==='loading';
    $('#meal-type').disabled=stage==='loading';
    $('#meal-reselect').hidden=stage!=='result';
    form.elements.namedItem('kcal').required=stage==='result';
    form.elements.namedItem('name').required=stage==='result';
    form.elements.namedItem('amount').required=stage==='result';
  }
  function mealForm(){
    return `<div class="meal-heading"><span class="eyebrow">FOOD JOURNAL</span><h2 id="meal-heading">记录这一餐</h2><p>好好吃饭，也认真记下。</p></div>
      <label class="meal-type-label" for="meal-type">餐次<select id="meal-type" name="type">${['早餐','午餐','晚餐','加餐'].map(t=>`<option ${t===mealType?'selected':''}>${t}</option>`).join('')}</select></label>
      <div id="meal-photo-card" class="meal-photo-card" hidden><img id="photo-preview" alt="这一餐的照片" hidden><span class="scan-line" aria-hidden="true"></span><span class="photo-badge">本餐照片</span></div>
      <div id="meal-setup"><div id="meal-choices" class="meal-choices">
        <label class="meal-choice choice-camera"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h4l2-3h4l2 3h4v13H4z" stroke-linejoin="round"/><circle cx="12" cy="13" r="4"/></svg></span><strong>拍照识别</strong><small>拍下眼前这一餐</small><input id="food-camera" type="file" accept="image/*" capture="environment"></label>
        <label class="meal-choice choice-album"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7" stroke-linejoin="round"/></svg></span><strong>相册上传</strong><small>选择一张食物照片</small><input id="food-photo" type="file" accept="image/*"></label>
        <button type="button" class="meal-choice choice-manual" data-meal-manual><span aria-hidden="true">✎</span><strong>手动记录</strong><small>填写食物、份量与热量</small></button>
      </div>
      <details class="photo-tips"><summary>怎样拍得更清楚？</summary><p>光线充足，拍下整份食物，尽量让餐盘完整入镜。照片无法准确判断重量与用油，结果需自行核对。</p></details>
      ${recognitionConfig.recognitionRequiresCode?`<details class="recognition-access" ${recognitionCode?'':'open'}><summary>个人访问口令</summary><input id="recognition-code" type="password" aria-label="个人访问口令" autocomplete="off" maxlength="256" value="${escape(recognitionCode)}" placeholder="填写你的访问口令"><p>仅在当前页面暂存。</p></details>`:''}
      <button id="recognize-food" class="main-btn meal-primary" type="button" data-recognize>开始识别</button><p class="meal-privacy">点击识别后，照片会发送至 DeepSeek。</p></div>
      <p id="recognition-status" class="recognition-status" role="status" aria-live="polite"></p>
      <div id="meal-result" hidden><div class="meal-result-note">请核对食物和实际份量，下面的数值都可以修改。</div><section class="meal-result-card"><span class="result-label">本餐总热量 · 估算</span><label class="meal-kcal"><input aria-label="本餐热量 kcal" name="kcal" type="number" min="0" max="10000" step="0.1" inputmode="decimal" placeholder="0"><span>kcal</span></label><div class="meal-macros">${nutrientFields.map(([key,label])=>`<label class="macro-${key}">${label}<div><input aria-label="${label}克数" name="${key}" type="number" min="0" max="2500" step="0.1" inputmode="decimal" placeholder="—"><span>g</span></div></label>`).join('')}</div><p class="meal-result-footnote">营养项留空表示未知，确认不含时再填 0。</p></section>
      <section class="meal-result-card meal-food-fields"><h3>食物与份量</h3><label>吃了什么<input name="name" placeholder="例如：番茄炒蛋、米饭" maxlength="100"></label><label>实际份量<input name="amount" placeholder="例如：米饭 1 碗，炒蛋半份" maxlength="100"></label></section><section class="meal-result-card food-editor-section"><div class="row"><h3>食物明细</h3><span class="tag">按实际份量</span></div><p id="food-mode-note" class="food-mode-note"></p><div id="food-editor"></div><button id="food-add" class="main-btn secondary" type="button" data-add-food>＋ 建立食物明细</button></section></div>
      <button id="meal-reselect" class="meal-back" type="button" data-meal-reselect hidden>← 返回照片识别</button>`;
  }
  function preparePhoto(input){
    const file=input.files?.[0];
    if(!file)return;
    input.value='';
    if(!file.type.startsWith('image/')){toast('请选择图片文件');return;}
    if(file.size>20*1024*1024){toast('请选择小于 20 MB 的照片');return;}
    const version=++photoVersion;
    recognition?.abort();recognition=null;
    mealStage('setup');
    const button=$('#recognize-food'),status=$('#recognition-status');
    button.disabled=true;status.textContent='正在准备照片…';
    const fail=message=>{
      if(version!==photoVersion||!sheet.open)return;
      button.disabled=false;status.textContent=message;
    };
    const reader=new FileReader();
    reader.onerror=()=>fail('照片读取失败，请重新选择，或使用手动记录。');
    reader.onload=()=>{
      if(version!==photoVersion||!sheet.open)return;
      const img=new Image();
      img.onload=()=>{
        if(version!==photoVersion||!sheet.open)return;
        try{
          const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(img.width,img.height));
          canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
          canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
          draftPhoto=canvas.toDataURL('image/jpeg',.7);
          draftFoods=null;renderFoodEditor();
          for(const key of ['name','amount','kcal',...nutrientFields.map(([key])=>key)])form.elements.namedItem(key).value='';
          $('#photo-preview').src=draftPhoto;$('#photo-preview').hidden=false;
          $('#meal-photo-card').hidden=false;button.disabled=false;
          status.textContent='照片已准备好，点击开始识别。';
        }catch{fail('照片处理失败，请换一张 JPG 或 PNG，或使用手动记录。');}
      };
      img.onerror=()=>fail('无法读取这张照片，请换用 JPG 或 PNG，或使用手动记录。');
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  }
  async function recognize(){
    if(!draftPhoto){toast('请先选择一张食物照片');return;}
    if(recognition)return;
    if(recognitionConfig.recognitionRequiresCode){
      const field=$('#recognition-code');recognitionCode=field.value.trim();
      if(!recognitionCode){$('#recognition-status').textContent='请先填写个人访问口令，再点击识别。';field.closest('details').open=true;field.focus();return;}
    }
    const version=photoVersion,photo=draftPhoto,button=$('#recognize-food'),status=$('#recognition-status');
    const controller=new AbortController();recognition=controller;mealStage('loading');status.textContent='正在识别，请保持页面打开，通常需要一些时间…';
    const timer=setTimeout(()=>controller.abort(),65000);
    try{
      const headers={'Content-Type':'application/json'};
      if(recognitionConfig.recognitionRequiresCode)headers.Authorization='Bearer '+recognitionCode;
      const response=await fetch(recognitionConfig.recognitionUrl,{method:'POST',headers,body:JSON.stringify({image:photo}),signal:controller.signal});
      const result=await response.json().catch(()=>({error:'识别服务尚未就绪，请确认云函数已部署轻循识别代码'}));
      if(!response.ok)throw Error(result.error||'识别失败，请稍后重试');
      if(typeof result.name!=='string'||!result.name.trim()||typeof result.amount!=='string'||!result.amount.trim()||typeof result.kcal!=='number'||!Number.isFinite(result.kcal)||result.kcal<0||result.kcal>10000)throw Error('识别服务返回内容不正确，请确认云函数已更新');
      if(version!==photoVersion||form.dataset.kind!=='meal'||!sheet.open)return;
      if(result.foods!=null&&(!Array.isArray(result.foods)||!result.foods.length||result.foods.length>30))throw Error('食物明细格式不正确，请重新识别');
      const foods=result.foods==null?null:result.foods.map(normalizeFood);
      if(foods){const total=foodTotals(foods);if(total.kcal>10000||Object.values(total.nutrients).some(v=>v>2500))throw Error('食物明细合计超出范围，请重新识别');}
      for(const key of ['name','amount','kcal'])form.elements.namedItem(key).value=result[key];
      let nutrientCount=0;
      for(const [key] of nutrientFields){const grams=result.nutrients?.[key],valid=typeof grams==='number'&&Number.isFinite(grams)&&grams>=0&&grams<=2500;form.elements.namedItem(key).value=valid?grams:'';if(valid)nutrientCount++;}
      draftFoods=foods;renderFoodEditor();mealStage('result');
      status.textContent=foods?'已按食物明细合计，请逐项核对份量后保存。':nutrientCount===3?'已返回整餐估算；逐项识别需部署新版 Worker，也可手动建立明细。':'已填入食物与热量；营养数据未完整返回，可手动补充。若始终缺少营养，请更新云函数。';
    }catch(error){if(version===photoVersion)status.textContent=error.name==='AbortError'?'识别已取消或超时，可重试或手动填写。':error instanceof TypeError?'无法连接识别服务，请检查网络及云函数的跨域配置，或手动填写。':error.message;}
    finally{clearTimeout(timer);if(recognition===controller){recognition=null;button.disabled=false;if(form.dataset.mealStage==='loading')mealStage('setup');}}
  }
  function open(kind,mealIndex=null){recognition?.abort();recognition=null;photoVersion++;editingMeal=kind==='meal'?mealIndex:null;const existing=editingMeal===null?null:day().meals[editingMeal];draftPhoto=existing?.photo||'';draftFoods=existing?.foods?.length?JSON.parse(JSON.stringify(existing.foods)):null;if(existing)mealType=existing.type;form.dataset.kind=kind;sheet.classList.toggle('meal-sheet',kind==='meal');let body='';
    if(kind==='health'){healthDraft=null;body=`<h2>粘贴健康数据</h2><p class="info">运行名为「健康数据导出」的快捷指令后，可点「粘贴并导入」，或长按输入框粘贴后预览保存。自动返回需将快捷指令最后的输出设为最终合并字典。数据只保存在当前浏览器。</p><button type="button" class="main-btn secondary" data-health-clipboard>粘贴并导入</button><label>健康数据 JSON<textarea id="health-json" rows="8" maxlength="2000000" placeholder="粘贴快捷指令最终合并的字典"></textarea></label><button type="button" class="main-btn secondary" data-health-preview>预览数据</button><div id="health-preview" aria-live="polite"></div><label class="confirmation"><input name="replace-weight" type="checkbox" checked>按称重日期覆盖当天旧体重（无效体重跳过）</label>`;}
    if(kind==='profile')body=`<h2>了解你的身体</h2><p class="info">身体信息仅保存在当前浏览器，可随时修改。</p><div class="form-grid"><label>年龄<input name="age" type="number" min="18" max="100" value="${state.profile.age}" required></label><label>身高 · cm<input name="height" type="number" min="100" max="230" step="any" inputmode="decimal" value="${state.profile.height}" required></label></div><label>当前体重 · kg<input name="weight" type="number" min="30" max="250" step="any" inputmode="decimal" value="${state.profile.weight}" required></label><label>日常活动量<select name="activity"><option value="">请选择</option>${['久坐为主','轻度活动','中等活动','高强度活动'].map(v=>`<option ${state.profile.activity===v?'selected':''}>${v}</option>`).join('')}</select></label><p class="info">当前只保存档案，热量计算将在确认目标和健康情况后接入。</p>`;
    if(kind==='cycle')body=`<h2>记录经期</h2><label>最近一次经期开始日<input name="start" type="date" max="${dateKey}" value="${escape(state.cycle.start||'')}" required></label><div class="form-grid"><label>通常周期 · 天<input name="length" type="number" min="15" max="60" value="${state.cycle.length||28}" required></label><label>通常经期 · 天<input name="duration" type="number" min="1" max="14" value="${state.cycle.duration||5}" required></label></div><p class="info">28 天 / 5 天是可修改的输入默认值，并非你的实际记录。周期不规律时，阶段估算可能不适用。</p>`;
    if(kind==='meal')body=mealForm();
    if(kind==='nutrition-goal'){
      const targets=state.profile.nutritionTargets||{};
      body=`<h2>每日摄入目标</h2><p class="info">按自己的计划填写，不自动推算。留空表示不设置该项目标；这与手表的实际消耗记录分开计算。</p><label>热量 · kcal<input name="goal-kcal" type="number" min="1" max="10000" step="0.1" inputmode="decimal" value="${escape(targets.kcal??'')}" placeholder="未设置"></label>${nutrientFields.map(([key,label])=>`<label>${label} · g<input name="goal-${key}" type="number" min="0.1" max="2500" step="0.1" inputmode="decimal" value="${escape(targets[key]??'')}" placeholder="未设置"></label>`).join('')}`;
    }
    if(kind==='weight-goal'){
      const points=trendSeries(state.days,'weight',dateKey),current=points[points.length-1]?.value||state.profile.weight||'';
      body=`<h2>设置体重目标</h2><p class="info">填写自己的起点和目标，记录体重后自动更新进度。支持减重和增重。</p><label>起始体重 · kg<input name="start" type="number" min="30" max="250" step="any" inputmode="decimal" value="${escape(state.profile.goalStart||current)}" required></label><label>目标体重 · kg<input name="target" type="number" min="30" max="250" step="any" inputmode="decimal" value="${escape(state.profile.goalTarget||'')}" placeholder="填写你的目标" required></label>`;
    }
    if(kind==='weight')body=`<h2>记录今日体重</h2><label>体重 · kg<input name="weight" type="number" min="30" max="250" step="any" inputmode="decimal" value="${day().weight||''}" required></label><p class="info">尽量在相似时间、相似条件下测量。</p>`;
    if(kind==='measurements')body=`<h2>记录今日围度</h2><p class="info">可填写任意一项，单位 cm。</p><div class="form-grid">${measurements.map(([key,label])=>`<label>${label} · cm<input name="${key}" type="number" min="5" max="250" step="0.1" value="${day().measurements?.[key]||''}" placeholder="选填"></label>`).join('')}</div><p class="info">软尺保持水平，不勒紧。</p>`;
    if(kind==='energy')body=`<h2>记录 Apple Watch 消耗</h2><p class="info">目前手动填写，尚未连接苹果健康。请从健康 App 查看同一天的两项全天累计值，勿再加上单次训练热量。</p><label>静息能量 · kcal<input name="resting" type="number" min="0" max="10000" step="1" value="${day().energy?.resting??''}" required></label><label>活动能量 · kcal<input name="active" type="number" min="0" max="10000" step="1" value="${day().energy?.active??''}" required></label><label class="confirmation"><input name="complete" type="checkbox" ${day().energy?.complete?'checked':''}>确认是今天结束后的全天完整消耗</label><p class="info">静息能量＋活动能量＝估算总消耗。需同时确认饮食完整，才会显示全天缺口。</p>`;
    if(kind==='symptom')body=`<h2>听听身体的声音</h2><label>今天的身体感受<textarea name="symptom" maxlength="200" placeholder="例如：有些疲惫、容易饿、精神不错">${escape(day().symptom||'')}</textarea></label>`;
    if(kind==='reminders')body=`<h2>给日常留一点提醒</h2><label>每日饮水目标 · ml<input name="goal" type="number" min="250" max="5000" step="50" value="${state.reminders.goal}" required></label><div class="form-grid"><label>喝水提醒时间<input name="water" type="time" value="${state.reminders.water}" required></label><label>运动提醒时间<input name="exercise" type="time" value="${state.reminders.exercise}" required></label></div><p class="info">此处仅保存提醒偏好。手机定时通知尚未接入，关闭页面后不会发送提醒。</p>`;
    if(kind==='video')body=`<h2>收藏${videoPlatform==='douyin'?'抖音视频':'B 站跟练'}</h2><label>视频名称<input name="title" placeholder="例如：20 分钟肩背舒展" maxlength="60" required></label><label>${videoPlatform==='douyin'?'抖音视频 / 分享链接':'B 站视频链接'}<textarea name="url" placeholder="${videoPlatform==='douyin'?'粘贴抖音分享文字或 https://v.douyin.com/…':'https://www.bilibili.com/video/…'}" required></textarea></label><label>分类<select name="category">${['肩背','臀腿','体态','拉伸'].map(t=>`<option>${t}</option>`).join('')}</select></label><p class="info">${videoPlatform==='douyin'?'支持抖音视频页与短链接；分享文字中的链接会自动提取。':'支持 bilibili.com 与 b23.tv 的 HTTPS 链接。'}</p>`;
    $('#sheet-body').innerHTML=body+`<p id="form-error" class="error" role="alert"></p><button ${kind==='meal'?'id="meal-save" hidden':''} class="main-btn ${kind==='meal'?'meal-primary':''}" type="submit">${kind==='meal'?'确认并保存这一餐':'保存记录 ✓'}</button>`;sheet.showModal();
    if(kind==='meal')mealStage(existing?'result':'setup');
    sheet.scrollTop=0;
    if(existing){
      for(const key of ['name','amount','kcal'])form.elements.namedItem(key).value=existing[key]??'';
      for(const [key] of nutrientFields)form.elements.namedItem(key).value=existing.nutrients?.[key]??'';
      if(draftPhoto){$('#photo-preview').src=draftPhoto;$('#photo-preview').hidden=false;}
    }
    if(kind==='meal')renderFoodEditor();
  }
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if('healthLaunch' in b.dataset){launchHealth();return;}if('healthClipboard' in b.dataset){importHealthClipboard();return;}if('healthPreview' in b.dataset){healthDraft=null;try{healthDraft=parseHealth($('#health-json').value);const names={weight:'体重',steps:'步数',distance:'距离'};$('#health-preview').innerHTML='<p class="info">按实际记录日期保存；完全相同样本不会重复添加。活动样本未包含来源，无法消除不同设备的重叠记录，也不能推定为全天总量。</p>'+healthDraft.warnings.map(w=>'<p class="info">'+escape(w)+'</p>').join('')+'<p>有效记录 '+healthDraft.rows.length+' 条</p>'+healthDraft.rows.slice(0,50).map(r=>'<div class="row"><span>'+escape(r.time.replace('T',' '))+'</span><span>'+names[r.metric]+' '+r.value+' '+(r.metric==='weight'?'kg':r.metric==='steps'?'步':'km')+'</span></div>').join('');$('#form-error').textContent='';}catch(error){$('#health-preview').textContent='';$('#form-error').textContent=error instanceof SyntaxError?'JSON 格式不正确，请复制最终合并字典的完整内容':error.message;}return;}if('addFood' in b.dataset){addDraftFood();return;}if('removeFood' in b.dataset){captureDraftFoods();const index=Number(b.dataset.removeFood);if(Number.isInteger(index)&&draftFoods?.[index]){draftFoods.splice(index,1);renderFoodEditor();}return;}if('mealManual' in b.dataset){photoVersion++;recognition?.abort();recognition=null;mealStage('result');$('#recognition-status').textContent='手动填写食物与份量，营养可选填。';return;}if('mealReselect' in b.dataset){mealStage('setup');$('#recognition-status').textContent='可重新选择照片，或再次识别。';return;}if('editMeal' in b.dataset){const index=Number(b.dataset.editMeal);if(Number.isInteger(index)&&day().meals[index])open('meal',index);return;}if('recognize' in b.dataset){recognize();return;}if(b.dataset.platform){videoPlatform=b.dataset.platform;open('video');}if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.go)navigate(b.dataset.go);if(b.dataset.water){day().water+=Number(b.dataset.water);saveQuietly();render();toast('已记录 '+b.dataset.water+' ml，慢慢喝。');}if(b.dataset.meal){mealType=b.dataset.meal;open('meal');}if(b.dataset.filter){filter=b.dataset.filter;render();}if(b.dataset.date){selected=b.dataset.date;render();}if(b.dataset.month){const dt=new Date(year,month+Number(b.dataset.month),1);month=dt.getMonth();year=dt.getFullYear();render();}if(b.dataset.action==='close'){photoVersion++;recognition?.abort();sheet.close();}else if(b.dataset.action==='exercise'){day().exercise=!day().exercise;if(!day().exercise)day().trainingCategories=[];saveQuietly();render();toast(day().exercise?'运动已打卡 ✓':'已撤销运动打卡');}else if(b.dataset.action)open(b.dataset.action);});
  document.addEventListener('input',e=>{
    if(e.target.id==='health-json'){healthDraft=null;$('#health-preview').textContent='内容已修改，请重新预览';}
    if(form.dataset.kind==='meal'&&e.target.dataset?.foodIndex!=null){captureDraftFoods();syncFoodTotals();}
  });
  document.addEventListener('change',async e=>{
    if(e.target.dataset?.training){const types=new Set(day().trainingCategories||[]);if(e.target.checked)types.add(e.target.dataset.training);else types.delete(e.target.dataset.training);day().trainingCategories=[...types];day().exercise=types.size>0;saveQuietly();render();}
    if(e.target.id==='intake-complete'){day().intakeComplete=e.target.checked;saveQuietly();render();}
if(e.target.id==='exercise'){day().exercise=e.target.checked;if(!day().exercise)day().trainingCategories=[];saveQuietly();render();}if(['food-photo','food-camera'].includes(e.target.id))preparePhoto(e.target);});
  let submitting=false;
  form.addEventListener('submit',async e=>{e.preventDefault();if(submitting)return;const before=JSON.parse(JSON.stringify(state)),f=Object.fromEntries(new FormData(form)),kind=form.dataset.kind;
    if(kind==='health'){
      if(!healthDraft){$('#form-error').textContent='请先预览有效数据，再保存';return;}
      applyHealth(healthDraft.rows,f['replace-weight']==='on');
    }
    if(kind==='profile')state.profile={...state.profile,age:+f.age,height:+f.height,weight:+f.weight,activity:f.activity};
    if(kind==='cycle'){if(+f.duration>=+f.length){$('#form-error').textContent='经期天数应小于周期天数';return;}const records=[...(state.cycle.records|| (state.cycle.start?[{start:state.cycle.start,length:state.cycle.length,duration:state.cycle.duration}]:[]))].filter(r=>r.start!==f.start);records.push({start:f.start,length:+f.length,duration:+f.duration});records.sort((a,b)=>a.start.localeCompare(b.start));state.cycle={...records[records.length-1],records};}
    if(kind==='meal'){
      if(form.dataset.mealStage!=='result'){toast('请先识别照片，或选择手动记录');return;}
      const nutrients={};
      for(const [key,label] of nutrientFields){if(f[key]!=null&&String(f[key]).trim()!==''){const value=Number(f[key]);if(!Number.isFinite(value)||value<0||value>2500){$('#form-error').textContent=label+'请填写 0 至 2500 之间的数字';return;}nutrients[key]=Math.round(value*10)/10;}}
      const previous=editingMeal===null?null:day().meals[editingMeal];
      let details=null;
      if(draftFoods!==null){
        captureDraftFoods();
        try{if(!draftFoods.length)throw Error('请至少保留一种食物');details=draftFoods.map(normalizeFood);}catch(error){$('#form-error').textContent=error.message;return;}
        const total=foodTotals(details);if(total.kcal>10000||Object.values(total.nutrients).some(v=>v>2500)){$('#form-error').textContent='食物明细合计超出范围，请核对';return;}
      }
      const meal={...previous,type:f.type,name:f.name.trim(),amount:f.amount.trim(),kcal:+f.kcal,photo:draftPhoto,nutrients,time:previous?.time||new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())};
      if(details){meal.foods=details;Object.assign(meal,foodTotals(details));meal.name=details.map(food=>food.name).join('、').slice(0,100);meal.amount=details.map(food=>food.name+' '+food.amount).join('，').slice(0,100);}
      else delete meal.foods;
      day().intakeComplete=false;
      if(previous)day().meals[editingMeal]=meal;else day().meals.push(meal);
    }
    if(kind==='nutrition-goal'){
      const targets={};
      for(const key of ['kcal',...nutrientFields.map(([key])=>key)]){
        const raw=f['goal-'+key];if(raw==null||String(raw).trim()==='')continue;
        const value=Number(raw),max=key==='kcal'?10000:2500;
        if(!Number.isFinite(value)||value<(key==='kcal'?1:0.1)||value>max){$('#form-error').textContent='热量目标需为 1 至 10000，营养目标需为 0.1 至 2500；留空可取消该项目标';return;}
        targets[key]=Math.round(value*10)/10;
      }
      state.profile={...state.profile,nutritionTargets:targets};
    }
    if(kind==='weight-goal'){
      if(!weightProgress(f.start,f.target,f.start)||+f.start<30||+f.start>250||+f.target<30||+f.target>250){$('#form-error').textContent='请填写 30 至 250 kg 之间的起始和目标体重';return;}
      state.profile={...state.profile,goalStart:+f.start,goalTarget:+f.target};
    }
    if(kind==='weight')day().weight=+f.weight;
    if(kind==='measurements'){
      if(!measurements.some(([key])=>f[key])){$('#form-error').textContent='请至少填写一项围度';return;}
      day().measurements=Object.fromEntries(measurements.filter(([key])=>f[key]).map(([key])=>[key,+f[key]]));
    }
    if(kind==='energy')day().energy={resting:+f.resting,active:+f.active,complete:f.complete==='on',source:'manual'};
    if(kind==='symptom')day().symptom=f.symptom.trim();
    if(kind==='reminders')state.reminders={goal:+f.goal,water:f.water,exercise:f.exercise};
    if(kind==='video'){
      const url=videoLink(f.url,videoPlatform);
      if(!url){$('#form-error').textContent=`请填写有效的${videoPlatform==='douyin'?'抖音':'B 站'} HTTPS 视频链接`;return;}
      state.videos.push({title:f.title.trim(),url,category:f.category,platform:videoPlatform});
    }
    submitting=true;
    try{await save();}catch{state=before;return;}finally{submitting=false;}
    sheet.close();render();toast(kind==='video'?'已加入跟练收藏':kind==='profile'||kind==='reminders'?'设置已保存':'已保存，在日历里也能回看。');
  });
  if(storage.info.error){$('#storage-alert').hidden=false;$('#storage-alert').textContent='本机数据库不可用：'+storage.info.error+'。当前修改无法保存，请勿关闭页面。';}
  sheet.addEventListener('close',()=>{photoVersion++;recognition?.abort();});
  render();
  await receiveHealth();
})();
