import base64, contextlib, importlib.util, io, json, pathlib, subprocess, tempfile, time, types, unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('control',ROOT/'scripts/vk-curl-control.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
URL='https://pu.vk.ru/c123/ss456/upload.php?act=do_add&wallphoto=1&hash=private-signature'

class ControlTests(unittest.TestCase):
 def test_url_boundary(self):
  self.assertEqual(m.validate_url(URL),URL)
  for raw in [URL.replace('https:','http:'),URL.replace('pu.vk.ru','localhost'),URL+'&access_token=private',URL+'#fragment',URL+'\nretry=9',URL.replace('act=do_add','act=other')]:
   with self.assertRaises(ValueError):m.validate_url(raw)
 def test_curl_control(self):
  config=m.curl_config(URL,'93.186.225.194',pathlib.Path('/private'))
  self.assertIn('resolve = "pu.vk.ru:443:93.186.225.194"',config)
  self.assertIn('retry = 0',config);self.assertIn('max-redirs = 0',config)
  self.assertNotIn('insecure',config);self.assertNotIn('location',config)
  for ip in ['127.0.0.1','192.168.1.1','::1','169.254.169.254']:
   with self.assertRaises(ValueError):m.curl_config(URL,ip,pathlib.Path('/private'))
 def test_claim_never_reuses(self):
  with tempfile.TemporaryDirectory() as folder, patch.object(m.os,'O_NOFOLLOW',getattr(m.os,'O_NOFOLLOW',0),create=True):
   path=pathlib.Path(folder)/'marker'
   m.claim(path)
   with self.assertRaises(FileExistsError):m.claim(path)
   self.assertEqual(path.read_text(),'ATTEMPTED\n')
 def test_blank_query_values_cannot_bypass_boundary(self):
  for suffix in ['&act=','&wallphoto=','&access_token=']:
   with self.assertRaises(ValueError):m.validate_url(URL+suffix)
 def test_output_is_classified_not_reflected(self):
  self.assertEqual(m.classify(405,b'HTTP/1.1 405 Method Not Allowed\r\nContent-Type: text/html\r\n\r\n',b'<h1>405 Not Allowed</h1>secret'),{'httpStatus':405,'contentType':'HTML','body':'METHOD_REJECTION'})
  self.assertNotIn('private',str(m.classify(200,b'',b'{"photo":"private","hash":"private","server":123}')))
 def test_unknown_outcome_consumes_marker_and_never_retries(self):
  value={'uploadUrl':URL,'exportedAt':int(time.time()*1000),'imageBase64':base64.b64encode(b'\x89PNG\r\n\x1a\n\0\0\0\0').decode()}
  with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
   root=pathlib.Path(folder).resolve()
   stack.enter_context(patch.object(m,'ROOT_DIR',root))
   original_stat=pathlib.Path.stat
   def secure_root_stat(path,*args,**kwargs):
    result=original_stat(path,*args,**kwargs)
    if path==root:
     fields=list(result);fields[0]=0o40700;fields[4]=0;return m.os.stat_result(fields)
    return result
   stack.enter_context(patch.object(pathlib.Path,'stat',secure_root_stat))
   stack.enter_context(patch.object(m.sys,'platform','linux'))
   stack.enter_context(patch.object(m.sys,'argv',['control','--execute']))
   stack.enter_context(patch.object(m.os,'geteuid',lambda:0,create=True))
   stack.enter_context(patch.object(m.os,'umask',lambda _:0))
   stack.enter_context(patch.object(m.os,'O_NOFOLLOW',getattr(m.os,'O_NOFOLLOW',0),create=True))
   stack.enter_context(patch.object(m.socket,'getaddrinfo',return_value=[(2,1,6,'',('93.186.225.194',443))]))
   run=stack.enter_context(patch.object(m.subprocess,'run',side_effect=subprocess.TimeoutExpired('curl',35)))
   for expected in ['OUTCOME_UNCONFIRMED','HOLD']:
    stack.enter_context(patch.object(m.sys,'stdin',types.SimpleNamespace(buffer=io.BytesIO(json.dumps(value).encode()))))
    output=io.StringIO()
    with contextlib.redirect_stdout(output):m.main()
    self.assertEqual(json.loads(output.getvalue())['status'],expected)
    self.assertNotIn('private-signature',output.getvalue())
   self.assertEqual(run.call_count,1)
   self.assertEqual(run.call_args.args[0],['/usr/bin/curl','--disable','--config','-'])

if __name__=='__main__':unittest.main()
