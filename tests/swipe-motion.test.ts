import test from 'node:test';
import assert from 'node:assert/strict';
import {swipeDirection,swipeDecision,swipeRotation} from '../lib/client/swipe-motion.ts';
test('direction lock and decisions respect horizontal threshold and vertical cancellation',()=>{
 for(const [dx,dy,want] of [[11,0,'pending'],[12,0,'horizontal'],[0,12,'vertical'],[12,12,'vertical']] as const)assert.equal(swipeDirection(dx,dy),want);
 for(const [dx,dy,want] of [[79,0,null],[80,0,'approve'],[-80,0,'reject'],[80,81,null],[80,80,null]] as const)assert.equal(swipeDecision(dx,dy),want);
 assert.equal(swipeRotation(1000),8); assert.equal(swipeRotation(-1000),-8);
});
