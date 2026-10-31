package ceui.lisa.activities

import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.viewModels
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentPagerAdapter
import androidx.lifecycle.lifecycleScope
import androidx.viewpager.widget.ViewPager
import ceui.lisa.R
import ceui.lisa.core.ManagerReactive
import ceui.lisa.database.AppDatabase
import ceui.lisa.database.DownloadEntity
import ceui.lisa.databinding.ActivityImageDetailBinding
import ceui.lisa.databinding.ViewV3FabBarBinding
import ceui.lisa.download.FileCreator
import ceui.lisa.download.IllustDownload
import ceui.lisa.fragments.FragmentImageDetail
import ceui.lisa.helper.ImageViewerTransition
import ceui.lisa.helper.PageTransformerHelper
import ceui.lisa.utils.Common
import ceui.lisa.utils.Params
import ceui.lisa.utils.PixivOperate
import ceui.lisa.utils.Settings
import ceui.lisa.view.DragDismissLayout
import ceui.pixiv.api.model.Illust
import ceui.pixiv.cache.ObjectPool
import ceui.pixiv.download.DownloadsRegistry
import ceui.pixiv.download.ExifKeywordWriter
import ceui.pixiv.download.IllustCaptionExporter
import ceui.pixiv.download.config.DownloadItems
import ceui.pixiv.imageloader.PageImageSourceResolver
import ceui.pixiv.imageloader.awaitFile
import ceui.pixiv.ui.filter.openImageFilter
import ceui.pixiv.ui.detail.DownloadFab
import ceui.pixiv.ui.detail.V3FabBarController
import ceui.pixiv.ui.detail.ViewerPageLink
import ceui.pixiv.ui.share.saveArtworkPoster
import ceui.pixiv.ui.works.ToggleToolnarViewModel
import ceui.pixiv.utils.animateFadeInQuickly
import ceui.pixiv.utils.animateFadeOutQuickly
import ceui.pixiv.utils.playToggleHaptic
import ceui.pixiv.utils.setOnClick
import ceui.pixiv.wallpaper.WallpaperSetter
import ceui.pixiv.witstudio.popup.WitMenuPopup
import ceui.pixiv.witstudio.theme.V3Palette
import ceui.pixiv.witstudio.theme.pressScale
import ceui.pixiv.witstudio.theme.setTextWithIcon
import ceui.pixiv.witstudio.theme.v3Font
import ceui.pixiv.ui.detail.frames.openUgoiraFrames
import com.blankj.utilcode.util.BarUtils
import java.io.File
import java.io.FileInputStream
import java.io.UnsupportedEncodingException
import java.net.URLDecoder
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber

/** 图片二级详情 */
@AndroidEntryPoint
class ImageDetailActivity : BaseActivity<ActivityImageDetailBinding?>() {
    var mIllust: Illust? = null
        private set

    private var localIllust: List<String>? = ArrayList()
    private var currentPage: TextView? = null
    private var downloadSingle: TextView? = null
    private var index = 0

    /** 上一次广播出去的大图页，用来去掉 onPageSelected 与 IDLE 对同一页的重复广播。 */
    private var lastPublishedPage = -1

    private val viewModel by viewModels<ToggleToolnarViewModel>()

    /** 小红书式全屏弹窗转场(进场展开/竖向拖拽跟手/收场缩回),见 [ImageViewerTransition]。 */
    private var viewerTransition: ImageViewerTransition? = null
    private var restoredFromSavedState = false
    private var entryOrientation = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        // 重建恢复(旋转关掉 configChanges 的场景不会走到,但进程重建会)不播进场动画
        restoredFromSavedState = savedInstanceState != null
        super.onCreate(savedInstanceState)
    }

    override fun setTheme(resid: Int) {
        super.setTheme(resid)
        // BaseActivity.updateTheme 会按用户主题色 setTheme(AppTheme_IndexN),把 manifest 里
        // ImageViewerTheme 的透明 windowBackground 盖回不透明;每次 setTheme 后都叠回窗口
        // 透明属性,保证 PhoneWindow 生成 DecorView 时读到透明背景。「能看见身后 Activity」
        // 本身由 manifest 主题在启动时决定,不受运行期换主题影响。
        theme.applyStyle(R.style.ImageViewerWindowOverlay, true)
    }

    /** 「二级详情」的下载 + 收藏胶囊(与一级 V3 详情页共用),仅该模式下装配。 */
    private var fabBar: V3FabBarController? = null

    override fun initLayout(): Int {
        return R.layout.activity_image_detail
    }

    override fun initView() {
        // 新的查看器会话：上一次会话回传的「当前页那一格」已失效，见 ViewerPageLink.clearViewport
        ViewerPageLink.clearViewport()
        val dataType = intent.getStringExtra("dataType")
        baseBind!!.viewPager.setPageTransformer(true, PageTransformerHelper.getCurrentTransformer())
        // issue #724: 个性化「看图时保留状态栏区域」开启时，给 ViewPager 顶部留出状态栏高度，
        // 让图片渲染在刘海/挖孔下方而不是铺满顶部被遮挡。用固定状态栏高度（而非 statusBars inset）
        // 是为了在双击进入沉浸/隐藏系统栏后顶部留白依旧保持。默认关闭，体验与原来完全一致。
        if (Shaft.sSettings.isKeepStatusBarWhenViewImage) {
            baseBind!!.viewPager.setPadding(0, BarUtils.getStatusBarHeight(), 0, 0)
        }
        val windowInsetsController =
            WindowInsetsControllerCompat(
                window,
                window.decorView,
            )
        val btnAi = findViewById<View>(R.id.btn_ai_menu)
        ViewCompat.setOnApplyWindowInsetsListener(btnAi) { v, windowInsets ->
            val statusBarHeight = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            val lp = v.layoutParams as android.widget.RelativeLayout.LayoutParams
            lp.topMargin = statusBarHeight + 8
            v.layoutParams = lp
            windowInsets
        }
        // btnAi 只在「二级详情」和快照大图可用；放进 infoItems 会被 animateFadeInQuickly()
        // 顶掉 GONE 状态 (issue #872)。反过来,可用的模式必须放进来,否则进沉浸模式时
        // 底部信息和状态栏都收了,AI 按钮还孤零零浮在图上。
        val infoItems = mutableListOf<View>()
        baseBind?.bottomRela?.let { infoItems.add(it) }
        if ("二级详情" == dataType) {
            infoItems.add(btnAi)
        }
        windowInsetsController.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        // issue #1242: 「看图时默认沉浸」开启时以沉浸态进场。重建恢复不再套用：配置变更重建时 ViewModel
        // 还留着用户切过的状态，不能盖掉；进程被杀后的恢复会退回非沉浸，可接受。
        // 首次下发直接收起工具条而不播淡出 —— 淡出从 alpha=1 起跳，会和进场转场抢 alpha 闪一下。
        var hideChromeInstantly = false
        if (!restoredFromSavedState && Shaft.sSettings.isImmersiveWhenViewImage &&
            "二级详情" == dataType
        ) {
            viewModel.isFullscreenMode.value = true
            hideChromeInstantly = true
        }
        viewModel.isFullscreenMode.observe(this) { isFullScreen ->
            if (isFullScreen) {
                windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
                if (hideChromeInstantly) {
                    infoItems.forEach { it.visibility = View.INVISIBLE }
                } else {
                    infoItems.forEach { it.animateFadeOutQuickly() }
                }
            } else {
                windowInsetsController.show(WindowInsetsCompat.Type.systemBars())
                infoItems.forEach { it.animateFadeInQuickly() }
            }
            hideChromeInstantly = false
        }
        setupViewerTransition(btnAi)
        if ("二级详情" == dataType) {
            currentPage = findViewById(R.id.current_page)
            mIllust = intent.getSerializableExtra("illust") as Illust?
            index = intent.getIntExtra("index", 0)
            if (mIllust == null) {
                // 没有 bean 就装配不了任何点击语义,别留一个看得见点不动的胶囊
                findViewById<View>(R.id.fab_bar_row).visibility = View.GONE
                return
            }
            val btnAiMenu = findViewById<ImageView>(R.id.btn_ai_menu)
            btnAiMenu.visibility = View.VISIBLE
            btnAiMenu.setOnClickListener { anchor ->
                val illust = mIllust ?: return@setOnClickListener
                // 动图只保留作品分享；画质增强、翻译和静态壁纸都需要可处理的静图原图。
                val actions = mutableListOf<Pair<CharSequence, () -> Unit>>()
                if (illust.isGif()) {
                    actions += getString(R.string.ugoira_frames_menu) to { openUgoiraFrames(this, illust) }
                }
                actions +=
                    getString(R.string.artwork_poster_save) to
                        {
                            saveArtworkPoster(illust, baseBind!!.viewPager.currentItem)
                        }
                if (!illust.isGif()) {
                    actions +=
                        getString(R.string.image_filter) to
                            {
                                openImageFilter(this, illust, baseBind!!.viewPager.currentItem)
                            }
                    actions +=
                        getString(R.string.string_set_wallpaper) to
                            {
                                performSetWallpaper(illust, baseBind!!.viewPager.currentItem)
                            }
                }
                WitMenuPopup.show(this, anchor, actions.map { it.first }.toTypedArray()) { index, _
                    ->
                    actions[index].second()
                }
            }
            baseBind!!.viewPager.adapter =
                object : FragmentPagerAdapter(supportFragmentManager) {
                    override fun getItem(i: Int): Fragment {
                        return FragmentImageDetail.newInstance(i)
                    }

                    override fun getCount(): Int {
                        return mIllust!!.page_count
                    }
                }
            baseBind!!.viewPager.currentItem = index
            setupFabBar()
            if (mIllust!!.isGif()) setupUgoiraFramesEntry(mIllust!!)
            checkDownload(index)
            baseBind!!
                .viewPager
                .addOnPageChangeListener(
                    object : ViewPager.OnPageChangeListener {
                        override fun onPageScrolled(i: Int, v: Float, i1: Int) {}

                        override fun onPageSelected(i: Int) {
                            publishViewerPage(i)
                            checkDownload(i)
                            currentPage?.setText(
                                String.format(
                                    Locale.getDefault(),
                                    "第 %d/%d P",
                                    i + 1,
                                    mIllust!!.page_count,
                                )
                            )
                        }

                        override fun onPageScrollStateChanged(state: Int) {
                            if (state != ViewPager.SCROLL_STATE_IDLE) return
                            publishViewerPage(baseBind?.viewPager?.currentItem ?: index)
                        }
                    }
                )
            if (mIllust!!.page_count == 1) {
                currentPage?.setVisibility(View.INVISIBLE)
            } else {
                currentPage?.setText(
                    String.format(
                        Locale.getDefault(),
                        "第 %d/%d P",
                        index + 1,
                        mIllust!!.page_count,
                    )
                )
            }
        } else if (ceui.pixiv.ui.common.ImageUrlViewer.DATA_TYPE_URL_SINGLE == dataType) {
            findViewById<View>(R.id.btn_ai_menu).visibility = View.GONE
            findViewById<View>(R.id.fab_bar_row).visibility = View.GONE
            currentPage = findViewById(R.id.current_page)
            val singleUrl = intent.getStringExtra(Params.URL)
            val singleTitle = intent.getStringExtra(Params.TITLE)
            if (singleUrl.isNullOrEmpty()) {
                finish()
                return
            }
            baseBind!!.viewPager.adapter =
                object : FragmentPagerAdapter(supportFragmentManager) {
                    override fun getItem(i: Int): Fragment =
                        FragmentImageDetail.newInstance(singleUrl, singleTitle)

                    override fun getCount(): Int = 1
                }
        } else if ("下载详情" == dataType) {
            findViewById<View>(R.id.btn_ai_menu).visibility = View.GONE
            findViewById<View>(R.id.fab_bar_row).visibility = View.GONE
            currentPage = findViewById(R.id.current_page)
            // 该模式下这个「按钮」只当文件路径标签用(历史行为),不参与下载
            downloadSingle = findViewById(R.id.download_this_one)
            downloadSingle?.visibility = View.VISIBLE
            localIllust = intent.getSerializableExtra("illust") as List<String>?
            index = intent.getIntExtra("index", 0)

            baseBind!!.viewPager.adapter =
                object : FragmentPagerAdapter(supportFragmentManager) {
                    override fun getItem(i: Int): Fragment {
                        return FragmentImageDetail.newInstance(localIllust!![i])
                    }

                    override fun getCount(): Int {
                        return localIllust!!.size
                    }
                }
            currentPage?.setVisibility(View.INVISIBLE)
            baseBind!!.viewPager.currentItem = index
            baseBind!!
                .viewPager
                .addOnPageChangeListener(
                    object : ViewPager.OnPageChangeListener {
                        override fun onPageScrolled(i: Int, v: Float, i1: Int) {}

                        override fun onPageSelected(i: Int) {
                            try {
                                downloadSingle?.setText(
                                    String.format(
                                        "%s%s",
                                        getString(R.string.file_path),
                                        URLDecoder.decode(localIllust!![i], "utf-8"),
                                    )
                                )
                            } catch (e: UnsupportedEncodingException) {
                                e.printStackTrace()
                            }
                        }

                        override fun onPageScrollStateChanged(i: Int) {}
                    }
                )
            try {
                downloadSingle?.setText(
                    String.format(
                        "%s%s",
                        getString(R.string.file_path),
                        URLDecoder.decode(localIllust!![index], "utf-8"),
                    )
                )
            } catch (e: UnsupportedEncodingException) {
                e.printStackTrace()
            }
        }
    }



    /**
     * 胶囊位置 + 顺序偏好(#1090)。左右留白已由外层 bottom_rela 的 20dp 内边距给出,胶囊自身不加边距;
     * 胶囊靠右时页码让到左边,否则两者会叠在同一行的右端。
     */
    private fun applyFabBarLayout(fabBar: V3FabBarController) {
        fabBar.applyLayoutPreference(sideMargin = 0)
        val pageLabel = findViewById<View>(R.id.current_page)
        val lp = pageLabel.layoutParams as FrameLayout.LayoutParams
        lp.gravity = if (Shaft.sSettings.artworkV3FabPosition == Settings.ARTWORK_V3_FAB_POSITION_RIGHT) {
            Gravity.START
        } else {
            Gravity.END
        }
        pageLabel.layoutParams = lp
        findViewById<View>(R.id.btn_ugoira_frames)?.let { entry ->
            entry.layoutParams = (entry.layoutParams as FrameLayout.LayoutParams).also { it.gravity = lp.gravity }
        }
    }

    /**
     * 动图的「逐帧」入口:页码那一格的玻璃小胶囊(可见 40dp、整行 48dp 热区),与下载 + 收藏胶囊同排,
     * 随工具栏一起显隐。打开逐帧页挑帧、标记、保存原帧。
     */
    private fun setupUgoiraFramesEntry(illust: Illust, offlineDir: File? = null) {
        val entry = findViewById<TextView>(R.id.btn_ugoira_frames) ?: return
        val palette = V3Palette.from(this)
        val density = resources.displayMetrics.density
        entry.visibility = View.VISIBLE
        entry.textSize = 13f
        entry.typeface = v3Font(600)
        entry.setTextColor(palette.floatingPillContent)
        entry.setTextWithIcon(getString(R.string.ugoira_frames_entry), R.drawable.ic_ugoira_frames_24, sizeDp = 16, gapDp = 6)
        // 上下 4dp 透明沿只补热区;InsetDrawable 会把 inset 报成内边距,所以先设背景再设 padding。
        entry.background = android.graphics.drawable.InsetDrawable(
            palette.floatingPillBg(999f), 0, (4 * density).toInt(), 0, (4 * density).toInt(),
        )
        entry.setPadding((12 * density).toInt(), 0, (14 * density).toInt(), 0)
        entry.contentDescription = getString(R.string.ugoira_frames_menu)
        entry.setOnClick { openUgoiraFrames(this, illust, offlineDir) }
        entry.pressScale()
    }


    private fun setupViewerTransition(btnAi: View) {
        val rootLayout = baseBind!!.root as DragDismissLayout
        val chrome = listOfNotNull(baseBind?.bottomRela, btnAi)
        val transition =
            ImageViewerTransition(
                rootLayout,
                baseBind!!.viewPager,
                chrome,
                intent.getIntArrayExtra(EXTRA_ENTER_BOUNDS),
            )
        viewerTransition = transition
        entryOrientation = resources.configuration.orientation
        rootLayout.dragTargetView = baseBind!!.viewPager
        // 叠在图片上的浮层可见时禁止拖动退出，统一走 DragDismissLayout 的闸口：
        // ① AI 超分 / 抠图 / 翻译的进度与结果层（ai_overlay_root，本页固定子 view）；
        // ② 当前页的圈选翻译框选层（在 ViewPager 每一页里，按当前页查询）。
        // 后续新增浮层只需再补一条判定。
        findViewById<View>(R.id.ai_overlay_root)?.let(rootLayout::addDismissBlockingOverlay)
        rootLayout.addDismissBlockingCheck {
            currentImageFragment()?.isManualSelectionActive() == true
        }
        // 「上/下拖动退出」灵敏度走用户设置（设置 → 浏览设置 → 大图拖动退出控制）。
        // 默认值与 DragDismissLayout.DEFAULT_* 一致，用户没调过就是原有手感。
        val dismissSettings = Shaft.sSettings
        rootLayout.dismissDistanceFraction = dismissSettings.viewerDismissDistance
        rootLayout.flingDismissVelocityDp = dismissSettings.viewerDismissVelocity
        rootLayout.maxDragScaleShrink = dismissSettings.viewerDismissScaleShrink
        rootLayout.callback =
            object : DragDismissLayout.Callback {
                override fun canStartDismissDrag(direction: DragDismissLayout.Direction): Boolean =
                    currentImageFragment()?.canSwipeToDismiss(direction) ?: true

                override fun onDismissDragUpdate(fraction: Float) =
                    transition.onDragProgress(fraction)

                override fun onDismissDragRelease(
                    shouldDismiss: Boolean,
                    direction: DragDismissLayout.Direction,
                    velocityY: Float,
                ) {
                    if (shouldDismiss) {
                        dismissViewer(direction)
                    } else {
                        transition.springBack()
                    }
                }
            }
        if (restoredFromSavedState) {
            transition.showImmediately()
        } else {
            transition.playEnter()
        }
    }

    /** [FragmentImageDetail] 观察到当前页离开初始缩放时回调；只观测，不做消费。 */
    fun onViewerPageZoomed(page: Int) {}

    /** FragmentPagerAdapter 内建 tag 规则定位当前页 fragment(三种 dataType 的页面都是它)。 */
    private fun currentImageFragment(): FragmentImageDetail? =
        supportFragmentManager.findFragmentByTag(
            "android:switcher:" + R.id.view_pager + ":" + baseBind!!.viewPager.currentItem
        ) as? FragmentImageDetail

    /**
     * 「二级详情」装配底部下载 + 收藏胶囊(布局/着色/顺序偏好/底距逻辑与一级 V3 详情页 共用 [V3FabBarController];点击语义归本页:下载 =
     * 保存**当前页**,收藏 = 收藏整个作品)。
     */
    private fun setupFabBar() {
        val fabBind = ViewV3FabBarBinding.bind(findViewById(R.id.fab_bar))
        // 本页这颗按钮存的是**当前页**(译图时存译图),不是整部作品;Idle 态用「保存当前图」
        // 图标(图片框 + 箭头),别借一级 V3 详情页的整作品下载箭头,免得同一颗箭头两页含义不同(issue #1220)
        val fabBar = V3FabBarController(fabBind, saveCurrentImage = true)
        this.fabBar = fabBar
        // 胶囊配色与一级 V3 详情页同一套规则(V3Palette 派生,日夜双模),不用 XML 里的深色默认值
        fabBar.applyPalette(V3Palette.from(this))
        applyFabBarLayout(fabBar)
        // 底距落在「胶囊 + 页码」整行上,页码跟着胶囊一起动
        fabBar.attachBottomInsetMargin(findViewById(R.id.fab_bar_row))

        // 收藏态:先按 intent 带来的 bean 画一次,再观察 ObjectPool 里同 id 的权威 bean(若有)
        mIllust?.let { fabBar.setBookmarked(it.isBookmarked) }
        mIllust?.id?.let { id ->
            ObjectPool.get<Illust>(id).observe(this) { bean ->
                bean?.let { fabBar.setBookmarked(it.isBookmarked) }
            }
        }

        fabBind.fabDownloadContainer.setOnClick {
            val illust = likeTargetIllust() ?: return@setOnClick
            val page = baseBind!!.viewPager.currentItem
            if (illust.isGif()) {
                // ugoira/gif 要 zip→帧→gif 渲染,简单文件拷贝救不了,保留原下载链路(它做 unzipAndPlay)。
                IllustDownload.downloadIllustCertainPage(illust, page, mContext as BaseActivity<*>)
                autoLikeAfterDownloadIfNeeded(illust, fabBar)
                return@setOnClick
            }
            val imageUrl =
                IllustDownload.getUrl(illust, page, Params.IMAGE_RESOLUTION_ORIGINAL)
                    ?: IllustDownload.getUrl(illust, page, Params.IMAGE_RESOLUTION_LARGE)
                    ?: return@setOnClick
            lifecycleScope.launch {
                IllustCaptionExporter.export(illust)
                val ok = saveLoadedIllustPage(illust, page, imageUrl)
                if (ok) {
                    Common.showToast(R.string.string_181)
                    checkDownload(page)
                    autoLikeAfterDownloadIfNeeded(illust, fabBar)
                }
            }
        }

        fabBind.fabBookmark.setOnClick {
            val illust = likeTargetIllust() ?: return@setOnClick
            val willBookmark = !illust.isBookmarked
            // 乐观着色,权威态由上面的 ObjectPool 观察兜底(与 ArtworkV3Fragment 同款)
            fabBar.setBookmarked(willBookmark)
            playToggleHaptic(it, willBookmark)
            PixivOperate.postLikeDefaultStarType(illust)
            if (willBookmark && Shaft.sSettings.isAutoDownloadAfterStar) {
                IllustDownload.downloadIllustAllPages(illust)
            }
        }
    }

    /** 收藏/取消收藏作用于整个作品:优先取 ObjectPool 里的权威 bean(与一级详情共享乐观态),退回 intent 副本。 */
    private fun likeTargetIllust(): Illust? = mIllust?.let {
        ObjectPool.get<Illust>(it.id).value ?: it
    }

    private fun autoLikeAfterDownloadIfNeeded(illust: Illust, fabBar: V3FabBarController) {
        if (Shaft.sSettings.isAutoPostLikeWhenDownload && !illust.isBookmarked) {
            fabBar.setBookmarked(true)
            PixivOperate.postLikeDefaultStarType(illust)
        }
    }


    private fun checkDownload(i: Int) {
        val illust = mIllust ?: return
        lifecycleScope.launch {
            val downloaded =
                withContext(Dispatchers.IO) {
                    Common.isIllustDownloaded(illust, i)
                }
            // 快速翻页时旧页的 DB 探测可能晚于新页返回,过期结果不能盖掉当前页的状态
            if (baseBind?.viewPager?.currentItem != i) return@launch
            // 对齐一级 V3 详情页:已下载的页显示绿色「已下载」勾,而不是把按钮藏起来
            fabBar?.renderDownload(if (downloaded) DownloadFab.Done else DownloadFab.Idle)
        }
    }



    /**
     * 「保存这一张」：复用大图页已加载的原图(与显示层同一 imageloader 共享任务,不重新下载),走**新**下载后端 [DownloadsRegistry]
     * 按用户命名模板/存储配置写盘;并记一条 [DownloadEntity]，让「已下载」列表与详情本地复用 (findDownloadedPageUri 仍查 DB)保持一致。按钮隐藏靠
     * [Common.isIllustDownloaded] → 新后端 `exists()` 自动生效。 不再走旧 `IllustDownload` / 不重下原图。
     */
    private suspend fun saveLoadedIllustPage(illust: Illust, page: Int, imageUrl: String): Boolean =
        withContext(Dispatchers.IO) {
            val file =
                try {
                    PageImageSourceResolver.resolve(this@ImageDetailActivity, illust, page, imageUrl)
                        .awaitFile(this@ImageDetailActivity)
                } catch (e: Exception) {
                    Timber.w(e, "[ImageDetail] save: await loaded file failed page=%d", page)
                    null
                } ?: return@withContext false

            // 这一页已下载时,本地来源可能正是这次要写的目标本身(同模板同路径)。替换策略下后端会先删 /
            // 截断目标再写,边读边写就把用户的原图抹成 0 字节。私有目录之外的来源先落一份副本再写。
            val staged =
                if (file.isInsideAppPrivateDir()) null
                else runCatching {
                    File.createTempFile("save_src", null, cacheDir).also { file.copyTo(it, overwrite = true) }
                }.getOrElse {
                    Timber.w(it, "[ImageDetail] save: stage local source failed page=%d", page)
                    return@withContext false
                }
            val source = staged ?: file

            runCatching {
                // open() 返回 null = Skip 策略且文件已存在 → 视为已保存,无需重写。
                val handle =
                    DownloadsRegistry.downloads.open(DownloadItems.illustPage(illust, page))
                        ?: return@runCatching true
                try {
                    handle.stream.use { out -> FileInputStream(source).use { it.copyTo(out) } }
                    handle.onFinish()
                } catch (t: Throwable) {
                    handle.onAbort()
                    throw t
                }
                // 可选:标签写进 JPEG XMP 关键词(issue #938)。放在 commit 之后、onAbort 作用域之外,
                // 免得写元数据抛错误删掉已成功的文件。整段再包一层 runCatching:即便标签取值意外抛错,
                // 也不能连累下面「已下载」写库(否则文件在盘上却不记账)。开关默认关时直接跳过,零开销。
                if (Shaft.sSettings.isWriteTagsToImageExif()) {
                    runCatching {
                        ExifKeywordWriter.writeIfEnabled(
                            this@ImageDetailActivity,
                            handle.uri,
                            FileCreator.customFileName(illust, page),
                            illust.tags.orEmpty().mapNotNull { it?.name },
                        )
                    }
                }
                // 与 Manager 成功分支一致地写库(fileName 用 FileCreator=模板命名,filePath 用写盘 uri)。
                val entity =
                    DownloadEntity().apply {
                        illustGson = Shaft.sGson.toJson(illust)
                        fileName = FileCreator.customFileName(illust, page)
                        downloadTime = System.currentTimeMillis()
                        filePath = handle.uri.toString()
                        // v41 的 page 列 —— 与 Manager 成功分支一致，让按 (illustId, page) 的
                        // 查询也能命中「保存这一张」写下的记录。
                        this.page = page
                    }
                // insertDownload 会从 illustGson 顶层 id 补上 illustId（走 v38 索引）。
                AppDatabase.getAppDatabase(Shaft.getContext()).downloadDao().insertDownload(entity)
                ManagerReactive.pokeDoneTable()
                true
            }
                .getOrElse { ex ->
                    Timber.e(ex, "[ImageDetail] saveLoadedIllustPage failed page=%d", page)
                    false
                }
                .also { staged?.delete() }
        }

    /** 查看器缓存 / 快照存档都在私有目录里,不可能是下载后端的写入目标,无需另拷一份。 */
    private fun File.isInsideAppPrivateDir(): Boolean {
        val path = canonicalPath
        return listOfNotNull(cacheDir, filesDir, externalCacheDir).any {
            path.startsWith(it.canonicalPath + File.separator)
        }
    }

    override fun initData() {
        // 返回键/返回手势与下拉收掉共用 dismissViewer 收场动画。targetSdk 35+ 后预测式返回
        // 默认开启,系统不再回调 onBackPressed,必须用 OnBackPressedDispatcher 接管。
        //
        // 这页是透明窗口(身后一级详情可见),系统不会给它播跨 Activity 预测式动画,
        // 所以 callback 常开、自己做跟手:手势进度 → 内容缩小/朝手势方向平移、黑底变淡
        // (ImageViewerTransition.onBackGestureProgress);取消弹回;提交走统一收场,
        // 从当前缩放态接着缩回缩略图矩形/淡出,不跳变。
        // 不带 owner 注册(与 TemplateActivity 同理):垫在所有 Fragment callback 之下。
        onBackPressedDispatcher.addCallback(
            object : OnBackPressedCallback(true) {
                override fun handleOnBackStarted(backEvent: BackEventCompat) {
                    viewerTransition?.onBackGestureStarted()
                }

                override fun handleOnBackProgressed(backEvent: BackEventCompat) {
                    viewerTransition?.onBackGestureProgress(
                        backEvent.progress,
                        fromLeftEdge = backEvent.swipeEdge == BackEventCompat.EDGE_LEFT,
                    )
                }

                override fun handleOnBackCancelled() {
                    viewerTransition?.springBack()
                }

                override fun handleOnBackPressed() {
                    finishViewer()
                }
            }
        )
    }


    /** 统一的退出入口(返回键 / AI 确认框的「退出」都走这里)。 */
    private fun finishViewer() {
        dismissViewer()
    }

    /**
     * 把「大图此刻停在哪一页」广播给身后的一级详情页，让它把视口滚到同一页。
     *
     * **挂在 [ViewPager.OnPageChangeListener.onPageSelected]**（手指抬起、目标页一定下那一刻），
     * 不能只挂 settle 完的 IDLE：IDLE 要等 200~300ms 的收尾动画，而「翻完立刻退出」是常态 ——
     * 那时 IDLE 还没到，详情页从没被驱动过，退出既拿不到归位目标、又会当着用户的面把列表滚过去。
     * IDLE 只当兜底（甩得更远时按最终落点再报一次），同页由 [lastPublishedPage] 去重。
     *
     * 只对**多图静态作品**广播：单图没有「第几页」，动图走 ugoira 没有分页语义。
     */
    private fun publishViewerPage(page: Int) {
        // 设置项（看图与详情 · 详情页跟随大图翻页滚动）默认「不跟随」；不跟随时完全不广播，
        // 详情页不会被驱动，退出也拿不到归位目标 —— 行为与加这个功能之前逐字一致。
        if (Shaft.sSettings.getViewerViewportLinkMode() == Settings.VIEWER_VIEWPORT_LINK_NONE) return
        // 二级详情与快照大图共用这套查看器，两者都跟随；其余模式（下载详情 / URL 单图 / 广场）不参与。
        val dataType = intent.getStringExtra("dataType")
        if ("二级详情" != dataType && "快照大图" != dataType) return
        val illust = mIllust ?: return
        if (illust.page_count <= 1 || illust.isGif()) return
        if (page == lastPublishedPage) return
        lastPublishedPage = page
        ViewerPageLink.publish(
            illustId = illust.id,
            entryPage = index,
            page = page,
        )
    }

    /**
     * 收场。归位目标按优先级取：
     * 1. 详情页回传的「当前页那一格」屏幕矩形 —— 视口已被联动挪到这一页，缩回它才对得上；
     * 2. 进场那张缩略图 —— 用户没翻过页（详情页没动过），矩形仍然有效，与改前逐字一致。
     *
     * 两者都拿不到（详情页还没排到那一格 / 转过屏）才退回淡出。动画播完才真正 finish
     * (透明主题 windowAnimationStyle=@null,系统不再叠动画)。
     *
     * [direction] 为空 = 没有方向偏好（返回键 / AI 确认框退出）：联动开着时降级为纯原地淡出，不凭空
     * 往某个方向滑；不跟随时按改前朝下滑。真的沿某个方向拖出去，降级总是跟着那个方向滑。
     */
    private fun dismissViewer(direction: DragDismissLayout.Direction? = null) {
        val transition =
            viewerTransition
                ?: run {
                    mActivity.finish()
                    return
                }
        val currentItem = baseBind?.viewPager?.currentItem
        val illustId = mIllust?.id
        val linkEnabled =
            Shaft.sSettings.getViewerViewportLinkMode() != Settings.VIEWER_VIEWPORT_LINK_NONE
        // 详情页只在真被联动挪动之后才回传视口（会话开始时已清空），所以「本会话有本作品的回传」
        // 就等于「详情页动过」。不能拿「大图翻没翻过页」代替：平板舞台、「仅已展开时」下折叠着的
        // 页面都不跟随，翻走又翻回时进场矩形仍然有效。
        val linkedViewport =
            if (linkEnabled) ViewerPageLink.viewport.value?.takeIf { it.illustId == illustId } else null
        val exitScreenBounds = linkedViewport?.takeIf { it.page == currentItem }?.screenRect
        // 详情页动过 → 进场那张缩略图已失准，只缩回当前页那一格（拿不到就淡出）；
        // 没动过（含「不跟随」）→ 与加这个功能之前一致：停在进场页才缩回缩略图。
        val backToBounds =
            (exitScreenBounds != null || (index == currentItem && linkedViewport == null)) &&
                resources.configuration.orientation == entryOrientation
        // 「没有方向偏好时原地淡出」只属于联动：不跟随时返回键仍按改前朝下滑走。
        val exitDirection =
            direction ?: if (linkEnabled) null else DragDismissLayout.Direction.DOWN
        Timber.d(
            "[ImageDetail] dismissViewer item=%d index=%d detailMoved=%s rect=%s backToBounds=%s dir=%s",
            currentItem ?: -1,
            index,
            linkedViewport != null,
            exitScreenBounds != null,
            backToBounds,
            exitDirection,
        )
        transition.playExit(backToBounds, exitDirection, exitScreenBounds) { mActivity.finish() }
    }

    /**
     * 二级大图浏览观测只在宿主可见时走表：切后台 / 被上层页压住时停表，回来接着算同一段。
     */
    override fun onStart() {
        super.onStart()
    }

    override fun onStop() {
        super.onStop()
    }

    override fun onDestroy() {
        super.onDestroy()
    }








    /**
     * 等这一页的图就绪。优先本地（已下载 / 已缓存 / 本地 URL），没有再复用大图页显示层的
     * 同一共享任务:已加载直接返回、否则等它下完,不重复下载。
     */
    private suspend fun awaitLoadedFile(illust: Illust, page: Int, imageUrl: String): File? =
        try {
            PageImageSourceResolver.resolve(this, illust, page, imageUrl).awaitFile(this)
        } catch (e: CancellationException) {
            // 页面销毁导致协程取消:重抛,别把「取消」当成加载失败弹「识别失败」
            throw e
        } catch (e: Exception) {
            null
        }

    private fun performSetWallpaper(illust: Illust, pageIndex: Int) {
        lifecycleScope.launch {
            WallpaperSetter.setFromIllust(this@ImageDetailActivity, illust, pageIndex)
        }
    }

    override fun hideStatusBar(): Boolean {
        return true
    }

    companion object {
        /** 进场缩略图矩形(屏幕坐标 [left, top, right, bottom]),发起端可选携带;没带则居中淡入。 */
        const val EXTRA_ENTER_BOUNDS = "enter_bounds"

        /** 译图文件名后缀,插在用户模板文件名与扩展名之间,避免覆盖原图。 */
        private const val TRANSLATED_FILENAME_SUFFIX = "_translated"
    }
}
