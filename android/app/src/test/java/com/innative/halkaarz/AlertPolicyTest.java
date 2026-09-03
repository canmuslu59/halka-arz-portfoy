package com.innative.halkaarz;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AlertPolicyTest {
    @Test
    public void classifiesDailyChangeAtExactThreshold() {
        assertEquals(AlertPolicy.Zone.NEUTRAL, AlertPolicy.classify(2.99, 3.0));
        assertEquals(AlertPolicy.Zone.UP, AlertPolicy.classify(3.0, 3.0));
        assertEquals(AlertPolicy.Zone.NEUTRAL, AlertPolicy.classify(-2.99, 3.0));
        assertEquals(AlertPolicy.Zone.DOWN, AlertPolicy.classify(-3.0, 3.0));
    }

    @Test
    public void notifiesOnlyWhenEnteringDifferentNonNeutralZone() {
        assertTrue(AlertPolicy.shouldNotify(AlertPolicy.Zone.NEUTRAL, AlertPolicy.Zone.UP));
        assertFalse(AlertPolicy.shouldNotify(AlertPolicy.Zone.UP, AlertPolicy.Zone.UP));
        assertFalse(AlertPolicy.shouldNotify(AlertPolicy.Zone.DOWN, AlertPolicy.Zone.NEUTRAL));
        assertTrue(AlertPolicy.shouldNotify(AlertPolicy.Zone.UP, AlertPolicy.Zone.DOWN));
    }

    @Test
    public void invalidNumbersStayNeutral() {
        assertEquals(AlertPolicy.Zone.NEUTRAL, AlertPolicy.classify(Double.NaN, 3.0));
        assertEquals(AlertPolicy.Zone.NEUTRAL, AlertPolicy.classify(4.0, 0.0));
    }
}
