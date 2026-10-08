import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const postcss=createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
const checks={controlsLayout:false,buttonSpacing:false,tableSpacing:false};
let sourceCssSha256=null;let stylesheetCount=0;
class BuildCheckError extends Error{constructor(code){super(code);this.code=code;}}
const spaced=rule=>rule.nodes.some(d=>d.type==='decl'&&d.prop==='padding'&&/[1-9]/.test(d.value));
try{
  const root=process.cwd();
  const source=await readFile(path.join(root,'app/globals.css'));
  sourceCssSha256=createHash('sha256').update(source).digest('hex');
  let urls;
  try{
    const html=(await readFile(path.join(root,'.next/server/app/index.html'),'utf8')).replace(/<!--[\s\S]*?-->/g,'');
    urls=[...new Set([...html.matchAll(/<link\b[^>]*>/g)].filter(m=>/\brel="stylesheet"/.test(m[0])).map(m=>/\bhref="([^"]+)"/.exec(m[0])?.[1]))];
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    const text=await readFile(path.join(root,'.next/server/app/page_client-reference-manifest.js'),'utf8');
    const match=/globalThis\.__RSC_MANIFEST\["\/page"\]\s*=\s*({[\s\S]*})\s*;\s*$/.exec(text);
    if(!match)throw new BuildCheckError('ANALYTICS_CSS_ASSET_INVALID');
    const manifest=JSON.parse(match[1]);
    urls=[...new Set(Object.entries(manifest.entryCSSFiles??{}).filter(([entry])=>/\/app\/(?:layout|page)(?:\.[cm]?[jt]sx?)?$/.test(entry)).flatMap(([,assets])=>assets.map(asset=>`/_next/${asset.path}`)))];
  }
  if(!urls.length||urls.some(u=>!u||!/^\/_next\/static\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.css$/.test(u)))throw new BuildCheckError('ANALYTICS_CSS_ASSET_INVALID');
  const staticRoot=await realpath(path.join(root,'.next/static'));
  for(const url of urls){
    const asset=await realpath(path.join(root,'.next',url.slice('/_next/'.length)));
    if(!asset.startsWith(staticRoot+path.sep))throw new BuildCheckError('ANALYTICS_CSS_ASSET_INVALID');
    const css=await readFile(asset,'utf8');stylesheetCount++;
    postcss.parse(css).walkRules(rule=>{
      const selectors=rule.selector.split(',').map(s=>s.trim().replace(/\s+/g,' '));
      if(selectors.includes('.analytics-controls')&&rule.nodes.some(d=>d.type==='decl'&&d.prop==='display'&&['flex','inline-flex','grid','inline-grid'].includes(d.value)))checks.controlsLayout=true;
      if(selectors.includes('.analytics-controls button')&&spaced(rule))checks.buttonSpacing=true;
      if(selectors.includes('.analytics-results td')&&spaced(rule))checks.tableSpacing=true;
    });
  }
  const ok=Object.values(checks).every(Boolean);
  console.log(JSON.stringify({code:ok?'ANALYTICS_CSS_OK':'ANALYTICS_CSS_MISSING',sourceCssSha256,stylesheetCount,checks}));
  if(!ok)process.exitCode=1;
}catch(error){
  console.log(JSON.stringify({code:error instanceof BuildCheckError?error.code:'ANALYTICS_CSS_BUILD_INVALID',sourceCssSha256,stylesheetCount,checks}));
  process.exitCode=1;
}
