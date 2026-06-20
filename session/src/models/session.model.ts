import mongoose, { Schema, Document } from "mongoose";

export interface ISession extends Document {
    userId: mongoose.Types.ObjectId;
    roomId: mongoose.Types.ObjectId;
    subject: string;
    joinedAt: Date;
    leftAt: Date | null;
    durationMinutes: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        roomId: {
            type: Schema.Types.ObjectId,
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
        delete (ret as any).__v;
        return ret;
    },
});

const Session = mongoose.model<ISession>("Session", sessionSchema);
export default Session;
