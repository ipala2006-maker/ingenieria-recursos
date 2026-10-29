package com.estudiemos.app;

import java.net.URI;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class CourseLinks {
    private static final String ORIGIN = "https://estudiemos.estudiemos-services.workers.dev/";
    private static final Pattern PATH = Pattern.compile("^/materia/([A-HJ-NP-Z2-9]{10})/?$", Pattern.CASE_INSENSITIVE);

    static String appUrl(String incoming) {
        return appUrl(incoming, ORIGIN.substring(0, ORIGIN.length() - 1));
    }

    static String appUrl(String incoming, String origin) {
        if (origin == null) return "";
        if (!origin.equals("https://estudiemos-app.vercel.app")
                && !origin.equals("https://estudiemos-candidate.estudiemos-services.workers.dev")
                && !origin.equals("https://estudiemos.estudiemos-services.workers.dev")) return "";
        String code = code(incoming);
        return code.isEmpty() ? "" : origin + "/?unirme=1&materia=" + code;
    }

    static String code(String incoming) {
        if (incoming == null || incoming.length() > 4096) return "";
        try {
            URI uri = new URI(incoming);
            if (uri.getRawUserInfo() != null || uri.getHost() == null) return "";
            String scheme = uri.getScheme(), route = uri.getRawPath();
            boolean custom = "estudiemos".equalsIgnoreCase(scheme) && "open".equalsIgnoreCase(uri.getHost())
                    && uri.getPort() == -1 && (route == null || route.isEmpty() || route.equals("/"));
            boolean trustedHost = "estudiemos-app.vercel.app".equalsIgnoreCase(uri.getHost())
                    || "estudiemos-candidate.estudiemos-services.workers.dev".equalsIgnoreCase(uri.getHost())
                    || "estudiemos.estudiemos-services.workers.dev".equalsIgnoreCase(uri.getHost());
            boolean web = trustedHost
                    && (("https".equalsIgnoreCase(scheme) && (uri.getPort() == -1 || uri.getPort() == 443))
                    || ("http".equalsIgnoreCase(scheme) && (uri.getPort() == -1 || uri.getPort() == 80)));
            if (!custom && !web) return "";
            List<String> codes = new ArrayList<>();
            if (web) {
                Matcher match = PATH.matcher(route == null ? "" : route);
                if (match.matches()) codes.add(match.group(1));
                else if (!"/".equals(route) && !"/index.html".equals(route)) return "";
            }
            collect(uri.getRawQuery(), codes);
            if (web) collect(uri.getRawFragment(), codes);
            if (codes.isEmpty()) return "";
            String first = normalize(codes.get(0));
            if (!first.matches("^[A-HJ-NP-Z2-9]{10}$")) return "";
            for (String candidate : codes) if (!first.equals(normalize(candidate))) return "";
            return first;
        } catch (Exception ignored) {
            return "";
        }
    }

    private static void collect(String query, List<String> codes) throws Exception {
        if (query == null) return;
        for (String item : query.split("&")) {
            String[] pair = item.split("=", 2);
            String name = URLDecoder.decode(pair[0], "UTF-8");
            if ("materia".equals(name) || "clase".equals(name)) {
                codes.add(pair.length == 2 ? URLDecoder.decode(pair[1], "UTF-8") : "");
            }
        }
    }

    private static String normalize(String value) {
        return value.toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
    }
}
