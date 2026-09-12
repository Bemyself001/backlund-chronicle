package io.github.bemyself001.backlundchronicle;

/** OTA lifecycle independent of Android, so interrupted starts can be regression-tested. */
public final class BundleState {
    String binaryVersion;
    String activePath;
    String activeVersion;
    String pendingPath;
    String pendingVersion;
    String launchingPath;
    String launchingVersion;
    String failedVersion;

    public void prepare(String installedVersion) {
        if (!installedVersion.equals(binaryVersion)) {
            reset();
            binaryVersion = installedVersion;
            return;
        }
        // A process that died before React confirmed startup must not retry that bundle.
        if (launchingPath != null) fail(launchingPath);
        launchingPath = pendingPath != null ? pendingPath : activePath;
        launchingVersion = pendingPath != null ? pendingVersion : activeVersion;
        pendingPath = null;
        pendingVersion = null;
    }

    public void stage(String path, String version) {
        pendingPath = path;
        pendingVersion = version;
    }

    public boolean confirm(String path, String version) {
        if (path == null || !path.equals(launchingPath) || !version.equals(launchingVersion)) return false;
        activePath = launchingPath;
        activeVersion = launchingVersion;
        launchingPath = null;
        launchingVersion = null;
        return true;
    }

    public void fail(String path) {
        if (path == null || !path.equals(launchingPath)) return;
        failedVersion = launchingVersion;
        if (path.equals(activePath)) {
            activePath = null;
            activeVersion = null;
        }
        launchingPath = null;
        launchingVersion = null;
    }

    public void reset() {
        activePath = activeVersion = pendingPath = pendingVersion = null;
        launchingPath = launchingVersion = failedVersion = null;
    }
}
