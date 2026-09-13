import { addCategory, exportSnapshotText, loadSnapshot, recordVisit, setWantToVisit } from "../../utils/storage";
import { distanceMeters, formatDistance, isInsideRegion } from "../../utils/geo";
import { formatVisitTime } from "../../utils/format";
import { ensureMarkerIcon } from "../../utils/marker";
import { Category, CurrentLocation, Place } from "../../utils/types";

type StatusFilter = "all" | "want" | "visited";

interface PlaceView extends Place {
  markerId: number;
  categoryName: string;
  categoryEmoji: string;
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
    newCategoryName: ""
  },

  mapContext: null as any,
  currentLocation: null as CurrentLocation | null,
  locationRequested: false,
  markerIconPath: "",

  onReady() {
    this.mapContext = wx.createMapContext("mainMap", this);
  },

  onLoad() {
    this.markerIconPath = ensureMarkerIcon();
    this.loadData();
    this.requestLocation(false);
  },

  onShow() {
    this.loadData();
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
      if (status === "visited") return !place.wantToVisit && place.visits.length > 0;
      return true;
    });

    const views: PlaceView[] = filtered.map((place, index) => {
      const category = categoryById.get(place.categoryId) || categories[0];
      const distance = this.currentLocation ? distanceMeters(this.currentLocation, place) : null;
      const latestVisit = place.visits.length ? place.visits[place.visits.length - 1] : null;
      const hasVisited = place.visits.length > 0;
      return {
        ...place,
        markerId: index + 1,
        categoryName: category ? category.name : "其他",
        categoryEmoji: category ? category.emoji : "📍",
        categoryColor: category ? category.color : "#8B6F9B",
        distance,
        distanceLabel: formatDistance(distance),
        statusLabel: place.wantToVisit
          ? (hasVisited ? `再次种草 · 去过 ${place.visits.length} 次` : "等待拔草")
          : `已拔草 · 去过 ${place.visits.length} 次`,
        hasVisited,
        showWantAgain: hasVisited && !place.wantToVisit,
        latestVisitLabel: latestVisit ? formatVisitTime(latestVisit.visitedAt) : "",
        lifecycleLabel: place.wantToVisit ? "种草" : "拔草",
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
      iconPath: this.markerIconPath,
      width: 30,
      height: 40,
      alpha: place.hasVisited && !place.wantToVisit ? 0.78 : 1,
      label: {
        content: `${place.lifecycleIcon} ${place.categoryEmoji}`,
        color: place.wantToVisit ? "#76520c" : "#285b46",
        fontSize: 15,
        anchorX: -18,
        anchorY: -44,
        borderRadius: 14,
        bgColor: place.wantToVisit ? "#fff0c9" : "#dff1e7",
        borderWidth: 1,
        borderColor: place.wantToVisit ? "#efbd54" : "#70a58c",
        padding: 6
      },
      callout: {
        content: `${place.name}\n${place.distanceLabel}`,
        display: place.selected ? "ALWAYS" : "BYCLICK",
        padding: 8,
        borderRadius: 8,
        bgColor: "#fffdf7",
        color: "#24251f",
        borderWidth: 1,
        borderColor: "#d8d2c5",
        fontSize: 12
      }
    }));

    const categoryTabs = [
      { id: "all", name: "全部", emoji: "◉", count: rawPlaces.length, active: categoryId === "all" },
      ...categories.map((category) => ({
        ...category,
        count: rawPlaces.filter((place) => place.categoryId === category.id).length,
        active: category.id === categoryId
      }))
    ];
    const scopedPlaces = rawPlaces.filter((place) => categoryId === "all" || place.categoryId === categoryId);
    const wantCount = scopedPlaces.filter((place) => place.wantToVisit).length;
    const visitedCount = scopedPlaces.filter((place) => !place.wantToVisit && place.visits.length > 0).length;
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
    this.setData({ selectedPlaceId: id }, () => {
      this.applyFilters();
      if (center) {
        const place = (this.data.filteredPlaces as PlaceView[]).find((item) => item.id === id);
        if (place) this.setData({ mapLatitude: place.latitude, mapLongitude: place.longitude, mapScale: Math.max(14, this.data.mapScale) });
      }
    });
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
          content: "请检查位置权限和后台接口设置，然后再试一次。",
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
    if (!this.currentLocation) {
      this.requestLocation(true);
      return;
    }
    if (this.mapContext && typeof this.mapContext.moveToLocation === "function") {
      this.mapContext.moveToLocation({
        latitude: this.currentLocation.latitude,
        longitude: this.currentLocation.longitude
      });
    } else {
      this.setData({ mapLatitude: this.currentLocation.latitude, mapLongitude: this.currentLocation.longitude, mapScale: 14 });
    }
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
    this.setData({ categoryCreatorVisible: true, newCategoryName: "" });
  },

  hideCategoryCreator() {
    this.setData({ categoryCreatorVisible: false, newCategoryName: "" });
  },

  onCategoryNameInput(event: any) {
    this.setData({ newCategoryName: event.detail.value });
  },

  createCategory() {
    const name = String(this.data.newCategoryName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入分类名称", icon: "none" });
      return;
    }
    const category = addCategory(name);
    this.hideCategoryCreator();
    this.loadData();
    this.setData({ selectedCategoryId: category.id }, () => this.applyFilters());
  },

  stopEvent() {},

  openMore() {
    wx.showActionSheet({
      itemList: ["新增分类", "复制本地备份"],
      success: (result: any) => {
        if (result.tapIndex === 0) this.showCategoryCreator();
        if (result.tapIndex === 1) this.copyBackup();
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
