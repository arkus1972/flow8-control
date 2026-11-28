package com.arkus1972.flow8control;

import android.annotation.TargetApi;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Environment;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

/**
 * Multitrack recorder and player for the FLOW 8 USB audio interface.
 * Recording: one AudioRecord with a channel index mask (every USB channel), each channel goes to its own
 * mono WAV (24 bit when Android gives float, else 16 bit) in Music/FLOW8/<date name>/ of the app's folder.
 * Playback: the WAVs are mixed on the fly with per-file left/right gains that the page sends (it owns
 * faders, pan, mute, solo and stereo pairs), into one stereo AudioTrack (phone, or the mixer over USB).
 * Mixdown renders the same mix into one stereo WAV.
 */
@TargetApi(23)
class Recorder {
    interface Sink { void emit(String kind, JSONObject o); }

    private final Context ctx;
    private final Sink sink;
    Recorder(Context c, Sink s) { ctx = c; sink = s; }

    File root() {
        File base = ctx.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (base == null) base = new File(ctx.getFilesDir(), "Music");
        File d = new File(base, "FLOW8");
        d.mkdirs();
        return d;
    }

    File dirOf(String name) throws IOException {
        File d = new File(root(), name);
        if (!d.getCanonicalPath().startsWith(root().getCanonicalPath() + File.separator)) throw new IOException("Zła ścieżka");
        return d;
    }

    // ---------------------------------------------------------------- devices
    static String typeName(int t) {
        switch (t) {
            case AudioDeviceInfo.TYPE_USB_DEVICE: return "usb";
            case 22: return "usb-headset";                       // TYPE_USB_HEADSET (API 26)
            case AudioDeviceInfo.TYPE_USB_ACCESSORY: return "usb-accessory";
            case AudioDeviceInfo.TYPE_BUILTIN_MIC: return "mic";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "speaker";
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "earpiece";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: return "headset";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES: return "headphones";
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP: return "bluetooth";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: return "bluetooth-sco";
            case AudioDeviceInfo.TYPE_TELEPHONY: return "telephony";
            default: return "other-" + t;
        }
    }

    static boolean isUsb(AudioDeviceInfo d) {
        int t = d.getType();
        return t == AudioDeviceInfo.TYPE_USB_DEVICE || t == 22 || t == AudioDeviceInfo.TYPE_USB_ACCESSORY;
    }

    static int maxChannels(AudioDeviceInfo d) {
        int m = 0;
        for (int c : d.getChannelCounts()) m = Math.max(m, c);
        for (int k : d.getChannelIndexMasks()) m = Math.max(m, Integer.bitCount(k));
        return m;                                            // 0 = Android says "any"
    }

    private static JSONArray arr(int[] a) { JSONArray j = new JSONArray(); for (int v : a) j.put(v); return j; }

    private static JSONObject dev(AudioDeviceInfo d) throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", d.getId());
        o.put("name", String.valueOf(d.getProductName()));
        o.put("type", typeName(d.getType()));
        o.put("usb", isUsb(d));
        o.put("channels", arr(d.getChannelCounts()));
        o.put("indexMasks", arr(d.getChannelIndexMasks()));
        o.put("rates", arr(d.getSampleRates()));
        o.put("encodings", arr(d.getEncodings()));
        o.put("max", maxChannels(d));
        return o;
    }

    private AudioManager am() { return (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE); }

    JSONObject devices() throws JSONException {
        JSONObject o = new JSONObject();
        JSONArray in = new JSONArray(), out = new JSONArray();
        for (AudioDeviceInfo d : am().getDevices(AudioManager.GET_DEVICES_INPUTS)) in.put(dev(d));
        for (AudioDeviceInfo d : am().getDevices(AudioManager.GET_DEVICES_OUTPUTS)) out.put(dev(d));
        o.put("inputs", in);
        o.put("outputs", out);
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        o.put("free", root().getUsableSpace());
        o.put("folder", root().getAbsolutePath());
        return o;
    }

    private AudioDeviceInfo usb(int flag, int id) {
        AudioDeviceInfo best = null;
        for (AudioDeviceInfo d : am().getDevices(flag)) {
            if (id >= 0) { if (d.getId() == id) return d; continue; }
            if (!isUsb(d)) continue;
            if (best == null || maxChannels(d) > maxChannels(best)) best = d;
        }
        return best;
    }

    static String safe(String s) {
        s = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", " ").replaceAll("\\s+", " ").trim();
        return s.length() > 40 ? s.substring(0, 40).trim() : s;
    }

    static double db(float peak) { return peak <= 0.0000316f ? -90 : Math.max(-90, 20 * Math.log10(peak)); }

    // ---------------------------------------------------------------- WAV
    static final class WavOut {
        final File file; final OutputStream os; final int ch, bits, rate; long bytes;
        WavOut(File f, int ch, int bits, int rate) throws IOException {
            file = f; this.ch = ch; this.bits = bits; this.rate = rate;
            os = new BufferedOutputStream(new FileOutputStream(f), 1 << 16);
            os.write(header(0));
        }
        byte[] header(long data) {
            int ba = ch * bits / 8;
            byte[] h = new byte[44];
            put(h, 0, "RIFF"); le32(h, 4, (int) Math.min(0xffffffffL, 36 + data)); put(h, 8, "WAVE");
            put(h, 12, "fmt "); le32(h, 16, 16); le16(h, 20, 1); le16(h, 22, ch); le32(h, 24, rate);
            le32(h, 28, rate * ba); le16(h, 32, ba); le16(h, 34, bits);
            put(h, 36, "data"); le32(h, 40, (int) Math.min(0xffffffffL, data));
            return h;
        }
        void write(byte[] b, int n) throws IOException { os.write(b, 0, n); bytes += n; }
        void close() throws IOException {
            os.close();
            try (RandomAccessFile r = new RandomAccessFile(file, "rw")) { r.seek(0); r.write(header(bytes)); }
        }
        static void put(byte[] b, int o, String s) { byte[] x = s.getBytes(StandardCharsets.US_ASCII); System.arraycopy(x, 0, b, o, 4); }
        static void le16(byte[] b, int o, int v) { b[o] = (byte) v; b[o + 1] = (byte) (v >> 8); }
        static void le32(byte[] b, int o, int v) { b[o] = (byte) v; b[o + 1] = (byte) (v >> 8); b[o + 2] = (byte) (v >> 16); b[o + 3] = (byte) (v >> 24); }
    }

    /** a mono or stereo PCM WAV opened for reading at any frame */
    static final class WavIn {
        final RandomAccessFile f; int ch = 1, bits = 16, rate = 48000, fmt = 1; long dataOff, frames;
        WavIn(File file) throws IOException {
            f = new RandomAccessFile(file, "r");
            byte[] h = new byte[12]; f.readFully(h);
            if (h[0] != 'R' || h[8] != 'W') throw new IOException("To nie WAV: " + file.getName());
            long pos = 12, len = f.length();
            while (pos + 8 <= len) {
                f.seek(pos); byte[] c = new byte[8]; f.readFully(c);
                String id = new String(c, 0, 4, StandardCharsets.US_ASCII);
                long sz = (c[4] & 0xffL) | (c[5] & 0xffL) << 8 | (c[6] & 0xffL) << 16 | (c[7] & 0xffL) << 24;
                if (id.equals("fmt ")) {
                    byte[] b = new byte[16]; f.readFully(b);
                    fmt = (b[0] & 0xff) | (b[1] & 0xff) << 8; ch = (b[2] & 0xff) | (b[3] & 0xff) << 8;
                    rate = (b[4] & 0xff) | (b[5] & 0xff) << 8 | (b[6] & 0xff) << 16 | (b[7] & 0xff) << 24;
                    bits = (b[14] & 0xff) | (b[15] & 0xff) << 8;
                } else if (id.equals("data")) {
                    dataOff = pos + 8;
                    long avail = len - dataOff;
                    if (sz == 0 || sz > avail || sz == 0xffffffffL) sz = avail;   // unfinished file: use what is there
                    frames = sz / (ch * bits / 8);
                    break;
                }
                pos += 8 + sz + (sz & 1);
            }
            if (dataOff == 0) throw new IOException("Brak danych w " + file.getName());
            if (!(fmt == 1 && (bits == 16 || bits == 24)) && !(fmt == 3 && bits == 32)) throw new IOException("Nieobsługiwany format WAV");
        }
        private byte[] buf = new byte[0];
        /** reads n frames from frame `at` into out[c][0..n), zero past the end; returns frames read */
        int read(long at, int n, float[][] out) throws IOException {
            int bpf = ch * bits / 8;
            int got = (int) Math.max(0, Math.min(n, frames - at));
            if (buf.length < n * bpf) buf = new byte[n * bpf];
            if (got > 0) { f.seek(dataOff + at * bpf); f.readFully(buf, 0, got * bpf); }
            for (int c = 0; c < ch && c < out.length; c++) {
                float[] o = out[c];
                for (int i = 0; i < n; i++) {
                    if (i >= got) { o[i] = 0; continue; }
                    int p = i * bpf + c * bits / 8;
                    if (bits == 16) o[i] = (short) ((buf[p] & 0xff) | buf[p + 1] << 8) / 32768f;
                    else if (bits == 24) o[i] = ((buf[p] & 0xff) | (buf[p + 1] & 0xff) << 8 | buf[p + 2] << 16) / 8388608f;
                    else o[i] = Float.intBitsToFloat((buf[p] & 0xff) | (buf[p + 1] & 0xff) << 8 | (buf[p + 2] & 0xff) << 16 | buf[p + 3] << 24);
                }
            }
            return got;
        }
        void close() { try { f.close(); } catch (IOException ignored) {} }
    }

    // ---------------------------------------------------------------- recording
    private volatile boolean recOn;
    private Thread recThread;

    boolean recording() { return recOn; }

    JSONObject recStart(JSONObject opt) throws Exception {
        if (recOn) throw new Exception("Już nagrywam");
        playStop();
        AudioDeviceInfo dev = usb(AudioManager.GET_DEVICES_INPUTS, opt.optInt("device", -1));
        boolean anyInput = opt.optBoolean("anyInput", false);
        if (dev == null && !anyInput) throw new Exception("Nie widzę karty dźwiękowej USB. Podłącz FLOW 8 kablem USB do telefonu i ustaw w mikserze tryb USB „nagrywanie”.");
        final int rate = opt.optInt("rate", 48000);
        int want = opt.optInt("channels", 0);
        if (want <= 0) want = dev != null ? maxChannels(dev) : 2;
        if (want <= 0) want = 10;
        want = Math.min(want, 24);

        int src = MediaRecorder.AudioSource.VOICE_RECOGNITION;
        if (Build.VERSION.SDK_INT >= 24 && "true".equals(am().getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED)))
            src = MediaRecorder.AudioSource.UNPROCESSED;

        ArrayList<Integer> counts = new ArrayList<>();
        for (int n : new int[] { want, 12, 10, 8, 6, 4, 2 }) if (n <= want && !counts.contains(n)) counts.add(n);
        AudioRecord r = null; int enc = 0; String err = "";
        outer:
        for (int n : counts) {
            for (int e : new int[] { AudioFormat.ENCODING_PCM_FLOAT, AudioFormat.ENCODING_PCM_16BIT }) {
                try {
                    AudioFormat f = new AudioFormat.Builder().setEncoding(e).setSampleRate(rate).setChannelIndexMask((1 << n) - 1).build();
                    int bps = e == AudioFormat.ENCODING_PCM_FLOAT ? 4 : 2;
                    AudioRecord a = new AudioRecord.Builder().setAudioSource(src).setAudioFormat(f).setBufferSizeInBytes(rate * n * bps / 2).build();
                    if (a.getState() != AudioRecord.STATE_INITIALIZED) { a.release(); continue; }
                    if (dev != null) a.setPreferredDevice(dev);
                    r = a; enc = e;
                    break outer;
                } catch (Exception x) { err = String.valueOf(x.getMessage()); }
            }
        }
        if (r == null) throw new Exception("Android nie otworzył wejścia USB (" + err + ")");
        final int ch = r.getChannelCount();
        final boolean flt = enc == AudioFormat.ENCODING_PCM_FLOAT;
        final int bits = flt ? 24 : 16;

        String stamp = new SimpleDateFormat("yyyy-MM-dd HH-mm-ss", Locale.US).format(new Date());
        String title = safe(opt.optString("name", ""));
        boolean test = opt.optBoolean("test", false);
        final File dir = new File(root(), stamp + (test ? " test" : "") + (title.isEmpty() ? "" : " " + title));
        if (!dir.mkdirs()) { r.release(); throw new IOException("Nie mogę utworzyć folderu"); }
        JSONArray names = opt.optJSONArray("names");
        final WavOut[] w = new WavOut[ch];
        final JSONArray files = new JSONArray(), trackNames = new JSONArray();
        try {
            for (int c = 0; c < ch; c++) {
                String nm = names != null && c < names.length() ? safe(names.optString(c)) : "";
                if (nm.isEmpty()) nm = "USB " + (c + 1);
                String fn = String.format(Locale.US, "%02d %s.wav", c + 1, nm);
                w[c] = new WavOut(new File(dir, fn), 1, bits, rate);
                files.put(fn); trackNames.put(nm);
            }
            r.startRecording();
        } catch (Exception x) {
            r.release();
            for (WavOut o : w) if (o != null) try { o.close(); } catch (IOException ignored) {}
            throw x;
        }
        if (r.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) { r.release(); throw new Exception("Nagrywanie nie wystartowało (mikrofon zajęty?)"); }

        AudioDeviceInfo routed = Build.VERSION.SDK_INT >= 24 ? r.getRoutedDevice() : dev;
        final JSONObject meta = new JSONObject();
        meta.put("name", title); meta.put("date", stamp); meta.put("rate", rate); meta.put("bits", bits);
        meta.put("channels", ch); meta.put("files", files); meta.put("names", trackNames); meta.put("test", test);
        meta.put("device", routed != null ? String.valueOf(routed.getProductName()) + " (" + typeName(routed.getType()) + ")" : "?");
        meta.put("asked", want);
        if (opt.has("pairs")) meta.put("pairs", opt.get("pairs"));
        if (opt.has("song")) meta.put("song", opt.get("song"));

        final AudioRecord rec = r;
        final long limit = opt.optDouble("seconds", 0) > 0 ? (long) (opt.optDouble("seconds", 0) * rate) : 0;
        recOn = true;
        recThread = new Thread(() -> {
            int block = rate / 50;                                     // 20 ms
            float[] fb = flt ? new float[block * ch] : null;
            short[] sb = flt ? null : new short[block * ch];
            byte[][] ob = new byte[ch][block * bits / 8];
            float[] peak = new float[ch], hold = new float[ch];
            long frames = 0, lastEmit = 0, lastDisk = 0; String reason = "stop";
            try {
                while (recOn) {
                    int got = flt ? rec.read(fb, 0, fb.length, AudioRecord.READ_BLOCKING) : rec.read(sb, 0, sb.length);
                    if (got < 0) { reason = "błąd odczytu " + got; break; }
                    int fr = got / ch;
                    if (fr == 0) continue;
                    for (int c = 0; c < ch; c++) {
                        byte[] o = ob[c]; int p = 0; float pk = peak[c];
                        for (int i = 0; i < fr; i++) {
                            float v = flt ? fb[i * ch + c] : sb[i * ch + c] / 32768f;
                            float a = Math.abs(v); if (a > pk) pk = a;
                            if (flt) {
                                int s = (int) Math.max(-8388608, Math.min(8388607, Math.round(v * 8388607.0)));
                                o[p++] = (byte) s; o[p++] = (byte) (s >> 8); o[p++] = (byte) (s >> 16);
                            } else { short s = sb[i * ch + c]; o[p++] = (byte) s; o[p++] = (byte) (s >> 8); }
                        }
                        peak[c] = pk;
                        if (pk > hold[c]) hold[c] = pk;
                        w[c].write(o, p);
                    }
                    frames += fr;
                    if (frames - lastEmit >= rate / 10) {
                        lastEmit = frames;
                        JSONObject e = new JSONObject();
                        JSONArray pa = new JSONArray(), ha = new JSONArray();
                        for (int c = 0; c < ch; c++) { pa.put(Math.round(db(peak[c]) * 10) / 10.0); ha.put(Math.round(db(hold[c]) * 10) / 10.0); peak[c] = 0; }
                        e.put("t", frames / (double) rate); e.put("peaks", pa); e.put("max", ha); e.put("dir", dir.getName());
                        sink.emit("rec", e);
                    }
                    if (frames - lastDisk >= rate * 2L) {
                        lastDisk = frames;
                        if (dir.getUsableSpace() < 80L * 1024 * 1024) { reason = "brak miejsca"; break; }
                    }
                    if (limit > 0 && frames >= limit) { reason = "koniec testu"; break; }
                }
            } catch (Exception x) {
                reason = "błąd: " + x.getMessage();
            } finally {
                recOn = false;
                try { rec.stop(); } catch (Exception ignored) {}
                rec.release();
                long size = 0;
                for (WavOut o : w) { try { o.close(); } catch (IOException ignored) {} size += o.bytes + 44; }
                try {
                    meta.put("frames", frames);
                    JSONArray mx = new JSONArray();
                    for (int c = 0; c < ch; c++) mx.put(Math.round(db(hold[c]) * 10) / 10.0);
                    meta.put("maxDb", mx);
                    writeMeta(dir, meta);
                    JSONObject e = new JSONObject();
                    e.put("dir", dir.getName()); e.put("seconds", frames / (double) rate); e.put("channels", ch);
                    e.put("bits", bits); e.put("reason", reason); e.put("size", size); e.put("maxDb", mx); e.put("test", meta.optBoolean("test"));
                    e.put("device", meta.optString("device"));
                    sink.emit("recDone", e);
                } catch (Exception ignored) {}
            }
        }, "flow8-rec");
        recThread.setPriority(Thread.MAX_PRIORITY);
        recThread.start();

        JSONObject res = new JSONObject();
        res.put("dir", dir.getName()); res.put("channels", ch); res.put("bits", bits); res.put("rate", rate);
        res.put("asked", want); res.put("names", trackNames); res.put("device", meta.optString("device"));
        return res;
    }

    void recStop() {
        recOn = false;
        Thread t = recThread;
        if (t != null) try { t.join(3000); } catch (InterruptedException ignored) {}
    }

    // ---------------------------------------------------------------- library
    static void writeMeta(File dir, JSONObject meta) throws IOException {
        try (FileOutputStream o = new FileOutputStream(new File(dir, "flow8.json"))) { o.write(meta.toString().getBytes(StandardCharsets.UTF_8)); }
    }

    static JSONObject readMeta(File dir) {
        File f = new File(dir, "flow8.json");
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int n = 0; while (n < b.length) { int k = in.read(b, n, b.length - n); if (k < 0) break; n += k; }
            return new JSONObject(new String(b, 0, n, StandardCharsets.UTF_8));
        } catch (Exception e) { return null; }
    }

    /** meta for a folder; folders without flow8.json (copied in by hand) are read from their WAVs */
    JSONObject metaOf(File dir) {
        JSONObject m = readMeta(dir);
        try {
            if (m == null) {
                m = new JSONObject();
                JSONArray files = new JSONArray(), names = new JSONArray();
                File[] ls = dir.listFiles();
                if (ls != null) {
                    java.util.Arrays.sort(ls);
                    for (File f : ls) if (f.getName().toLowerCase(Locale.ROOT).endsWith(".wav") && !f.getName().startsWith("miks ")) { files.put(f.getName()); names.put(f.getName().replaceAll("(?i)\\.wav$", "")); }
                }
                m.put("files", files); m.put("names", names); m.put("name", dir.getName());
            }
            if (!m.has("frames") || m.optLong("frames") == 0) {
                JSONArray files = m.optJSONArray("files");
                if (files != null && files.length() > 0) {
                    WavIn w = new WavIn(new File(dir, files.getString(0)));
                    m.put("frames", w.frames); m.put("rate", w.rate); w.close();
                }
            }
            long size = 0; File[] ls = dir.listFiles();
            if (ls != null) for (File f : ls) size += f.length();
            m.put("size", size);
            m.put("dir", dir.getName());
            File[] mixes = dir.listFiles((d, n) -> n.startsWith("miks ") && n.endsWith(".wav"));
            JSONArray mx = new JSONArray(); if (mixes != null) for (File f : mixes) mx.put(f.getName());
            m.put("mixes", mx);
        } catch (Exception ignored) {}
        return m;
    }

    JSONObject list() throws JSONException {
        JSONArray a = new JSONArray();
        File[] ls = root().listFiles(File::isDirectory);
        if (ls != null) {
            java.util.Arrays.sort(ls, (x, y) -> y.getName().compareTo(x.getName()));
            for (File d : ls) { JSONObject m = metaOf(d); if (m != null) a.put(m); }
        }
        JSONObject o = new JSONObject();
        o.put("items", a); o.put("free", root().getUsableSpace()); o.put("folder", root().getAbsolutePath()); o.put("recording", recOn);
        return o;
    }

    void delete(String name) throws IOException {
        File d = dirOf(name);
        if (player != null && player.dir.equals(d)) playStop();
        File[] ls = d.listFiles();
        if (ls != null) for (File f : ls) if (!f.delete()) throw new IOException("Nie mogę usunąć " + f.getName());
        if (!d.delete()) throw new IOException("Nie mogę usunąć folderu");
    }

    void setMeta(String name, JSONObject patch) throws Exception {
        File d = dirOf(name);
        JSONObject m = readMeta(d);
        if (m == null) { m = metaOf(d); m.remove("size"); m.remove("dir"); m.remove("mixes"); }
        java.util.Iterator<String> it = patch.keys();
        while (it.hasNext()) { String k = it.next(); m.put(k, patch.get(k)); }
        writeMeta(d, m);
    }

    // ---------------------------------------------------------------- playback
    static final class Player {
        final File dir; final WavIn[] in; final int rate; final long frames;
        volatile float[] gl, gr; volatile long pos, loopA = -1, loopB = -1; volatile boolean on; Thread thread; AudioTrack track;
        Player(File dir, WavIn[] in) {
            this.dir = dir; this.in = in; rate = in.length > 0 ? in[0].rate : 48000;
            long f = 0; for (WavIn w : in) f = Math.max(f, w.frames); frames = f;
            gl = new float[in.length]; gr = new float[in.length];
        }
    }
    private Player player;

    JSONObject playLoad(String name) throws Exception {
        playClose();
        File d = dirOf(name);
        JSONObject m = metaOf(d);
        JSONArray files = m.optJSONArray("files");
        if (files == null || files.length() == 0) throw new IOException("Brak śladów w nagraniu");
        WavIn[] in = new WavIn[files.length()];
        try { for (int i = 0; i < in.length; i++) in[i] = new WavIn(new File(d, files.getString(i))); }
        catch (Exception x) { for (WavIn w : in) if (w != null) w.close(); throw x; }
        player = new Player(d, in);
        m.put("frames", player.frames); m.put("rate", player.rate);
        return m;
    }

    void playMix(JSONArray l, JSONArray r) {
        Player p = player; if (p == null) return;
        float[] a = new float[p.in.length], b = new float[p.in.length];
        for (int i = 0; i < a.length; i++) { a[i] = (float) l.optDouble(i, 0); b[i] = (float) r.optDouble(i, 0); }
        p.gl = a; p.gr = b;
    }

    void playSeek(double t) { Player p = player; if (p != null) p.pos = Math.max(0, Math.min(p.frames, (long) (t * p.rate))); }

    void playLoop(double a, double b) {
        Player p = player; if (p == null) return;
        if (a < 0 || b <= a) { p.loopA = -1; p.loopB = -1; } else { p.loopA = (long) (a * p.rate); p.loopB = (long) (b * p.rate); }
    }

    void playStart(boolean toUsb) throws Exception {
        final Player p = player;
        if (p == null) throw new Exception("Najpierw otwórz nagranie");
        if (recOn) throw new Exception("Trwa nagrywanie");
        if (p.on) return;
        if (p.pos >= p.frames) p.pos = 0;
        int min = AudioTrack.getMinBufferSize(p.rate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_FLOAT);
        AudioTrack t = new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(p.rate).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
            .setBufferSizeInBytes(Math.max(min, p.rate * 8 / 10))
            .setTransferMode(AudioTrack.MODE_STREAM).build();
        if (toUsb) { AudioDeviceInfo o = usb(AudioManager.GET_DEVICES_OUTPUTS, -1); if (o != null) t.setPreferredDevice(o); }
        p.track = t; p.on = true;
        t.play();
        p.thread = new Thread(() -> {
            final int n = 1024;
            float[][] tmp = new float[1][n];
            float[] out = new float[n * 2];
            float[] pk = new float[p.in.length];
            long lastEmit = -1; boolean ended = false;
            try {
                while (p.on) {
                    long at = p.pos;
                    if (p.loopB > 0 && at >= p.loopB) { at = p.loopA; p.pos = at; }
                    if (at >= p.frames) { ended = true; break; }
                    int len = (int) Math.min(n, p.frames - at);
                    if (p.loopB > 0 && at < p.loopB) len = (int) Math.min(len, p.loopB - at);
                    java.util.Arrays.fill(out, 0);
                    float[] gl = p.gl, gr = p.gr;
                    for (int k = 0; k < p.in.length; k++) {
                        p.in[k].read(at, len, tmp);
                        float a = gl[k], b = gr[k], m = pk[k]; float[] s = tmp[0];
                        for (int i = 0; i < len; i++) {
                            float v = s[i]; float av = Math.abs(v); if (av > m) m = av;
                            out[2 * i] += v * a; out[2 * i + 1] += v * b;
                        }
                        pk[k] = m;
                    }
                    float ml = 0, mr = 0;
                    for (int i = 0; i < len; i++) {
                        float l = out[2 * i], r = out[2 * i + 1];
                        ml = Math.max(ml, Math.abs(l)); mr = Math.max(mr, Math.abs(r));
                        out[2 * i] = Math.max(-1f, Math.min(1f, l)); out[2 * i + 1] = Math.max(-1f, Math.min(1f, r));
                    }
                    p.track.write(out, 0, len * 2, AudioTrack.WRITE_BLOCKING);
                    if (p.pos == at) p.pos = at + len;                 // a seek from the page wins
                    if (lastEmit < 0 || Math.abs(at - lastEmit) >= p.rate / 12) {
                        lastEmit = at;
                        JSONObject e = new JSONObject(); JSONArray pa = new JSONArray();
                        for (int k = 0; k < pk.length; k++) { pa.put(Math.round(db(pk[k]) * 10) / 10.0); pk[k] = 0; }
                        e.put("t", at / (double) p.rate); e.put("peaks", pa);
                        e.put("l", Math.round(db(ml) * 10) / 10.0); e.put("r", Math.round(db(mr) * 10) / 10.0);
                        sink.emit("play", e);
                    }
                }
            } catch (Exception x) {
                try { JSONObject e = new JSONObject(); e.put("error", x.getMessage()); sink.emit("playEnd", e); } catch (JSONException ignored) {}
                ended = false;
            } finally {
                p.on = false;
                try { p.track.pause(); p.track.flush(); p.track.release(); } catch (Exception ignored) {}
                if (ended) { p.pos = 0; try { JSONObject e = new JSONObject(); e.put("end", true); sink.emit("playEnd", e); } catch (JSONException ignored) {} }
            }
        }, "flow8-play");
        p.thread.start();
    }

    void playStop() {
        Player p = player; if (p == null) return;
        p.on = false;
        Thread t = p.thread;
        if (t != null && t != Thread.currentThread()) try { t.join(1500); } catch (InterruptedException ignored) {}
    }

    void playClose() {
        playStop();
        if (player != null) for (WavIn w : player.in) w.close();
        player = null;
    }

    // ---------------------------------------------------------------- mixdown
    private volatile boolean mixing;

    void mixdown(String name, JSONArray l, JSONArray r, String title) throws Exception {
        if (mixing) throw new Exception("Już eksportuję");
        final File d = dirOf(name);
        JSONObject m = metaOf(d);
        final JSONArray files = m.optJSONArray("files");
        if (files == null || files.length() == 0) throw new IOException("Brak śladów");
        final WavIn[] in = new WavIn[files.length()];
        for (int i = 0; i < in.length; i++) in[i] = new WavIn(new File(d, files.getString(i)));
        final float[] gl = new float[in.length], gr = new float[in.length];
        for (int i = 0; i < in.length; i++) { gl[i] = (float) l.optDouble(i, 0); gr[i] = (float) r.optDouble(i, 0); }
        long fr = 0; for (WavIn w : in) fr = Math.max(fr, w.frames);
        final long frames = fr; final int rate = in[0].rate;
        String t = safe(title);
        final File outF = new File(d, "miks " + (t.isEmpty() ? new SimpleDateFormat("HH-mm-ss", Locale.US).format(new Date()) : t) + ".wav");
        mixing = true;
        new Thread(() -> {
            String err = null; float peak = 0;
            try {
                WavOut w = new WavOut(outF, 2, 24, rate);
                final int n = 4096; float[][] tmp = new float[1][n]; float[] mix = new float[n * 2]; byte[] ob = new byte[n * 6];
                long lastPct = -1;
                for (long at = 0; at < frames; at += n) {
                    int len = (int) Math.min(n, frames - at);
                    java.util.Arrays.fill(mix, 0);
                    for (int k = 0; k < in.length; k++) {
                        in[k].read(at, len, tmp); float a = gl[k], b = gr[k]; float[] s = tmp[0];
                        if (a == 0 && b == 0) continue;
                        for (int i = 0; i < len; i++) { mix[2 * i] += s[i] * a; mix[2 * i + 1] += s[i] * b; }
                    }
                    int p = 0;
                    for (int i = 0; i < len * 2; i++) {
                        float v = mix[i]; peak = Math.max(peak, Math.abs(v));
                        int s = (int) Math.max(-8388608, Math.min(8388607, Math.round(v * 8388607.0)));
                        ob[p++] = (byte) s; ob[p++] = (byte) (s >> 8); ob[p++] = (byte) (s >> 16);
                    }
                    w.write(ob, p);
                    long pct = at * 100 / Math.max(1, frames);
                    if (pct != lastPct) { lastPct = pct; JSONObject e = new JSONObject(); e.put("p", pct); sink.emit("mixProgress", e); }
                }
                w.close();
            } catch (Exception x) { err = x.getMessage(); }
            finally {
                for (WavIn w : in) w.close();
                mixing = false;
                try {
                    JSONObject e = new JSONObject();
                    e.put("dir", d.getName()); e.put("file", outF.getName()); e.put("path", outF.getAbsolutePath());
                    e.put("peakDb", Math.round(db(peak) * 10) / 10.0);
                    if (err != null) e.put("error", err);
                    sink.emit("mixDone", e);
                } catch (JSONException ignored) {}
            }
        }, "flow8-mix").start();
    }

    // ---------------------------------------------------------------- copy to the phone's Music folder (visible to other apps)
    @TargetApi(29)
    int saveToMusic(String name, JSONArray only) throws Exception {
        if (Build.VERSION.SDK_INT < 29) throw new Exception("Na tym Androidzie użyj „udostępnij”.");
        File d = dirOf(name);
        File[] ls = d.listFiles((x, n) -> n.toLowerCase(Locale.ROOT).endsWith(".wav"));
        if (ls == null) return 0;
        android.content.ContentResolver cr = ctx.getContentResolver();
        int n = 0;
        for (File f : ls) {
            if (only != null && only.length() > 0) { boolean hit = false; for (int i = 0; i < only.length(); i++) if (f.getName().equals(only.optString(i))) hit = true; if (!hit) continue; }
            android.content.ContentValues v = new android.content.ContentValues();
            v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, f.getName());
            v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "audio/wav");
            v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/FLOW8/" + d.getName());
            v.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1);
            android.net.Uri uri = cr.insert(android.provider.MediaStore.Audio.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
            if (uri == null) throw new IOException("Android nie przyjął pliku " + f.getName());
            try (OutputStream o = cr.openOutputStream(uri); FileInputStream i = new FileInputStream(f)) {
                if (o == null) throw new IOException("Nie mogę zapisać " + f.getName());
                byte[] b = new byte[1 << 16]; int k; while ((k = i.read(b)) > 0) o.write(b, 0, k);
            }
            v.clear(); v.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, v, null, null);
            n++;
        }
        return n;
    }
}
