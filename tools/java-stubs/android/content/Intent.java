package android.content;
public class Intent { public static final String ACTION_OPEN_DOCUMENT="a",ACTION_OPEN_DOCUMENT_TREE="b",CATEGORY_OPENABLE="c",EXTRA_MIME_TYPES="d",EXTRA_ALLOW_MULTIPLE="e";
 public static final int FLAG_ACTIVITY_NEW_TASK=1,FLAG_GRANT_READ_URI_PERMISSION=2,FLAG_GRANT_PERSISTABLE_URI_PERMISSION=4,FLAG_GRANT_PREFIX_URI_PERMISSION=8;
 public Intent(String a){} public Intent(Context c,Class<?> k){} public Intent addFlags(int f){return this;} public Intent addCategory(String c){return this;}
 public Intent setType(String t){return this;} public Intent putExtra(String k,String v){return this;} public Intent putExtra(String k,String[] v){return this;} public Intent putExtra(String k,boolean v){return this;}
 public String getStringExtra(String k){return null;} public android.net.Uri getData(){return null;} public ClipData getClipData(){return null;} }