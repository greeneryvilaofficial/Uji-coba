package android.database;
public interface Cursor { boolean moveToNext(); boolean moveToFirst(); String getString(int i); long getLong(int i); boolean isNull(int i); void close(); }