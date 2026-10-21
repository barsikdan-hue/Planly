"""Build one own child→parent metadata permission probe; import is inert.

This is a prerequisite inside a future explicitly approved whole recovery,
before starting its daemon. It does not change ptrace/Yama/seccomp policy,
discover a foreign process or grant permission based on CI results.
"""
import re

from copy_observation import Incomplete


def build_probe(sources, parent_pid, parent_start, source_fd, identity, marker):
    if (type(sources) is not dict or set(sources) != {'copy_observation', 'fd_pin'}
            or any(type(raw) is not bytes for raw in sources.values())
            or not all(type(value) is int and 0 <= value <= 18446744073709551615
                       for value in (parent_pid, parent_start, source_fd))
            or not parent_pid or not parent_start or max(parent_pid, source_fd) > 2147483647
            or type(identity) is not tuple or len(identity) != 2
            or not all(type(value) is int and 0 < value <= 18446744073709551615 for value in identity)
            or type(marker) is not str or not re.fullmatch(r'/run/planly-a1-reuse-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', marker)):
        raise Incomplete('EXACT_OWNED_PROBE_INPUT_REQUIRED')
    code = 'import sys,types,os,json,select,stat\nMARKER=' + repr(marker) + '\n'
    if sum(map(len, sources.values())) > 30000:
        raise Incomplete('OWNED_PROBE_CODE_BOUND')
    for name in ('copy_observation', 'fd_pin'):
        compile(sources[name], '<reviewed-' + name + '>', 'exec')
        code += ('m=types.ModuleType(' + repr(name) + ');sys.modules[' + repr(name) + ']=m\n'
                 'exec(compile(' + repr(sources[name]) + ',"<owned-probe-module>","exec"),m.__dict__)\n')
    code += 'PARENT,START,FD,IDENTITY=' + repr((parent_pid, parent_start, source_fd, identity)) + '\n'
    code += '''
import fd_pin,copy_observation
pidfd=duplicate=None
result={'status':'NO_GO','fileDataReads':0,'duplicateAttempts':0}
try:
 if os.geteuid()!=0:raise copy_observation.Incomplete('ROOT_PROBE_REQUIRED')
 if os.uname().machine!='x86_64':raise copy_observation.Incomplete('REVIEWED_SYSCALL_ARCH_REQUIRED')
 pidfd=os.pidfd_open(PARENT)
 def check():
  if os.getppid()!=PARENT or fd_pin._target(pidfd)!=PARENT or select.select([pidfd],[],[],0)[0]:
   raise copy_observation.Incomplete('OWNED_PROBE_PARENT_LOST')
  if copy_observation.process_start(fd_pin._text(fd_pin.Path('/proc')/str(PARENT)/'stat'))!=START:
   raise copy_observation.Incomplete('OWNED_PROBE_PARENT_START')
 check()
 result['duplicateAttempts']=1
 duplicate=fd_pin._duplicate(pidfd,FD)
 value=os.fstat(duplicate)
 if not stat.S_ISREG(value.st_mode) or (value.st_dev,value.st_ino)!=IDENTITY or os.get_inheritable(duplicate):
  raise copy_observation.Incomplete('OWNED_PROBE_FILE_IDENTITY')
 check()
 os.close(duplicate);duplicate=None
 os.close(pidfd);pidfd=None
 result={'status':'CAPABILITY_OBSERVED','fileDataReads':0,'duplicateAttempts':1}
except BaseException as error:
 result['className']=type(error).__name__ if type(error) in (OSError,PermissionError,ProcessLookupError) else 'INCOMPLETE'
 if isinstance(error,OSError):result['errno']=error.errno
finally:
 for descriptor in (duplicate,pidfd):
  if descriptor is not None:
   try:os.close(descriptor)
   except BaseException:result['status']='NO_GO';result['cleanup']='UNKNOWN'
print(json.dumps(result,sort_keys=True),flush=True)
sys.exit(0 if result['status']=='CAPABILITY_OBSERVED' else 1)
'''
    if len(code.encode('utf8')) > 65536:
        raise Incomplete('OWNED_PROBE_CODE_BOUND')
    return code
