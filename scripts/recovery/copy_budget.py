"""Inert finite VFS create experiment. Never changes recovery acceptance/budget."""
import math
import re
from owned_retirement import need, error_view, stopped, image_set

def measure(io):
    need(not getattr(io,'measurement_consumed',False),'ONE_BUDGET_MEASUREMENT')
    io.measurement_consumed=True
    result=dict(status='HOLD',cleanup='NOT_STARTED',rmAttempts=0,fullRecovery='UNVERIFIED')
    phase='PREFLIGHT'
    try:
        io.preflight();phase='PRESERVE';io.preserve();phase='START';io.start()
        phase='NATIVE_PROOF';need(io.ids()==[],'EMPTY_ISOLATED_STORE_REQUIRED')
        before=image_set(io.images(),{'image':io.image})
        phase='CREATE';measurement=io.create_once()
        need(type(measurement) is dict and set(measurement)=={'cid','seconds','pendingAt60','exitCode'},'CLOSED_CREATE_MEASUREMENT')
        seconds=measurement['seconds']
        need(type(seconds) in (int,float) and math.isfinite(seconds) and 0<=seconds<=180
             and type(measurement['pendingAt60']) is bool and measurement['pendingAt60']==(seconds>60)
             and type(measurement['exitCode']) is int and measurement['exitCode']==0
             and type(measurement['cid']) is str and re.fullmatch('[a-f0-9]{64}',measurement['cid']),'VALID_COMPLETED_CREATE_MEASUREMENT')
        cid=measurement['cid'];target=io.target(cid)
        need(type(target) is dict and set(target)=={'id','scope','run','name','image'}
             and target['id']==cid and target['image']==io.image,'CLOSED_PROBE_TARGET')
        phase='OWNED_PROOF';stopped(io.inspect(cid),target);stopped(io.inspect(cid),target)
        phase='RM';result['rmAttempts']=1;need(io.remove(cid)==cid,'PROBE_RM_ACK_UNKNOWN')
        phase='AFTER_RM';need(io.ids()==[],'PROBE_CONTAINER_REMAINS')
        need(image_set(io.images(),target)==before,'PROBE_IMAGE_SET_CHANGED')
        result.update(measurement=measurement,exceededOriginal60=measurement['pendingAt60'],status='MEASURED')
    except BaseException as error:result['primaryError']=error_view(error,phase)
    finally:
        if getattr(io,'started',False):
            try:need(io.stop()=='PASS','PROBE_OWN_STOP_UNKNOWN');result['cleanup']='PASS'
            except BaseException as error:
                result.update(status='HOLD',cleanup='UNKNOWN')
                result['secondaryError' if 'primaryError' in result else 'primaryError']=error_view(error,'STOP')
        if result['status']=='MEASURED':
            try:io.postflight()
            except BaseException as error:result.update(status='HOLD',primaryError=error_view(error,'POSTFLIGHT'))
    return result
