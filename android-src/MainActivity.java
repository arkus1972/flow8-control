package com.arkus1972.flow8control;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FlowBlePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
