package android.media;
public class MediaPlayer { public static final int MEDIA_ERROR_UNKNOWN=1;
 public interface OnPreparedListener { void onPrepared(MediaPlayer m); } public interface OnCompletionListener { void onCompletion(MediaPlayer m); } public interface OnErrorListener { boolean onError(MediaPlayer m,int w,int e); }
 public void setAudioAttributes(AudioAttributes a){} public void setDataSource(String p) throws java.io.IOException {} public void setDataSource(android.content.Context c,android.net.Uri u) throws java.io.IOException {}
 public void setOnPreparedListener(OnPreparedListener l){} public void setOnCompletionListener(OnCompletionListener l){} public void setOnErrorListener(OnErrorListener l){}
 public void prepareAsync(){} public void start(){} public void pause(){} public boolean isPlaying(){return false;} public void seekTo(int m){} public int getCurrentPosition(){return 0;} public int getDuration(){return 0;}
 public void setVolume(float l,float r){} public void reset(){} public void release(){} }