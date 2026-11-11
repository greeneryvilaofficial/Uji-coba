package android.app;
public class Activity extends android.content.Context { public static final int RESULT_OK=-1;
 protected void onCreate(android.os.Bundle b){} protected void onActivityResult(int r,int s,android.content.Intent d){} public android.content.Intent getIntent(){return null;}
 public void startActivityForResult(android.content.Intent i,int r){} public void finish(){} public void runOnUiThread(Runnable r){}
 public Object getSystemService(String n){return null;} public java.io.File getExternalFilesDir(String t){return null;} public java.io.File getFilesDir(){return null;}
 public android.content.ContentResolver getContentResolver(){return null;} public android.content.SharedPreferences getSharedPreferences(String n,int m){return null;}
 public android.content.Context getApplicationContext(){return this;} public void startActivity(android.content.Intent i){} }