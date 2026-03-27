import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        subject: {
            type: String,
            default: "General",
            trim: true,
        },
        joinedAt: {
            type: Date,
            required: true,
        },
        leftAt: {
            type: Date,
            default: null,   // null means session is still active
        },
        durationMinutes: {
            type: Number,
            default: 0,      // calculated on session end
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Fast queries for analytics
sessionSchema.index({ userId: 1, joinedAt: -1 });
sessionSchema.index({ userId: 1, isActive: 1 });

sessionSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

const Session = mongoose.model("Session", sessionSchema);
export default Session;