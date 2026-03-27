import mongoose from "mongoose";

// ── Version subdocument ────────────────────────────────────────────────────────
const versionSchema = new mongoose.Schema(
    {
        content: {
            type: String,
            required: true,
        },
        savedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        savedAt: {
            type: Date,
            default: Date.now,
        },
        // Short label shown in version history UI e.g. "v3 · 2 hours ago"
        label: {
            type: String,
            default: "",
        },
    },
    { _id: true }
);

// ── Note document ──────────────────────────────────────────────────────────────
const noteSchema = new mongoose.Schema(
    {
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,   // one note per room
            index: true,
        },
        content: {
            type: String,
            default: "",
            maxlength: 50000,
        },
        lastEditedBy: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        // Capped array of versions — oldest are pruned when MAX_VERSIONS exceeded
        versions: {
            type: [versionSchema],
            default: [],
        },
        versionCount: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

noteSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

const Note = mongoose.model("Note", noteSchema);
export default Note;