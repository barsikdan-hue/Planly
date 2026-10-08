import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cleanup} from './helpers/library-editor-fixture.mjs';
afterEach(cleanup);
test('real App passes owner lifetime to analytics and dashboard',async()=>{
  const value=fixture();await value.app.settle();globalThis.window.location.hash='#analytics';
  const navigation=value.app.find('Navigation');navigation.props.navigate('analytics');await value.app.settle();
  const analytics=value.app.find('Analytics');assert.ok(analytics);assert.equal(analytics.props.ownerContext.id,'owner');
  navigation.props.navigate('dashboard');await value.app.settle();assert.equal(value.app.find('Dashboard').props.ownerContext.id,'owner');
});
