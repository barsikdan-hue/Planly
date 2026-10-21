"""Inert controller for one previously attributed stopped recovery container.

The caller supplies a reviewed IO adapter with exact ancestry, daemon pidfd,
source authority, private preservation and native-command boundaries. No Docker,
process, file operation or permission is performed by importing this module.
"""
import re
import subprocess

def need(ok,code):
    if not ok:raise ValueError(code)

def error_view(error,phase):
    known=(OSError,PermissionError,FileNotFoundError,ValueError,TypeError,KeyError,TimeoutError,subprocess.TimeoutExpired)
    out={'class':type(error).__name__ if type(error) in known else 'UNKNOWN','phase':phase}
    if isinstance(error,OSError) and type(error.errno) is int:out['errno']=error.errno
    if type(error) is ValueError and error.args and type(error.args[0]) is str and re.fullmatch('[A-Z0-9_]{1,80}',error.args[0]):out['code']=error.args[0]
    return out

def stopped(value,target):
    need(type(value) is dict and all(type(value.get(k)) is str and value[k]==v for k,v in target.items()),'EXACT_OWNED_CONTAINER_REQUIRED')
    need(all(value.get(k) is False for k in ('running','paused','restarting','dead')) and type(value.get('pid')) is int and value['pid']==0,'STOPPED_CONTAINER_REQUIRED')
    need(value.get('restartPolicy')=='no','NO_AUTORESTART_REQUIRED')

def image_set(values,target):
    need(type(values) is list and len(values)==4 and all(type(v) is str and re.fullmatch('sha256:[a-f0-9]{64}',v) for v in values),'FOUR_NATIVE_IMAGES_REQUIRED')
    need(len(set(values))==4 and target['image'] in values,'EXACT_NATIVE_IMAGES_REQUIRED')
    return set(values)

def retire(io,target):
    result={'status':'HOLD','rmAttempts':0,'cleanup':'NOT_STARTED'};phase='PREFLIGHT'
    try:
        need(not getattr(io,'retirement_consumed',False),'ONE_RETIREMENT_ENTRY')
        io.retirement_consumed=True
        need(type(target) is dict and set(target)=={'id','scope','run','name','image'} and re.fullmatch('[a-f0-9]{64}',target['id']),'CLOSED_RETIREMENT_TARGET')
        io.preflight();phase='PRESERVE';io.preserve();phase='START';io.start()
        phase='NATIVE_PROOF';need(io.ids()==[target['id']],'EXACT_SINGLE_CONTAINER');stopped(io.inspect(),target)
        before=image_set(io.images(),target)
        need(io.ids()==[target['id']],'EXACT_SINGLE_CONTAINER');stopped(io.inspect(),target)
        phase='RM';result['rmAttempts']=1;need(io.remove(target['id'])==target['id'],'RM_ACK_UNKNOWN')
        phase='AFTER_RM';need(io.ids()==[],'CONTAINER_REMAINS');need(image_set(io.images(),target)==before,'IMAGE_SET_CHANGED')
        result['status']='PASS'
    except BaseException as error:result['primaryError']=error_view(error,phase)
    finally:
        if getattr(io,'started',False):
            try:
                need(io.stop()=='PASS','OWN_DAEMON_STOP_UNKNOWN');result['cleanup']='PASS'
            except BaseException as error:
                result.update(status='HOLD',cleanup='UNKNOWN')
                result['secondaryError' if 'primaryError' in result else 'primaryError']=error_view(error,'STOP')
        if result['status']=='PASS':
            try:io.postflight()
            except BaseException as error:result.update(status='HOLD',primaryError=error_view(error,'POSTFLIGHT'))
    return result
