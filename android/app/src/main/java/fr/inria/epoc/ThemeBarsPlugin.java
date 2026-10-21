package fr.inria.epoc;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the window background visible behind the system bars with the app theme color.
 * On Android 15+ with WebView < 140, Capacitor's SystemBars pads the webview instead of drawing it
 * behind the system bars, and resets this background to the Android theme color (following the
 * system dark mode) on every style change and configuration change.
 */
@CapacitorPlugin(name = "ThemeBars")
public class ThemeBarsPlugin extends Plugin {
  @PluginMethod
  public void setBackgroundColor(PluginCall call) {
    String hex = call.getString("color");
    final int color;
    try {
      color = Color.parseColor(hex);
    } catch (Exception e) {
      call.reject("Couleur invalide (format attendu : #RRGGBB)");
      return;
    }

    getActivity().runOnUiThread(() -> {
      // Fond de la fenêtre (zone de padding sous les barres)
      getActivity().getWindow().setBackgroundDrawable(new ColorDrawable(color));
      // WebView et son conteneur, selon où Capacitor applique le padding
      View webView = getBridge().getWebView();
      webView.setBackgroundColor(color);
      if (webView.getParent() instanceof View) {
        ((View) webView.getParent()).setBackgroundColor(color);
      }
      call.resolve();
    });
  }
}
