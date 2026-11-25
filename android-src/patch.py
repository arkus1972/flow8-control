"""Patch the generated Capacitor Android project: native BLE plugin, permissions,
version name, and signing with the repo's own app key (so updates install over each other)."""
import re, pathlib, shutil

root = pathlib.Path(__file__).resolve().parent.parent
app = root / 'android' / 'app'
pkg = app / 'src' / 'main' / 'java' / 'com' / 'arkus1972' / 'flow8control'
pkg.mkdir(parents=True, exist_ok=True)
for f in ('FlowBlePlugin.java', 'MainActivity.java'):
    shutil.copy(root / 'android-src' / f, pkg / f)

man = app / 'src' / 'main' / 'AndroidManifest.xml'
m = man.read_text()
perms = '''
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
'''
if 'BLUETOOTH_CONNECT' not in m:
    m = m.replace('<application', perms + '\n    <application', 1)
# keep the screen on and lock nothing: a mixer remote is used on stage
man.write_text(m)

ver = re.search(r"APP_VERSION = '([^']*)'", (root / 'app.js').read_text()).group(1)
parts = [int(x) for x in ver.split('.')] + [0, 0]
code = parts[0] * 10000 + parts[1] * 100 + parts[2]
g = app / 'build.gradle'
t = g.read_text()
t = re.sub(r'versionCode \d+', f'versionCode {max(code, 1)}', t)
t = re.sub(r'versionName "[^"]*"', f'versionName "{ver}"', t)
if 'signingConfigs' not in t:
    t = t.replace('    buildTypes {', '''    signingConfigs {
        release {
            storeFile file("../../android-src/flow8-app.keystore")
            storePassword "flow8control"
            keyAlias "flow8"
            keyPassword "flow8control"
        }
    }
    buildTypes {''', 1)
    t = re.sub(r'(release \{\n\s*minifyEnabled false)', r'\1\n            signingConfig signingConfigs.release', t, count=1)
g.write_text(t)
print('patched', ver, code)
print(t[t.find('signingConfigs'):t.find('signingConfigs') + 600])
