import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {uploadVkPhotoMultipart} from '../lib/server/connectors/vk.ts';

const image=readFileSync(new URL('../experiments/vk-render-check/fixture.png',import.meta.url));
function crc32(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
test('actual fixture PNG has valid chunks/CRC, dimensions, complete pixels and exact deployed hash',()=>{
 assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(createHash('sha256').update(image).digest('hex'),'58934f24b2916662df1bd9968e85bc305c21c58686a15293cf0b2bc904e5873b');
 let offset=8,header,end=false;const chunks=[];
 while(offset<image.length){const size=image.readUInt32BE(offset);const type=image.subarray(offset+4,offset+8).toString('ascii');assert.ok(offset+size+12<=image.length);const body=image.subarray(offset+8,offset+8+size);assert.equal(crc32(image.subarray(offset+4,offset+8+size)),image.readUInt32BE(offset+8+size));if(type==='IHDR')header=body;if(type==='IDAT')chunks.push(body);if(type==='IEND')end=true;offset+=size+12;}
 assert.equal(offset,image.length);assert.ok(end);assert.equal(header.readUInt32BE(0),1000);assert.equal(header.readUInt32BE(4),600);assert.equal(header[8],8);assert.ok([2,6].includes(header[9]));assert.equal(header[12],0);
 const pixels=inflateSync(Buffer.concat(chunks));const stride=1+1000*(header[9]===6?4:3);assert.equal(pixels.length,stride*600);for(let row=0;row<600;row++)assert.ok(pixels[row*stride]<=4);
});
test('unchanged native upload sender delivers one complete photo part to loopback, exact bytes and length, no credential headers',async()=>{
 let requests=0,resolveBody;const received=new Promise(r=>resolveBody=r);
 const server=createServer(async(req,res)=>{requests++;const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);resolveBody({body,headers:req.headers,method:req.method,url:req.url});res.writeHead(200,{'content-type':'application/json'});res.end('{"server":12,"photo":"opaque","hash":"fixture"}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const response=await uploadVkPhotoMultipart({uploadUrl:new URL(`http://127.0.0.1:${server.address().port}/fixture-upload`),bytes:image,mimeType:'image/png',fetchImpl:globalThis.fetch});assert.equal(response.status,200);assert.equal((await response.json()).server,12);
  const {body,headers,method,url}=await received;assert.equal(requests,1);assert.equal(method,'POST');assert.equal(url,'/fixture-upload');assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined);assert.equal(headers['transfer-encoding'],undefined);assert.equal(Number(headers['content-length']),body.length);
  const boundary=/boundary=(?:"([^"]+)"|([^;]+))/.exec(headers['content-type']);assert.ok(boundary);const delimiter=boundary[1]??boundary[2];assert.ok(body.subarray(0,delimiter.length+4).equals(Buffer.from(`--${delimiter}\r\n`)));
  const split=body.indexOf('\r\n\r\n');assert.ok(split>0);const partHeader=body.subarray(0,split).toString('utf8');assert.match(partHeader,/name="photo"; filename="photo.png"/);assert.match(partHeader,/Content-Type: image\/png/i);
  const closing=Buffer.from(`\r\n--${delimiter}--`);const end=body.indexOf(closing,split+4);assert.ok(end>split);assert.deepEqual(body.subarray(split+4,end),image);assert.ok([0,2].includes(body.length-end-closing.length));
  const tail=body.subarray(end+closing.length);if(tail.length)assert.equal(tail.toString(),'\r\n');
  console.log('VK_LOCAL_WIRE '+JSON.stringify({node:process.version,undici:process.versions.undici,contentLength:true,transferEncoding:false,photoPartCount:1,imageBytes:image.length,closingCRLF:tail.length===2,providerCalls:0}));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
