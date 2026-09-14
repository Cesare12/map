import { addCategory, exportSnapshotText, loadSnapshot, recordVisit, setCategoryAppearance, setWantToVisit } from "../../utils/storage";
import { distanceMeters, formatDistance, isInsideRegion } from "../../utils/geo";
import { formatVisitTime } from "../../utils/format";
import { clusterIconPath, markerIconPath } from "../../utils/marker";
import { CATEGORY_ICON_OPTIONS, categoryIconPath, categoryNameGlyph, normalizeCategorySymbolText, normalizeCategorySymbolType } from "../../utils/category-icon";
import { CATEGORY_COLOR_OPTIONS, categoryColor } from "../../utils/category-color";
import { clusterPlaces, clusterCenter, worldSizeFromRegion, MAX_MAP_SCALE } from "../../utils/clustering";
import { Category, CurrentLocation, Place } from "../../utils/types";

type StatusFilter = "all" | "want" | "visited";

interface PlaceView extends Place {
  markerId: number;
  categoryName: string;
  categoryEmoji: string;
  categoryIconKey: string;
  categoryIconPath: string;
  categoryColorKey: string;
  categoryColor: string;
  categorySoftColor: string;
  categorySymbolType: "icon" | "text";
  categorySymbolText: string;
  categoryUsesText: boolean;
  distance: number | null;
  distanceLabel: string;
  statusLabel: string;
  hasVisited: boolean;
  showWantAgain: boolean;
  latestVisitLabel: string;
  lifecycleLabel: string;
  lifecycleIcon: string;
  lifecycleClass: string;
  selected: boolean;
}

const DEFAULT_CENTER = { latitude: 31.2304, longitude: 121.4737 };

Page({
  data: {
    mapLatitude: DEFAULT_CENTER.latitude,
    mapLongitude: DEFAULT_CENTER.longitude,
    mapScale: 12,
    safeTop: 20,
    capsuleReserve: 92,
    mapActionsTop: 126,
    locationReady: false,
    places: [] as Place[],
    filteredPlaces: [] as PlaceView[],
    nearbyPlaces: [] as PlaceView[],
    markers: [] as any[],
    categories: [] as Category[],
    categoryTabs: [] as any[],
    statusTabs: [] as any[],
    selectedCategoryId: "all",
    selectedStatus: "all" as StatusFilter,
    selectedPlaceId: "",
    selectedPlace: null as PlaceView | null,
    viewportLabel: "0 个地点",
    emptyTitle: "",
    emptyCopy: "",
    emptyIcon: "📍",
    nearbyCollapsed: false,
    manualPinMode: false,
    categoryCreatorVisible: false,
    categoryEditorMode: "manage" as "manage" | "create" | "edit",
    categoryManagerItems: [] as any[],
    editingCategoryId: "",
    newCategoryName: "",
    newCategoryIconKey: "other",
    newCategoryColorKey: "blue",
    newCategoryColor: "#0071E3",
    newCategorySymbolType: "icon" as "icon" | "text",
    newCategoryGlyph: "",
    categoryColorOptions: CATEGORY_COLOR_OPTIONS.map((item) => ({
      ...item,
      active: item.key === "blue"
    })),
    categoryIconOptions: CATEGORY_ICON_OPTIONS.map((item) => ({
      ...item,
      iconPath: categoryIconPath(item.key, "blue"),
      active: item.key === "other"
    }))
  },

  mapContext: null as any,
  currentLocation: null as CurrentLocation | null,
  locationRequested: false,
  markerIdByPlaceId: new Map<string, number>(),
  nextMarkerId: 1,
  clusterMembers: new Map<number, PlaceView[]>(),
  markerRenderRevision: 0,
  mapWidth: 375,
  currentMapScale: 12,
  renderedWorldSize: 256 * Math.pow(2, 12),

  onReady() {
    this.mapContext = wx.createMapContext("mainMap", this);
    this.syncMapMarkers();
  },

  onUnload() {
    this.markerRenderRevision++;
    this.mapContext = null;
  },

  syncMapMarkers() {
    const revision = ++this.markerRenderRevision;
    const context = this.mapContext;
    if (!context) {
      this.renderMapMarkers(this.renderedWorldSize);
      return;
    }
    const readRegion = (scale: number) => {
      if (revision !== this.markerRenderRevision) return;
      const render = (worldSize: number) => {
        if (revision !== this.markerRenderRevision) return;
        this.renderedWorldSize = worldSize;
        this.renderMapMarkers(worldSize);
      };
      const fallback = () => render(256 * Math.pow(2, scale));
      if (typeof context.getRegion !== "function") return fallback();
      context.getRegion({
        success: (region: any) => {
          const size = worldSizeFromRegion(
            Number(region.southwest && region.southwest.longitude),
            Number(region.northeast && region.northeast.longitude), this.mapWidth
          );
          if (size) render(size);
          else fallback();
        },
        fail: fallback
      });
    };
    if (typeof context.getScale !== "function") return readRegion(this.currentMapScale);
    context.getScale({
      success: (result: any) => {
        if (revision !== this.markerRenderRevision) return;
        const scale = Number(result.scale);
        if (Number.isFinite(scale) && scale >= 3 && scale <= MAX_MAP_SCALE) {
          // 记住手势缩放后的实际级别，点按聚合时从当前视野继续放大。
          this.currentMapScale = scale;
          readRegion(scale);
        } else readRegion(this.currentMapScale);
      },
      fail: () => readRegion(this.currentMapScale)
    });
  },

  renderMapMarkers(worldSize: number) {
    const groups = clusterPlaces(this.data.filteredPlaces as PlaceView[], worldSize);
    const clusterMembers = new Map<number, PlaceView[]>();
    const markers = groups.map((places) => {
      const first = places[0];
      if (places.length === 1) return this.placeMarker(first);
      const id = 100000000 + Math.min(...places.map((place) => place.markerId));
      clusterMembers.set(id, places);
      const sameCategory = places.every((place) => place.categoryId === first.categoryId);
      const count = String(places.length);
      return {
        id,
        ...clusterCenter(places),
        iconPath: clusterIconPath(sameCategory ? first.categoryColorKey : undefined),
        width: 40,
        height: 40,
        anchor: { x: 0.5, y: 0.5 },
        zIndex: 20,
        label: {
          content: count,
          color: "#FFFFFF",
          fontSize: 14,
          anchorX: -count.length * 4,
          anchorY: -8,
          textAlign: "center"
        }
      };
    });
    this.clusterMembers = clusterMembers;
    // 唯一绘制通道：替换 map.markers 全量列表，拆分后不再保留任何旧聚合圆。
    this.setData({ markers });
  },

  placeMarker(place: PlaceView) {
    return {
      id: place.markerId,
      latitude: place.latitude,
      longitude: place.longitude,
      iconPath: markerIconPath(place.categoryIconKey, place.categoryColorKey, place.wantToVisit, place.categoryUsesText),
      width: place.selected ? 36 : 31,
      height: place.selected ? 44 : 38,
      zIndex: place.selected ? 9 : 1,
      anchor: { x: 0.5, y: 1 },
      ...(place.categoryUsesText ? {
        label: {
          content: place.categorySymbolText,
          color: place.wantToVisit ? place.categoryColor : "#FFFFFF",
          fontSize: place.selected ? 13 : 12,
          anchorX: - (place.selected ? 6.5 : 6),
          anchorY: place.selected ? -33 : -29,
          textAlign: "center"
        }
      } : {})
    };
  },

  openCluster(places: PlaceView[]) {
    const center = clusterCenter(places);
    const samePosition = places.every((place) =>
      Math.abs(place.latitude - center.latitude) < 0.000001 &&
      Math.abs(place.longitude - center.longitude) < 0.000001
    );
    if (samePosition || this.currentMapScale >= MAX_MAP_SCALE) {
      this.showClusterPlaces(places, 0);
      return;
    }
    this.setData({
      mapLatitude: center.latitude,
      mapLongitude: center.longitude,
      mapScale: Math.min(MAX_MAP_SCALE, this.currentMapScale + 2)
    });
  },

  showClusterPlaces(places: PlaceView[], offset: number) {
    const visible = places.slice(offset, offset + 5);
    const hasNext = offset + 5 < places.length;
    wx.showActionSheet({
      itemList: visible.map((place) => place.name).concat(hasNext ? ["更多地点…"] : []),
      success: (result: any) => {
        if (result.tapIndex === visible.length && hasNext) this.showClusterPlaces(places, offset + 5);
        else if (visible[result.tapIndex]) this.selectPlace(visible[result.tapIndex].id, false);
      }
    });
  },

  onLoad() {
    this.initLayoutMetrics();
    this.loadData();
    this.requestLocation(false);
  },

  initLayoutMetrics() {
    try {
      const info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const menu = wx.getMenuButtonBoundingClientRect();
      this.mapWidth = Number(info.windowWidth) || 375;
      this.setData({
        safeTop: Math.max(Number(info.statusBarHeight) || 20, Number(menu.top) || 0),
        capsuleReserve: Math.max(88, Number(info.windowWidth) - Number(menu.left) + 8),
        mapActionsTop: Math.max(122, Number(menu.bottom) + 48)
      });
    } catch (_) {
      // 使用 data 中的保守默认值。
    }
  },

  onShow() {
    const focusPlaceId = wx.getStorageSync("want_to_go_focus_place_id");
    if (!focusPlaceId) {
      this.loadData();
      return;
    }
    wx.removeStorageSync("want_to_go_focus_place_id");
    const snapshot = loadSnapshot();
    const place = snapshot.places.find((item) => item.id === focusPlaceId);
    if (!place) {
      this.setData({ places: snapshot.places, categories: snapshot.categories }, () => this.applyFilters());
      return;
    }
    const selectedCategoryId = this.data.selectedCategoryId === "all" || this.data.selectedCategoryId === place.categoryId
      ? this.data.selectedCategoryId
      : place.categoryId;
    this.setData({
      places: snapshot.places,
      categories: snapshot.categories,
      selectedCategoryId,
      selectedStatus: "all",
      selectedPlaceId: place.id,
      mapLatitude: place.latitude,
      mapLongitude: place.longitude,
      mapScale: 15
    }, () => this.applyFilters());
  },

  markerIdFor(placeId: string): number {
    const existing = this.markerIdByPlaceId.get(placeId);
    if (existing) return existing;
    const markerId = this.nextMarkerId++;
    this.markerIdByPlaceId.set(placeId, markerId);
    return markerId;
  },

  loadData() {
    const snapshot = loadSnapshot();
    this.setData({ places: snapshot.places, categories: snapshot.categories }, () => this.applyFilters());
  },

  requestLocation(fromUser: boolean) {
    if (this.locationRequested && !fromUser) return;
    this.locationRequested = true;
    wx.getLocation({
      type: "gcj02",
      isHighAccuracy: true,
      highAccuracyExpireTime: 3000,
      success: (result: any) => {
        this.currentLocation = {
          latitude: result.latitude,
          longitude: result.longitude,
          updatedAt: Date.now()
        };
        this.setData({
          locationReady: true,
          mapLatitude: result.latitude,
          mapLongitude: result.longitude,
          mapScale: 13
        }, () => this.applyFilters());
      },
      fail: () => {
        this.setData({ locationReady: false }, () => this.applyFilters());
        if (fromUser) this.handleLocationFailure();
      }
    });
  },

  handleLocationFailure() {
    wx.showModal({
      title: "暂时无法定位",
      content: "你仍可保存和分类地点。若曾拒绝授权，可以去设置中重新开启位置权限。",
      confirmText: "去设置",
      cancelText: "稍后",
      success: (result: any) => {
        if (!result.confirm) return;
        wx.openSetting({
          success: (settings: any) => {
            if (settings.authSetting["scope.userLocation"]) this.requestLocation(true);
          }
        });
      }
    });
  },

  applyFilters() {
    const categoryId = this.data.selectedCategoryId;
    const status = this.data.selectedStatus as StatusFilter;
    const categories = this.data.categories as Category[];
    const rawPlaces = this.data.places as Place[];
    const categoryById = new Map(categories.map((item) => [item.id, item]));

    let filtered = rawPlaces.filter((place) => categoryId === "all" || place.categoryId === categoryId);
    filtered = filtered.filter((place) => {
      if (status === "want") return place.wantToVisit;
      if (status === "visited") return !place.wantToVisit;
      return true;
    });

    const views: PlaceView[] = filtered.map((place) => {
      const category = categoryById.get(place.categoryId) || categories[0];
      const palette = categoryColor(category ? category.colorKey : "blue");
      const distance = this.currentLocation ? distanceMeters(this.currentLocation, place) : null;
      const latestVisit = place.visits.length ? place.visits[place.visits.length - 1] : null;
      const hasVisited = place.visits.length > 0;
      const symbolType = normalizeCategorySymbolType(category ? category.symbolType : "icon");
      const symbolText = symbolType === "text" ? normalizeCategorySymbolText(category ? category.symbolText : "") : "";
      return {
        ...place,
        markerId: this.markerIdFor(place.id),
        categoryName: category ? category.name : "其他",
        categoryEmoji: category ? category.emoji : "📍",
        categoryIconKey: category ? category.iconKey : "other",
        categoryIconPath: categoryIconPath(category ? category.iconKey : "other", palette.key),
        categoryColorKey: palette.key,
        categoryColor: palette.hex,
        categorySoftColor: palette.soft,
        categorySymbolType: symbolType,
        categorySymbolText: symbolText,
        categoryUsesText: symbolType === "text" && !!symbolText,
        distance,
        distanceLabel: formatDistance(distance),
        statusLabel: hasVisited ? `去过 ${place.visits.length} 次` : "等待拔草",
        hasVisited,
        showWantAgain: hasVisited && !place.wantToVisit,
        latestVisitLabel: latestVisit ? formatVisitTime(latestVisit.visitedAt) : "",
        lifecycleLabel: place.wantToVisit ? (hasVisited ? "再次种草" : "种草") : "已拔草",
        lifecycleIcon: place.wantToVisit ? "○" : "✓",
        lifecycleClass: place.wantToVisit ? "want" : "visited",
        selected: place.id === this.data.selectedPlaceId
      };
    });

    const nearby = views.slice().sort((a, b) => {
      if (a.distance === null && b.distance === null) return b.updatedAt - a.updatedAt;
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });

    const categoryTabs = [
      {
        id: "all",
        name: "全部",
        iconPath: "/assets/category-icons/all.png",
        usesText: false,
        symbolText: "",
        count: rawPlaces.length,
        active: categoryId === "all",
        style: categoryId === "all" ? "border-color:#007aff;background:#eaf3ff;color:#007aff" : ""
      },
      ...categories.map((category) => ({
        ...category,
        iconPath: categoryIconPath(category.iconKey, category.colorKey),
        usesText: normalizeCategorySymbolType(category.symbolType) === "text",
        symbolText: normalizeCategorySymbolText(category.symbolText),
        style: category.id === categoryId
          ? `border-color:${category.color};background:${categoryColor(category.colorKey).soft};color:${category.color}`
          : "",
        count: rawPlaces.filter((place) => place.categoryId === category.id).length,
        active: category.id === categoryId
      }))
    ];
    const scopedPlaces = rawPlaces.filter((place) => categoryId === "all" || place.categoryId === categoryId);
    const wantCount = scopedPlaces.filter((place) => place.wantToVisit).length;
    const visitedCount = scopedPlaces.filter((place) => !place.wantToVisit).length;
    const statusTabs = [
      { id: "all", icon: "◉", name: "全部", count: scopedPlaces.length, active: status === "all" },
      { id: "want", icon: "🌱", name: "种草", count: wantCount, active: status === "want" },
      { id: "visited", icon: "✓", name: "拔草", count: visitedCount, active: status === "visited" }
    ];

    let emptyTitle = "";
    let emptyCopy = "";
    let emptyIcon = "📍";
    if (rawPlaces.length === 0) {
      emptyTitle = "还没有种草的地方";
      emptyCopy = "从你刚刚刷到的那家店开始种草吧";
    } else if (views.length === 0) {
      emptyTitle = "这个筛选下没有地点";
      emptyCopy = status === "want" ? "这个分类暂时没有种草地点" : status === "visited" ? "去一家店，完成第一次拔草吧" : "换一个分类看看";
      emptyIcon = "🧭";
    }

    const selectedPlace = views.find((item) => item.id === this.data.selectedPlaceId) || null;
    const categoryManagerItems = categories.map((category) => {
      const palette = categoryColor(category.colorKey);
      const count = rawPlaces.filter((place) => place.categoryId === category.id).length;
      return {
        ...category,
        iconPath: categoryIconPath(category.iconKey, category.colorKey),
        usesText: normalizeCategorySymbolType(category.symbolType) === "text",
        symbolText: normalizeCategorySymbolText(category.symbolText),
        softColor: palette.soft,
        count,
        countLabel: count ? `${count} 个地点` : "暂无地点"
      };
    });
    this.setData({
      filteredPlaces: views,
      nearbyPlaces: nearby,
      categoryTabs,
      statusTabs,
      categoryManagerItems,
      selectedPlace,
      selectedPlaceId: selectedPlace ? selectedPlace.id : "",
      emptyTitle,
      emptyCopy,
      emptyIcon,
      viewportLabel: `${views.length} 个地点`
    }, () => {
      this.syncMapMarkers();
      this.updateViewportCount();
    });
  },

  selectCategory(event: any) {
    this.setData({ selectedCategoryId: event.currentTarget.dataset.id, selectedPlaceId: "" }, () => this.applyFilters());
  },

  selectStatus(event: any) {
    this.setData({ selectedStatus: event.currentTarget.dataset.id, selectedPlaceId: "" }, () => this.applyFilters());
  },

  onMarkerTap(event: any) {
    if (this.data.manualPinMode) return;
    const cluster = this.clusterMembers.get(Number(event.detail.markerId));
    if (cluster) {
      this.openCluster(cluster);
      return;
    }
    const place = (this.data.filteredPlaces as PlaceView[]).find((item) => item.markerId === event.detail.markerId);
    if (place) this.selectPlace(place.id, false);
  },

  selectPlaceCard(event: any) {
    this.selectPlace(event.currentTarget.dataset.id, true);
  },

  selectPlace(id: string, center: boolean) {
    const place = (this.data.filteredPlaces as PlaceView[]).find((item) => item.id === id);
    const position = center && place ? {
      mapLatitude: place.latitude,
      mapLongitude: place.longitude,
      mapScale: Math.max(14, this.currentMapScale)
    } : {};
    this.setData({ selectedPlaceId: id, ...position }, () => this.applyFilters());
  },

  closeSelected() {
    this.setData({ selectedPlaceId: "", selectedPlace: null }, () => this.applyFilters());
  },

  addPlace() {
    wx.showActionSheet({
      itemList: ["搜索地图地点", "在地图上选点"],
      success: (result: any) => {
        if (result.tapIndex === 0) this.chooseMapLocation();
        if (result.tapIndex === 1) this.startManualPin();
      }
    });
  },

  chooseMapLocation() {
    wx.chooseLocation({
      success: (result: any) => {
        const query = [
          `name=${encodeURIComponent(result.name || "")}`,
          `address=${encodeURIComponent(result.address || "")}`,
          `latitude=${result.latitude}`,
          `longitude=${result.longitude}`,
          `categoryId=${encodeURIComponent(this.data.selectedCategoryId === "all" ? "" : this.data.selectedCategoryId)}`
        ].join("&");
        wx.navigateTo({ url: `/pages/place/index?${query}` });
      },
      fail: (error: any) => {
        if (String(error.errMsg || "").includes("cancel")) return;
        wx.showModal({
          title: "暂时不能选择地点",
          content: "请检查微信的位置权限，然后再试一次。",
          showCancel: false
        });
      }
    });
  },

  startManualPin() {
    this.setData({ manualPinMode: true, selectedPlaceId: "", selectedPlace: null });
  },

  cancelManualPin() {
    this.setData({ manualPinMode: false });
  },

  onMapTap(event: any) {
    if (!this.data.manualPinMode) return;
    const latitude = Number(event.detail && event.detail.latitude);
    const longitude = Number(event.detail && event.detail.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      wx.showToast({ title: "请再点一次地图", icon: "none" });
      return;
    }
    this.setData({ manualPinMode: false });
    const query = [
      "name=",
      "address=",
      `latitude=${latitude}`,
      `longitude=${longitude}`,
      `categoryId=${encodeURIComponent(this.data.selectedCategoryId === "all" ? "" : this.data.selectedCategoryId)}`,
      "manual=1"
    ].join("&");
    wx.navigateTo({ url: `/pages/place/index?${query}` });
  },

  editSelected() {
    if (!this.data.selectedPlaceId) return;
    wx.navigateTo({ url: `/pages/place/index?id=${encodeURIComponent(this.data.selectedPlaceId)}` });
  },

  recordSelectedVisit() {
    const selected = this.data.selectedPlace as PlaceView | null;
    if (!selected) return;
    recordVisit(selected.id);
    this.loadData();
    wx.showToast({ title: "已完成拔草", icon: "success" });
  },

  wantAgain() {
    const selected = this.data.selectedPlace as PlaceView | null;
    if (!selected) return;
    setWantToVisit(selected.id, true);
    this.loadData();
    wx.showToast({ title: "再次种草", icon: "success" });
  },

  navigateSelected() {
    const selected = this.data.selectedPlace as PlaceView | null;
    if (!selected) return;
    const fallback = () => wx.openLocation({
      latitude: selected.latitude,
      longitude: selected.longitude,
      name: selected.name,
      address: selected.address,
      scale: 16
    });
    const options = {
      latitude: selected.latitude,
      longitude: selected.longitude,
      destination: selected.name,
      fail: fallback
    };
    if (this.mapContext && typeof this.mapContext.openMapApp === "function") {
      this.mapContext.openMapApp(options);
    } else {
      fallback();
    }
  },

  moveToMyLocation() {
    this.requestLocation(true);
  },

  showAllPlaces() {
    const places = this.data.filteredPlaces as PlaceView[];
    if (!places.length) return;
    if (places.length === 1) {
      this.setData({ mapLatitude: places[0].latitude, mapLongitude: places[0].longitude, mapScale: 15 });
      return;
    }
    this.mapContext && this.mapContext.includePoints({
      points: places.map((place) => ({ latitude: place.latitude, longitude: place.longitude })),
      padding: [180, 60, 360, 60]
    });
  },

  onRegionChange(event: any) {
    const phase = event.detail && event.detail.type || event.type;
    if (phase === "begin") this.markerRenderRevision++;
    if (phase === "end") {
      const scale = Number(event.detail && event.detail.scale);
      if (Number.isFinite(scale) && scale >= 3 && scale <= MAX_MAP_SCALE) this.currentMapScale = scale;
      this.syncMapMarkers();
      this.updateViewportCount();
    }
  },

  updateViewportCount() {
    const places = this.data.filteredPlaces as PlaceView[];
    if (!this.mapContext || !places.length || typeof this.mapContext.getRegion !== "function") {
      this.setData({ viewportLabel: `${places.length} 个地点` });
      return;
    }
    this.mapContext.getRegion({
      success: (region: any) => {
        const visible = places.filter((place) => isInsideRegion(place, region.southwest, region.northeast)).length;
        const label = visible === places.length ? `${places.length} 个地点` : `视野内 ${visible} / 共 ${places.length}`;
        this.setData({ viewportLabel: label });
      },
      fail: () => this.setData({ viewportLabel: `${places.length} 个地点` })
    });
  },

  toggleNearby() {
    this.setData({ nearbyCollapsed: !this.data.nearbyCollapsed });
  },

  showCategoryCreator() {
    this.setData({
      categoryCreatorVisible: true,
      categoryEditorMode: "create",
      editingCategoryId: "",
      newCategoryName: "",
      newCategoryIconKey: "other",
      newCategoryColorKey: "blue",
      newCategorySymbolType: "icon",
      newCategoryGlyph: ""
    }, () => {
      this.refreshCategoryColorOptions();
      this.refreshCategoryIconOptions();
    });
  },

  showCategoryManager() {
    this.setData({
      categoryCreatorVisible: true,
      categoryEditorMode: "manage",
      editingCategoryId: "",
      newCategoryName: ""
    });
  },

  editCategoryFromManager(event: any) {
    const categoryId = event.currentTarget.dataset.id;
    const category = (this.data.categories as Category[]).find((item) => item.id === categoryId);
    if (!category) return;
    this.setData({
      categoryEditorMode: "edit",
      editingCategoryId: category.id,
      newCategoryName: category.name,
      newCategoryIconKey: category.iconKey,
      newCategoryColorKey: category.colorKey,
      newCategorySymbolType: normalizeCategorySymbolType(category.symbolType),
      newCategoryGlyph: categoryNameGlyph(category.name)
    }, () => {
      this.refreshCategoryColorOptions();
      this.refreshCategoryIconOptions();
    });
  },

  showCurrentCategoryEditor() {
    const categoryId = this.data.selectedCategoryId;
    if (categoryId === "all") {
      wx.showToast({ title: "请先选择一个分类", icon: "none" });
      return;
    }
    const category = (this.data.categories as Category[]).find((item) => item.id === categoryId);
    if (!category) return;
    this.setData({
      categoryCreatorVisible: true,
      categoryEditorMode: "edit",
      editingCategoryId: category.id,
      newCategoryName: category.name,
      newCategoryIconKey: category.iconKey,
      newCategoryColorKey: category.colorKey,
      newCategorySymbolType: normalizeCategorySymbolType(category.symbolType),
      newCategoryGlyph: categoryNameGlyph(category.name)
    }, () => {
      this.refreshCategoryColorOptions();
      this.refreshCategoryIconOptions();
    });
  },

  hideCategoryCreator() {
    this.setData({ categoryCreatorVisible: false, editingCategoryId: "", newCategoryName: "" });
  },

  categorySheetBack() {
    if (this.data.categoryEditorMode === "manage") {
      this.hideCategoryCreator();
      return;
    }
    this.showCategoryManager();
  },

  categorySheetPrimary() {
    if (this.data.categoryEditorMode === "manage") {
      this.showCategoryCreator();
      return;
    }
    this.saveCategoryEditor();
  },

  refreshCategoryIconOptions() {
    const selected = this.data.newCategoryIconKey;
    const colorKey = this.data.newCategoryColorKey;
    this.setData({
      categoryIconOptions: CATEGORY_ICON_OPTIONS.map((item) => ({
        ...item,
        iconPath: categoryIconPath(item.key, colorKey),
        active: this.data.newCategorySymbolType === "icon" && item.key === selected
      }))
    });
  },

  refreshCategoryColorOptions() {
    const selected = this.data.newCategoryColorKey;
    const selectedPalette = categoryColor(selected);
    this.setData({
      newCategoryColor: selectedPalette.hex,
      categoryColorOptions: CATEGORY_COLOR_OPTIONS.map((item) => ({
        ...item,
        active: item.key === selected
      }))
    });
  },

  selectCategoryIcon(event: any) {
    this.setData({ newCategoryIconKey: event.currentTarget.dataset.key, newCategorySymbolType: "icon" }, () => this.refreshCategoryIconOptions());
  },

  selectCategoryTextMode() {
    this.setData({ newCategorySymbolType: "text" }, () => this.refreshCategoryIconOptions());
  },

  selectCategoryColor(event: any) {
    this.setData({ newCategoryColorKey: event.currentTarget.dataset.key }, () => {
      this.refreshCategoryColorOptions();
      this.refreshCategoryIconOptions();
    });
  },

  onCategoryNameInput(event: any) {
    this.setData({ newCategoryName: event.detail.value, newCategoryGlyph: categoryNameGlyph(event.detail.value) });
  },

  saveCategoryEditor() {
    const name = String(this.data.newCategoryName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入分类名称", icon: "none" });
      return;
    }
    const duplicate = (this.data.categories as Category[]).some((item) =>
      item.name === name && item.id !== this.data.editingCategoryId
    );
    if (duplicate) {
      wx.showToast({ title: "分类名称已存在", icon: "none" });
      return;
    }
    const symbolType = this.data.newCategorySymbolType as "icon" | "text";
    const symbolText = symbolType === "text" ? categoryNameGlyph(name) : "";
    if (symbolType === "text" && !symbolText) {
      wx.showToast({ title: "名称首字需为汉字、字母或数字", icon: "none" });
      return;
    }
    if (this.data.categoryEditorMode === "edit") {
      const category = setCategoryAppearance(
        this.data.editingCategoryId,
        name,
        this.data.newCategoryIconKey,
        this.data.newCategoryColorKey,
        symbolType
      );
      if (!category) return;
      this.hideCategoryCreator();
      this.loadData();
      wx.showToast({ title: "分类已更新", icon: "success" });
      return;
    }
    const category = addCategory(name, this.data.newCategoryIconKey, this.data.newCategoryColorKey, symbolType);
    this.hideCategoryCreator();
    this.loadData();
    this.setData({ selectedCategoryId: category.id }, () => this.applyFilters());
  },

  stopEvent() {},

  openMore() {
    wx.showActionSheet({
      itemList: ["管理分类", "复制本地备份"],
      success: (result: any) => {
        if (result.tapIndex === 0) this.showCategoryManager();
        if (result.tapIndex === 1) this.copyBackup();
      }
    });
  },

  copyBackup() {
    wx.setClipboardData({
      data: exportSnapshotText(),
      success: () => wx.showToast({ title: "备份已复制", icon: "success" })
    });
  }
});
