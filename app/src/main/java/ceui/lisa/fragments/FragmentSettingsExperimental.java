package ceui.lisa.fragments;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CompoundButton;
import android.widget.SeekBar;
import android.widget.TextView;

import java.text.DecimalFormat;


import ceui.lisa.R;
import ceui.lisa.activities.Shaft;
import ceui.lisa.databinding.FragmentSettingsExperimentalBinding;
import ceui.lisa.utils.Common;
import ceui.lisa.utils.Local;
import ceui.pixiv.debug.TimberFileLog;
import ceui.pixiv.witstudio.dialog.WitDialog;
import ceui.pixiv.witstudio.dialog.WitDialogAction;
import ceui.pixiv.witstudio.dialog.WitDialogView;
import ceui.pixiv.witstudio.theme.V3Palette;

/** 设置 · 试验性 */
public class FragmentSettingsExperimental extends SettingsPageFragment<FragmentSettingsExperimentalBinding> {

    @Override
    public void initLayout() {
        mLayoutID = R.layout.fragment_settings_experimental;
    }

    @Override
    protected void initData() {
        bindWitGalleryRows();
        bindLogFileRow();
        bindTriggerCrashRow();

        // google(Play)渠道不展示公开聊天室横幅开关，与 SettingsCatalog 索引一致。
        if (ceui.lisa.BuildConfig.IS_LITE) {
            baseBind.showChatRoomPushBannerRela.setVisibility(View.GONE);
            // 上面整组消失后 Firebase 成了页内唯一一行,它原本用来跟前一组拉开的
            // 上外边距就成了页首一块空白,去掉。改完必须 setLayoutParams 回写:直接改 lp 字段
            // 只是碰巧因为 initData() 跑在首次 layout 之前才生效,靠的是时序不是契约;
            // setLayoutParams 内部会 requestLayout,任何时机调用都对。
            ViewGroup.MarginLayoutParams lp =
                    (ViewGroup.MarginLayoutParams) baseBind.isFirebaseEnableRela.getLayoutParams();
            lp.topMargin = 0;
            baseBind.isFirebaseEnableRela.setLayoutParams(lp);
            return;
        }

        baseBind.showChatRoomPushBanner.setChecked(Shaft.sSettings.isShowChatRoomPushBanner());

        baseBind.showChatRoomPushBanner.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                Shaft.sSettings.setShowChatRoomPushBanner(isChecked);
                Common.showToast(getString(R.string.string_428));
                Local.setSettings(Shaft.sSettings);
            }
        });
        baseBind.showChatRoomPushBannerRela.setOnClickListener(v ->
                baseBind.showChatRoomPushBanner.performClick());

        bindFirebaseRow();
    }

    /**
     * 弹窗画廊入口。一屏之内覆盖 7 种 builder 形态,是日夜 × 主题档截图验收的载体,
     * 只在 debug 包出现;phase 7 收尾时连同这一行、布局里的 RelativeLayout
     * 和 WitDialogGallery.kt 一并删除。不进 SettingsCatalog 索引——它不是用户设置。
     */
    private void bindWitGalleryRows() {
        if (!ceui.lisa.BuildConfig.DEBUG) {
            baseBind.witGalleryRela.setVisibility(View.GONE);
            return;
        }
        baseBind.witGalleryRela.setOnClickListener(v ->
                ceui.pixiv.ui.settings.WitDialogGallery.showWit(mContext));
    }

    private void bindLogFileRow() {
        baseBind.logFileEnable.setChecked(Shaft.sSettings.isLogFileEnabled());
        String folder = TimberFileLog.INSTANCE.currentFolderPath();
        baseBind.logFilePath.setText(getString(
                R.string.setting_log_file_desc,
                folder != null ? folder : getString(R.string.setting_log_file_no_file)));

        baseBind.logFileShare.setOnClickListener(v ->
                TimberFileLog.INSTANCE.shareLogFile(mContext));

        baseBind.logFileEnable.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                Shaft.sSettings.setLogFileEnabled(isChecked);
                Local.setSettings(Shaft.sSettings);
                Common.showToast(getString(R.string.please_restart_app), 2);
            }
        });
        baseBind.logFileEnableRela.setOnClickListener(v ->
                baseBind.logFileEnable.performClick());
    }

    private void bindTriggerCrashRow() {
        if (!ceui.lisa.BuildConfig.DEBUG) {
            baseBind.triggerCrashRela.setVisibility(View.GONE);
            return;
        }
        baseBind.triggerCrashRela.setOnClickListener(v -> crashDeep());
    }

    /**
     * 无限递归触发 StackOverflowError：Error 而非 Exception，catch(Exception) 抓不到，且必走未捕获异常处理器。
     */
    private void crashDeep() {
        crashDeep();
    }

}
