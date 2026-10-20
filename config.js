(function(root){
  'use strict';
  const local=['localhost','127.0.0.1','[::1]'].includes(root.location?.hostname);
  root.QingxunConfig=Object.freeze({
    recognitionUrl:'./api/recognize',
    recognitionRequiresCode:!local
  });
})(globalThis);
