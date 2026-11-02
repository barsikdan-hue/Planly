import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();await page.route('**/*',r=>r.abort());
  const png=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=500;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#edf4ff';ctx.fillRect(0,0,800,500);
    ctx.fillStyle='#0969da';ctx.fillRect(60,60,680,14);ctx.font='bold 62px sans-serif';ctx.fillText('PLANLY',60,220);
    ctx.fillStyle='#183047';ctx.font='32px sans-serif';ctx.fillText('VK PHOTO UPLOAD TEST',60,295);
    ctx.font='24px sans-serif';ctx.fillText('29.10.2026',60,360);return canvas.toDataURL('image/png').split(',')[1];
  });
  process.stdout.write(Buffer.from(png,'base64'));
}finally{await browser.close();}
