package com.estudiemos.app;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

final class WidgetListDelta {
    private WidgetListDelta() {}

    static <T> List<T> apply(List<T> previous, List<T> replacements, List<String> removals,
                             List<String> order, Function<T, String> identifier) {
        if (previous.size() > 2000 || replacements.size() > 2000 || removals.size() > 2000)
            throw new IllegalArgumentException("List too large");
        Map<String, T> items = new LinkedHashMap<>();
        for (T item : previous) {
            String id = validId(identifier.apply(item));
            if (items.put(id, item) != null) throw new IllegalArgumentException("Duplicate base ID");
        }
        for (String id : removals) {
            if (items.remove(validId(id)) == null) throw new IllegalArgumentException("Missing removed ID");
        }
        HashSet<String> putIds = new HashSet<>();
        for (T item : replacements) {
            String id = validId(identifier.apply(item));
            if (!putIds.add(id)) throw new IllegalArgumentException("Duplicate replacement ID");
            items.put(id, item);
        }
        if (items.size() > 2000) throw new IllegalArgumentException("List too large");
        if (order == null) return new ArrayList<>(items.values());
        if (order.size() != items.size() || new HashSet<>(order).size() != order.size())
            throw new IllegalArgumentException("Incomplete order");
        List<T> result = new ArrayList<>();
        for (String id : order) {
            T item = items.get(validId(id));
            if (item == null) throw new IllegalArgumentException("Unknown order ID");
            result.add(item);
        }
        return result;
    }

    private static String validId(String id) {
        if (id == null || id.isEmpty() || id.length() > 180) throw new IllegalArgumentException("Invalid ID");
        return id;
    }
}
