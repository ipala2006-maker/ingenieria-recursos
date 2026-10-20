package com.estudiemos.app;

final class DriveWidgetRules {
    static final int MAX_ITEMS = 100;
    private DriveWidgetRules() {}

    static boolean belongsTo(String owner, String current) {
        return current != null && !current.isEmpty() && current.equals(owner);
    }

    static boolean validId(String id) {
        return id != null && id.matches("[A-Za-z0-9_-]{5,200}");
    }

    static String cleanName(String name) {
        if (name == null) return "";
        String value = name.replaceAll("[\\p{Cntrl}]", "").trim();
        return value.length() > 120 ? value.substring(0, 120) : value;
    }

    static String openUrl(String id, String kind) {
        if (!validId(id)) return "";
        return "folder".equals(kind) ? "https://drive.google.com/drive/folders/" + id
                : "https://drive.google.com/file/d/" + id + "/view";
    }
}
