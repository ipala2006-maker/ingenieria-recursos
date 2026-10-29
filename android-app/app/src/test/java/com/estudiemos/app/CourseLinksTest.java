package com.estudiemos.app;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class CourseLinksTest {
    private static final String APP = "https://estudiemos.estudiemos-services.workers.dev/";
    private static final String EXPECTED = APP + "?unirme=1&materia=ABCDEFGHJK";

    @Test public void configuredCloudflareOriginRetainsOldInvitationsWithoutTrustingOtherHosts() {
        String target = "https://estudiemos.estudiemos-services.workers.dev";
        assertEquals(target + "/?unirme=1&materia=ABCDEFGHJK", CourseLinks.appUrl(APP + "materia/ABCDEFGHJK", target));
        assertEquals(EXPECTED, CourseLinks.appUrl(target + "/materia/ABCDEFGHJK"));
        assertEquals("", CourseLinks.appUrl(APP + "materia/ABCDEFGHJK", "https://attacker.test"));
        assertEquals("", CourseLinks.appUrl(target + ".attacker.test/materia/ABCDEFGHJK"));
    }

    @Test public void friendlyLinksAndLegacyInvitationsReachTheSameCourse() {
        for (String url : new String[] {
                APP + "materia/ABCDEFGHJK", APP + "materia/abcdefghjk/?utm_source=whatsapp",
                APP + "?materia=ABCDE-FGHJK", APP + "#clase=ABCDEFGHJK",
                "estudiemos://open?materia=abcdefghjk", "estudiemos://open?clase=ABCDE-FGHJK",
                APP.replace("https:", "http:") + "materia/ABCDEFGHJK"
        }) assertEquals(url, EXPECTED, CourseLinks.appUrl(url));
    }

    @Test public void untrustedAmbiguousAndMalformedLinksNeverReachPrivateScreens() {
        for (String url : new String[] {
                null, "", "javascript:alert(1)", "https://attacker.test/materia/ABCDEFGHJK",
                "https://estudiemos-app.vercel.app.attacker.test/materia/ABCDEFGHJK",
                "https://attacker.test@estudiemos-app.vercel.app/materia/ABCDEFGHJK",
                "https://estudiemos-app.vercel.app:444/materia/ABCDEFGHJK",
                APP + "materia/BAD", APP + "materia/ABCDEFGHIJ", APP + "materia/ABCDEFGHJK/extra",
                APP + "materia/%41BCDEFGHJK", APP + "api/account-config?materia=ABCDEFGHJK",
                APP + "materia/ABCDEFGHJK?materia=KJHGFEDCBA", APP + "?materia=ABCDEFGHJK&materia=",
                "estudiemos://other?materia=ABCDEFGHJK", "estudiemos://open/other?materia=ABCDEFGHJK",
                "estudiemos://open?ref=ABCDEF12", "estudiemos://open?materia=%GG"
        }) assertEquals(String.valueOf(url), "", CourseLinks.appUrl(url));
    }
}
