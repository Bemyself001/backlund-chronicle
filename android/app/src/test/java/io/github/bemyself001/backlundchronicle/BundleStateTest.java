package io.github.bemyself001.backlundchronicle;

import static org.junit.Assert.*;
import org.junit.Test;

public class BundleStateTest {
    private BundleState installed() {
        BundleState s = new BundleState();
        s.prepare("1.2.100");
        return s;
    }

    @Test public void freshInstallUsesPackagedAssets() {
        BundleState s = installed();
        assertNull(s.launchingPath);
        assertEquals("1.2.100", s.binaryVersion);
    }

    @Test public void downloadDoesNotChangeCurrentlyRunningBundle() {
        BundleState s = installed();
        s.stage("/bundles/new", "1.2.101");
        assertNull(s.launchingPath);
        assertNull(s.activePath);
        s.prepare("1.2.100");
        assertEquals("/bundles/new", s.launchingPath);
        assertNull(s.activePath);
        assertNull(s.pendingPath);
    }

    @Test public void successfulReactMountConfirmsMatchingVersionOnly() {
        BundleState s = installed();
        s.stage("/bundles/new", "1.2.101");
        s.prepare("1.2.100");
        assertFalse(s.confirm("/bundles/new", "1.1.0"));
        assertFalse(s.confirm("/bundles/other", "1.2.101"));
        assertTrue(s.confirm("/bundles/new", "1.2.101"));
        assertEquals("1.2.101", s.activeVersion);
        assertNull(s.launchingPath);
    }

    @Test public void interruptedFirstUpdateReturnsToPackagedAssets() {
        BundleState s = installed();
        s.stage("/bundles/broken", "1.2.101");
        s.prepare("1.2.100");
        s.prepare("1.2.100");
        assertNull(s.launchingPath);
        assertEquals("1.2.101", s.failedVersion);
    }

    @Test public void failedUpdateReturnsToLastConfirmedBundle() {
        BundleState s = installed();
        s.stage("/bundles/good", "1.2.101");
        s.prepare("1.2.100");
        s.confirm("/bundles/good", "1.2.101");
        s.stage("/bundles/broken", "1.2.102");
        s.prepare("1.2.100");
        s.fail("/bundles/broken");
        s.prepare("1.2.100");
        assertEquals("/bundles/good", s.launchingPath);
        assertEquals("1.2.102", s.failedVersion);
    }

    @Test public void brokenPreviouslyConfirmedBundleFallsBackWithoutLooping() {
        BundleState s = installed();
        s.stage("/bundles/good", "1.2.101");
        s.prepare("1.2.100");
        s.confirm("/bundles/good", "1.2.101");
        s.prepare("1.2.100");
        s.prepare("1.2.100");
        assertNull(s.activePath);
        assertNull(s.launchingPath);
    }

    @Test public void installingNewApkDiscardsOldOtaIncludingBrokenStartup() {
        BundleState s = installed();
        s.stage("/bundles/old", "1.2.101");
        s.prepare("1.2.100");
        s.prepare("1.2.102");
        assertNull(s.activePath);
        assertNull(s.pendingPath);
        assertNull(s.launchingPath);
        assertNull(s.failedVersion);
        assertEquals("1.2.102", s.binaryVersion);
    }

    @Test public void obsoleteTimeoutCannotFailAnotherLaunch() {
        BundleState s = installed();
        s.stage("/bundles/new", "1.2.101");
        s.prepare("1.2.100");
        s.fail("/bundles/old");
        assertEquals("/bundles/new", s.launchingPath);
    }
}
