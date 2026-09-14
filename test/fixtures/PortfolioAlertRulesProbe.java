package com.innative.halkaarz;
import java.util.*;
public class PortfolioAlertRulesProbe {
  static void equal(Object actual,Object expected){if(!Objects.equals(actual,expected))throw new AssertionError(actual+" != "+expected);}
  public static void main(String[] args) {
    equal(PortfolioAlertRules.levels(-1,1),List.of(-1.0));
    equal(PortfolioAlertRules.levels(-1.5,1),List.of(-1.0));
    equal(PortfolioAlertRules.levels(-3,1),List.of(-1.0,-2.0,-3.0));
    equal(PortfolioAlertRules.levels(3,1),List.of(1.0,2.0,3.0));
    equal(PortfolioAlertRules.levels(-0.999,1),List.of());
    equal(PortfolioAlertRules.levels(-1.5,1.5),List.of(-1.5));
    // Same-time position values: a -2% sampled crossing followed by recovery to zero.
    List<Map<Long,Double>> history=List.of(Map.of(100L,98.0,200L,100.0),Map.of(100L,98.0,200L,100.0));
    equal(PortfolioAlertRules.sampledPercentages(history,200,100),List.of(-2.0,0.0));
    equal(PortfolioAlertRules.sampledPercentages(history,200,101),List.of(0.0));
    // Never add prices from different timestamps or replay old portfolio configuration.
    equal(PortfolioAlertRules.sampledPercentages(List.of(Map.of(100L,98.0),Map.of(200L,98.0)),200,0),List.of());
    equal(PortfolioAlertRules.sampledPercentages(history,200,201),List.of());
    equal(PortfolioAlertRules.sampledPercentages(history,Double.NaN,0),List.of());
    System.out.println("Native signed thresholds and aligned sample recovery: PASS (11 assertions)");
  }
}
