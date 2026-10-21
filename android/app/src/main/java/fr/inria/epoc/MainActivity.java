package fr.inria.epoc;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ThemeBarsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
