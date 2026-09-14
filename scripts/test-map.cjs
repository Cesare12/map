// node scripts/test-map.cjs /path/to/typescript/lib/typescript.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require(process.argv[2] || 'typescript');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS }
  });
  module._compile(output.outputText, filename);
};

const config = ts.readConfigFile(path.join(__dirname, '../tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(__dirname, '..'));
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => process.cwd(), getCanonicalFileName: f => f, getNewLine: () => '\n'
}));

const { clusterPlaces, clusterCenter, worldSizeFromRegion } = require('../miniprogram/utils/clustering.ts');
const { categoryNameGlyph } = require('../miniprogram/utils/category-icon.ts');
let pageDefinition;
global.Page = page => { pageDefinition = page; };
const storage = new Map();
let toast = '';
global.wx = {
  getStorageSync: key => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
  showToast: options => { toast = options.title; }
};
require('../miniprogram/pages/map/index.ts');
const { loadSnapshot, addCategory, setCategoryAppearance } = require('../miniprogram/utils/storage.ts');
function page() {
  return {
    ...pageDefinition,
    data: structuredClone(pageDefinition.data),
    markerIdByPlaceId: new Map(), clusterMembers: new Map(),
    renderedGroups: [], finalMarkers: [], transitionTapTargets: new Map(),
    setData(data, callback) { Object.assign(this.data, data); if (callback) callback(); }
  };
}
let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log('PASS', name);
}
// 在 worldSize = 36000 时，经度每 0.01 度对应 1px，便于构造可核算的边界场景。
function point(id, x, categoryId = 'food') {
  return {
    id: String(id), markerId: id, latitude: 0, longitude: 100 + x / 100,
    categoryId, categoryColorKey: 'orange', categoryColor: '#C93400',
    categoryIconKey: 'food', categoryUsesText: false, wantToVisit: true,
    selected: false, name: `地点${id}`
  };
}
const near = [point(1, 0), point(2, 10), point(3, 160, 'sight')];
const sizes = (points, size) => clusterPlaces(points, size).map(group => group.length).sort();

test('最近两点先合并；继续缩小为三点；放大后拆成三个', () => {
  assert.deepEqual(sizes(near, 36000), [1, 2]);
  assert.deepEqual(sizes(near, 9000), [3]);
  assert.deepEqual(sizes(near, 360000), [1, 1, 1]);
});
test('跨网格边界的近点仍合并；种草拔草参与同一距离计算', () => {
  const points = [point(1, 71), { ...point(2, 73), wantToVisit: false }];
  assert.deepEqual(sizes(points, 36000), [2]);
});
test('A-B、B-C分别靠近但A-C较远时，不允许链式合并三点', () => {
  assert.deepEqual(sizes([point(1, 0), point(2, 40), point(3, 80)], 36000), [1, 2]);
});
test('输入顺序不会改变最近点对；48px边界内外区分', () => {
  const group = clusterPlaces([near[2], near[1], near[0]], 36000).find(g => g.length === 2);
  assert.deepEqual(group.map(p => p.markerId).sort(), [1, 2]);
  assert.deepEqual(sizes([point(1, 0), point(2, 47.99)], 36000), [2]);
  assert.deepEqual(sizes([point(1, 0), point(2, 48.01)], 36000), [1, 1]);
});
test('屏幕距离按当前视野和屏宽计算，支持跨日期变更线', () => {
  assert.equal(worldSizeFromRegion(100, 103.75, 375), 36000);
  assert.equal(worldSizeFromRegion(179, -179, 400), 72000);
  assert.equal(worldSizeFromRegion(NaN, 120, 375), null);
  const points = [{ ...point(1, 0), longitude: 179.99 }, { ...point(2, 0), longitude: -179.99 }];
  assert.deepEqual(sizes(points, 36000), [2]);
  assert.equal(Math.abs(clusterCenter(points).longitude), 180);
});
test('同类用分类色；混类即便颜色相同也用灰；数量正确', () => {
  const p = page(); p.data.filteredPlaces = near;
  p.renderMapMarkers(36000);
  const same = p.data.markers.find(m => m.label);
  assert.equal(same.iconPath, '/assets/clusters/orange.png');
  assert.equal(same.label.content, '2');
  p.renderMapMarkers(9000);
  assert.equal(p.data.markers[0].iconPath, '/assets/clusters/mixed.png');
  assert.equal(p.data.markers[0].label.content, '3');
});
test('灰圆放大后彻底移除；筛选及删除后清空旧簇', () => {
  const p = page(); p.data.filteredPlaces = near;
  p.renderMapMarkers(9000);
  p.renderMapMarkers(360000);
  assert.deepEqual(p.data.markers.map(m => m.id).sort(), [1, 2, 3]);
  assert.equal(p.clusterMembers.size, 0);
  p.data.filteredPlaces = [near[0]];
  p.renderMapMarkers(9000);
  assert.equal(p.data.markers.length, 1);
  assert.equal(p.data.markers[0].id, 1);
  p.data.filteredPlaces = [];
  p.renderMapMarkers(9000);
  assert.deepEqual(p.data.markers, []);
});
test('实际筛选链路：只选美食包含种草和拔草，不混入景点', () => {
  const p = page();
  p.renderedWorldSize = 36000;
  p.data.categories = loadSnapshot().categories;
  p.data.places = near.map((place, index) => ({
    ...place, wantToVisit: index !== 1,
    visits: index === 1 ? [{ id: 'visit', visitedAt: Date.now() }] : [],
    createdAt: Date.now(), updatedAt: Date.now(), note: '', address: ''
  }));
  p.selectCategory({ currentTarget: { dataset: { id: 'food' } } });
  assert.equal(p.data.filteredPlaces.length, 2);
  assert.equal(p.data.markers.length, 1);
  assert.equal(p.data.markers[0].label.content, '2');
  assert.equal(p.data.markers[0].iconPath, '/assets/clusters/orange.png');
  p.selectStatus({ currentTarget: { dataset: { id: 'visited' } } });
  assert.equal(p.data.markers.length, 1);
  assert.equal(p.data.markers[0].id, p.markerIdByPlaceId.get('2'));
  assert.equal(p.clusterMembers.size, 0);
});
test('快速缩放：过期的getRegion回调不能把旧灰圆画回来', () => {
  const p = page(); p.data.filteredPlaces = near;
  const callbacks = [];
  p.mapContext = { getScale: o => o.success({ scale: 12 }), getRegion: o => callbacks.push(o) };
  p.syncMapMarkers(); p.syncMapMarkers();
  callbacks[1].success({ southwest: { longitude: 100 }, northeast: { longitude: 100.375 } });
  assert.equal(p.data.markers.length, 3);
  callbacks[0].success({ southwest: { longitude: 100 }, northeast: { longitude: 109.375 } });
  assert.equal(p.data.markers.length, 3);
});
test('两种regionchange事件结构均刷新；开始新手势使旧请求失效', () => {
  const p = page(); let renders = 0;
  p.syncMapMarkers = () => { renders++; }; p.updateViewportCount = () => {};
  p.onRegionChange({ type: 'end' });
  p.onRegionChange({ type: 'regionchange', detail: { type: 'end' } });
  assert.equal(renders, 2);
  const revision = p.markerRenderRevision;
  p.onRegionChange({ detail: { type: 'begin' } });
  assert.equal(p.markerRenderRevision, revision + 1);
});
test('点击聚合始终打开完整列表，放大成为可选操作', () => {
  const p = page();
  p.openCluster(near);
  assert.equal(p.data.clusterSheetPlaces.length, 3);
  assert.equal(p.data.clusterSheetVisible, true);
  assert.equal(p.data.mapScale, 12);
  p.zoomCluster();
  assert.equal(p.data.mapScale, 14);
  assert.equal(p.data.clusterSheetVisible, false);
  p.currentMapScale = 20;
  p.openCluster([point(1, 0), point(2, 0)]);
  assert.equal(p.data.clusterSheetPlaces.length, 2);
  assert.equal(p.data.clusterCanZoom, false);
  let selected;
  p.selectPlace = id => { selected = id; };
  p.selectClusterPlace({ currentTarget: { dataset: { id: '2' } } });
  assert.equal(selected, '2');
  assert.equal(p.data.clusterSheetVisible, false);
});
test('类名首字提取和校验：吃饭、理发、酒店、英文、数字、Emoji', () => {
  for (const [name, glyph] of [['吃饭','吃'], ['理发','理'], ['酒店','酒'], ['  coffee ','c'], ['24小时','2'], ['', ''], ['🍜吃饭',''], ['·酒店','']]) {
    assert.equal(categoryNameGlyph(name), glyph);
  }
});
test('旧文字分类迁移、改名同步；图标分类不受文字校验约束', () => {
  storage.clear();
  const category = addCategory('酒店', 'other', 'blue', 'text');
  const snapshot = loadSnapshot();
  snapshot.categories.find(c => c.id === category.id).symbolText = '宿';
  storage.set('want_to_go_map_snapshot_v1', snapshot);
  assert.equal(loadSnapshot().categories.find(c => c.id === category.id).symbolText, '酒');
  assert.equal(setCategoryAppearance(category.id, '理发', 'other', 'blue', 'text').symbolText, '理');
  assert.equal(setCategoryAppearance(category.id, '🍜吃饭', 'food', 'blue', 'text'), null);
  assert.equal(setCategoryAppearance(category.id, '🍜吃饭', 'food', 'blue', 'icon').symbolType, 'icon');
});
test('完成按钮校验空名称与不支持的首字，选择字不会要求额外输入', () => {
  const p = page(); p.data.newCategorySymbolType = 'text';
  p.data.newCategoryName = ''; p.saveCategoryEditor(); assert.equal(toast, '请输入分类名称');
  p.data.newCategoryName = '🍜吃饭'; p.saveCategoryEditor(); assert.equal(toast, '名称首字需为汉字、字母或数字');
  p.data.newCategoryName = '吃饭'; p.data.categoryEditorMode = 'create';
  p.saveCategoryEditor();
  assert.equal(loadSnapshot().categories.find(c => c.name === '吃饭').symbolText, '吃');
});
function fakeClock(run) {
  const originalSet = global.setTimeout, originalClear = global.clearTimeout, originalNow = Date.now;
  let now = 0, nextId = 0;
  const timers = new Map();
  global.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id; };
  global.clearTimeout = id => timers.delete(id);
  Date.now = () => now;
  const advance = milliseconds => {
    const target = now + milliseconds;
    while (true) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].callback();
    }
    now = target;
  };
  try { run(advance); }
  finally { global.setTimeout = originalSet; global.clearTimeout = originalClear; Date.now = originalNow; }
}

test('48/56px缓冲区保持原状态，超过56拆开后不会立即重新合并', () => {
  const points = [point(1, 0), point(2, 50)];
  assert.deepEqual(sizes(points, 36000), [1, 1]);
  const joined = clusterPlaces(points, 30000);
  assert.equal(joined.length, 1);
  let previous = joined.map(g => g.map(p => p.markerId));
  assert.equal(clusterPlaces(points, 36000, previous).length, 1);
  assert.equal(clusterPlaces(points, 40000, previous).length, 1);
  const split = clusterPlaces(points, 41000, previous);
  assert.equal(split.length, 2);
  previous = split.map(g => g.map(p => p.markerId));
  assert.equal(clusterPlaces(points, 36000, previous).length, 2);
  assert.equal(clusterPlaces(points, 30000, previous).length, 1);
});

test('靠拢动画为200ms，完成后只留下正式聚合圆', () => fakeClock(advance => {
  const p = page(); p.data.filteredPlaces = near.slice(0, 2);
  p.renderMapMarkers(360000);
  const calls = []; p.mapContext = { moveAlong: o => calls.push(o) };
  p.renderMapMarkers(36000, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(o => o.duration === 200 && o.autoRotate === false));
  assert.ok(p.data.markers.every(m => m.id >= 200000000));
  assert.deepEqual(calls[0].path[1], calls[1].path[1]);
  assert.equal(p.data.filteredPlaces[0].longitude, near[0].longitude);
  calls.forEach(o => o.success());
  advance(199); assert.equal(p.transitionActive, true);
  advance(1); assert.equal(p.transitionActive, false);
  assert.equal(p.data.markers.length, 1);
  assert.equal(p.data.markers[0].label.content, '2');
  assert.ok(p.data.markers.every(m => m.id < 200000000));
}));

test('拆分从旧聚合中心出发，文字标记和最终真实坐标一同保留', () => fakeClock(advance => {
  const p = page(); p.data.filteredPlaces = near.slice(0, 2).map(p => ({ ...p, categoryUsesText: true, categorySymbolText: '吃' }));
  p.renderMapMarkers(36000);
  const center = { latitude: p.data.markers[0].latitude, longitude: p.data.markers[0].longitude };
  const calls = []; p.mapContext = { moveAlong: o => calls.push(o) };
  p.renderMapMarkers(360000, true);
  assert.equal(calls.length, 2);
  assert.ok(p.data.markers.every(m => m.label.content === '吃'));
  assert.ok(calls.every(o => o.path[0].longitude === center.longitude));
  assert.notEqual(calls[0].path[1].longitude, calls[1].path[1].longitude);
  calls.forEach(o => o.success()); advance(200);
  assert.deepEqual(p.data.markers.map(m => m.id), [1, 2]);
  assert.deepEqual(p.data.markers.map(m => m.longitude), near.slice(0, 2).map(p => p.longitude));
}));

test('新手势中断动画，旧回调和定时器不能覆盖新标记', () => fakeClock(advance => {
  const p = page(); p.data.filteredPlaces = near.slice(0, 2); p.renderMapMarkers(360000);
  const calls = []; p.mapContext = { moveAlong: o => calls.push(o) };
  p.renderMapMarkers(36000, true);
  p.onRegionChange({ detail: { type: 'begin' } });
  assert.equal(p.transitionActive, false);
  p.renderMapMarkers(360000);
  calls.forEach(o => o.success()); advance(1000);
  assert.deepEqual(p.data.markers.map(m => m.id), [1, 2]);
}));

test('动画失败或丢失回调时回到正式标记，临时标记不会残留', () => fakeClock(advance => {
  const p = page(); p.data.filteredPlaces = near.slice(0, 2); p.renderMapMarkers(360000);
  p.mapContext = { moveAlong: o => o.fail() };
  p.renderMapMarkers(36000, true);
  assert.equal(p.transitionActive, false);
  assert.equal(p.data.markers[0].label.content, '2');
  p.mapContext = { moveAlong: () => {} };
  p.renderMapMarkers(360000, true);
  assert.equal(p.transitionActive, true);
  advance(350);
  assert.equal(p.transitionActive, false);
  assert.deepEqual(p.data.markers.map(m => m.id), [1, 2]);
}));

test('点击动画中的图钉也能打开目标聚合列表', () => fakeClock(() => {
  const p = page(); p.data.filteredPlaces = near.slice(0, 2); p.renderMapMarkers(360000);
  p.mapContext = { moveAlong: () => {} };
  p.renderMapMarkers(36000, true);
  const temporaryId = p.data.markers[0].id;
  p.onMarkerTap({ detail: { markerId: temporaryId } });
  assert.equal(p.data.clusterSheetVisible, true);
  assert.equal(p.data.clusterSheetPlaces.length, 2);
  assert.equal(p.transitionActive, false);
}));

test('页面离开或数据被清空后，旧动画不得重新添加地点', () => fakeClock(advance => {
  const p = page(); p.data.filteredPlaces = near.slice(0, 2); p.renderMapMarkers(360000);
  const calls = []; p.mapContext = { moveAlong: o => calls.push(o) };
  p.renderMapMarkers(36000, true);
  p.onHide(); assert.equal(p.transitionActive, false);
  p.data.filteredPlaces = []; p.renderMapMarkers(36000);
  calls.forEach(o => o.success()); advance(1000);
  assert.deepEqual(p.data.markers, []);
  assert.equal(p.clusterMembers.size, 0);
}));

test('没有移动接口或分组未改变时直接显示，避免无意义动画', () => {
  const p = page(); p.data.filteredPlaces = near.slice(0, 2); p.renderMapMarkers(360000);
  p.mapContext = {};
  p.renderMapMarkers(36000, true);
  assert.equal(p.transitionActive, false);
  let calls = 0; p.mapContext = { moveAlong: () => { calls++; } };
  p.renderMapMarkers(40000, true);
  assert.equal(calls, 0);
});

console.log(`TypeScript 检查通过；${passed} 项回归检查通过。`);
