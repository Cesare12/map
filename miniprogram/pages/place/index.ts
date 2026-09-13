import { createId, loadSnapshot, removePlace, upsertPlace } from "../../utils/storage";
import { Category, Place, Visit } from "../../utils/types";

type LifecycleStatus = "want" | "visited";

Page({
  data: {
    editing: false,
    id: "",
    name: "",
    address: "",
    latitude: 0,
    longitude: 0,
    categoryId: "food",
    categoryOptions: [] as any[],
    categories: [] as Category[],
    wantToVisit: true,
    lifecycleStatus: "want" as LifecycleStatus,
    initialLifecycleStatus: "want" as LifecycleStatus,
    lifecycleOptions: [] as any[],
    note: "",
    visits: [] as any[],
    createdAt: 0
  },

  onLoad(options: Record<string, string>) {
    const snapshot = loadSnapshot();
    if (options.id) {
      const place = snapshot.places.find((item) => item.id === decodeURIComponent(options.id));
      if (!place) {
        wx.showToast({ title: "没有找到这个地点", icon: "none" });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.setData({
        editing: true,
        id: place.id,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        categoryId: place.categoryId,
        wantToVisit: place.wantToVisit,
        lifecycleStatus: place.wantToVisit ? "want" : "visited",
        initialLifecycleStatus: place.wantToVisit ? "want" : "visited",
        note: place.note,
        visits: place.visits,
        createdAt: place.createdAt,
        categories: snapshot.categories
      }, () => {
        this.refreshCategories();
        this.refreshLifecycleOptions();
      });
      return;
    }

    const requestedCategory = options.categoryId ? decodeURIComponent(options.categoryId) : "";
    const initialCategory = snapshot.categories.some((item) => item.id === requestedCategory)
      ? requestedCategory
      : (wx.getStorageSync("want_to_go_last_category") || "food");
    this.setData({
      name: options.name ? decodeURIComponent(options.name) : "",
      address: options.address ? decodeURIComponent(options.address) : "",
      latitude: Number(options.latitude) || 0,
      longitude: Number(options.longitude) || 0,
      categoryId: snapshot.categories.some((item) => item.id === initialCategory) ? initialCategory : "food",
      categories: snapshot.categories
    }, () => {
      this.refreshCategories();
      this.refreshLifecycleOptions();
    });
  },

  refreshCategories() {
    this.setData({
      categoryOptions: (this.data.categories as Category[]).map((item) => ({
        ...item,
        active: item.id === this.data.categoryId
      }))
    });
  },

  onNameInput(event: any) {
    this.setData({ name: event.detail.value });
  },

  onNoteInput(event: any) {
    this.setData({ note: event.detail.value });
  },

  refreshLifecycleOptions() {
    const status = this.data.lifecycleStatus as LifecycleStatus;
    this.setData({
      lifecycleOptions: [
        { id: "want", icon: "🌱", title: "种草", copy: "想去，等待拔草", active: status === "want" },
        { id: "visited", icon: "✓", title: "拔草", copy: "已经到访过", active: status === "visited" }
      ]
    });
  },

  selectLifecycle(event: any) {
    const lifecycleStatus = event.currentTarget.dataset.id as LifecycleStatus;
    this.setData({ lifecycleStatus, wantToVisit: lifecycleStatus === "want" }, () => this.refreshLifecycleOptions());
  },

  selectCategory(event: any) {
    this.setData({ categoryId: event.currentTarget.dataset.id }, () => this.refreshCategories());
  },

  reselectLocation() {
    wx.chooseLocation({
      latitude: this.data.latitude || undefined,
      longitude: this.data.longitude || undefined,
      success: (result: any) => this.setData({
        name: result.name || this.data.name,
        address: result.address || "",
        latitude: result.latitude,
        longitude: result.longitude
      })
    });
  },

  savePlace() {
    const name = String(this.data.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写地点名称", icon: "none" });
      return;
    }
    if (!this.data.latitude || !this.data.longitude) {
      wx.showToast({ title: "请先选择准确地点", icon: "none" });
      return;
    }
    const now = Date.now();
    const lifecycleStatus = this.data.lifecycleStatus as LifecycleStatus;
    const visits = ([...(this.data.visits || [])]) as Visit[];
    const startedAsWant = (this.data.initialLifecycleStatus as LifecycleStatus) === "want";
    if (lifecycleStatus === "visited" && (!this.data.editing || startedAsWant)) {
      visits.push({ id: createId("visit"), visitedAt: now, note: "" });
    }
    const place: Place = {
      id: this.data.id || createId("place"),
      name,
      address: String(this.data.address || ""),
      latitude: Number(this.data.latitude),
      longitude: Number(this.data.longitude),
      categoryId: this.data.categoryId,
      wantToVisit: lifecycleStatus === "want",
      visits,
      note: String(this.data.note || "").trim(),
      createdAt: this.data.createdAt || now,
      updatedAt: now
    };
    try {
      upsertPlace(place);
      wx.setStorageSync("want_to_go_last_category", place.categoryId);
      wx.showToast({ title: lifecycleStatus === "want" ? "种草成功" : "已完成拔草", icon: "success" });
      setTimeout(() => wx.navigateBack(), 450);
    } catch (error) {
      console.error("保存地点失败", error);
      wx.showModal({ title: "保存失败", content: "本机存储空间可能不足，请清理后重试。", showCancel: false });
    }
  },

  deletePlace() {
    wx.showModal({
      title: "删除这个地点？",
      content: "相关的到访记录也会一起删除，此操作无法撤销。",
      confirmText: "删除",
      confirmColor: "#b5483f",
      success: (result: any) => {
        if (!result.confirm) return;
        removePlace(this.data.id);
        wx.showToast({ title: "已删除", icon: "success" });
        setTimeout(() => wx.navigateBack(), 450);
      }
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
