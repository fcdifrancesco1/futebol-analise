const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.existsSync(path.join(__dirname, '../public/js/models.js'))
  ? fs.readFileSync(path.join(__dirname, '../public/js/models.js'), 'utf8')
  : fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8').split('function computeProbability(')[1].split('function renderPitchBar(')[0];
const ctx = vm.createContext({});
vm.runInContext(source.startsWith('statsA') ? 'function computeProbability(' + source : source, ctx);
const stats = (id, wins = 5, goals = '1.0') => ({team:{id,name:'Club '+id},fixtures:{played:{total:10,home:5,away:5},wins:{total:wins,home:2,away:2}},goals:{for:{average:{total:goals,home:goals,away:goals}},against:{average:{total:'1.0',home:'1.0',away:'1.0'}}},form:'WDLWD'});
test('zero goal average lowers strength instead of becoming one goal', () => {
  const p = ctx.computeProbability(stats(1,5,'0.0'), stats(2), [], null);
  assert.ok(p.probA < p.probB);
  assert.equal(p.probA+p.probB+p.probDraw, 100);
});
test('completed recent head to head changes estimate; unfinished games do not', () => {
  const match = {fixture:{date:'2026-01-01',status:{short:'FT'}},teams:{home:{id:1},away:{id:2}},goals:{home:3,away:0}};
  const p = ctx.computeProbability(stats(1),stats(2),[match],null);
  assert.ok(p.probA - p.probB >= 5);
  match.fixture.status.short='NS';
  const upcoming = ctx.computeProbability(stats(1),stats(2),[match],null);
  assert.ok(Math.abs(upcoming.probA-upcoming.probB)<=1);
});
test('win-rate justification compares numeric 100 and 90 correctly', () => {
  assert.equal(ctx.buildJustifications(stats(1,10),stats(2,9),[],null)[0].side,'a');
});
test('head to head excludes fixtures involving another opponent', () => {
  const other = {fixture:{date:'2026-01-01',status:{short:'FT'}},teams:{home:{id:1},away:{id:3}},goals:{home:3,away:0}};
  const p = ctx.computeProbability(stats(1),stats(2),[other],null);
  assert.ok(Math.abs(p.probA-p.probB)<=1);
});
