(function (root) {
  'use strict';
  const phases = [
    {key:'menstrual', label:'经期'}, {key:'follicular', label:'卵泡期'},
    {key:'luteal', label:'黄体期'}, {key:'late-luteal', label:'黄体后期'}
  ];
  const dayNumber = date => Date.parse(date+'T00:00:00Z') / 86400000;
  function cyclePhase(date, cycle) {
    const records = cycle.records?.length ? cycle.records : cycle.start ? [cycle] : [];
    const record = records.filter(r=>r.start<=date).sort((a,b)=>b.start.localeCompare(a.start))[0];
    if(!record) return null;
    const elapsed = dayNumber(date)-dayNumber(record.start), length=Number(record.length), duration=Number(record.duration);
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=length) return null;
    const n=elapsed+1;
    const index=n<=duration?0:n<=length-14?1:n<=length-5?2:3;
    return {...phases[index], day:n, start:record.start};
  }
  function videoLink(text, platform) {
    const match=String(text).match(/https:\/\/[^\s<>"“”]+/i);
    if(!match) return null;
    let url;
    try {url=new URL(match[0].replace(/[，。；！）)]+$/u,''));} catch {return null;}
    const allowed = platform==='douyin' ? ['douyin.com','www.douyin.com','v.douyin.com','iesdouyin.com','www.iesdouyin.com'] : ['bilibili.com','www.bilibili.com','m.bilibili.com','b23.tv'];
    return url.protocol==='https:' && allowed.includes(url.hostname) ? url.href : null;
  }
  function trendSeries(days,metric,through){
    return Object.entries(days).filter(([date])=>!through||date<=through).map(([date,day])=>({date,value:Number(metric==='weight'?day.weight:day.measurements?.[metric])})).filter(p=>Number.isFinite(p.value)&&p.value>0).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
  }
  function energyBalance(day){
    const intake=(day.meals||[]).reduce((sum,meal)=>sum+Number(meal.kcal||0),0),energy=day.energy;
    const available=energy&&Number.isFinite(energy.resting)&&Number.isFinite(energy.active)&&energy.resting>=0&&energy.active>=0;
    if(!available)return {intake,status:'missing'};
    const total=energy.resting+energy.active,difference=total-intake;
    return {intake,total,difference,status:day.intakeComplete&&energy.complete?'complete':'partial'};
  }
  function nutrientTotals(meals=[]){
    return Object.fromEntries(['protein','carbs','fat'].map(key=>{
      const values=meals.map(meal=>meal.nutrients?.[key]).filter(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=2500);
      return [key,{grams:values.length?Math.round(values.reduce((a,b)=>a+b,0)*10)/10:null,count:values.length,total:meals.length}];
    }));
  }
  function weightProgress(start,target,current){
    const values=[start,target,current];
    if(values.some(v=>v==null||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<=0))return null;
    [start,target,current]=values.map(Number);
    const distance=target-start,direction=Math.sign(distance);
    const complete=distance===0?current===target:(current-target)*direction>=0;
    return {start,target,current,percent:complete?100:distance===0?0:Math.min(99.9,Math.round(Math.max(0,(current-start)/distance*100)*10)/10),remaining:complete?0:Math.round(Math.abs(target-current)*100)/100,complete};
  }
  const api={phases,cyclePhase,videoLink,trendSeries,energyBalance,nutrientTotals,weightProgress};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.QingxunCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
