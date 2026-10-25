package app.musike.android;

import android.app.UiModeManager;
import android.os.Build;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** What kind of device the app runs on (web/src/native/android.ts): the same APK serves phones and Android TV. */
@CapacitorPlugin(name = "MusikeDevice")
public class MusikeDevicePlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        Context context = getContext();
        UiModeManager uiMode = (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
        PackageManager pm = context.getPackageManager();
        // Fire TV doesn't always report the television UI mode: the app can run there as a plain phone app, with
        // no way to work a remote. Amazon's manufacturer name, Fire TV's own feature and a missing touchscreen
        // cover the ones that lie; phones always have a touchscreen, so nothing changes there.
        boolean tvMode = uiMode != null && uiMode.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        boolean leanback = pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK);
        boolean amazon = "Amazon".equalsIgnoreCase(Build.MANUFACTURER) || pm.hasSystemFeature("amazon.hardware.fire_tv");
        boolean noTouch = !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
        boolean tv = tvMode || leanback || amazon || noTouch;
        JSObject result = new JSObject();
        result.put("tv", tv);
        call.resolve(result);
    }
}
