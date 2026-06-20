import mongoose, { Schema, Document } from "mongoose";

export interface IUserStats extends Document {
    userId: mongoose.Types.ObjectId;
    totalStudyMinutes: number;
    streak: number;
    lastStudyDate: string | null;
    longestStreak: number;
    createdAt: Date;
    updatedAt: Date;
}

const userStatsSchema = new Schema<IUserStats>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            required: true,
            unique: true,
            index: true,
        },
        totalStudyMinutes: {
            type: Number,
            default: 0,
        },
        streak: {
            type: Number,
            default: 0,
        },
        lastStudyDate: {
            // Stored as YYYY-MM-DD string for easy date comparison
            type: String,
            default: null,
        },
        longestStreak: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

userStatsSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete (ret as any).__v;
        return ret;
    },
});

const UserStats = mongoose.model<IUserStats>("UserStats", userStatsSchema);
export default UserStats;
