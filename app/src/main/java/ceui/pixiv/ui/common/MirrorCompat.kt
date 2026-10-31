package ceui.pixiv.ui.common

import ceui.pixiv.feeds.FeedItem

/**
 * 自建源列表（shaft-api-v2 榜单 / 热度 / 壁纸、pixiv 网页 ajax、发现池快照）的收藏态回填。
 *
 * 在 `classic` 里，这些 payload 的 `is_bookmarked` 是上报者 / 匿名网页的视角，source 一律
 * 清成 false，卡片上永远是灰心，于是这里会去问本地收藏镜像（BookmarkMirror）把「只升不降」
 * 地翻成 true。
 *
 * `lean` 分支删掉了 BookmarkMirror（见 CLEANUP_MANIFEST.md §3.3），收藏变成纯网络读写，
 * 本地没有可问的副本。约三十个 feed 调用点仍在调这个名字，所以保留这个**同签名的恒等
 * shim**：不再回填，也不必去动那三十处代码。要恢复「自建源卡片显红心」的正确做法是加一个
 * 按 id 批量查收藏态的接口，而不是把镜像搬回来。
 */
internal suspend fun List<FeedItem>.withMirroredBookmarks(): List<FeedItem> = this
