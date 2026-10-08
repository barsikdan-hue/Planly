import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAnalyticsUrl} from '../lib/analytics.ts';
test('analytics links cannot expose credentials or navigate outside the provider',()=>{
  assert.equal(safeAnalyticsUrl('https://t.me/channel_name/31','telegram'),'https://t.me/channel_name/31');
  assert.equal(safeAnalyticsUrl('https://max.ru/channel/42','max'),'https://max.ru/channel/42');
  for(const url of ['javascript:alert(1)','https://evil.test/31','https://t.me/31?token=synthetic','https://u:p@t.me/31','https://t.me/31#token','http://t.me/31']) assert.equal(safeAnalyticsUrl(url,'telegram'),null);
});
