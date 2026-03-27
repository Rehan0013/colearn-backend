import Note from "../models/note.model.js";
import config from "../config/_config.js";

/**
 * Called by RabbitMQ consumer (auto-save) and manual save controller.
 * Upserts the note content and appends a new version.
 * Prunes oldest versions when MAX_VERSIONS is exceeded.
 */
export const saveNoteVersion = async ({ roomId, content, lastEditedBy, updatedAt, label }) => {
    const note = await Note.findOne({ roomId });

    const newVersion = {
        content,
        savedBy: lastEditedBy,
        savedAt: updatedAt ?? new Date(),
        label: label ?? "",
    };

    if (!note) {
        // First save for this room
        await Note.create({
            roomId,
            content,
            lastEditedBy,
            versions: [newVersion],
            versionCount: 1,
        });
        return;
    }

    // Don't save if content hasn't changed
    if (note.content === content) return;

    note.content = content;
    note.lastEditedBy = lastEditedBy;
    note.versions.push(newVersion);
    note.versionCount += 1;

    // Prune oldest versions if over the limit
    if (note.versions.length > config.max_versions) {
        note.versions = note.versions.slice(-config.max_versions);
    }

    await note.save();
};