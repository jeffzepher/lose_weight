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
  const api={phases,cyclePhase,videoLink};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.QingxunCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
