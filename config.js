(function(root){
  'use strict';
  const local=['localhost','127.0.0.1','[::1]'].includes(root.location?.hostname);
  root.QingxunConfig=Object.freeze({
    recognitionUrl:local?'./api/recognize':'https://193.112.55.186:4186/api/recognize',
    recognitionRequiresCode:!local
  });
})(globalThis);
