(() => {
  let installPrompt;
  window.addEventListener('beforeinstallprompt', e=>{e.preventDefault();installPrompt=e;});
  window.addEventListener('appinstalled', ()=>{installPrompt=null;});
  document.addEventListener('click', async e=>{
    if(!e.target.closest('[data-install]')) return;
    if(installPrompt){
      await installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt=null;
      return;
    }
    const body=document.getElementById('sheet-body');
    document.getElementById('sheet-form').dataset.kind='install';
    const standalone=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    body.innerHTML=`<h2>${standalone?'已在桌面模式中':'添加到手机桌面'}</h2><div class="install-help"><h3>iPhone / iPad</h3><p>用 Safari 打开线上网址，点分享按钮，选择「添加到主屏幕」，再点「添加」。</p><h3>安卓手机</h3><p>用 Chrome 或 Edge 打开线上网址，在菜单中选择「安装应用」或「添加到主屏幕」。</p><p class="info">如果菜单没有安装选项，请使用系统浏览器打开 HTTPS 网址。当前电脑的 127.0.0.1 地址不能在手机上使用。首次在线打开后，可离线使用已缓存的页面。</p></div>`;
    document.getElementById('sheet').showModal();
  });
  if('serviceWorker' in navigator && window.isSecureContext){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();
