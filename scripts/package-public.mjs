// Export a fresh source tree, never local Git history, credentials or test data.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2] || join(root,'work','github-public'));
try { await access(output); throw new Error('输出目录已存在，请使用新的目录，避免覆盖。'); } catch(e) { if(e.code!=='ENOENT')throw e; }
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const files=[...new Set(paths)].filter(p=>!p.startsWith('.openai/') && !p.startsWith('.sites-runtime/') && !p.endsWith('.tsbuildinfo') && !p.startsWith('.git/') && !/^(work|outputs|node_modules|dist|\.wrangler)\//.test(p));
await mkdir(output,{recursive:true});
for(const file of files){await mkdir(dirname(join(output,file)),{recursive:true});await cp(join(root,file),join(output,file));}
await mkdir(join(output,'.openai'),{recursive:true});
await writeFile(join(output,'.openai','hosting.json'),JSON.stringify({d1:'DB',capabilities:['mcp'],r2:null},null,2)+'\n');
const uploaded=[...files,'.openai/hosting.json'];
for(const file of uploaded){
  const content=await readFile(join(output,file),'utf8');
  if(/appgprj_[a-z0-9]{8,}|plugin_asdk_app_sites_[a-z0-9]{8,}|modular-collaboration-assistant\.nimblecrane1|C:[\\/]Users[\\/]chang|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/.test(content))throw new Error('发现不应公开的标识或凭据：'+file);
}
await writeFile(join(root,'work','public-files.json'),JSON.stringify({output,files:uploaded},null,2));
console.log('Public package ready: '+output+' ('+uploaded.length+' files; no owner cloud IDs or credentials)');
