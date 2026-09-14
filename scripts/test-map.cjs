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
  assert.deepEqual(sizes(near, 14400), [3]);
  assert.deepEqual(sizes(near, 360000), [1, 1, 1]);
});
test('跨网格边界的近点仍合并；种草拔草参与同一距离计算', () => {
  const points = [point(1, 71), { ...point(2, 73), wantToVisit: false }];
  assert.deepEqual(sizes(points, 36000), [2]);
});
test('A-B、B-C分别靠近但A-C较远时，不允许链式合并三点', () => {
  assert.deepEqual(sizes([point(1, 0), point(2, 60), point(3, 120)], 36000), [1, 2]);
});
test('输入顺序不会改变最近点对；72px边界内外区分', () => {
  const group = clusterPlaces([near[2], near[1], near[0]], 36000).find(g => g.length === 2);
  assert.deepEqual(group.map(p => p.markerId).sort(), [1, 2]);
  assert.deepEqual(sizes([point(1, 0), point(2, 71.99)], 36000), [2]);
  assert.deepEqual(sizes([point(1, 0), point(2, 72.01)], 36000), [1, 1]);
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
  p.renderMapMarkers(14400);
  assert.equal(p.data.markers[0].iconPath, '/assets/clusters/mixed.png');
  assert.equal(p.data.markers[0].label.content, '3');
});
test('灰圆放大后彻底移除；筛选及删除后清空旧簇', () => {
  const p = page(); p.data.filteredPlaces = near;
  p.renderMapMarkers(14400);
  p.renderMapMarkers(360000);
  assert.deepEqual(p.data.markers.map(m => m.id).sort(), [1, 2, 3]);
  assert.equal(p.clusterMembers.size, 0);
  p.data.filteredPlaces = [near[0]];
  p.renderMapMarkers(14400);
  assert.equal(p.data.markers.length, 1);
  assert.equal(p.data.markers[0].id, 1);
  p.data.filteredPlaces = [];
  p.renderMapMarkers(14400);
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
test('同坐标或最高缩放级别时，点击聚合可选择地点', () => {
  const p = page(); let picked;
  p.showClusterPlaces = places => { picked = places; };
  p.openCluster([point(1, 0), point(2, 0)]);
  assert.equal(picked.length, 2);
  picked = null; p.currentMapScale = 20;
  p.openCluster(near); assert.equal(picked.length, 3);
  p.currentMapScale = 12; p.openCluster(near);
  assert.equal(p.data.mapScale, 14);
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
console.log(`TypeScript 检查通过；${passed} 项回归检查通过。`);
