package android.provider;

import android.content.Context;
import android.net.Uri;

public final class DocumentsContract {
    private DocumentsContract() {}

    public static final String EXTRA_INFO = "android.provider.extra.INFO";
    public static final String EXTRA_LOADING = "android.provider.extra.LOADING";
    public static final String EXTRA_ERROR = "android.provider.extra.ERROR";
    public static final String PROVIDER_INTERFACE = "android.content.action.DOCUMENTS_PROVIDER";

    public static boolean isDocumentUri(Context context, Uri uri) { return false; }
    public static String getDocumentId(Uri documentUri) { return null; }
    public static String getTreeDocumentId(Uri documentUri) { return null; }
    public static Uri buildDocumentUri(String authority, String documentId) { return null; }
    public static Uri buildDocumentUriUsingTree(Uri treeUri, String documentId) { return null; }
    public static Uri buildTreeDocumentUri(String authority, String documentId) { return null; }
    public static Uri buildChildDocumentsUri(String authority, String parentDocumentId) { return null; }
    public static Uri buildChildDocumentsUriUsingTree(Uri treeUri, String parentDocumentId) { return null; }
    public static Uri buildRootUri(String authority, String rootId) { return null; }
    public static Uri buildRootsUri(String authority) { return null; }
    public static Uri buildSearchDocumentsUri(String authority, String rootId, String query) { return null; }
    public static Uri buildRecentDocumentsUri(String authority, String rootId) { return null; }
    public static Uri createDocument(Context context, Uri parentDocumentUri, String mimeType, String displayName) { return null; }
    public static boolean deleteDocument(android.content.ContentResolver resolver, Uri documentUri) { return false; }
    public static String renameDocument(android.content.ContentResolver resolver, Uri documentUri, String displayName) { return null; }
    public static Uri copyDocument(android.content.ContentResolver resolver, Uri sourceDocumentUri, Uri targetParentDocumentUri) { return null; }
    public static Uri moveDocument(android.content.ContentResolver resolver, Uri sourceDocumentUri, Uri sourceParentDocumentUri, Uri targetParentDocumentUri) { return null; }
    public static boolean removeDocument(android.content.ContentResolver resolver, Uri documentUri, Uri parentDocumentUri) { return false; }

    public static final class Document {
        private Document() {}
        public static final String COLUMN_DOCUMENT_ID = "_id";
        public static final String COLUMN_MIME_TYPE = "mime_type";
        public static final String COLUMN_DISPLAY_NAME = "_display_name";
        public static final String COLUMN_LAST_MODIFIED = "last_modified";
        public static final String COLUMN_FLAGS = "flags";
        public static final String COLUMN_SIZE = "_size";
        public static final String COLUMN_SUMMARY = "summary";
        public static final String COLUMN_ICON = "icon";
        public static final String MIME_TYPE_DIR = "vnd.android.document/directory";
        public static final int FLAG_SUPPORTS_WRITE = 1 << 1;
        public static final int FLAG_SUPPORTS_DELETE = 1 << 2;
        public static final int FLAG_SUPPORTS_THUMBNAIL = 1 << 3;
        public static final int FLAG_DIR_PREFERS_LAST_MODIFIED = 1 << 4;
        public static final int FLAG_DIR_PREFERS_SIZE = 1 << 5;
        public static final int FLAG_SUPPORTS_COPY = 1 << 6;
        public static final int FLAG_SUPPORTS_MOVE = 1 << 7;
        public static final int FLAG_SUPPORTS_REMOVE = 1 << 8;
        public static final int FLAG_VIRTUAL_DOCUMENT = 1 << 9;
    }

    public static final class Root {
        private Root() {}
        public static final String COLUMN_ROOT_ID = "root_id";
        public static final String COLUMN_FLAGS = "flags";
        public static final String COLUMN_ICON = "icon";
        public static final String COLUMN_TITLE = "title";
        public static final String COLUMN_SUMMARY = "summary";
        public static final String COLUMN_DOCUMENT_ID = "document_id";
        public static final String COLUMN_AVAILABLE_BYTES = "available_bytes";
        public static final String COLUMN_CAPACITY_BYTES = "capacity_bytes";
        public static final String COLUMN_MIME_TYPES = "mime_types";
        public static final int FLAG_SUPPORTS_CREATE = 1;
        public static final int FLAG_SUPPORTS_RECENTS = 1 << 1;
        public static final int FLAG_SUPPORTS_SEARCH = 1 << 2;
        public static final int FLAG_SUPPORTS_IS_CHILD = 1 << 3;
        public static final int FLAG_LOCAL_ONLY = 1 << 4;
        public static final int FLAG_EMPTY = 1 << 5;
        public static final int FLAG_ADVANCED = 1 << 6;
    }

    public static final class Path {
        private Path() {}
        public static final String COLUMN_PATH = "path";
    }
                                        }
