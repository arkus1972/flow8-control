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
        closeGatt();
        connectCall = call;
        attempts = 0;
        BluetoothLeScanner sc = ad.getBluetoothLeScanner();
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
                    && !name.toUpperCase().contains("AUDIO")
                    && d.getType() != BluetoothDevice.DEVICE_TYPE_CLASSIC
                    && System.currentTimeMillis() - scanStart > 6000;
                if (hasSvc || byName) {
                    stopScan(sc);
                    connectDevice(d);
                }
            }
            @Override public void onScanFailed(int code) { fail("Skanowanie nie działa (" + code + ")"); }
        };
        sc.startScan(null, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCb);
        main.postDelayed(() -> {
            if (scanCb != null) { stopScan(sc); fail("Nie znaleziono FLOW 8. Czy mikser jest włączony, a FLOW Mix zamknięta?"); }
        }, 12000);
    }

    @SuppressLint("MissingPermission")
    private void stopScan(BluetoothLeScanner sc) {
        if (scanCb != null) { try { sc.stopScan(scanCb); } catch (Exception ignored) {} scanCb = null; }
    }

    @SuppressLint("MissingPermission")
    private void connectDevice(BluetoothDevice d) {
        attempts++;
        gatt = d.connectGatt(getContext(), false, cb, BluetoothDevice.TRANSPORT_LE);
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
                    main.postDelayed(() -> connectDevice(d), 600L * attempts);
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
