package com.arkus1972.flow8control;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;

import java.util.UUID;

/**
 * Native Bluetooth LE bridge for the Behringer FLOW 8.
 * The mixer's data characteristic is "notify" but has no CCCD descriptor, so Chrome's
 * Web Bluetooth refuses to subscribe. Android itself only needs setCharacteristicNotification
 * (that is what the official app does), which this plugin calls.
 */
@CapacitorPlugin(
    name = "FlowBle",
    permissions = {
        @Permission(alias = "ble12", strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "bleOld", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class FlowBlePlugin extends Plugin {
    private static final UUID SVC = UUID.fromString("14839ad4-8d7e-415c-9a42-167340cf2339");
    private static final UUID CHR = UUID.fromString("0034594a-a8e7-4b1a-a6b1-cd5243059a57");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic chr;
    private PluginCall connectCall;
    private PluginCall writeCall;
    private ScanCallback scanCb;
    private int attempts;
    private long scanStart;
    private boolean discovering;

    private String alias() { return Build.VERSION.SDK_INT >= 31 ? "ble12" : "bleOld"; }

    @PluginMethod
    public void connect(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias(), call, "permsDone");
            return;
        }
        startScan(call);
    }

    @PermissionCallback
    private void permsDone(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) startScan(call);
        else call.reject("Brak zgody na Bluetooth");
    }

    @SuppressLint("MissingPermission")
    private void startScan(PluginCall call) {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter ad = bm == null ? null : bm.getAdapter();
        if (ad == null || !ad.isEnabled()) { call.reject("Włącz Bluetooth w telefonie"); return; }
        BluetoothLeScanner sc = ad.getBluetoothLeScanner();
        if (sc == null) { call.reject("Włącz Bluetooth w telefonie"); return; }
        stopScan(sc);                                   // an earlier search still running must not connect too
        closeGatt();
        if (connectCall != null && connectCall != call) connectCall.reject("Przerwano");
        connectCall = call;
        attempts = 0;
        scanStart = System.currentTimeMillis();
        scanCb = new ScanCallback() {
            @Override public void onScanResult(int type, ScanResult r) {
                BluetoothDevice d = r.getDevice();
                String name = r.getScanRecord() != null ? r.getScanRecord().getDeviceName() : null;
                if (name == null) name = d.getName();
                boolean hasSvc = r.getScanRecord() != null && r.getScanRecord().getServiceUuids() != null
                    && r.getScanRecord().getServiceUuids().toString().toLowerCase().contains(SVC.toString());
                // FLOW Mix looks for the control service only. The mixer's audio Bluetooth is a
                // separate device with a similar name, so the name is just a late fallback.
                boolean byName = name != null && name.toUpperCase().startsWith("FLOW")
                    && d.getType() != BluetoothDevice.DEVICE_TYPE_CLASSIC
                    && System.currentTimeMillis() - scanStart > 6000;
                if (hasSvc || byName) {
                    stopScan(sc);
                    connectDevice(d);
                }
            }
            @Override public void onScanFailed(int code) { fail("Skanowanie nie działa (" + code + ")"); }
        };
        final ScanCallback mine = scanCb;
        sc.startScan(null, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCb);
        main.postDelayed(() -> {                        // only this search's timeout, never a later one's
            if (scanCb != null && scanCb == mine) { stopScan(sc); fail("Nie znaleziono FLOW 8. Czy mikser jest włączony, a FLOW Mix zamknięta?"); }
        }, 12000);
    }

    @SuppressLint("MissingPermission")
    private void stopScan(BluetoothLeScanner sc) {
        if (scanCb != null) { try { sc.stopScan(scanCb); } catch (Exception ignored) {} scanCb = null; }
    }

    @SuppressLint("MissingPermission")
    private void connectDevice(BluetoothDevice d) {
        attempts++;
        gatt = d.connectGatt(getContext(), false, cb);   // same call as FLOW Mix: let Android pick the transport
    }

    private final BluetoothGattCallback cb = new BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        @Override public void onConnectionStateChange(BluetoothGatt g, int status, int state) {
            if (state == BluetoothProfile.STATE_CONNECTED) {
                g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH);
                discovering = false;
                main.postDelayed(() -> g.requestMtu(255), 100);
                main.postDelayed(() -> discover(g), 1500);          // in case onMtuChanged never comes
            } else if (state == BluetoothProfile.STATE_DISCONNECTED) {
                BluetoothDevice d = g.getDevice();
                g.close();
                if (connectCall != null && attempts < 4) {          // first attempt often fails on Android
                    main.postDelayed(() -> { if (connectCall != null) connectDevice(d); }, 600L * attempts);   // not after the user gave up
                } else if (connectCall != null) {
                    gatt = null; fail("Połączenie nieudane (status " + status + ")");
                } else {
                    gatt = null; chr = null;
                    notifyListeners("disconnected", new JSObject());
                }
            }
        }
        @SuppressLint("MissingPermission")
        @Override public void onMtuChanged(BluetoothGatt g, int mtu, int status) { discover(g); }

        @SuppressLint("MissingPermission")
        @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService s = g.getService(SVC);
            chr = s == null ? null : s.getCharacteristic(CHR);
            if (chr == null) { fail("To urządzenie nie wygląda na FLOW 8"); g.disconnect(); return; }
            g.setCharacteristicNotification(chr, true);
            BluetoothGattDescriptor dsc = chr.getDescriptor(CCCD);     // FLOW 8 has none; fine
            if (dsc != null) {
                dsc.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                g.writeDescriptor(dsc);
            }
            if (connectCall != null) {
                JSObject r = new JSObject();
                r.put("name", g.getDevice().getName());
                connectCall.resolve(r);
                connectCall = null;
            }
        }
        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            emit(c.getValue());
        }
        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            emit(value);
        }
        @Override public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            PluginCall w = writeCall; writeCall = null;
            if (w != null) { if (status == BluetoothGatt.GATT_SUCCESS) w.resolve(); else w.reject("Zapis nieudany (" + status + ")"); }
        }
    };

    @SuppressLint("MissingPermission")
    private void discover(BluetoothGatt g) {
        if (discovering || g != gatt) return;
        discovering = true;
        g.discoverServices();
    }

    private void emit(byte[] v) {
        if (v == null) return;
        JSArray a = new JSArray();
        for (byte b : v) a.put(b & 0xff);
        JSObject o = new JSObject();
        o.put("value", a);
        notifyListeners("data", o);
    }

    @SuppressLint("MissingPermission")
    // one short, crisp haptic click for a knob notch (the WebView's navigator.vibrate is too weak or ignored on some phones)
    @PluginMethod
    public void buzz(PluginCall call) {
        try {
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                boolean soft = Boolean.TRUE.equals(call.getBoolean("soft", false));
                if (Build.VERSION.SDK_INT >= 29) v.vibrate(VibrationEffect.createPredefined(soft ? VibrationEffect.EFFECT_TICK : VibrationEffect.EFFECT_HEAVY_CLICK));
                else if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(soft ? 10 : 25, soft ? 120 : 255));
                else v.vibrate(soft ? 10 : 25);
            }
        } catch (Exception e) { }
        call.resolve();
    }

    // ----- MIDI controllers (song changes): USB devices appear by themselves, Bluetooth MIDI is found by its service -----
    private static final UUID MIDI_SVC = UUID.fromString("03b80e5a-ede8-4b33-a751-6ce34ec4c700");
    private Object midi;                                   // Midi helper, only on Android 6+
    private ScanCallback midiScanCb;

    @PluginMethod
    public void midiStart(PluginCall call) {
        if (Build.VERSION.SDK_INT < 23) { call.reject("MIDI wymaga Androida 6"); return; }
        try {
            if (midi == null) midi = new Midi(this);
            ((Midi) midi).start();
            call.resolve();
        } catch (Exception e) { call.reject("MIDI niedostępne: " + e.getMessage()); }
    }

    void midiEvent(String kind, JSObject o) { notifyListeners(kind, o); }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void midiScan(PluginCall call) {
        try {
            BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter ad = bm == null ? null : bm.getAdapter();
            BluetoothLeScanner sc = ad == null ? null : ad.getBluetoothLeScanner();
            if (sc == null) { call.reject("Włącz Bluetooth w telefonie"); return; }
            if (midiScanCb != null) try { sc.stopScan(midiScanCb); } catch (Exception e) { }
            final java.util.HashSet<String> seen = new java.util.HashSet<>();
            midiScanCb = new ScanCallback() {
                @Override
                public void onScanResult(int type, ScanResult r) {
                    BluetoothDevice d = r.getDevice();
                    boolean isMidi = r.getScanRecord() != null && r.getScanRecord().getServiceUuids() != null
                        && r.getScanRecord().getServiceUuids().contains(new android.os.ParcelUuid(MIDI_SVC));
                    if (!isMidi || !seen.add(d.getAddress())) return;
                    JSObject o = new JSObject();
                    o.put("address", d.getAddress());
                    String n = r.getScanRecord().getDeviceName();
                    o.put("name", n != null ? n : d.getAddress());
                    notifyListeners("midiFound", o);
                }
            };
            sc.startScan(null, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), midiScanCb);
            final ScanCallback mine = midiScanCb;
            main.postDelayed(() -> { try { sc.stopScan(mine); } catch (Exception e) { } if (midiScanCb == mine) midiScanCb = null; notifyListeners("midiScanEnd", new JSObject()); }, 8000);
            call.resolve();
        } catch (Exception e) { call.reject("Nie mogę szukać: " + e.getMessage()); }
    }

    @PluginMethod
    public void midiBle(PluginCall call) {
        if (Build.VERSION.SDK_INT < 23) { call.reject("MIDI wymaga Androida 6"); return; }
        try {
            if (midi == null) midi = new Midi(this);
            BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            ((Midi) midi).openBle(bm.getAdapter().getRemoteDevice(call.getString("address")));
            call.resolve();
        } catch (Exception e) { call.reject("Nie mogę połączyć: " + e.getMessage()); }
    }

    @android.annotation.TargetApi(23)
    static class Midi {
        private final FlowBlePlugin p;
        private final android.media.midi.MidiManager mm;
        private final java.util.HashMap<String, android.media.midi.MidiDevice> open = new java.util.HashMap<>();
        private boolean listening;
        Midi(FlowBlePlugin p) {
            this.p = p;
            mm = (android.media.midi.MidiManager) p.getContext().getSystemService(Context.MIDI_SERVICE);
            if (mm == null) throw new IllegalStateException("brak MIDI w telefonie");
        }
        private static String key(android.media.midi.MidiDeviceInfo info) {
            android.os.Bundle b = info.getProperties();
            String n = b.getString(android.media.midi.MidiDeviceInfo.PROPERTY_NAME);
            return info.getId() + ":" + (n == null ? "" : n);
        }
        void start() {
            for (android.media.midi.MidiDeviceInfo info : mm.getDevices()) openInfo(info);
            if (!listening) {
                listening = true;
                mm.registerDeviceCallback(new android.media.midi.MidiManager.DeviceCallback() {
                    @Override public void onDeviceAdded(android.media.midi.MidiDeviceInfo info) { openInfo(info); }
                    @Override public void onDeviceRemoved(android.media.midi.MidiDeviceInfo info) {
                        android.media.midi.MidiDevice d = open.remove(key(info));
                        if (d != null) try { d.close(); } catch (Exception e) { }
                        devices();
                    }
                }, new Handler(Looper.getMainLooper()));
            }
            devices();
        }
        void openInfo(android.media.midi.MidiDeviceInfo info) {
            if (open.containsKey(key(info)) || info.getOutputPortCount() == 0) return;
            mm.openDevice(info, d -> attach(key(info), d), new Handler(Looper.getMainLooper()));
        }
        void openBle(BluetoothDevice bd) {
            mm.openBluetoothDevice(bd, d -> { if (d != null) attach("ble:" + bd.getAddress() + ":" + d.getInfo().getProperties().getString(android.media.midi.MidiDeviceInfo.PROPERTY_NAME), d); }, new Handler(Looper.getMainLooper()));
        }
        void attach(String k, android.media.midi.MidiDevice d) {
            if (d == null) return;
            open.put(k, d);
            for (android.media.midi.MidiDeviceInfo.PortInfo port : d.getInfo().getPorts()) {
                if (port.getType() != android.media.midi.MidiDeviceInfo.PortInfo.TYPE_OUTPUT) continue;
                android.media.midi.MidiOutputPort out = d.openOutputPort(port.getPortNumber());
                if (out == null) continue;
                out.connect(new android.media.midi.MidiReceiver() {
                    @Override public void onSend(byte[] msg, int off, int count, long ts) {
                        JSArray a = new JSArray();
                        for (int i = 0; i < count; i++) a.put(msg[off + i] & 255);
                        JSObject o = new JSObject();
                        o.put("data", a);
                        p.midiEvent("midi", o);
                    }
                });
            }
            devices();
        }
        void devices() {
            JSArray a = new JSArray();
            for (String k : open.keySet()) a.put(k.substring(k.lastIndexOf(':') + 1));
            JSObject o = new JSObject();
            o.put("names", a);
            p.midiEvent("midiDevices", o);
        }
    }

    // send text (a preset backup) to another app: Drive, e-mail, a messenger, Files
    @PluginMethod
    public void share(PluginCall call) {
        try {
            android.content.Intent it = new android.content.Intent(android.content.Intent.ACTION_SEND);
            it.setType("text/plain");
            it.putExtra(android.content.Intent.EXTRA_SUBJECT, call.getString("title", "FLOW 8"));
            it.putExtra(android.content.Intent.EXTRA_TEXT, call.getString("text", ""));
            android.content.Intent ch = android.content.Intent.createChooser(it, call.getString("title", "FLOW 8"));
            ch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ch);
            call.resolve();
        } catch (Exception e) { call.reject("Nie mogę udostępnić"); }
    }

    // keep the screen on (metronome running, screen lock in the app), so Android does not pause the app
    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (getActivity() != null) getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    // open a link (the newest APK) in the phone's browser, which downloads it and offers to install
    @PluginMethod
    public void openUrl(PluginCall call) {
        try {
            android.content.Intent it = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(call.getString("url")));
            it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(it);
            call.resolve();
        } catch (Exception e) { call.reject("Nie mogę otworzyć linku"); }
    }

    @PluginMethod
    public void write(PluginCall call) {
        if (gatt == null || chr == null) { call.reject("Brak połączenia"); return; }
        JSONArray arr = call.getArray("data");
        byte[] data = new byte[arr.length()];
        for (int i = 0; i < arr.length(); i++) data[i] = (byte) arr.optInt(i);
        writeCall = call;
        boolean ok;
        if (Build.VERSION.SDK_INT >= 33) {
            ok = gatt.writeCharacteristic(chr, data, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == 0;
        } else {
            chr.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            chr.setValue(data);
            ok = gatt.writeCharacteristic(chr);
        }
        if (!ok) { writeCall = null; call.reject("Zapis odrzucony"); }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        connectCall = null;
        closeGatt();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void closeGatt() {
        if (gatt != null) { try { gatt.disconnect(); gatt.close(); } catch (Exception ignored) {} }
        gatt = null; chr = null;
    }

    private void fail(String msg) {
        if (connectCall != null) { connectCall.reject(msg); connectCall = null; }
    }
}
