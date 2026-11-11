package android.media;
public class AudioRecord {
  public static final int STATE_INITIALIZED=1;
  public static java.util.function.Supplier<Source> SOURCE;
  public interface Source { void read(short[] b,int off,int n); }
  private Source src; private int rate; private long samplesRead=0; private volatile boolean stopped=false;
  public static int getMinBufferSize(int r,int c,int e){return 4096;}
  public AudioRecord(int a,int rate,int c,int e,int buf){this.rate=rate; src=SOURCE.get();}
  public int getState(){return STATE_INITIALIZED;}
  public void startRecording(){ android.os.VClock.t=0; }
  public void stop(){stopped=true;} public void release(){stopped=true;}
  // virtual time: data for this chunk exists only at due time; if the detector is already later (slow), it returns at once
  public int read(short[] b,int off,int n){
    if(stopped) return -1;
    samplesRead+=n;
    double due=samplesRead*1000.0/rate;
    if(android.os.VClock.t<due) android.os.VClock.t=due;
    if(due>android.os.VClock.limitMs) return -1;
    src.read(b,off,n); return n;
  }
}
