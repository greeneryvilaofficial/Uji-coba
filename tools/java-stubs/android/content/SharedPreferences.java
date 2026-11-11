package android.content;
public interface SharedPreferences { java.util.Set<String> getStringSet(String k, java.util.Set<String> d); Editor edit();
 interface Editor { Editor putStringSet(String k, java.util.Set<String> v); void apply(); } }