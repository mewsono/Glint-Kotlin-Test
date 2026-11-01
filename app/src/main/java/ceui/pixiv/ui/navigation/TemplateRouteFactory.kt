package ceui.pixiv.ui.navigation

import android.content.Intent
import android.net.Uri
import androidx.core.content.IntentCompat
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import ceui.lisa.activities.TemplateActivity
import ceui.lisa.fragments.FragmentAboutApp
import ceui.lisa.fragments.FragmentCollection
import ceui.lisa.fragments.FragmentEditAccount
import ceui.lisa.fragments.FragmentEditFile
import ceui.lisa.fragments.FragmentFileName
import ceui.lisa.fragments.FragmentHistoryTabs
import ceui.lisa.fragments.FragmentIllust
import ceui.lisa.fragments.FragmentImageDetail
import ceui.lisa.fragments.FragmentLogin
import ceui.lisa.fragments.FragmentMarkdown
import ceui.lisa.fragments.FragmentNew
import ceui.lisa.fragments.FragmentNewNovel
import ceui.lisa.fragments.FragmentPv
import ceui.lisa.fragments.FragmentSAF
import ceui.lisa.fragments.FragmentSearch
import ceui.lisa.fragments.FragmentSettingsHub
import ceui.lisa.fragments.FragmentUserInfo
import ceui.lisa.fragments.FragmentViewPager
import ceui.lisa.fragments.FragmentWebView
import ceui.lisa.fragments.FragmentWorkSpace
import ceui.lisa.fragments.SettingsCatalog
import ceui.lisa.fragments.StreetMainFragment
import ceui.lisa.utils.Params
import ceui.loxia.Novel
import ceui.pixiv.api.model.Illust
import ceui.pixiv.api.model.ObjectType
import ceui.pixiv.cache.ObjectPool
import ceui.pixiv.services.appServices
import ceui.pixiv.ui.account.AccountSwitchV3Fragment
import ceui.pixiv.ui.account.EmailBackupV3Fragment
import ceui.pixiv.ui.bulk.BulkSelectHandoff
import ceui.pixiv.ui.bulk.BulkSelectV3Fragment
import ceui.pixiv.ui.bulk.NovelBulkSelectV3Fragment
import ceui.pixiv.ui.collection.BookedTagFeedFragment
import ceui.pixiv.ui.collection.LikeIllustFeedFragment
import ceui.pixiv.ui.collection.LikeNovelFeedFragment
import ceui.pixiv.ui.comic.ComicTopFeedFragment
import ceui.pixiv.ui.comic.reader.ComicReaderV3Fragment
import ceui.pixiv.ui.comments.CommentsFragment
import ceui.pixiv.ui.detail.ArtworkV3Fragment
import ceui.pixiv.ui.detail.IllustSeriesFragment
import ceui.pixiv.ui.detail.RelatedIllustFeedFragment
import ceui.pixiv.ui.detail.frames.UgoiraFramesFragment
import ceui.pixiv.ui.filter.ImageFilterFragment
import ceui.pixiv.ui.discovery.DiscoveryFeedFragment
import ceui.pixiv.ui.discovery.WebDiscoveryFragment
import ceui.pixiv.ui.download.DownloadManagerV3Fragment
import ceui.pixiv.ui.dynamic.FollowingNovelFeedFragment
import ceui.pixiv.ui.fanbox.FanboxHomeFragment
import ceui.pixiv.ui.fanbox.FanboxPostDetailFragment
import ceui.pixiv.ui.feature.FeatureFeedFragment
import ceui.pixiv.ui.flag.FlagDescFragment
import ceui.pixiv.ui.flag.FlagReasonFragment
import ceui.pixiv.ui.home.NiceFriendIllustFeedFragment
import ceui.pixiv.ui.home.RecmdMangaFeedFragment
import ceui.pixiv.ui.home.WalkthroughFeedFragment
import ceui.pixiv.ui.notification.InfoCategoryListFragment
import ceui.pixiv.ui.notification.NotificationPagerFragment
import ceui.pixiv.ui.notification.NotificationViewMoreFragment
import ceui.pixiv.ui.novel.NovelMarkersFeedFragment
import ceui.pixiv.ui.novel.NovelSeriesFragment
import ceui.pixiv.ui.novel.NovelTextFragment
import ceui.pixiv.ui.novel.local.LocalLibraryFragment
import ceui.pixiv.ui.novel.reader.NovelReaderV3Fragment
import ceui.pixiv.ui.pinned.PinnedTabsFragment
import ceui.pixiv.ui.recommend.AI_ONLY
import ceui.pixiv.ui.recommend.ArtistRankFeedFragment
import ceui.pixiv.ui.recommend.BookmarkRankFragment
import ceui.pixiv.ui.recommend.DailyRecommendationsFragment
import ceui.pixiv.ui.recommend.FragmentEventHistory
import ceui.pixiv.ui.recommend.FragmentRecentRecommend
import ceui.pixiv.ui.recommend.FragmentSiteRecommend
import ceui.pixiv.ui.recommend.MonthRankFragment
import ceui.pixiv.ui.recommend.NovelLengthRankFragment
import ceui.pixiv.ui.recommend.RESTRICT_SFW
import ceui.pixiv.ui.recommend.SeriesRankFragment
import ceui.pixiv.ui.recommend.TagRankFragment
import ceui.pixiv.ui.recommend.TrendingArtistsFragment
import ceui.pixiv.ui.recommend.UgoiraRankFragment
import ceui.pixiv.ui.recommend.ViewRankFragment
import ceui.pixiv.ui.recommend.WallpaperRankFragment
import ceui.pixiv.ui.recommend.YearRankFragment
import ceui.pixiv.ui.settings.Aria2SettingsFragment
import ceui.pixiv.ui.settings.DownloadPathSettingsFragment
import ceui.pixiv.ui.settings.NovelHeaderSettingsFragment
import ceui.pixiv.ui.settings.ThemeColorFeedFragment
import ceui.pixiv.ui.synonym.SynonymDictFragment
import ceui.pixiv.ui.user.FollowUserFeedFragment
import ceui.pixiv.ui.user.LikeUsersFeedFragment
import ceui.pixiv.ui.user.NiceFriendFeedFragment
import ceui.pixiv.ui.user.RecmdUserFeedFragment
import ceui.pixiv.ui.user.RelatedUserFeedFragment
import ceui.pixiv.ui.user.RequestPlan
import ceui.pixiv.ui.user.RequestPlanDetailFragment
import ceui.pixiv.ui.user.UserFansFeedFragment
import ceui.pixiv.ui.user.UserIllustByTagFeedFragment
import ceui.pixiv.ui.user.UserIllustFeedFragment
import ceui.pixiv.ui.user.UserMangaFeedFragment
import ceui.pixiv.ui.user.UserMangaSeriesFeedFragment
import ceui.pixiv.ui.user.UserNovelByTagFeedFragment
import ceui.pixiv.ui.user.UserNovelFeedFragment
import ceui.pixiv.ui.user.UserNovelSeriesFeedFragment
import ceui.pixiv.ui.user.UserTagSearchSheet
import ceui.pixiv.ui.watchlater.WatchLaterTabsFragment
import ceui.pixiv.ui.web.WebFragment

/**
 * [TemplateRoute] → Fragment。原先是 TemplateActivity 里一个 128 case 的中文字符串 switch， 现在 `when`
 * 对枚举穷举：新增路由忘了在这里接就编译不过。
 *
 * 每个分支只做「从 Intent 取参 + newInstance」，不放业务逻辑；extra 的 key 沿用各页自己 声明的常量，这里不另起名字。
 */
object TemplateRouteFactory {

    @JvmStatic
    fun create(route: TemplateRoute, intent: Intent): Fragment =
        when (route) {
            // 邀请码落地页已随 `lean` 删除：旧链接（shaftintent://referral）落到登录页。
            TemplateRoute.REFERRAL_PLAN -> FragmentLogin()
            TemplateRoute.LOGIN -> FragmentLogin()
            TemplateRoute.RELATED_ILLUSTS ->
                RelatedIllustFeedFragment.newInstance(
                    Params.getLongCompat(intent, Params.ILLUST_ID),
                    intent.getStringExtra(Params.ILLUST_TITLE),
                )
            TemplateRoute.HISTORY -> FragmentHistoryTabs()
            TemplateRoute.WATCH_LATER -> WatchLaterTabsFragment()
            TemplateRoute.WEB_LINK ->
                FragmentWebView.newInstance(
                    intent.getStringExtra(Params.TITLE),
                    intent.getStringExtra(Params.URL),
                    intent.getBooleanExtra(Params.PREFER_PRESERVE, false),
                )
            TemplateRoute.SETTINGS -> FragmentSettingsHub()
            TemplateRoute.SETTINGS_CATEGORY ->
                SettingsCatalog.fragmentFor(intent.getStringExtra(SettingsCatalog.EXTRA_CATEGORY))
            // 与 FragmentRight#seeMore 配对：货架把自己那批快照存进 RecmdUserHandoff，
            // 只把 key 传过来。取用/清理都归 RecmdUserFeedFragment 自己（数据落进 VM，
            // 旋转不重拉；key 为 null 或 map 已失效时它自己退化成网络首屏）。
            TemplateRoute.RECOMMENDED_USERS ->
                RecmdUserFeedFragment.newInstance(intent.getStringExtra(Params.USER_MODEL))
            TemplateRoute.PIXIVISION -> FragmentPv()
            // 搜索本身由 WebView 发（引擎都在 Cloudflare 质询后面，见 ReverseImage），
            // 这里只是把引擎上传页和待搜图片转交过去。
            TemplateRoute.REVERSE_IMAGE_SEARCH ->
                FragmentWebView.newInstance(
                    intent.getStringExtra(Params.TITLE),
                    intent.getStringExtra(Params.URL),
                    IntentCompat.getParcelableExtra(
                        intent,
                        Params.REVERSE_SEARCH_IMAGE_URI,
                        Uri::class.java,
                    ),
                )
            // 评论区：插画/漫画入口塞 ILLUST_ID，小说入口塞 NOVEL_ID。作者 id 不在 extra 里，
            // 从对象池取，取不到就给 0（只影响自己发的评论要不要盖「作者」标记）。
            TemplateRoute.COMMENTS -> {
                val novelId = intent.getIntExtra(Params.NOVEL_ID, 0).toLong()
                if (novelId > 0L) {
                    CommentsFragment.newInstance(
                        novelId,
                        ObjectPool.get<Novel>(novelId).value?.user?.userId ?: 0L,
                        ObjectType.NOVEL,
                    )
                } else {
                    val illustId = Params.getLongCompat(intent, Params.ILLUST_ID)
                    CommentsFragment.newInstance(
                        illustId,
                        ObjectPool.get<Illust>(illustId).value?.user?.userId ?: 0L,
                        ObjectType.ILLUST,
                    )
                }
            }
            // V3 / MD3-E 重做版，替代 legacy FragmentLocalUsers（当前账号 hero 卡 +
            // 其他账号分段行 + 添加账号独行）
            TemplateRoute.ACCOUNT_SWITCH -> AccountSwitchV3Fragment()
            TemplateRoute.BOOKED_TAG_FILTER ->
                BookedTagFeedFragment.newInstance(
                    intent.getIntExtra(Params.DATA_TYPE, 0),
                    intent.getStringExtra(TemplateActivity.EXTRA_KEYWORD),
                )
            TemplateRoute.ABOUT -> FragmentAboutApp()
            // 统一路由到新的 V3 下载管理页（默认进队列 tab）
            TemplateRoute.BULK_DOWNLOAD_QUEUE -> DownloadManagerV3Fragment()
            TemplateRoute.BULK_SELECT ->
                BulkSelectV3Fragment.newInstance(
                    intent.getStringExtra(BulkSelectHandoff.ARG_HANDOFF_KEY)
                )
            TemplateRoute.NOVEL_BULK_SELECT ->
                NovelBulkSelectV3Fragment.newInstance(
                    intent.getStringExtra(BulkSelectHandoff.ARG_HANDOFF_KEY)
                )
            TemplateRoute.WALKTHROUGH -> WalkthroughFeedFragment()
            TemplateRoute.FOLLOWING ->
                FollowUserFeedFragment.newInstance(
                    Params.getUserId(intent),
                    Params.TYPE_PUBLIC,
                    true,
                )
            // legacy 直接从 Activity 的 intent 读 USER_ID（它没有 newInstance），
            // 新版收进 arguments，故这里显式传。
            TemplateRoute.NICE_FRIENDS ->
                NiceFriendFeedFragment.newInstance(Params.getUserId(intent))
            TemplateRoute.NICE_FRIEND_ILLUSTS -> NiceFriendIllustFeedFragment()
            TemplateRoute.SEARCH -> FragmentSearch()
            TemplateRoute.USER_INFO -> FragmentUserInfo()
            TemplateRoute.NEW_WORKS -> FragmentNew()
            TemplateRoute.FANS -> UserFansFeedFragment.newInstance(Params.getUserId(intent))
            TemplateRoute.ILLUST_LIKERS ->
                LikeUsersFeedFragment.newInstance(
                    (intent.getSerializableExtra(Params.CONTENT) as? Illust) ?: Illust(id = 0L)
                )
            TemplateRoute.NOVEL_LIKERS ->
                LikeUsersFeedFragment.newInstance(
                    intent.getLongExtra(Params.NOVEL_ID, 0L),
                    intent.getStringExtra(Params.TITLE),
                )
            // Legacy 路由——桥接到新页 NovelSeriesFragment。保留只为兼容外部深链或仍在路上的
            // 字符串拼接调用；内部入口都已迁到 NOVEL_SERIES + ARG_SERIES_ID(Long)。
            TemplateRoute.NOVEL_SERIES_DETAIL_LEGACY ->
                NovelSeriesFragment.newInstance(
                    intent.getLongExtra(
                        NovelSeriesFragment.ARG_SERIES_ID,
                        intent.getIntExtra(Params.ID, 0).toLong(),
                    )
                )
            TemplateRoute.USER_ILLUSTS ->
                UserIllustFeedFragment.newInstance(
                    Params.getUserId(intent),
                    true,
                    intent.getIntExtra(Params.INITIAL_OFFSET, 0),
                    intent.getStringExtra(Params.TARGET_DATE),
                )
            // issue #569: 按 Tag 筛选画师插画
            TemplateRoute.USER_ILLUSTS_BY_TAG ->
                UserIllustByTagFeedFragment.newInstance(
                    Params.getUserId(intent),
                    intent.getStringExtra(Params.KEY_WORD),
                )
            // issue #996: 按 Tag 筛选画师漫画(与插画同页,网页端点段不同)
            TemplateRoute.USER_MANGA_BY_TAG ->
                UserIllustByTagFeedFragment.newInstance(
                    Params.getUserId(intent),
                    intent.getStringExtra(Params.KEY_WORD),
                    UserTagSearchSheet.CATEGORY_MANGA,
                )
            // issue #996: 按 Tag 筛选作者小说
            TemplateRoute.USER_NOVELS_BY_TAG ->
                UserNovelByTagFeedFragment.newInstance(
                    Params.getUserId(intent),
                    intent.getStringExtra(Params.KEY_WORD),
                )
            TemplateRoute.USER_MANGA ->
                UserMangaFeedFragment.newInstance(
                    Params.getUserId(intent),
                    true,
                    intent.getIntExtra(Params.INITIAL_OFFSET, 0),
                    intent.getStringExtra(Params.TARGET_DATE),
                )
            // STAR_TYPE / KEY_WORD 可选：同义词词典管理页跳转时带上（issue #904）
            TemplateRoute.ILLUST_BOOKMARKS ->
                LikeIllustFeedFragment.newInstance(
                    Params.getUserId(intent),
                    intent.getStringExtra(Params.STAR_TYPE) ?: Params.TYPE_PUBLIC,
                    true,
                    intent.getStringExtra(Params.KEY_WORD),
                )
            TemplateRoute.DOWNLOAD_MANAGER -> DownloadManagerV3Fragment()
            TemplateRoute.RECOMMENDED_MANGA -> RecmdMangaFeedFragment.newInstance()
            TemplateRoute.RECOMMENDED_NOVELS -> FragmentNewNovel()
            TemplateRoute.NOVEL_BOOKMARKS ->
                LikeNovelFeedFragment.newInstance(
                    Params.getUserId(intent),
                    intent.getStringExtra(Params.STAR_TYPE) ?: Params.TYPE_PUBLIC,
                    true,
                    intent.getStringExtra(Params.KEY_WORD),
                )
            TemplateRoute.USER_NOVELS -> UserNovelFeedFragment.newInstance(Params.getUserId(intent))
            TemplateRoute.LOCAL_NOVEL_LIBRARY -> LocalLibraryFragment()
            TemplateRoute.COMIC_READER -> {
                ComicReaderV3Fragment.newInstance(Params.getLongCompat(intent, Params.ILLUST_ID))
            }
            TemplateRoute.NOVEL_SERIES ->
                NovelSeriesFragment.newInstance(
                    intent.getLongExtra(NovelSeriesFragment.ARG_SERIES_ID, 0L)
                )
            TemplateRoute.WEB_HOME -> StreetMainFragment()
            TemplateRoute.WEB_PAGE ->
                WebFragment.newInstance(
                    intent.getStringExtra(Params.URL) ?: "https://www.pixiv.net/",
                    intent.getBooleanExtra("saveCookies", false),
                )
            TemplateRoute.IMAGE_DETAIL ->
                FragmentImageDetail.newInstance(
                    intent.getStringExtra(Params.URL),
                    intent.getStringExtra(Params.TITLE),
                )
            TemplateRoute.EDIT_ACCOUNT -> FragmentEditAccount()
            // V3 账号备份/恢复页（pixshaft-api /v1/account/*）。与 Pixiv 原生「绑定邮箱」
            // (改 pixiv-id/邮箱/密码) 是两回事。mode = "backup"(设置入口) | "restore"(登录页入口)。
            TemplateRoute.EMAIL_BACKUP ->
                EmailBackupV3Fragment().apply {
                    intent.getStringExtra(EmailBackupV3Fragment.ARG_MODE)?.let { mode ->
                        arguments = bundleOf(EmailBackupV3Fragment.ARG_MODE to mode)
                    }
                }
            TemplateRoute.EDIT_PROFILE -> FragmentEditFile()
            TemplateRoute.MUTED_TAGS -> FragmentViewPager.newInstance(Params.VIEW_PAGER_MUTED)
            TemplateRoute.FILE_NAME_FORMAT -> FragmentFileName.newInstance()
            TemplateRoute.DOWNLOAD_PATH_SETTINGS -> DownloadPathSettingsFragment()
            TemplateRoute.ARIA2_SETTINGS -> Aria2SettingsFragment()
            TemplateRoute.NOVEL_HEADER_SETTINGS -> NovelHeaderSettingsFragment()
            // 旧 key 是线上契约不能删；已移除的空捐赠页安全降级到关于页。
            TemplateRoute.DONATE -> FragmentAboutApp()
            // feeds 版(替代 legacy FragmentNewNovels);独立页带 toolbar,restrict 走默认「全部」
            TemplateRoute.FOLLOWING_NOVELS -> FollowingNovelFeedFragment.newInstance()
            TemplateRoute.USER_MANGA_SERIES ->
                UserMangaSeriesFeedFragment.newInstance(Params.getUserId(intent))
            // V3 漫画系列详情页 IllustSeriesFragment。系列 id 兼容旧调用的 MANGA_SERIES_ID
            // 与新 ARG_SERIES_ID(long)，两者都按 Long 读。
            TemplateRoute.MANGA_SERIES_DETAIL -> {
                var sid = intent.getLongExtra(IllustSeriesFragment.ARG_SERIES_ID, 0L)
                if (sid == 0L) sid = Params.getLongCompat(intent, Params.MANGA_SERIES_ID)
                if (sid == 0L) sid = intent.getIntExtra(Params.ID, 0).toLong()
                IllustSeriesFragment.newInstance(sid)
            }
            TemplateRoute.USER_NOVEL_SERIES ->
                UserNovelSeriesFeedFragment.newInstance(Params.getUserId(intent))
            TemplateRoute.FEATURE_LIST -> FeatureFeedFragment()
            TemplateRoute.WORKSPACE -> FragmentWorkSpace()
            TemplateRoute.PINNED_CONTENT -> PinnedTabsFragment()
            // key = 老 assets 文件名里那段 sha256，现在是 pixshaft-api 的路径参数。
            // 本地收藏库（BookmarkMirror 或 ui/library）已随 `lean` 删除，收藏入口直接进经典合集页。
            TemplateRoute.MY_ILLUST_COLLECTION -> FragmentCollection.newInstance(0)
            // 小说收藏入口与插画侧同一条规则（理由见上面 MY_ILLUST_COLLECTION 的注释）。
            TemplateRoute.MY_NOVEL_COLLECTION -> FragmentCollection.newInstance(1)
            // 本地收藏库（BookmarkMirror / ui/library）已随 `lean` 删除，这个入口退回经典合集页。
            TemplateRoute.BOOKMARK_LIBRARY -> FragmentCollection.newInstance(0)
            TemplateRoute.WATCHLIST -> FragmentCollection.newInstance(3)
            TemplateRoute.MY_FOLLOWING -> FragmentCollection.newInstance(2)
            TemplateRoute.NOVEL_MARKERS -> NovelMarkersFeedFragment()
            // 设置 → 标签译文颜色 也复用本页，通过 extra 切成选择器模式。
            TemplateRoute.THEME_COLOR ->
                ThemeColorFeedFragment.newInstance(
                    intent.getBooleanExtra(
                        ThemeColorFeedFragment.ARG_SELECT_TAG_TRANSLATION_COLOR,
                        false,
                    )
                )
            TemplateRoute.SAF_TEST -> FragmentSAF()
            // flagObjectId 是插画/用户等真实业务 ID，必须走 long——曾经这里用 getIntExtra 读，
            // 跟 Illust.id(Long) 类型不匹配，Bundle 类型不符时静默返回 0，导致举报的 illust_id 恒为 0。
            TemplateRoute.FLAG_REASON ->
                FlagReasonFragment.newInstance(
                    intent.getLongExtra(FlagDescFragment.FlagObjectIdKey, 0L),
                    intent.getIntExtra(FlagDescFragment.FlagObjectTypeKey, 0),
                )
            TemplateRoute.FLAG_DESC ->
                FlagDescFragment.newInstance(
                    intent.getIntExtra(FlagDescFragment.FlagTopicIdKey, 0),
                    intent.getStringExtra(FlagDescFragment.FlagTopicTitleKey),
                    intent.getLongExtra(FlagDescFragment.FlagObjectIdKey, 0L),
                    intent.getIntExtra(FlagDescFragment.FlagObjectTypeKey, 0),
                )
            TemplateRoute.RELATED_USERS ->
                RelatedUserFeedFragment.newInstance(Params.getUserId(intent))
            TemplateRoute.MARKDOWN ->
                FragmentMarkdown.newInstance(intent.getStringExtra(Params.URL))
            TemplateRoute.DISCOVERY -> DiscoveryFeedFragment()
            TemplateRoute.WEB_DISCOVERY -> WebDiscoveryFragment()
            TemplateRoute.RECENT_RECOMMEND -> FragmentRecentRecommend()
            TemplateRoute.SITE_RECOMMEND -> FragmentSiteRecommend()
            TemplateRoute.ARTIST_RANK -> ArtistRankFeedFragment.newInstance("total")
            TemplateRoute.ARTIST_AVG_RANK -> ArtistRankFeedFragment.newInstance("avg")
            TemplateRoute.VIEW_RANK -> ViewRankFragment.newInstance()
            TemplateRoute.PIXIV_COMIC -> ComicTopFeedFragment()
            TemplateRoute.FANBOX_HOME -> FanboxHomeFragment()
            TemplateRoute.FANBOX_POST ->
                FanboxPostDetailFragment.newInstance(
                    intent.requireString(FanboxPostDetailFragment.ARG_POST_ID)
                )
            TemplateRoute.BOOKMARK_RANK -> BookmarkRankFragment.newInstance(null, null)
            // 同一个 Fragment,多带一个 ?ai=only
            TemplateRoute.AI_RANK -> BookmarkRankFragment.newInstance(AI_ONLY, null)
            // 同一个 Fragment,多带一个 ?restrict=sfw(服务端剔除 R-18)
            TemplateRoute.SFW_RANK -> BookmarkRankFragment.newInstance(null, RESTRICT_SFW)
            TemplateRoute.YEAR_RANK -> YearRankFragment.newInstance()
            TemplateRoute.TAG_RANK -> TagRankFragment.newInstance()
            TemplateRoute.WALLPAPER_RANK -> WallpaperRankFragment.newInstance()
            // shaft-api-v2 discover/series:漫画 / 小说系列按累计收藏排
            TemplateRoute.SERIES_RANK -> SeriesRankFragment.newInstance()
            // shaft-api-v2 discover/most-bookmarked?month=YYYY-MM,选月份 + 三类型 tab
            TemplateRoute.MONTH_RANK -> MonthRankFragment.newInstance()
            // shaft-api-v2 discover/most-bookmarked?type=novel&length=long|medium|short
            TemplateRoute.NOVEL_LENGTH_RANK -> NovelLengthRankFragment.newInstance()
            TemplateRoute.TRENDING_ARTISTS -> TrendingArtistsFragment.newInstance()
            TemplateRoute.DAILY_RECOMMENDATIONS -> DailyRecommendationsFragment()
            TemplateRoute.UGOIRA_RANK -> UgoiraRankFragment.newInstance()
            TemplateRoute.UGOIRA_FRAMES ->
                UgoiraFramesFragment.newInstance(
                    (intent.getSerializableExtra(Params.CONTENT) as? Illust) ?: Illust(id = 0L),
                    intent.getStringExtra(UgoiraFramesFragment.ARG_OFFLINE_DIR),
                )
            TemplateRoute.IMAGE_FILTER ->
                ImageFilterFragment.newInstance(
                    (intent.getSerializableExtra(Params.CONTENT) as? Illust) ?: Illust(id = 0L),
                    intent.getIntExtra(Params.INDEX, 0),
                )
            TemplateRoute.EVENT_HISTORY -> FragmentEventHistory()
            TemplateRoute.SYNONYM_DICT -> SynonymDictFragment()
            // 聊天 / 广场相关路由已随 `lean` 删除：这几个 key 现在落到插画详情，不再有对应页面。
            TemplateRoute.PLAZA_BLOCKS,
            TemplateRoute.PLAZA_REPORT,
            TemplateRoute.PLAZA_OPEN_ILLUST -> FragmentCollection.newInstance(0)
            TemplateRoute.NOTIFICATION_CENTER -> NotificationPagerFragment()
            TemplateRoute.NOTIFICATION_VIEW_MORE -> NotificationViewMoreFragment()
            TemplateRoute.INFO_CATEGORY -> InfoCategoryListFragment()
        }
}