const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'public');
fs.mkdirSync(output,{recursive:true});
// Publish only browser assets. Server code, local credentials and tests stay private.
const assets=['index.html','style.css','mobile.css','core.js','storage.js','config.js','app.js','install.js','sw.js','manifest.webmanifest','icons'];
for(const asset of assets)fs.cpSync(path.join(root,asset),path.join(output,asset),{recursive:true});
