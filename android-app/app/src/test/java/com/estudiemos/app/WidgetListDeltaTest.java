package com.estudiemos.app;

import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class WidgetListDeltaTest {
    @Test public void changesOnlyNamedItemsAndPreservesExplicitOrder() {
        assertEquals(Arrays.asList("c1", "b1"), WidgetListDelta.apply(
                Arrays.asList("a0", "b0"), Arrays.asList("b1", "c1"), Collections.singletonList("a"),
                Arrays.asList("c", "b"), value -> value.substring(0, 1)));
    }

    @Test public void editsWithoutReorderingKeepExistingPositions() {
        assertEquals(Arrays.asList("a0", "b1"), WidgetListDelta.apply(
                Arrays.asList("a0", "b0"), Collections.singletonList("b1"), Collections.emptyList(),
                null, value -> value.substring(0, 1)));
    }

    @Test public void rejectsBrokenBasesAndIncompleteOrders() {
        assertThrows(IllegalArgumentException.class, () -> WidgetListDelta.apply(
                Arrays.asList("a0", "a1"), Collections.emptyList(), Collections.emptyList(), null, value -> value.substring(0, 1)));
        assertThrows(IllegalArgumentException.class, () -> WidgetListDelta.apply(
                Collections.singletonList("a0"), Collections.emptyList(), Collections.singletonList("b"), null, value -> value.substring(0, 1)));
        assertThrows(IllegalArgumentException.class, () -> WidgetListDelta.apply(
                Collections.singletonList("a0"), Collections.emptyList(), Collections.emptyList(), Collections.singletonList("b"), value -> value.substring(0, 1)));
        assertThrows(IllegalArgumentException.class, () -> WidgetListDelta.apply(
                Arrays.asList("a0", "b0"), Collections.emptyList(), Collections.emptyList(), Arrays.asList("a", "a"), value -> value.substring(0, 1)));
    }
}
