package android.content;
public abstract class ContentResolver { public abstract android.database.Cursor query(android.net.Uri u,String[] p,String s,String[] a,String o);
 public abstract String getType(android.net.Uri u); public abstract java.io.InputStream openInputStream(android.net.Uri u) throws java.io.FileNotFoundException;
 public abstract void takePersistableUriPermission(android.net.Uri u,int f); public abstract void releasePersistableUriPermission(android.net.Uri u,int f); }