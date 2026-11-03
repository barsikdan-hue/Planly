"""Local receiver. Default is offline preparation; execution needs its own Owner gate."""
import base64, hashlib, importlib.util, json, os, pathlib, shlex, subprocess, sys, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
PRIVATE=pathlib.Path('C:/Users/EliteSochi/.codex/private/vk-control')
SOURCE=PRIVATE/'vk-curl-address.json'

def main():
 execute=sys.argv[1:]==['--execute-once']
 if not execute and sys.argv[1:]!=['--prepare']:raise ValueError('MODE')
 # The PNG is non-private; no provider/browser network calls are made.
 image=subprocess.run(['node',str(ROOT/'scripts/make-vk-curl-fixture.mjs')],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=True,timeout=30).stdout
 if not image.startswith(b'\x89PNG\r\n\x1a\n') or len(image)>1000000:raise ValueError('PNG')
 if not execute:
  print(json.dumps({'status':'PREPARED','pngBytes':len(image),'pngSha256':hashlib.sha256(image).hexdigest(),'providerCalls':0}));return
 if SOURCE.is_symlink() or SOURCE.resolve().parent!=PRIVATE.resolve() or not SOURCE.is_file() or SOURCE.stat().st_size>10000:raise ValueError('EXPORT')
 value=json.loads(SOURCE.read_text(encoding='utf-8'))
 if set(value)!={'uploadUrl','exportedAt'} or type(value['exportedAt']) is not int or not 0<=time.time()*1000-value['exportedAt']<=300000:raise ValueError('EXPORT')
 # Never display, log, put in argv or write another copy of the signed URL.
 payload=json.dumps(value|{'imageBase64':base64.b64encode(image).decode()}).encode();value=None
 operation='vk-curl-control-20261102-01'
 with (PRIVATE/(operation+'.ATTEMPTED')).open('x',encoding='ascii') as marker:marker.write('ATTEMPTED\n')
 ssh=['ssh','-i','C:/Users/EliteSochi/.ssh/planly_newvps_stage_ed25519','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=C:/Users/EliteSochi/.ssh/planly_newvps_stage_known_hosts','root@62.173.149.73']
 helper=(ROOT/'scripts/vk-curl-control.py').read_bytes();remote='/opt/planly-staging/ops/'+operation+'.py'
 bootstrap="import pathlib,os,sys,hashlib; p=pathlib.Path(sys.argv[1]); root=p.parent; assert root.resolve()==root and root.stat().st_uid==0 and not root.stat().st_mode&0o022; b=sys.stdin.buffer.read(30001); assert len(b)<=30000 and hashlib.sha256(b).hexdigest()==sys.argv[2]; fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600); f=os.fdopen(fd,'wb'); f.write(b); f.close()"
 command='python3 -I -B -c '+shlex.quote(bootstrap)+' '+shlex.quote(remote)+' '+hashlib.sha256(helper).hexdigest()
 first=subprocess.run(ssh+[command],input=helper,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
 if first.returncode:raise ValueError('HELPER_HOLD')
 attempted=False
 try:
  attempted=True
  result=subprocess.run(ssh+['python3 -I -B '+shlex.quote(remote)+' --execute'],input=payload,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=50)
  if len(result.stdout)>2000:raise ValueError('OUTPUT')
  v=json.loads(result.stdout)
  allowed={'status','operation','providerAttempts','httpStatus','contentType','body','vkErrorCode'}
  if not isinstance(v,dict) or set(v)-allowed:raise ValueError('OUTPUT')
  # Reconstruct only closed enums/numbers; never relay arbitrary remote strings.
  spec=importlib.util.spec_from_file_location('vk_curl_control',ROOT/'scripts/vk-curl-control.py')
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  safe=module.safe_output(v)
  print(json.dumps(safe))
 except BaseException:print('{"status":"OUTCOME_UNCONFIRMED"}')
 finally:
  payload=None
  if attempted:SOURCE.unlink(missing_ok=True)

if __name__=='__main__':
 try:main()
 except BaseException:print('{"status":"HOLD"}');sys.exit(1)
