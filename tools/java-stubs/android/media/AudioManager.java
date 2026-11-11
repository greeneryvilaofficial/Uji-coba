package android.media;
public class AudioManager { public static final int AUDIOFOCUS_GAIN=1,AUDIOFOCUS_LOSS=-1,AUDIOFOCUS_LOSS_TRANSIENT=-2,AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK=-3,AUDIOFOCUS_REQUEST_GRANTED=1,STREAM_MUSIC=3;
 public interface OnAudioFocusChangeListener { void onAudioFocusChange(int c); }
 public int requestAudioFocus(AudioFocusRequest r){return 1;} public int requestAudioFocus(OnAudioFocusChangeListener l,int s,int g){return 1;}
 public int abandonAudioFocusRequest(AudioFocusRequest r){return 1;} public int abandonAudioFocus(OnAudioFocusChangeListener l){return 1;} }