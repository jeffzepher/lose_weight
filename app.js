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
  const {cyclePhase,phases,videoLink,trendSeries,energyBalance,nutrientTotals}=QingxunCore;
  const measurements=[['chest','胸围'],['waist','腰围'],['hip','臀围'],['thigh','大腿围'],['arm','上臂围'],['calf','小腿围']];
  const measurementText=d=>measurements.filter(([key])=>d.measurements?.[key]).map(([key,label])=>`${label} ${d.measurements[key]} cm`).join(' · ');
  let page='today', month=today.getMonth(), year=today.getFullYear(), selected=dateKey, filter='全部', mealType='早餐';
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
  const summary = key => {const d=day(key);return {kcal:d.meals.reduce((n,m)=>n+Number(m.kcal||0),0),water:d.water,meals:d.meals.length};};
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
  function todayPage(){const d=day(), s=summary(dateKey),balance=energyBalance(d),weightPoints=trendSeries(state.days,'weight',dateKey),latestWeight=weightPoints[weightPoints.length-1];return `
    <section class="panel budget"><div class="row"><h3><span class="label-icon">◒</span>今天的热量收支</h3><button class="small-btn" data-action="profile">身体档案</button></div><div class="budget-main"><div class="ring"><small>${balance.status==='complete'?(balance.difference>=0?'估算热量缺口':'估算摄入超出'):'估算热量缺口'}</small><strong>${balance.status==='complete'?Math.round(Math.abs(balance.difference)):'—'}</strong><small>kcal</small></div><div class="budget-copy"><h3>${balance.status==='complete'?(balance.difference>0?'今天有热量缺口':balance.difference<0?'今天摄入高于消耗':'今天摄入与消耗持平'):'记录完整后，<br>看见今天的收支。'}</h3><p>${balance.status==='complete'?'根据手动填写的数据估算':'Apple Watch 自动同步尚未接入'}</p><button class="small-btn coral-btn" data-action="energy">填写手表消耗 ↗</button></div></div><div class="stats"><div><small>已记录摄入</small><strong>${s.kcal}</strong><em>kcal</em></div><div><small>静息消耗</small><strong>${d.energy?.resting??'—'}</strong><em>kcal</em></div><div><small>活动消耗</small><strong>${d.energy?.active??'—'}</strong><em>kcal</em></div></div><p class="energy-summary">${balance.status==='missing'?'请填写健康 App 中当天的静息能量与活动能量。':`已填写总消耗 ${Math.round(balance.total)} kcal。${balance.status==='partial'?'饮食或消耗尚未确认为全天完整，暂不判断全天缺口。':'总消耗减去全天摄入，得到估算差额。'}`}</p><label class="confirmation"><input id="intake-complete" type="checkbox" ${d.intakeComplete?'checked':''}>确认已记完今天的全部饮食与饮料</label></section>
    <div class="tiles"><section class="panel next-meal"><div><span class="eyebrow">下一餐 · 好好吃饭</span><h3>${s.meals?'每一餐，都值得认真对待':'从第一餐开始记录'}</h3><p>${s.meals?'记录食物和份量，慢慢了解饮食习惯。':'拍张照片，也可以手动填写。'}</p></div><button class="small-btn" data-go="record">去记录一餐 →</button></section><button class="panel meal-cta" data-action="meal"><span class="camera">▣</span><div><h3>拍照记一餐</h3><p>照片 · 份量 · 热量</p></div></button></div>
    <section class="panel"><div class="row"><div class="water-title"><span>♧</span><div><h3>今天喝水</h3><small>目标 ${state.reminders.goal} ml · 可自行调整</small></div></div><button class="small-btn" data-action="reminders">提醒设置</button></div><div class="water-body"><div class="bottle" style="--fill:${Math.min(100,d.water/state.reminders.goal*100)}%"></div><div class="water-number"><strong>${d.water}</strong><small>/ ${state.reminders.goal} ml</small></div><div class="water-actions"><small>刚刚喝了多少？</small><div class="water-buttons">${[100,200,300].map(n=>`<button data-water="${n}">+${n}</button>`).join('')}</div></div></div></section>
    <section class="panel"><div class="row"><h3>☀ 今天动一动</h3><span class="tag">按身体状态安排</span></div><div class="task"><input type="checkbox" id="exercise" ${d.exercise?'checked':''}><label for="exercise">完成今天的运动<small>散步、拉伸，或你喜欢的练习</small></label><button class="small-btn" data-go="train">去跟练 ↗</button></div></section>
    <section class="panel"><div class="row"><h3>体重记录</h3><button class="small-btn" data-action="weight">记一下</button></div><div class="weight-num">${latestWeight?.value||state.profile.weight||'—'} <small>kg</small></div><p class="info">${d.weight?'今日已记录体重':latestWeight?'最近记录于 '+latestWeight.date:'今日还未记录体重'}</p>${trend('weight','体重','kg')}</section><button class="panel measurement-entry" data-go="measurements"><span><h3>围度记录</h3><small>查看各部位记录与趋势线</small></span><span aria-hidden="true">›</span></button><p class="footer-note">不赶时间，和身体好好相处。</p>`;}
  const nutrientFields=[['protein','蛋白质'],['carbs','碳水'],['fat','脂肪']];
  function nutrientsPanel(meals){
    const totals=nutrientTotals(meals),complete=meals.filter(m=>nutrientFields.every(([key])=>typeof m.nutrients?.[key]==='number'&&Number.isFinite(m.nutrients[key])&&m.nutrients[key]>=0&&m.nutrients[key]<=2500)).length;
    return `<section class="panel nutrition-panel" aria-label="今日营养记录"><div class="nutrients">${nutrientFields.map(([key,label])=>{const item=totals[key];return `<div><small>${label}</small><strong>${item.grams===null?'—':item.grams+' <span>g</span>'}</strong><span class="nutrient-coverage">${!item.total?'暂无记录':!item.count?'尚未补充':item.count<item.total?'已记录 '+item.count+'/'+item.total+' 餐':'已记录合计'}</span></div>`;}).join('')}</div><p class="nutrition-note">${!meals.length?'记录餐食后，在这里查看营养合计。':complete<meals.length?'还有 '+(meals.length-complete)+' 餐营养信息不完整，点击餐食旁的「编辑」补充。':'合计来自已记录餐食，识别数值为估算。'}</p></section>`;
  }
  function recordPage(){
    const d=day(),s=summary(dateKey);
    return head('FOOD & BODY','把日常，轻轻记下。','每一餐和每一次努力，都在这里。')+`
      <div class="panel"><div class="row"><h3>今日饮食</h3><span class="tag">${s.kcal} kcal · 已记录</span></div>
      <div class="meal-types">${[['早餐','🍞'],['午餐','🍚'],['晚餐','🥗'],['加餐','🍓']].map(([t,e])=>`<button data-meal="${t}"><span>${e}</span>${t}<em>＋</em></button>`).join('')}</div>
      ${d.meals.length?d.meals.map((m,index)=>`<div class="meal-entry">${m.photo?`<img src="${m.photo}" alt="${escape(m.type)}照片">`:''}<div class="meal-copy"><h3>${escape(m.type)} · ${escape(m.name)}</h3><p>${escape(m.amount)} · ${escape(m.time)}</p></div><div class="meal-actions"><strong>${m.kcal} kcal</strong><button class="small-btn" data-edit-meal="${index}" aria-label="编辑${escape(m.type)}：${escape(m.name)}">编辑</button></div></div>`).join(''):`<div class="empty"><span>🥣</span><h3>今天的第一餐，会是什么？</h3><p>选一餐，拍照或输入食物。</p></div>`}</div>
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
  async function recognize(){
    if(!draftPhoto){toast('请先选择一张食物照片');return;}
    if(recognition)return;
    if(recognitionConfig.recognitionRequiresCode){
      const field=$('#recognition-code');recognitionCode=field.value.trim();
      if(!recognitionCode){$('#recognition-status').textContent='请先填写个人访问口令，再点击识别。';field.focus();return;}
    }
    const version=photoVersion,photo=draftPhoto,button=$('#recognize-food'),status=$('#recognition-status');
    const controller=new AbortController();recognition=controller;button.disabled=true;status.textContent='正在识别，请稍候…';
    const timer=setTimeout(()=>controller.abort(),65000);
    try{
      const headers={'Content-Type':'application/json'};
      if(recognitionConfig.recognitionRequiresCode)headers.Authorization='Bearer '+recognitionCode;
      const response=await fetch(recognitionConfig.recognitionUrl,{method:'POST',headers,body:JSON.stringify({image:photo}),signal:controller.signal});
      const result=await response.json().catch(()=>({error:'识别服务尚未就绪，请确认云函数已部署轻循识别代码'}));
      if(!response.ok)throw Error(result.error||'识别失败，请稍后重试');
      if(typeof result.name!=='string'||!result.name.trim()||typeof result.amount!=='string'||!result.amount.trim()||typeof result.kcal!=='number'||!Number.isFinite(result.kcal)||result.kcal<0||result.kcal>10000)throw Error('识别服务返回内容不正确，请确认云函数已更新');
      if(version!==photoVersion||form.dataset.kind!=='meal'||!sheet.open)return;
      for(const key of ['name','amount','kcal'])form.elements.namedItem(key).value=result[key];
      let nutrientCount=0;
      for(const [key] of nutrientFields){const grams=result.nutrients?.[key],valid=typeof grams==='number'&&Number.isFinite(grams)&&grams>=0&&grams<=2500;form.elements.namedItem(key).value=valid?grams:'';if(valid)nutrientCount++;}
      status.textContent=nutrientCount===3?'已填入食物、热量和营养估算，请核对并修改后保存。':'已填入食物与热量；营养数据未完整返回，可手动补充。若始终缺少营养，请更新云函数。';
    }catch(error){if(version===photoVersion)status.textContent=error.name==='AbortError'?'识别已取消或超时，可重试或手动填写。':error instanceof TypeError?'无法连接识别服务，请检查网络及云函数的跨域配置，或手动填写。':error.message;}
    finally{clearTimeout(timer);if(recognition===controller){recognition=null;button.disabled=false;}}
  }
  function open(kind,mealIndex=null){recognition?.abort();recognition=null;photoVersion++;editingMeal=kind==='meal'?mealIndex:null;const existing=editingMeal===null?null:day().meals[editingMeal];draftPhoto=existing?.photo||'';if(existing)mealType=existing.type;form.dataset.kind=kind;let body='';
    if(kind==='profile')body=`<h2>了解你的身体</h2><p class="info">身体信息仅保存在当前浏览器，可随时修改。</p><div class="form-grid"><label>年龄<input name="age" type="number" min="18" max="100" value="${state.profile.age}" required></label><label>身高 · cm<input name="height" type="number" min="100" max="230" step="any" inputmode="decimal" value="${state.profile.height}" required></label></div><label>当前体重 · kg<input name="weight" type="number" min="30" max="250" step="any" inputmode="decimal" value="${state.profile.weight}" required></label><label>日常活动量<select name="activity"><option value="">请选择</option>${['久坐为主','轻度活动','中等活动','高强度活动'].map(v=>`<option ${state.profile.activity===v?'selected':''}>${v}</option>`).join('')}</select></label><p class="info">当前只保存档案，热量计算将在确认目标和健康情况后接入。</p>`;
    if(kind==='cycle')body=`<h2>记录经期</h2><label>最近一次经期开始日<input name="start" type="date" max="${dateKey}" value="${escape(state.cycle.start||'')}" required></label><div class="form-grid"><label>通常周期 · 天<input name="length" type="number" min="15" max="60" value="${state.cycle.length||28}" required></label><label>通常经期 · 天<input name="duration" type="number" min="1" max="14" value="${state.cycle.duration||5}" required></label></div><p class="info">28 天 / 5 天是可修改的输入默认值，并非你的实际记录。周期不规律时，阶段估算可能不适用。</p>`;
    if(kind==='meal')body=`<h2>把这一餐记下来</h2><label>餐次<select name="type">${['早餐','午餐','晚餐','加餐'].map(t=>`<option ${t===mealType?'selected':''}>${t}</option>`).join('')}</select></label><label class="upload">▣ 拍照或从相册选择<input id="food-photo" type="file" accept="image/*"><img id="photo-preview" alt="食物照片预览" hidden></label><p class="info">选择照片后点击识别，照片将发送至 DeepSeek。结果可修改，也可以手动填写。</p><button id="recognize-food" class="main-btn secondary" type="button" data-recognize>识别这张照片</button><p id="recognition-status" class="info" role="status" aria-live="polite"></p><label>吃了什么<input name="name" placeholder="例如：鸡蛋、牛奶、全麦面包" maxlength="100" required></label><label>份量<input name="amount" placeholder="例如：鸡蛋 1 个，牛奶 250 ml" maxlength="100" required></label><label>本餐热量 · kcal<input name="kcal" type="number" min="0" max="10000" placeholder="手动填写包装标示或估算值" required></label>`;
    if(kind==='weight')body=`<h2>记录今日体重</h2><label>体重 · kg<input name="weight" type="number" min="30" max="250" step="any" inputmode="decimal" value="${day().weight||''}" required></label><p class="info">尽量在相似时间、相似条件下测量。</p>`;
    if(kind==='measurements')body=`<h2>记录今日围度</h2><p class="info">可填写任意一项，单位 cm。</p><div class="form-grid">${measurements.map(([key,label])=>`<label>${label} · cm<input name="${key}" type="number" min="5" max="250" step="0.1" value="${day().measurements?.[key]||''}" placeholder="选填"></label>`).join('')}</div><p class="info">软尺保持水平，不勒紧。</p>`;
    if(kind==='energy')body=`<h2>记录 Apple Watch 消耗</h2><p class="info">目前手动填写，尚未连接苹果健康。请从健康 App 查看同一天的两项全天累计值，勿再加上单次训练热量。</p><label>静息能量 · kcal<input name="resting" type="number" min="0" max="10000" step="1" value="${day().energy?.resting??''}" required></label><label>活动能量 · kcal<input name="active" type="number" min="0" max="10000" step="1" value="${day().energy?.active??''}" required></label><label class="confirmation"><input name="complete" type="checkbox" ${day().energy?.complete?'checked':''}>确认是今天结束后的全天完整消耗</label><p class="info">静息能量＋活动能量＝估算总消耗。需同时确认饮食完整，才会显示全天缺口。</p>`;
    if(kind==='symptom')body=`<h2>听听身体的声音</h2><label>今天的身体感受<textarea name="symptom" maxlength="200" placeholder="例如：有些疲惫、容易饿、精神不错">${escape(day().symptom||'')}</textarea></label>`;
    if(kind==='reminders')body=`<h2>给日常留一点提醒</h2><label>每日饮水目标 · ml<input name="goal" type="number" min="250" max="5000" step="50" value="${state.reminders.goal}" required></label><div class="form-grid"><label>喝水提醒时间<input name="water" type="time" value="${state.reminders.water}" required></label><label>运动提醒时间<input name="exercise" type="time" value="${state.reminders.exercise}" required></label></div><p class="info">此处仅保存提醒偏好。手机定时通知尚未接入，关闭页面后不会发送提醒。</p>`;
    if(kind==='video')body=`<h2>收藏${videoPlatform==='douyin'?'抖音视频':'B 站跟练'}</h2><label>视频名称<input name="title" placeholder="例如：20 分钟肩背舒展" maxlength="60" required></label><label>${videoPlatform==='douyin'?'抖音视频 / 分享链接':'B 站视频链接'}<textarea name="url" placeholder="${videoPlatform==='douyin'?'粘贴抖音分享文字或 https://v.douyin.com/…':'https://www.bilibili.com/video/…'}" required></textarea></label><label>分类<select name="category">${['肩背','臀腿','体态','拉伸'].map(t=>`<option>${t}</option>`).join('')}</select></label><p class="info">${videoPlatform==='douyin'?'支持抖音视频页与短链接；分享文字中的链接会自动提取。':'支持 bilibili.com 与 b23.tv 的 HTTPS 链接。'}</p>`;
    if(kind==='meal')body+=`<h3 class="section-title">本餐营养 · 选填</h3><div class="nutrient-inputs">${nutrientFields.map(([key,label])=>`<label>${label} · g<input name="${key}" type="number" min="0" max="2500" step="0.1" inputmode="decimal" placeholder="未填写"></label>`).join('')}</div><p class="info">留空表示未知；只有确认不含该营养时才填 0。修改食物或份量后，请同步核对这里的数值。</p>`;
    if(kind==='meal'&&recognitionConfig.recognitionRequiresCode)body=body.replace('<button id="recognize-food"',`<label>个人访问口令<input id="recognition-code" type="password" autocomplete="off" maxlength="256" value="${escape(recognitionCode)}" placeholder="填写你设置的访问口令"></label><p class="info">口令仅在当前页面暂存，手动记录无需填写。</p><button id="recognize-food"`);
    $('#sheet-body').innerHTML=body+'<p id="form-error" class="error" role="alert"></p><button class="main-btn" type="submit">保存记录 ✓</button>';sheet.showModal();
    if(existing){
      for(const key of ['name','amount','kcal'])form.elements.namedItem(key).value=existing[key]??'';
      for(const [key] of nutrientFields)form.elements.namedItem(key).value=existing.nutrients?.[key]??'';
      if(draftPhoto){$('#photo-preview').src=draftPhoto;$('#photo-preview').hidden=false;}
    }
  }
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if('editMeal' in b.dataset){const index=Number(b.dataset.editMeal);if(Number.isInteger(index)&&day().meals[index])open('meal',index);return;}if('recognize' in b.dataset){recognize();return;}if(b.dataset.platform){videoPlatform=b.dataset.platform;open('video');}if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.go)navigate(b.dataset.go);if(b.dataset.water){day().water+=Number(b.dataset.water);saveQuietly();render();toast('已记录 '+b.dataset.water+' ml，慢慢喝。');}if(b.dataset.meal){mealType=b.dataset.meal;open('meal');}if(b.dataset.filter){filter=b.dataset.filter;render();}if(b.dataset.date){selected=b.dataset.date;render();}if(b.dataset.month){const dt=new Date(year,month+Number(b.dataset.month),1);month=dt.getMonth();year=dt.getFullYear();render();}if(b.dataset.action==='close'){photoVersion++;recognition?.abort();sheet.close();}else if(b.dataset.action==='exercise'){day().exercise=!day().exercise;if(!day().exercise)day().trainingCategories=[];saveQuietly();render();toast(day().exercise?'运动已打卡 ✓':'已撤销运动打卡');}else if(b.dataset.action)open(b.dataset.action);});
  document.addEventListener('change',async e=>{
    if(e.target.dataset?.training){const types=new Set(day().trainingCategories||[]);if(e.target.checked)types.add(e.target.dataset.training);else types.delete(e.target.dataset.training);day().trainingCategories=[...types];day().exercise=types.size>0;saveQuietly();render();}
    if(e.target.id==='intake-complete'){day().intakeComplete=e.target.checked;saveQuietly();render();}
if(e.target.id==='exercise'){day().exercise=e.target.checked;if(!day().exercise)day().trainingCategories=[];saveQuietly();render();}if(e.target.id==='food-photo'){const version=++photoVersion;recognition?.abort();recognition=null;draftPhoto='';$('#photo-preview').hidden=true;$('#recognition-status').textContent='';$('#recognize-food').disabled=false;const file=e.target.files[0];if(!file)return;if(!file.type.startsWith('image/')){toast('请选择图片文件');return;}if(file.size>20*1024*1024){toast('请选择小于 20 MB 的照片');return;}const reader=new FileReader();reader.onerror=()=>toast('照片读取失败，请重试');reader.onload=()=>{const img=new Image();img.onload=()=>{if(version!==photoVersion)return;const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(img.width,img.height));canvas.width=img.width*scale;canvas.height=img.height*scale;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);draftPhoto=canvas.toDataURL('image/jpeg',.7);$('#photo-preview').src=draftPhoto;$('#photo-preview').hidden=false;};img.onerror=()=>toast('暂时无法读取这张图片，请换用 JPG 或 PNG');img.src=reader.result;};reader.readAsDataURL(file);}});
  let submitting=false;
  form.addEventListener('submit',async e=>{e.preventDefault();if(submitting)return;const before=JSON.parse(JSON.stringify(state)),f=Object.fromEntries(new FormData(form)),kind=form.dataset.kind;
    if(kind==='profile')state.profile={age:+f.age,height:+f.height,weight:+f.weight,activity:f.activity};
    if(kind==='cycle'){if(+f.duration>=+f.length){$('#form-error').textContent='经期天数应小于周期天数';return;}const records=[...(state.cycle.records|| (state.cycle.start?[{start:state.cycle.start,length:state.cycle.length,duration:state.cycle.duration}]:[]))].filter(r=>r.start!==f.start);records.push({start:f.start,length:+f.length,duration:+f.duration});records.sort((a,b)=>a.start.localeCompare(b.start));state.cycle={...records[records.length-1],records};}
    if(kind==='meal'){
      const nutrients={};
      for(const [key,label] of nutrientFields){if(f[key]!=null&&String(f[key]).trim()!==''){const value=Number(f[key]);if(!Number.isFinite(value)||value<0||value>2500){$('#form-error').textContent=label+'请填写 0 至 2500 之间的数字';return;}nutrients[key]=Math.round(value*10)/10;}}
      const previous=editingMeal===null?null:day().meals[editingMeal];
      const meal={...previous,type:f.type,name:f.name.trim(),amount:f.amount.trim(),kcal:+f.kcal,photo:draftPhoto,nutrients,time:previous?.time||new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())};
      day().intakeComplete=false;
      if(previous)day().meals[editingMeal]=meal;else day().meals.push(meal);
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
})();
