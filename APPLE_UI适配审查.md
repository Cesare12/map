# Apple UI 适配审查

本项目运行在微信小程序中，不直接复制 UIKit 或 Apple 的视觉素材，而是采用 Apple Human Interface Guidelines 的信息语义和交互原则。

## 颜色与状态

- Apple 没有规定某一种颜色必须代表某一种分类。提醒事项允许用户为列表同时选择颜色和图标，因此本项目也把颜色和图标作为“分类属性”。
- 系统蓝只表示按钮、链接和可操作控件；分类颜色只表示分类，避免同一种颜色同时承担操作、分类和状态三种含义。
- 种草与拔草不只靠颜色区分：种草使用描边图钉和空心状态符号；拔草使用实心图钉和勾。
- 地图当前选中地点通过图钉放大、提高层级和显示地点卡片表达，不复用种草或拔草的状态样式。
- 分类颜色使用 8 个预设色相。色值针对白色卡片和浅色地图提高了对比度，不允许输入任意十六进制色值，避免产生无法识别的组合。

## 控件审查结果

- 地图状态筛选改为三个等宽、文字一致的分段控件：全部、种草、拔草。
- 分类仍使用可横向滚动的筛选按钮，因为分类数量不固定，不应塞进分段控件。
- 添加地点页使用微信原生导航栏和返回行为。
- 添加地点页的种草/拔草改为双项分段控件，并在下方用空心圆或勾解释状态。
- 新建和编辑分类改为底部 Sheet，提供取消与完成，并在同一层完成名称、颜色和图标设置。
- 地图上的“完成拔草”是用户主动发起且可通过再次种草恢复的常用操作，因此直接执行并提供轻量反馈，不再额外弹确认框。
- 删除地点会永久删除到访记录，继续使用带取消按钮的确认弹窗，并使用危险红色。
- 复制备份属于预期成功操作，改用轻量 Toast，不再显示纯信息弹窗。
- 主要地图按钮、保存按钮和删除按钮扩大到接近 44pt 的触控区域；次要图标选择器至少保持可辨识间距。

## 状态逻辑修正

- “种草”和“拔草”筛选现在按当前状态互斥：`wantToVisit = true` 属于种草，`wantToVisit = false` 属于拔草。
- 曾经去过、后来再次种草的地点只出现在当前的种草筛选中；历史到访次数仍保留在地点卡片中。
- 修改分类颜色或图标后，该分类下所有地点、筛选按钮和编辑页会同步更新。

## 地图密度与选点

- 相互压盖的地点会使用带数量的聚合标记；缩放放大或点按聚合标记后自动拆开，符合 Apple Maps 对高密度兴趣点的建议。
- 普通图钉为 31×38，选中图钉为 36×44。Apple 没有规定第三方地图标记的固定尺寸，本项目保持地图内容优先，只用小幅放大表达选中状态。
- 分类栏末尾始终显示“管理”，用户无需先选中某个分类即可进入列表，修改已有分类的名称、颜色和图标。
- 添加地点同时提供地图搜索和自由选点。自由选点直接保存 GCJ-02 经纬度和用户填写的店名，不依赖底图 POI 是否收录。

## 微信地图实现依据

- 微信 `map` 组件与腾讯位置服务使用同一数据体系，并支持地图展示、POI 与坐标交互。
- `joinCluster` 决定标记是否参加聚合；`MapContext.initMarkerCluster` 可配置默认聚合样式、点击拆分和 60px 聚合距离。
- `map` 的点击事件从基础库 2.9.0 起返回经纬度；本项目基础库为 3.10.0。

## Apple 官方依据

- Color: https://developer.apple.com/design/human-interface-guidelines/color
- Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- Segmented controls: https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- Sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
- Alerts: https://developer.apple.com/design/human-interface-guidelines/alerts
- Maps: https://developer.apple.com/design/human-interface-guidelines/maps
- Reminders list appearance: https://support.apple.com/en-gb/guide/iphone/iph82596cb20/ios
- WeChat map component: https://developers.weixin.qq.com/miniprogram/dev/component/map.html
- WeChat marker clustering: https://developers.weixin.qq.com/miniprogram/dev/api/media/map/MapContext.initMarkerCluster.html
