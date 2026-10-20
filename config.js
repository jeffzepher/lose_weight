(function(root){
  'use strict';
  const local=['localhost','127.0.0.1','[::1]'].includes(root.location?.hostname);
  root.QingxunConfig=Object.freeze({
    recognitionUrl:local?'./api/recognize':'https://qingxun-ai.jeffchen9618.workers.dev/api/recognize',
    recognitionRequiresCode:!local
  });
})(globalThis);
