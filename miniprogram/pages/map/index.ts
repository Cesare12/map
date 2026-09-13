import { addCategory, exportSnapshotText, loadSnapshot, recordVisit, setCategoryIcon, setWantToVisit } from "../../utils/storage";
import { distanceMeters, formatDistance, isInsideRegion } from "../../utils/geo";
import { formatVisitTime } from "../../utils/format";
import { markerIconPath } from "../../utils/marker";
import { CATEGORY_ICON_OPTIONS, categoryIconPath } from "../../utils/category-icon";
import { Category, CurrentLocation, Place } from "../../utils/types";

type StatusFilter = "all" | "want" | "visited";

interface PlaceView extends Place {
  markerId: number;
  categoryName: string;
  categoryEmoji: string;
  categoryIconKey: string;
  categoryIconPath: string;
  categoryColor: string;
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
    categoryCreatorVisible: false,
    categoryEditorMode: "create" as "create" | "icon",
    editingCategoryId: "",
    newCategoryName: "",
    newCategoryIconKey: "other",
    categoryIconOptions: CATEGORY_ICON_OPTIONS.map((item) => ({
      ...item,
      iconPath: categoryIconPath(item.key),
      active: item.key === "other"
    }))
  },

  mapContext: null as any,
  currentLocation: null as CurrentLocation | null,
  locationRequested: false,
  markerIdByPlaceId: new Map<string, number>(),
  nextMarkerId: 1,

  onReady() {
    this.mapContext = wx.createMapContext("mainMap", this);
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
      if (status === "visited") return place.visits.length > 0;
      return true;
    });

    const views: PlaceView[] = filtered.map((place) => {
      const category = categoryById.get(place.categoryId) || categories[0];
      const distance = this.currentLocation ? distanceMeters(this.currentLocation, place) : null;
      const latestVisit = place.visits.length ? place.visits[place.visits.length - 1] : null;
      const hasVisited = place.visits.length > 0;
      return {
        ...place,
        markerId: this.markerIdFor(place.id),
        categoryName: category ? category.name : "其他",
        categoryEmoji: category ? category.emoji : "📍",
        categoryIconKey: category ? category.iconKey : "other",
        categoryIconPath: categoryIconPath(category ? category.iconKey : "other"),
        categoryColor: category ? category.color : "#8B6F9B",
        distance,
        distanceLabel: formatDistance(distance),
        statusLabel: hasVisited ? `去过 ${place.visits.length} 次` : "等待拔草",
        hasVisited,
        showWantAgain: hasVisited && !place.wantToVisit,
        latestVisitLabel: latestVisit ? formatVisitTime(latestVisit.visitedAt) : "",
        lifecycleLabel: place.wantToVisit ? (hasVisited ? "再次种草" : "种草") : "已拔草",
        lifecycleIcon: place.wantToVisit ? "🌱" : "✓",
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

    const markers = views.map((place) => ({
      id: place.markerId,
      latitude: place.latitude,
      longitude: place.longitude,
      iconPath: markerIconPath(place.categoryIconKey, place.wantToVisit),
      width: place.selected ? 36 : 30,
      height: place.selected ? 44 : 37,
      anchor: { x: 0.5, y: 1 }
    }));

    const categoryTabs = [
      { id: "all", name: "全部", iconPath: "/assets/category-icons/all.png", count: rawPlaces.length, active: categoryId === "all" },
      ...categories.map((category) => ({
        ...category,
        iconPath: categoryIconPath(category.iconKey),
        count: rawPlaces.filter((place) => place.categoryId === category.id).length,
        active: category.id === categoryId
      }))
    ];
    const scopedPlaces = rawPlaces.filter((place) => categoryId === "all" || place.categoryId === categoryId);
    const wantCount = scopedPlaces.filter((place) => place.wantToVisit).length;
    const visitedCount = scopedPlaces.filter((place) => place.visits.length > 0).length;
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
    this.setData({
      filteredPlaces: views,
      nearbyPlaces: nearby,
      markers,
      categoryTabs,
      statusTabs,
      selectedPlace,
      selectedPlaceId: selectedPlace ? selectedPlace.id : "",
      emptyTitle,
      emptyCopy,
      emptyIcon,
      viewportLabel: `${views.length} 个地点`
    }, () => this.updateViewportCount());
  },

  selectCategory(event: any) {
    this.setData({ selectedCategoryId: event.currentTarget.dataset.id, selectedPlaceId: "" }, () => this.applyFilters());
  },

  selectStatus(event: any) {
    this.setData({ selectedStatus: event.currentTarget.dataset.id, selectedPlaceId: "" }, () => this.applyFilters());
  },

  onMarkerTap(event: any) {
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
      mapScale: Math.max(14, this.data.mapScale)
    } : {};
    this.setData({ selectedPlaceId: id, ...position }, () => this.applyFilters());
  },

  closeSelected() {
    this.setData({ selectedPlaceId: "", selectedPlace: null }, () => this.applyFilters());
  },

  addPlace() {
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

  editSelected() {
    if (!this.data.selectedPlaceId) return;
    wx.navigateTo({ url: `/pages/place/index?id=${encodeURIComponent(this.data.selectedPlaceId)}` });
  },

  recordSelectedVisit() {
    const selected = this.data.selectedPlace as PlaceView | null;
    if (!selected) return;
    wx.showModal({
      title: selected.hasVisited ? "再次完成拔草？" : "完成拔草？",
      content: "会记录本次到访时间，并把地点移到“拔草”中。",
      confirmText: "完成拔草",
      success: (result: any) => {
        if (!result.confirm) return;
        recordVisit(selected.id);
        this.loadData();
        wx.showToast({ title: "拔草完成", icon: "success" });
      }
    });
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
    if (event.type === "end") this.updateViewportCount();
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
      newCategoryIconKey: "other"
    }, () => this.refreshCategoryIconOptions());
  },

  showCurrentCategoryIconEditor() {
    const categoryId = this.data.selectedCategoryId;
    if (categoryId === "all") {
      wx.showToast({ title: "请先选择一个分类", icon: "none" });
      return;
    }
    const category = (this.data.categories as Category[]).find((item) => item.id === categoryId);
    if (!category) return;
    this.setData({
      categoryCreatorVisible: true,
      categoryEditorMode: "icon",
      editingCategoryId: category.id,
      newCategoryName: category.name,
      newCategoryIconKey: category.iconKey
    }, () => this.refreshCategoryIconOptions());
  },

  hideCategoryCreator() {
    this.setData({ categoryCreatorVisible: false, editingCategoryId: "", newCategoryName: "" });
  },

  refreshCategoryIconOptions() {
    const selected = this.data.newCategoryIconKey;
    this.setData({
      categoryIconOptions: CATEGORY_ICON_OPTIONS.map((item) => ({
        ...item,
        iconPath: categoryIconPath(item.key),
        active: item.key === selected
      }))
    });
  },

  selectCategoryIcon(event: any) {
    this.setData({ newCategoryIconKey: event.currentTarget.dataset.key }, () => this.refreshCategoryIconOptions());
  },

  onCategoryNameInput(event: any) {
    this.setData({ newCategoryName: event.detail.value });
  },

  saveCategoryEditor() {
    if (this.data.categoryEditorMode === "icon") {
      const category = setCategoryIcon(this.data.editingCategoryId, this.data.newCategoryIconKey);
      if (!category) return;
      this.hideCategoryCreator();
      this.loadData();
      wx.showToast({ title: "分类图标已更新", icon: "success" });
      return;
    }
    const name = String(this.data.newCategoryName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入分类名称", icon: "none" });
      return;
    }
    const category = addCategory(name, this.data.newCategoryIconKey);
    this.hideCategoryCreator();
    this.loadData();
    this.setData({ selectedCategoryId: category.id }, () => this.applyFilters());
  },

  stopEvent() {},

  openMore() {
    wx.showActionSheet({
      itemList: ["新增分类", "修改当前分类图标", "复制本地备份"],
      success: (result: any) => {
        if (result.tapIndex === 0) this.showCategoryCreator();
        if (result.tapIndex === 1) this.showCurrentCategoryIconEditor();
        if (result.tapIndex === 2) this.copyBackup();
      }
    });
  },

  copyBackup() {
    wx.setClipboardData({
      data: exportSnapshotText(),
      success: () => wx.showModal({
        title: "备份已经复制",
        content: "请粘贴到自己的安全位置保存。当前 V0 只有文字和地点数据。",
        showCancel: false
      })
    });
  }
});
