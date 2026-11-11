package android.os;
public class VClock {
  public static volatile double t = 0;          // jam deteksi virtual (ms)
  public static double limitMs = 1e12;
  public static double cost = 0;                // biaya virtual (ms) per bacaan YIN, meniru HP lambat
  public static long ms() { return (long) t; }
  public static void advance(double d) { t += d; }
}
