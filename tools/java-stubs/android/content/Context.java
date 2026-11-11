package android.content;
public abstract class Context { public static final String AUDIO_SERVICE="audio"; public static final int MODE_PRIVATE=0;
 public abstract Object getSystemService(String n); public abstract java.io.File getExternalFilesDir(String t); public abstract java.io.File getFilesDir();
 public abstract ContentResolver getContentResolver(); public abstract SharedPreferences getSharedPreferences(String n,int m);
 public abstract Context getApplicationContext(); public abstract void startActivity(Intent i); }