"""Standalone one-shot control. Import/tests never contact a provider."""
import base64, ipaddress, json, os, pathlib, re, socket, subprocess, sys, tempfile, time
from urllib.parse import urlsplit, parse_qs, unquote

OPERATION='vk-curl-control-20261102-01'
ROOT_DIR=pathlib.Path('/opt/planly-staging/ops')

def validate_url(raw):
 if not isinstance(raw,str) or not 1<=len(raw)<=8192 or re.search(r'[\s\x00-\x1f\x7f]',raw):raise ValueError('URL')
 u=urlsplit(raw);q=parse_qs(u.query,keep_blank_values=True)
 if re.search(r'[\x00-\x1f\x7f]',unquote(raw)):raise ValueError('URL')
 if u.scheme!='https' or u.netloc!='pu.vk.ru' or u.fragment or not re.fullmatch(r'/c\d{1,12}/ss\d{1,12}/upload.php',u.path):raise ValueError('URL')
 if q.get('act')!=['do_add'] or q.get('wallphoto')!=['1'] or any(k.lower() in ('access_token','refresh_token','authorization') for k in q):raise ValueError('URL')
 return raw

def curl_config(url,ip,folder):
 validate_url(url)
 address=ipaddress.ip_address(ip)
 if address.version!=4 or not address.is_global:raise ValueError('DNS')
 def quoted(v):return '"'+str(v).replace('\\','\\\\').replace('"','\\"')+'"'
 values={'url':url,'resolve':'pu.vk.ru:443:'+ip,'request':'POST','form':'photo=@'+str(folder/'image.png')+';type=image/png;filename=planly-server-test.png','output':str(folder/'body'),'dump-header':str(folder/'headers'),'proxy':'','noproxy':'*','proto':'=https','write-out':'%{http_code}'}
 return '\n'.join(k+' = '+quoted(v) for k,v in values.items())+'\nretry = 0\nmax-redirs = 0\nconnect-timeout = 5\nmax-time = 30\nmax-filesize = 1100000\nhttp1.1\nsilent\n'

def claim(path):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:f.write('ATTEMPTED\n');f.flush();os.fsync(f.fileno())

def classify(status,headers,body):
 kind='HTML' if re.search(br'(?im)^content-type:\s*text/html(?:[;\s]|$)',headers) else 'OTHER'
 classification='METHOD_REJECTION' if kind=='HTML' and re.search(br'(?:405\s+(?:Not\s+Allowed|Method\s+Not\s+Allowed)|Method\s+Not\s+Allowed)',body[:4096],re.I) else 'OTHER'
 if len(body)>4096:classification='LIMIT'
 if 200<=status<300:
  try:
   v=json.loads(body)
   if type(v.get('server')) is int and v['server']>0 and isinstance(v.get('photo'),str) and v['photo'].strip() not in ('','[]') and isinstance(v.get('hash'),str) and v['hash'].strip():classification='UPLOAD_CONFIRMED'
  except (ValueError,AttributeError):pass
 return {'httpStatus':status,'contentType':kind,'body':classification}

def main():
 result={'status':'HOLD','operation':OPERATION,'providerAttempts':0}
 try:
  if sys.argv[1:]!=['--execute'] or not sys.platform.startswith('linux') or os.geteuid()!=0:raise ValueError('EXECUTION_GATE')
  raw=sys.stdin.buffer.read(1350001)
  if len(raw)>1350000:raise ValueError('INPUT')
  v=json.loads(raw);raw=None
  if set(v)!={'uploadUrl','exportedAt','imageBase64'} or type(v['exportedAt']) is not int or not 0<=time.time()*1000-v['exportedAt']<=300000:raise ValueError('INPUT')
  url=validate_url(v['uploadUrl']);image=base64.b64decode(v['imageBase64'],validate=True)
  if not 12<=len(image)<=1000000 or not image.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('PNG')
  addresses=sorted({r[4][0] for r in socket.getaddrinfo('pu.vk.ru',443,socket.AF_INET,socket.SOCK_STREAM)})
  if not addresses or not all(ipaddress.ip_address(ip).is_global for ip in addresses):raise ValueError('DNS')
  root=ROOT_DIR
  if root.resolve()!=root or root.stat().st_uid!=0 or root.stat().st_mode&0o022:raise ValueError('ROOT')
  os.umask(0o077)
  # Independent marker, never clearing any original browser/Redis attempt.
  claim(root/(OPERATION+'.ATTEMPTED'))
  with tempfile.TemporaryDirectory(prefix=OPERATION+'-',dir=root) as tmp:
   folder=pathlib.Path(tmp);(folder/'image.png').write_bytes(image)
   config=curl_config(url,addresses[0],folder)
   # No URL/credentials in argv, no shell, no curlrc, no proxy, no redirect/retry.
   result['providerAttempts']=1
   env={k:v for k,v in os.environ.items() if 'proxy' not in k.lower()}
   p=subprocess.run(['/usr/bin/curl','--disable','--config','-'],input=config.encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=env,timeout=35)
   url=config=v=None
   if p.returncode or not re.fullmatch(b'[1-5][0-9][0-9]',p.stdout):result['status']='OUTCOME_UNCONFIRMED'
   else:
    headers=(folder/'headers').read_bytes()[:16384];body=(folder/'body').read_bytes()[:1100001]
    result.update(status='RESPONSE_RECEIVED',**classify(int(p.stdout),headers,body))
 except BaseException:
  result['status']='OUTCOME_UNCONFIRMED' if result['providerAttempts'] else 'HOLD'
 print(json.dumps(result));return 0 if result['status']=='RESPONSE_RECEIVED' else 1

if __name__=='__main__':sys.exit(main())
