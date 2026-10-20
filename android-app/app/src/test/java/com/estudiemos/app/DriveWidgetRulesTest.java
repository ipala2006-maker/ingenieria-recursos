package com.estudiemos.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class DriveWidgetRulesTest {
    @Test public void onlyCanonicalDriveLinksAreProduced() {
        assertEquals("https://drive.google.com/drive/folders/abc_123-XYZ", DriveWidgetRules.openUrl("abc_123-XYZ", "folder"));
        assertEquals("https://drive.google.com/file/d/abc_123-XYZ/view", DriveWidgetRules.openUrl("abc_123-XYZ", "file"));
        for (String id : new String[] {"", "a", "../other", "https://example.test", "abc12?token=secret", "abc12/other", "abc12\n"}) {
            assertFalse(DriveWidgetRules.validId(id));
            assertEquals("", DriveWidgetRules.openUrl(id, "folder"));
        }
        assertFalse(DriveWidgetRules.validId(null));
    }

    @Test public void staleWidgetIntentsCannotCrossAccounts() {
        assertTrue(DriveWidgetRules.belongsTo("account-a", "account-a"));
        assertFalse(DriveWidgetRules.belongsTo("account-a", "account-b"));
        assertFalse(DriveWidgetRules.belongsTo("account-a", ""));
        assertFalse(DriveWidgetRules.belongsTo("", ""));
        assertFalse(DriveWidgetRules.belongsTo(null, "account-a"));
        assertFalse(DriveWidgetRules.belongsTo("account-a", null));
    }

    @Test public void namesAreBoundedAndDoNotContainControls() {
        assertEquals("Gu\u00eda.pdf", DriveWidgetRules.cleanName("  Gu\u00eda.pdf\n\r\t "));
        assertEquals(120, DriveWidgetRules.cleanName("a".repeat(200)).length());
        assertEquals("", DriveWidgetRules.cleanName(null));
    }
}
