package app.omnileaf.folderaccess

internal class ReadOnlyGrant(
    tree: String,
) : Exception("the grant on $tree allows reading only")

internal class DeleteRefused(
    document: String,
) : Exception("the documents provider refused to delete $document")

internal fun deleteIfGranted(
    tree: String,
    document: String,
    isWritable: Boolean,
    delete: () -> Boolean,
) {
    if (!isWritable) {
        throw ReadOnlyGrant(tree)
    }
    if (!delete()) {
        throw DeleteRefused(document)
    }
}
